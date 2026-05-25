import { css, html, LitElement, nothing, unsafeCSS, type CSSResultGroup, type PropertyValues, type TemplateResult } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import type * as Monaco from "monaco-editor";
import monacoStyles from "monaco-editor/min/vs/editor/editor.main.css?inline";
import {
  ClipboardCopy,
  FileCode2,
  RefreshCw,
  SearchCode,
  SquareTerminal,
  type IconNode,
  type SVGProps,
} from "lucide";
import { VizslaBrowserClient } from "../lab/lsp-client";
import { diagnosticsFromLspReport, registerVizslaLspProviders, toMarkerData } from "../lab/monaco-lsp";
import { installShadowDomHoverBridge } from "../lab/monaco-shadow-hover";
import { configureMonaco, syncVizslaSemanticTheme, wireVizslaVscodeLanguage } from "../lab/monaco-setup";
import {
  displayPath,
  entryFile,
  isSourceFile,
  languageIdForPath,
  pathFromWorkspaceUri,
  scenarioWorkspaceFiles,
  sourceFiles,
  workspaceUri,
  type LabFileState,
} from "../lab/workspace";
import { drawWaveform } from "../lab/waveform";
import { getScenario, SCENARIOS } from "../scenarios";
import type { LabDiagnostic, LspTraceEntry, VizslaScenario, VizslaScenarioFile, WorkerStatus } from "../types";

const DIAGNOSTIC_DEBOUNCE_MS = 260;

export class VizslaLabElement extends LitElement {
  static properties = {
    scenario: { type: String },
    wasmBaseUrl: { type: String, attribute: "wasm-base-url" },
    vscodeAssetsUrl: { type: String, attribute: "vscode-assets-url" },
    height: { type: String },
    docs: { type: Boolean, reflect: true },
  };

