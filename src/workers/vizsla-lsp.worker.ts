import type { WorkerRequest, WorkerResponse, WorkerStatus, WorkerWorkspaceFile } from "../types";
import { browserClientCapabilities, browserInitializationOptions } from "./lsp-browser-config";
import { isRecord, type LspMessage, type LspNotification, type LspResponse, type PendingClientRequest, type WasmEngine } from "./lsp-protocol";

const REQUEST_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 16;

let engine: WasmEngine | null = null;
let status: WorkerStatus = {
  engine: "unavailable",
  ready: false,
  detail: "Vizsla WASM engine has not been loaded.",
};
let serverCapabilities: unknown = null;
let traceId = 1;
let lspId = 1;
let pendingNotifications: LspNotification[] = [];
let pollTimer: number | undefined;
let rootUri = "file:///workspace";
const pendingClientRequests = new Map<number | string, PendingClientRequest>();

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  void handleRequest(event.data).catch((error: unknown) => {
    post({
      kind: "log",
      level: "error",
      message: error instanceof Error ? error.message : "Vizsla worker request failed.",
    });
  });
});

async function handleRequest(message: WorkerRequest): Promise<void> {
  switch (message.kind) {
    case "boot":
      trace("client", "initialize", `${message.workspaceFiles.length} workspace files`);
      await boot(message.wasmBaseUrl, message.rootUri, message.workspaceFiles);
      post({ kind: "status", status });
      if (serverCapabilities) {
        post({ kind: "serverCapabilities", capabilities: serverCapabilities });
      }
      trace("server", "initialized", status.detail);
      break;
    case "lspNotification": {
      const notification: LspNotification = {
        jsonrpc: "2.0",
        method: message.method,
        params: message.params,
      };
      trace("client", message.method, summarizeJson(message.params ?? {}));
      if (engine) {
        sendLsp(notification);
      } else {
        pendingNotifications.push(notification);
      }
      break;
    }
    case "lspRequest": {
      trace("client", message.method, summarizeJson(message.params ?? {}));
      try {
        sendClientLspRequest(message.requestId, message.method, message.params ?? {});
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : `${message.method} failed.`;
        trace("server", message.method, errorMessage);
        post({ kind: "lspError", requestId: message.requestId, message: errorMessage });
      }
      break;
    }
  }
}

async function boot(wasmBaseUrl: string, requestedRootUri: string, workspaceFiles: WorkerWorkspaceFile[]): Promise<void> {
  try {
    clearPendingClientRequests("Vizsla LSP is restarting.");
    rootUri = normalizeRootUri(requestedRootUri);
    engine = await loadWasmEngine(wasmBaseUrl, rootUri, workspaceFiles);
    const initialize = sendImmediateLspRequest("initialize", {
      processId: null,
      rootUri,
      capabilities: browserClientCapabilities(),
      initializationOptions: browserInitializationOptions(),
      trace: "off",
    });
    if (initialize.error) {
      throw new Error(initialize.error.message);
    }
    serverCapabilities = isRecord(initialize.result) ? (initialize.result.capabilities ?? null) : null;
    sendLspNotification("initialized", {});
    flushPendingNotifications();
    status = { engine: "wasm", ready: true, detail: "Vizsla WASM engine loaded." };
  } catch (error) {
    engine = null;
    serverCapabilities = null;
    clearPendingClientRequests(error instanceof Error ? error.message : "Vizsla WASM is not available.");
    status = {
      engine: "unavailable",
      ready: false,
      detail: error instanceof Error ? error.message : "Vizsla WASM is not available.",
    };
    post({
      kind: "log",
      level: "error",
      message: `${status.detail} Build and copy the real Vizsla WASM adapter to public/wasm/vizsla-lsp.js.`,
    });
  }
}

async function loadWasmEngine(wasmBaseUrl: string, rootUri: string, workspaceFiles: WorkerWorkspaceFile[]): Promise<WasmEngine> {
  const baseUrl = new URL(wasmBaseUrl.endsWith("/") ? wasmBaseUrl : `${wasmBaseUrl}/`, self.location.href);
  const moduleUrl = new URL("vizsla-lsp.js", baseUrl);
  moduleUrl.search = baseUrl.search;
  const loaded = (await import(/* @vite-ignore */ moduleUrl.href)) as {
    createVizslaLspEngine?: (options: {
      wasmBaseUrl: string;
      rootUri: string;
      workspaceFiles: WorkerWorkspaceFile[];
    }) => Promise<WasmEngine>;
  };

  if (!loaded.createVizslaLspEngine) {
    throw new Error("Vizsla WASM adapter did not export createVizslaLspEngine().");
  }

  return loaded.createVizslaLspEngine({ wasmBaseUrl: baseUrl.href, rootUri, workspaceFiles });
}

function requireEngine(): WasmEngine {
  if (!engine) {
    throw new Error(status.detail);
  }
  return engine;
}

function sendImmediateLspRequest(method: string, params: unknown): LspResponse {
  const id = lspId++;
  const responses = sendLsp({ jsonrpc: "2.0", id, method, params });
  const response = responses.find((message): message is LspResponse => "id" in message && message.id === id);
  if (!response) {
    throw new Error(`Vizsla LSP did not respond to ${method}.`);
  }
  return response;
}

