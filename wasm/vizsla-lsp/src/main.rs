#![feature(try_blocks)]

use std::{cell::RefCell, ffi::CString, os::raw::c_char, panic, path::PathBuf};

use crossbeam_channel::Receiver;
use itertools::Itertools;
use lsp_server::{Message, Request, Response};
use lsp_types::{
    InitializeParams, InitializeResult, MessageType, ServerInfo, ShowMessageParams, TraceValue,
    Url, notification::Notification as _, request::Request as _,
};
use utils::{
    json::from_json,
    paths::{AbsPathBuf, Utf8PathBuf},
};

use crate::{
    config::Config,
    i18n::{I18n, Locale},
};

fn main() {}

#[cfg(target_os = "emscripten")]
unsafe extern "C" {
    fn emscripten_get_now() -> f64;
}

#[cfg(target_os = "emscripten")]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn _emscripten_get_now() -> f64 {
    unsafe { emscripten_get_now() }
}

#[path = "../../../.vendor/vizsla/src/config.rs"]
mod config;
#[path = "../../../.vendor/vizsla/src/global_state.rs"]
mod global_state;
#[path = "../../../.vendor/vizsla/src/i18n.rs"]
mod i18n;
#[path = "../../../.vendor/vizsla/src/lsp_ext.rs"]
mod lsp_ext;

const DEFAULT_PROCESS_NAME: &str = "vizsla";
const VERSION: &str = concat!(env!("CARGO_PKG_VERSION"), "_WASM");

#[derive(Clone, Debug)]
pub struct Opt {
    pub process_name: String,
    pub log: String,
    pub log_filename: Option<PathBuf>,
    pub profile_trace: Option<PathBuf>,
}

struct BrowserSession {
    state: global_state::GlobalState,
    outgoing: Receiver<Message>,
}

thread_local! {
    static SESSION: RefCell<Option<BrowserSession>> = const { RefCell::new(None) };
}