  static styles: CSSResultGroup = [
    unsafeCSS(monacoStyles),
    css`
      :host {
        display: block;
        color: #efe8d2;
        font-family:
          "Aptos",
          "Segoe UI",
          system-ui,
          sans-serif;
        --vzlab-height: min(860px, calc(100vh - 28px));
      }

      :host([docs]) {
        --vzlab-height: 620px;
      }

      * {
        box-sizing: border-box;
      }

      .shell {
        min-height: var(--vzlab-height);
        background: #ece5d0;
        color: #171813;
        display: grid;
        grid-template-rows: auto 1fr;
        border: 1px solid #20221c;
        overflow: hidden;
      }

      .topbar {
        display: grid;
        grid-template-columns: minmax(230px, 1fr) auto auto;
        align-items: center;
        gap: 14px;
        padding: 12px;
        background: #f8f0da;
        border-bottom: 1px solid #20221c;
      }

      .brand {
        min-width: 0;
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
      }

      .mark {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        background: #171813;
        color: #b8dd47;
        font-family:
          "Cascadia Code",
          Consolas,
          monospace;
        font-weight: 800;
        border-radius: 6px;
      }

      h1,
      p,
      dl,
      dd {
        margin: 0;
      }

      h1 {
        font-size: 18px;
        line-height: 1.1;
      }

      .brand p,
      .editor-header,
      .file-strip,
      .status,
      select,
      button,
      .diagnostic span,
      .trace p,
      .project dt,
      .project dd {
        font-family:
          "Cascadia Code",
          Consolas,
          monospace;
      }

      .brand p {
        margin-top: 4px;
        color: #5d5849;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .select {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #5d5849;
        font-size: 12px;
      }

      select {
        height: 36px;
        min-width: 184px;
        color: #171813;
        background: #fffaf0;
        border: 1px solid #beb49b;
        border-radius: 6px;
        padding: 0 10px;
      }

      button {
        height: 36px;
        min-width: 36px;
        display: inline-grid;
        place-items: center;
        border: 1px solid #20221c;
        border-radius: 6px;
        background: #fffaf0;
        color: #171813;
        cursor: pointer;
        transition:
          background 150ms ease,
          transform 150ms ease;
      }

      button:hover,
      button:focus-visible {
        background: #b8dd47;
      }

      button:active {
        transform: translateY(1px);
      }

      button svg {
        width: 17px;
        height: 17px;
      }

      button.is-busy svg {
        animation: spin 700ms linear infinite;
      }

      .status {
        justify-self: end;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding: 0 12px;
        border: 1px solid #20221c;
        border-radius: 999px;
        background: #fffaf0;
        color: #8d2b1f;
        font-size: 12px;
      }

      .status.is-ready {
        color: #244c25;
      }

      .status-dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: currentColor;
      }

      .body {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(330px, 28vw);
        background: #10110f;
      }

      .editor-panel {
        min-width: 0;
        min-height: 0;
        display: grid;
        grid-template-rows: auto auto 1fr;
        border-right: 1px solid #383b32;
      }

      .editor-header {
        min-height: 42px;
        color: #d8cfb6;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0 14px;
        border-bottom: 1px solid #383b32;
        font-size: 12px;
      }

      .editor-header span:first-child {
        min-width: 0;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .editor-header svg {
        width: 15px;
        height: 15px;
      }

      .file-strip {
        min-height: 38px;
        display: flex;
        align-items: stretch;
        overflow-x: auto;
        border-bottom: 1px solid #383b32;
        background: #171915;
      }

      .file-strip button {
        flex: 0 0 auto;
        height: 38px;
        min-width: 0;
        max-width: 220px;
        border: 0;
        border-right: 1px solid #383b32;
        border-radius: 0;
        background: transparent;
        color: #9c947e;
        padding: 0 12px;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .file-strip button.is-active {
        background: #10110f;
        color: #efe8d2;
        box-shadow: inset 0 -2px 0 #b8dd47;
      }

      .file-strip button.has-diagnostic {
        color: #ffb02e;
      }

      .file-strip button.has-error {
        color: #ef6f6c;
      }

      .editor {
        min-height: 0;
      }

      .inspector {
        min-width: 0;
        min-height: 0;
        display: grid;
        grid-template-rows: 118px auto 1fr;
        background: #171915;
      }

      .waveform {
        width: 100%;
        height: 118px;
        border-bottom: 1px solid #383b32;
      }

      .tabs {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        border-bottom: 1px solid #383b32;
      }

      .tabs button {
        border: 0;
        border-right: 1px solid #383b32;
        border-radius: 0;
        background: #171915;
        color: #d8cfb6;
        font-size: 12px;
      }

      .tabs button:last-child {
        border-right: 0;
      }

      .tabs button.is-active {
        background: #ece5d0;
        color: #171813;
      }

      .panel {
        min-height: 0;
        display: none;
        overflow: auto;
        padding: 12px;
      }

      .panel.is-active {
        display: block;
      }

      .empty {
        min-height: 180px;
        display: grid;
        place-items: center;
        gap: 10px;
        align-content: center;
        color: #8a856f;
        text-align: center;
      }

      .empty svg {
        width: 28px;
        height: 28px;
      }

      .diagnostic,
      .trace,
      .project div {
        border: 1px solid #383b32;
        background: #10110f;
        color: #efe8d2;
        border-radius: 6px;
        padding: 10px;
        margin-bottom: 10px;
      }

      .diagnostic {
        border-left: 4px solid #ef6f6c;
      }

      .diagnostic.severity-2 {
        border-left-color: #ffb02e;
      }

      .diagnostic strong,
      .trace strong {
        display: block;
        font-size: 13px;
      }

      .diagnostic p,
      .trace p {
        color: #d8cfb6;
        margin: 7px 0;
        font-size: 12px;
        line-height: 1.45;
      }

      .diagnostic span {
        color: #8a856f;
        font-size: 11px;
      }

      .trace {
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr);
        column-gap: 8px;
      }

      .trace span {
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        border-radius: 4px;
        background: #293423;
        color: #b8dd47;
        font-weight: 800;
        font-size: 12px;
      }

      .trace.server span {
        background: #213632;
        color: #13b9a5;
      }

      .project {
        display: grid;
        gap: 10px;
      }

      .project div {
        margin-bottom: 0;
      }

      .project dt {
        color: #8a856f;
        font-size: 11px;
        text-transform: uppercase;
      }

      .project dd {
        margin-top: 5px;
        color: #efe8d2;
        font-size: 13px;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }

      @media (max-width: 860px) {
        .topbar {
          grid-template-columns: 1fr;
        }

        .controls,
        .status {
          justify-self: stretch;
        }

        .controls {
          flex-wrap: wrap;
        }

        .body {
          grid-template-columns: 1fr;
          grid-template-rows: minmax(420px, 1fr) 360px;
        }

        .editor-panel {
          border-right: 0;
          border-bottom: 1px solid #383b32;
        }
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 1ms !important;
          transition-duration: 1ms !important;
        }
      }
    `,
  ];