function sendClientLspRequest(requestId: number, method: string, params: unknown): void {
  requireEngine();

  const id = lspId++;
  const timeout = self.setTimeout(() => {
    const pending = pendingClientRequests.get(id);
    if (!pending) {
      return;
    }
    pendingClientRequests.delete(id);
    trace("server", pending.method, "request timed out");
    post({
      kind: "lspError",
      requestId: pending.requestId,
      message: `Vizsla LSP did not respond to ${pending.method}.`,
    });
  }, REQUEST_TIMEOUT_MS);

  pendingClientRequests.set(id, { requestId, method, timeout });
  sendLsp({ jsonrpc: "2.0", id, method, params });

  if (pendingClientRequests.has(id)) {
    schedulePump();
  }
}

function sendLspNotification(method: string, params: unknown): void {
  sendLsp({ jsonrpc: "2.0", method, params });
}

function sendLsp(message: LspMessage): LspMessage[] {
  const emitted = requireEngine().send(message);
  processEmittedMessages(emitted);
  return emitted;
}

function pollLsp(): LspMessage[] {
  const emitted = requireEngine().poll();
  processEmittedMessages(emitted);
  return emitted;
}

function processEmittedMessages(emitted: LspMessage[]): void {
  for (const response of emitted) {
    traceEmittedMessage(response);
    handleClientResponse(response);
    handleServerRequest(response);
  }
}

function flushPendingNotifications(): void {
  const notifications = pendingNotifications;
  pendingNotifications = [];
  for (const notification of notifications) {
    sendLsp(notification);
  }
}

function schedulePump(): void {
  if (pollTimer !== undefined || pendingClientRequests.size === 0) {
    return;
  }

  pollTimer = self.setTimeout(() => {
    pollTimer = undefined;
    try {
      pollLsp();
      schedulePump();
    } catch (error) {
      clearPendingClientRequests(error instanceof Error ? error.message : "Vizsla LSP polling failed.");
    }
  }, POLL_INTERVAL_MS);
}

function handleClientResponse(message: LspMessage): void {
  if (!("id" in message) || "method" in message) {
    return;
  }

  const pending = pendingClientRequests.get(message.id);
  if (!pending) {
    return;
  }

  self.clearTimeout(pending.timeout);
  pendingClientRequests.delete(message.id);

  if (message.error) {
    trace("server", pending.method, message.error.message);
    post({ kind: "lspError", requestId: pending.requestId, message: message.error.message });
  } else {
    trace("server", pending.method, summarizeLspResult(message.result));
    post({ kind: "lspResponse", requestId: pending.requestId, result: message.result ?? null });
  }
}

function clearPendingClientRequests(message: string): void {
  for (const pending of pendingClientRequests.values()) {
    self.clearTimeout(pending.timeout);
    post({ kind: "lspError", requestId: pending.requestId, message });
  }
  pendingClientRequests.clear();

  if (pollTimer !== undefined) {
    self.clearTimeout(pollTimer);
    pollTimer = undefined;
  }
}

function handleServerRequest(message: LspMessage): void {
  if (!("method" in message) || !("id" in message)) {
    return;
  }

  if (message.method === "workspace/diagnostic/refresh") {
    post({ kind: "diagnosticRefresh" });
    respondToServer(message.id, null);
  } else if (
    message.method === "workspace/inlayHint/refresh" ||
    message.method === "workspace/codeLens/refresh" ||
    message.method === "client/registerCapability" ||
    message.method === "client/unregisterCapability"
  ) {
    respondToServer(message.id, null);
  } else if (message.method === "workspace/configuration") {
    respondToServer(message.id, []);
  }
}

function respondToServer(id: number | string, result: unknown): void {
  sendLsp({ jsonrpc: "2.0", id, result });
}

function traceEmittedMessage(message: LspMessage): void {
  if ("method" in message) {
    const detail = "params" in message ? summarizeJson(message.params) : "";
    trace("server", message.method, detail);
  } else if ("id" in message) {
    trace("server", `response#${String(message.id)}`, message.error ? message.error.message : "ok");
  }
}

function summarizeJson(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function summarizeLspResult(value: unknown): string {
  if (isRecord(value)) {
    if (Array.isArray(value.items)) {
      return `${value.items.length} items`;
    }
    if (Array.isArray(value.data)) {
      return `${value.data.length / 5} semantic tokens`;
    }
    if (Array.isArray(value.edits)) {
      return `${value.edits.length} edits`;
    }
    if ("contents" in value) {
      return "contents returned";
    }
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  return value === null || value === undefined ? "empty" : "ok";
}

function trace(direction: "client" | "server", method: string, detail: string): void {
  post({ kind: "trace", entry: { id: traceId++, direction, method, detail } });
}

function post(response: WorkerResponse): void {
  self.postMessage(response);
}

function normalizeRootUri(uri: string): string {
  return uri.replace(/\/+$/, "");
}