#[unsafe(no_mangle)]
pub extern "C" fn vizsla_lsp_message(json_ptr: *const u8, json_len: usize) -> *mut c_char {
    run_json(|| {
        let json = read_utf8(json_ptr, json_len)?;
        let message: Message = serde_json::from_str(&json).map_err(|error| error.to_string())?;
        let mut emitted = Vec::new();

        SESSION.with(|session| -> Result<(), String> {
            let mut session = session.borrow_mut();
            if let Message::Request(request) = &message
                && request.method == lsp_types::request::Initialize::METHOD
            {
                if session.is_some() {
                    return Err("Vizsla LSP session is already initialized".to_owned());
                }
                let mut initialized = initialize(request)?;
                emitted.append(&mut initialized.messages);
                *session = Some(initialized.session);
                return Ok(());
            }

            let Some(active) = session.as_mut() else {
                return Err("Vizsla LSP session must receive initialize first".to_owned());
            };

            active
                .state
                .handle_lsp_message_for_browser(message)
                .map_err(|error| format!("{error:#}"))?;
            emitted.extend(active.drain_outgoing());
            Ok(())
        })?;

        serde_json::to_string(&emitted).map_err(|error| error.to_string())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn vizsla_lsp_poll(_json_ptr: *const u8, _json_len: usize) -> *mut c_char {
    run_json(|| {
        let mut emitted = Vec::new();
        SESSION.with(|session| -> Result<(), String> {
            let mut session = session.borrow_mut();
            if let Some(active) = session.as_mut() {
                active
                    .state
                    .drain_browser_queued_events()
                    .map_err(|error| format!("{error:#}"))?;
                emitted.extend(active.drain_outgoing());
            }
            Ok(())
        })?;

        serde_json::to_string(&emitted).map_err(|error| error.to_string())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn vizsla_lsp_reset() {
    SESSION.with(|session| {
        *session.borrow_mut() = None;
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn vizsla_lsp_write_file(
    path_ptr: *const u8,
    path_len: usize,
    text_ptr: *const u8,
    text_len: usize,
) -> *mut c_char {
    run_json(|| {
        let path = read_utf8(path_ptr, path_len)?;
        let text = read_utf8(text_ptr, text_len)?;
        let path = PathBuf::from(path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(path, text).map_err(|error| error.to_string())?;
        Ok("null".to_owned())
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn vizsla_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(unsafe { CString::from_raw(ptr) });
    }
}

struct InitializeOutput {
    session: BrowserSession,
    messages: Vec<Message>,
}

fn initialize(request: &Request) -> Result<InitializeOutput, String> {
    let InitializeParams {
        root_uri,
        capabilities: client_caps,
        workspace_folders,
        initialization_options,
        trace,
        locale,
        ..
    } = from_json::<InitializeParams>("InitializeParams", &request.params)
        .map_err(|error| error.to_string())?;

    let root_path = root_uri.as_ref().and_then(abs_path_from_url).unwrap_or_else(default_root);
    let workspace_roots = workspace_folders
        .map(|folders| {
            folders
                .into_iter()
                .filter_map(|folder| abs_path_from_url(&folder.uri))
                .collect_vec()
        })
        .filter(|folders| !folders.is_empty())
        .unwrap_or_else(|| vec![root_path.clone()]);

    let i18n = I18n::new(Locale::from_lsp(locale.as_deref()));
    let (user_config, snippets, config_errors) = initialization_options
        .map(Config::parse_initialization_options)
        .unwrap_or_default();

    let config = Config::new(
        Opt {
            process_name: DEFAULT_PROCESS_NAME.to_owned(),
            log: "error".to_owned(),
            log_filename: None,
            profile_trace: None,
        },
        root_path,
        client_caps,
        workspace_roots,
        i18n,
        user_config,
        snippets,
    );

    let initialize_result = InitializeResult {
        capabilities: config.server_caps(),
        server_info: Some(ServerInfo {
            name: DEFAULT_PROCESS_NAME.to_owned(),
            version: Some(VERSION.to_owned()),
        }),
    };

    let (sender, outgoing) = crossbeam_channel::unbounded();
    let mut state =
        global_state::GlobalState::new(sender, config, trace.unwrap_or(TraceValue::Off));
    state.request_workspace_reload("Start");
    state.start_requested_workspace_fetch();
    let mut messages = vec![Response::new_ok(request.id.clone(), &initialize_result).into()];

    if !config_errors.is_empty() {
        let notification = lsp_server::Notification::new(
            lsp_types::notification::ShowMessage::METHOD.to_owned(),
            ShowMessageParams {
                typ: MessageType::WARNING,
                message: config_errors.message(i18n),
            },
        );
        messages.push(notification.into());
    }

    Ok(InitializeOutput { session: BrowserSession { state, outgoing }, messages })
}

impl BrowserSession {
    fn drain_outgoing(&mut self) -> Vec<Message> {
        let mut messages = Vec::new();
        while let Ok(message) = self.outgoing.try_recv() {
            messages.push(message);
        }
        messages
    }
}

fn run_json(f: impl FnOnce() -> Result<String, String> + panic::UnwindSafe) -> *mut c_char {
    let result = panic::catch_unwind(f)
        .unwrap_or_else(|_| Err("Vizsla LSP session panicked".to_owned()))
        .unwrap_or_else(|error| {
            serde_json::to_string(&serde_json::json!({ "error": error }))
                .unwrap_or_else(|_| "{\"error\":\"Vizsla LSP session failed\"}".to_owned())
        });

    CString::new(result).expect("JSON output must not contain interior NUL bytes").into_raw()
}

fn read_utf8(ptr: *const u8, len: usize) -> Result<String, String> {
    if ptr.is_null() {
        return Err("null input pointer".to_owned());
    }
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    std::str::from_utf8(bytes).map(|value| value.to_owned()).map_err(|error| error.to_string())
}

fn default_root() -> AbsPathBuf {
    AbsPathBuf::assert(Utf8PathBuf::from("/workspace"))
}

fn abs_path_from_url(url: &Url) -> Option<AbsPathBuf> {
    if let Ok(path) = url.to_file_path() {
        return AbsPathBuf::try_from(path).ok();
    }

    let path = url.path();
    if path.is_empty() {
        return None;
    }
    AbsPathBuf::try_from(path).ok()
}