  declare scenario: string;
  declare wasmBaseUrl: string;
  declare vscodeAssetsUrl: string;
  declare height: string;
  declare docs: boolean;

  private monaco?: typeof Monaco;
  private editor?: Monaco.editor.IStandaloneCodeEditor;
  private client?: VizslaBrowserClient;
  private providerDisposables: Monaco.IDisposable[] = [];
  private editorDisposables: Monaco.IDisposable[] = [];
  private fileStates = new Map<string, LabFileState>();
  private activeScenario: VizslaScenario = getScenario("counter");
  private activeUri = workspaceUri(entryFile(this.activeScenario).path);
  private diagnosticsByUri = new Map<string, LabDiagnostic[]>();
  private trace: LspTraceEntry[] = [];
  private status: WorkerStatus = { engine: "unavailable", ready: false, detail: "Starting Vizsla WASM engine." };
  private activeTab = "diagnostics";
  private diagnosticsBusy = false;
  private cursor = "1:1";
  private resizeObserver?: ResizeObserver;
  private diagnosticTimer: number | undefined;
  private diagnosticGeneration = 0;
  private clientGeneration = 0;

  constructor() {
    super();
    this.scenario = "counter";
    this.wasmBaseUrl = "/wasm/";
    this.vscodeAssetsUrl = "/vscode/";
    this.height = "";
    this.docs = false;
  }

  protected firstUpdated(): void {
    this.activeScenario = getScenario(this.scenario);
    this.activeUri = workspaceUri(entryFile(this.activeScenario).path);
    this.style.setProperty("--vzlab-height", this.height || (this.docs ? "620px" : "min(860px, calc(100vh - 28px))"));
    this.mountEditor();
    this.restartClient();
    this.observeWaveform();
    this.refreshWaveform();
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("height") || changed.has("docs")) {
      this.style.setProperty("--vzlab-height", this.height || (this.docs ? "620px" : "min(860px, calc(100vh - 28px))"));
    }

    if (changed.has("scenario") && this.editor) {
      this.setScenario(getScenario(this.scenario));
    }

    this.refreshWaveform();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.clearDiagnosticTimer();
    this.disposeLanguageFeatures();
    this.disposeEditorDisposables();
    this.editor?.dispose();
    this.disposeModels();
    this.client?.dispose();
    this.resizeObserver?.disconnect();
  }

  protected render(): TemplateResult {
    const activePath = pathFromWorkspaceUri(this.activeUri);
    return html`
      <section class="shell" aria-label="Vizsla Lab">
        <header class="topbar">
          <div class="brand">
            <div class="mark" aria-hidden="true">VL</div>
            <div>
              <h1>Vizsla Lab</h1>
              <p>${activePath}</p>
            </div>
          </div>

          <div class="controls">
            <label class="select">
              <span>Scenario</span>
              <select @change=${this.onScenarioChange}>
                ${SCENARIOS.map(
                  (scenario) =>
                    html`<option value=${scenario.id} ?selected=${scenario.id === this.activeScenario.id}>
                      ${scenario.label}
                    </option>`,
                )}
              </select>
            </label>
            <button
              class=${this.diagnosticsBusy ? "is-busy" : ""}
              type="button"
              @click=${() => this.refreshDiagnosticsNow()}
              title="Refresh diagnostics"
            >
              ${icon(RefreshCw)}
            </button>
            <button type="button" @click=${() => this.resetScenario()} title="Reset workspace">${icon(FileCode2)}</button>
            <button type="button" @click=${() => this.copySource()} title="Copy current file">${icon(ClipboardCopy)}</button>
          </div>

          <div class=${this.status.ready ? "status is-ready" : "status"}>
            <span class="status-dot"></span>
            <strong>${this.status.ready ? "WASM ready" : "WASM starting"}</strong>
          </div>
        </header>

        <div class="body">
          <section class="editor-panel" aria-label="SystemVerilog editor">
            <div class="editor-header">
              <span>${icon(FileCode2)}${activePath}</span>
              <span>${this.cursor}</span>
            </div>
            <div class="file-strip" role="tablist" aria-label="Workspace files">
              ${this.activeScenario.files.map((file) => this.renderFileTab(file))}
            </div>
            <div class="editor"></div>
          </section>

          <aside class="inspector" aria-label="LSP inspector">
            <canvas class="waveform" aria-hidden="true"></canvas>
            <div class="tabs" role="tablist" aria-label="Inspector views">
              ${["diagnostics", "protocol", "project"].map(
                (tab) =>
                  html`<button
                    type="button"
                    role="tab"
                    class=${this.activeTab === tab ? "is-active" : ""}
                    @click=${() => this.activateTab(tab)}
                  >
                    ${tab}
                  </button>`,
              )}
            </div>
            <div class=${this.activeTab === "diagnostics" ? "panel is-active" : "panel"}>${this.renderDiagnostics()}</div>
            <div class=${this.activeTab === "protocol" ? "panel is-active" : "panel"}>${this.renderTrace()}</div>
            <div class=${this.activeTab === "project" ? "panel is-active" : "panel"}>${this.renderProject()}</div>
          </aside>
        </div>
      </section>
    `;
  }

  private renderFileTab(file: VizslaScenarioFile): TemplateResult {
    const uri = workspaceUri(file.path);
    const diagnostics = this.diagnosticsByUri.get(uri) ?? [];
    const classes = [
      uri === this.activeUri ? "is-active" : "",
      diagnostics.length > 0 ? "has-diagnostic" : "",
      diagnostics.some((diagnostic) => diagnostic.severity === 1) ? "has-error" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return html`
      <button type="button" role="tab" class=${classes} @click=${() => this.activateFile(uri)} title=${displayPath(file.path)}>
        ${displayPath(file.path)}
      </button>
    `;
  }

  private renderDiagnostics(): TemplateResult | TemplateResult[] {
    const diagnostics = this.allDiagnostics();
    if (diagnostics.length === 0) {
      return html`<div class="empty">${icon(SearchCode)}<span>No diagnostics</span></div>`;
    }

    return diagnostics.map(
      (diagnostic) => html`
        <article class="diagnostic severity-${diagnostic.severity}" @click=${() => this.revealDiagnostic(diagnostic)}>
          <strong>${diagnostic.title}</strong>
          <p>${diagnostic.message}</p>
          <span>${diagnostic.source} - ${diagnostic.filePath}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}</span>
        </article>
      `,
    );
  }

  private renderTrace(): TemplateResult | TemplateResult[] {
    if (this.trace.length === 0) {
      return html`<div class="empty">${icon(SquareTerminal)}<span>No protocol events</span></div>`;
    }

    return this.trace.map(
      (entry) => html`
        <div class=${`trace ${entry.direction}`}>
          <span>${entry.direction === "client" ? "C" : "S"}</span>
          <div>
            <strong>${entry.method}</strong>
            <p>${entry.detail}</p>
          </div>
        </div>
      `,
    );
  }

  private renderProject(): TemplateResult {
    return html`
      <dl class="project">
        <div><dt>Scenario</dt><dd>${this.activeScenario.description}</dd></div>
        <div><dt>Workspace</dt><dd>/workspace</dd></div>
        <div><dt>Entry</dt><dd>${this.activeScenario.entryFile}</dd></div>
        <div><dt>Files</dt><dd>${this.activeScenario.files.map((file) => file.path).join(", ")}</dd></div>
        <div><dt>Engine</dt><dd>${this.status.engine}</dd></div>
        <div><dt>State</dt><dd>${this.status.detail}</dd></div>
      </dl>
    `;
  }

  private mountEditor(): void {
    this.monaco = configureMonaco();
    const editorHost = this.renderRoot.querySelector<HTMLElement>(".editor");
    if (!editorHost) {
      return;
    }

    this.createModels(this.activeScenario);
    this.editor = this.monaco.editor.create(editorHost, {
      model: this.activeFileState()?.model,
      theme: "vizsla-lab",
      automaticLayout: true,
      fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
      fontSize: 14,
      lineHeight: 22,
      minimap: { enabled: false },
      renderLineHighlight: "all",
      scrollBeyondLastLine: false,
      tabSize: 2,
      padding: { top: 14, bottom: 14 },
      fixedOverflowWidgets: true,
      hover: { enabled: true, delay: 250, sticky: true },
      "semanticHighlighting.enabled": true,
    });

    this.editorDisposables.push(
      this.editor.onDidChangeCursorPosition((event) => {
        this.cursor = `${event.position.lineNumber}:${event.position.column}`;
        this.requestUpdate();
      }),
      this.editor.onDidChangeModelContent(() => {
        const state = this.activeFileState();
        if (!state || !isSourceFile(state.file.path)) {
          return;
        }
        state.version += 1;
        this.openDocument(state);
        this.client?.didChange(state.uri, state.model.getValue(), state.version);
        this.scheduleDiagnostics(this.sourceUris(), true);
      }),
      installShadowDomHoverBridge({
        monaco: this.monaco,
        editor: this.editor,
        root: this.renderRoot as ShadowRoot,
        ownsModel: (model) => this.ownsSourceModel(model),
      }),
    );

    void wireVizslaVscodeLanguage(this.editor, this.vscodeAssetsUrl).catch((error: unknown) => {
      this.pushTrace("server", "grammar/load", error instanceof Error ? error.message : "Failed to load VS Code grammar assets.");
    });
  }

  private createModels(scenario: VizslaScenario): void {
    if (!this.monaco) {
      return;
    }
    this.disposeModels();
    for (const file of scenario.files) {
      const uri = workspaceUri(file.path);
      const model = this.monaco.editor.createModel(file.source, languageIdForPath(file.path), this.monaco.Uri.parse(uri));
      this.fileStates.set(uri, { file, uri, version: 1, model, opened: false });
    }
    this.activeUri = workspaceUri(entryFile(scenario).path);
  }

  private registerLanguageFeatures(serverCapabilities: unknown): void {
    const client = this.client;
    if (!this.monaco || !client || !this.status.ready) {
      return;
    }

    this.disposeLanguageFeatures();
    syncVizslaSemanticTheme(this.monaco, serverCapabilities);
    const commonOptions = {
      monaco: this.monaco,
      serverCapabilities,
      ownsModel: (model: Monaco.editor.ITextModel) => this.ownsSourceModel(model),
      uriForModel: (model: Monaco.editor.ITextModel) => model.uri.toString(),
      request: async (method: string, params?: unknown) => {
        if (client !== this.client || !this.status.ready) {
          return null;
        }
        try {
          return await client.request(method, params);
        } catch (error) {
          if (client === this.client) {
            this.pushTrace("server", method, error instanceof Error ? error.message : "LSP request failed.");
          }
          return null;
        }
      },
    };
    this.providerDisposables = ["systemverilog", "verilog"].flatMap((languageId) =>
      registerVizslaLspProviders({
        ...commonOptions,
        languageId,
      }),
    );
  }

  private restartClient(): void {
    this.clearDiagnosticTimer();
    this.disposeLanguageFeatures();
    this.client?.dispose();
    const generation = ++this.clientGeneration;
    const client = new VizslaBrowserClient(this.wasmBaseUrl);
    this.client = client;
    this.status = { engine: "unavailable", ready: false, detail: "Starting Vizsla WASM engine." };
    client.onStatus = (status) => {
      if (generation !== this.clientGeneration || client !== this.client) {
        return;
      }
      this.status = status;
      if (status.ready) {
        this.openSourceDocuments();
        this.scheduleDiagnostics(this.sourceUris(), false);
      }
      this.requestUpdate();
    };
    client.onServerCapabilities = (capabilities) => {
      if (generation !== this.clientGeneration || client !== this.client) {
        return;
      }
      if (this.status.ready) {
        this.registerLanguageFeatures(capabilities);
      }
    };
    client.onDiagnosticRefresh = () => {
      if (generation !== this.clientGeneration || client !== this.client) {
        return;
      }
      this.scheduleDiagnostics(this.sourceUris(), false);
    };
    client.onTrace = (entry) => {
      if (generation !== this.clientGeneration || client !== this.client) {
        return;
      }
      this.trace = [entry, ...this.trace].slice(0, 52);
      this.requestUpdate();
    };
    client.onLog = (message, level) => {
      if (generation !== this.clientGeneration || client !== this.client) {
        return;
      }
      this.pushTrace("server", level === "error" ? "worker/error" : "worker/log", message);
    };
    client.start(scenarioWorkspaceFiles(this.activeScenario));
  }

  private openSourceDocuments(): void {
    for (const state of this.fileStates.values()) {
      if (isSourceFile(state.file.path)) {
        this.openDocument(state);
      }
    }
  }

  private openDocument(state: LabFileState): void {
    if (state.opened || !isSourceFile(state.file.path)) {
      return;
    }
    this.client?.didOpen(state.uri, languageIdForPath(state.file.path), state.model.getValue(), state.version);
    state.opened = true;
  }

  private async refreshDiagnosticsNow(): Promise<void> {
    await this.refreshDiagnostics(this.sourceUris(), false);
  }

  private scheduleDiagnostics(uris: string[], autosave: boolean): void {
    this.clearDiagnosticTimer();
    this.diagnosticTimer = window.setTimeout(() => {
      void this.refreshDiagnostics(uris, autosave);
    }, DIAGNOSTIC_DEBOUNCE_MS);
  }

  private async refreshDiagnostics(uris: string[], autosave: boolean): Promise<void> {
    if (!this.client || !this.status.ready || uris.length === 0) {
      return;
    }

    const generation = ++this.diagnosticGeneration;
    this.diagnosticsBusy = true;
    this.requestUpdate();

    try {
      for (const uri of uris) {
        const state = this.fileStates.get(uri);
        if (!state || !isSourceFile(state.file.path)) {
          continue;
        }
        this.openDocument(state);
        if (autosave) {
          this.client.didSave(uri);
        }
        const report = await this.client.request("textDocument/diagnostic", {
          textDocument: { uri },
          previousResultId: null,
        });
        if (generation !== this.diagnosticGeneration) {
          return;
        }
        this.diagnosticsByUri.set(uri, diagnosticsFromLspReport(report, uri, displayPath(state.file.path)));
        this.applyMarkers(uri);
      }
    } catch (error) {
      this.pushTrace("server", "textDocument/diagnostic", error instanceof Error ? error.message : "Diagnostics failed.");
    } finally {
      if (generation === this.diagnosticGeneration) {
        this.diagnosticsBusy = false;
        this.requestUpdate();
      }
    }
  }

  private resetScenario(): void {
    this.setScenario(this.activeScenario, true);
  }

  private setScenario(scenario: VizslaScenario, force = false): void {
    if (!force && scenario.id === this.activeScenario.id) {
      return;
    }
    this.disposeLanguageFeatures();
    this.client?.dispose();
    this.client = undefined;
    this.clientGeneration += 1;
    this.activeScenario = scenario;
    if (this.scenario !== scenario.id) {
      this.scenario = scenario.id;
    }
    this.diagnosticsByUri.clear();
    this.trace = [];
    this.createModels(scenario);
    this.editor?.setModel(this.activeFileState()?.model ?? null);
    this.editor?.updateOptions({ readOnly: this.activeFileState()?.file.editable === false });
    this.cursor = "1:1";
    this.restartClient();
    this.requestUpdate();
  }

  private disposeLanguageFeatures(): void {
    this.providerDisposables.forEach((disposable) => disposable.dispose());
    this.providerDisposables = [];
  }

  private disposeEditorDisposables(): void {
    this.editorDisposables.forEach((disposable) => disposable.dispose());
    this.editorDisposables = [];
  }

  private activateFile(uri: string): void {
    const state = this.fileStates.get(uri);
    if (!state || !this.editor) {
      return;
    }
    this.activeUri = uri;
    this.editor.setModel(state.model);
    this.editor.updateOptions({ readOnly: state.file.editable === false });
    this.openDocument(state);
    if (isSourceFile(state.file.path)) {
      this.scheduleDiagnostics(this.sourceUris(), false);
    }
    this.requestUpdate();
  }

  private revealDiagnostic(diagnostic: LabDiagnostic): void {
    const state = this.fileStates.get(diagnostic.uri);
    if (!state || !this.editor) {
      return;
    }
    this.activateFile(diagnostic.uri);
    const range = new this.monaco!.Range(
      diagnostic.range.start.line + 1,
      diagnostic.range.start.character + 1,
      diagnostic.range.end.line + 1,
      diagnostic.range.end.character + 1,
    );
    this.editor.setSelection(range);
    this.editor.revealRangeInCenter(range);
  }

  private async copySource(): Promise<void> {
    await navigator.clipboard.writeText(this.activeFileState()?.model.getValue() ?? "");
    this.pushTrace("client", "clipboard/writeText", pathFromWorkspaceUri(this.activeUri));
  }

  private onScenarioChange(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    this.setScenario(getScenario(select.value));
  }

  private activateTab(tab: string): void {
    this.activeTab = tab;
    this.requestUpdate();
  }

  private applyMarkers(uri: string): void {
    if (!this.monaco) {
      return;
    }
    const state = this.fileStates.get(uri);
    if (!state) {
      return;
    }
    const diagnostics = this.diagnosticsByUri.get(uri) ?? [];
    this.monaco.editor.setModelMarkers(
      state.model,
      "vizsla",
      diagnostics.map((diagnostic) => toMarkerData(this.monaco!, diagnostic)),
    );
  }

  private activeFileState(): LabFileState | undefined {
    return this.fileStates.get(this.activeUri);
  }

  private ownsSourceModel(model: Monaco.editor.ITextModel): boolean {
    const state = this.fileStates.get(model.uri.toString());
    return !!state && isSourceFile(state.file.path);
  }

  private sourceUris(): string[] {
    return sourceFiles(this.activeScenario).map((file) => workspaceUri(file.path));
  }

  private allDiagnostics(): LabDiagnostic[] {
    return Array.from(this.diagnosticsByUri.values()).flat();
  }

  private clearDiagnosticTimer(): void {
    if (this.diagnosticTimer !== undefined) {
      window.clearTimeout(this.diagnosticTimer);
      this.diagnosticTimer = undefined;
    }
  }

  private disposeModels(): void {
    for (const state of this.fileStates.values()) {
      state.model.dispose();
    }
    this.fileStates.clear();
  }

  private observeWaveform(): void {
    const canvas = this.renderRoot.querySelector<HTMLCanvasElement>(".waveform");
    if (!canvas) {
      return;
    }
    this.resizeObserver = new ResizeObserver(() => this.refreshWaveform());
    this.resizeObserver.observe(canvas);
  }

  private refreshWaveform(): void {
    const canvas = this.renderRoot.querySelector<HTMLCanvasElement>(".waveform");
    if (canvas) {
      drawWaveform(canvas, this.status.ready);
    }
  }

  private pushTrace(direction: "client" | "server", method: string, detail: string): void {
    this.trace = [{ id: Date.now(), direction, method, detail }, ...this.trace].slice(0, 52);
    this.requestUpdate();
  }
}

function icon(node: IconNode | undefined): TemplateResult | typeof nothing {
  return node ? html`${unsafeSVG(toSvg(node))}` : nothing;
}

function toSvg([tag, attrs, children]: IconNode): string {
  const attrText = attrsToString(attrs);
  const childText = children?.map(([childTag, childAttrs]) => `<${childTag}${attrsToString(childAttrs)} />`).join("") ?? "";
  return `<${tag}${attrText}>${childText}</${tag}>`;
}

function attrsToString(attrs: SVGProps): string {
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${String(value).replace(/"/g, "&quot;")}"`)
    .join("");
}

if (!customElements.get("vizsla-lab")) {
  customElements.define("vizsla-lab", VizslaLabElement);
}
