import { LitElement, type PropertyValues, type TemplateResult } from "lit";
import type * as Monaco from "monaco-editor";
import { renderVizslaLabView } from "./vizsla-lab.view";
import { vizslaLabStyles } from "./vizsla-lab.styles";
import { isClientDisposedError, VizslaBrowserClient } from "../lab/lsp-client";
import { diagnosticsFromLspReport, registerVizslaLspProviders, toMarkerData } from "../lab/monaco-lsp";
import { installShadowDomHoverBridge } from "../lab/monaco-shadow-hover";
import {
  configureMonaco,
  setVizslaMonacoTheme,
  syncVizslaSemanticTheme,
  vizslaThemeName,
  wireVizslaVscodeLanguage,
  type VizslaColorScheme,
} from "../lab/monaco-setup";
import {
  displayPath,
  entryFile,
  isSourceFile,
  languageIdForPath,
  normalizeWorkspacePath,
  scenarioWorkspaceFiles,
  sourceFiles,
  workspaceUri,
  type LabFileState,
} from "../lab/workspace";
import { getScenario, SCENARIOS } from "../scenarios";
import type { LabDiagnostic, VizslaScenario, WorkerStatus } from "../types";

const DIAGNOSTIC_DEBOUNCE_MS = 260;

export class VizslaLabElement extends LitElement {
  static properties = {
    scenario: { type: String },
    wasmBaseUrl: { type: String, attribute: "wasm-base-url" },
    vscodeAssetsUrl: { type: String, attribute: "vscode-assets-url" },
    height: { type: String },
    theme: { type: String },
    docs: { type: Boolean, reflect: true },
    project: { attribute: false },
    activeFile: { type: String, attribute: "active-file" },
    cursorLine: { type: Number, attribute: "cursor-line" },
    cursorColumn: { type: Number, attribute: "cursor-column" },
    selection: { type: String },
    diagnosticsOpen: { type: Boolean, attribute: "diagnostics-open", reflect: true },
    focusEditor: { type: Boolean, attribute: "focus-editor" },
  };

  static styles = vizslaLabStyles;

  declare scenario: string;
  declare wasmBaseUrl: string;
  declare vscodeAssetsUrl: string;
  declare height: string;
  declare theme: "auto" | VizslaColorScheme;
  declare docs: boolean;
  declare project: VizslaScenario | undefined;
  declare activeFile: string;
  declare cursorLine: number;
  declare cursorColumn: number;
  declare selection: string;
  declare diagnosticsOpen: boolean;
  declare focusEditor: boolean;

  private monaco?: typeof Monaco;
  private editor?: Monaco.editor.IStandaloneCodeEditor;
  private client?: VizslaBrowserClient;
  private providerDisposables: Monaco.IDisposable[] = [];
  private editorDisposables: Monaco.IDisposable[] = [];
  private fileStates = new Map<string, LabFileState>();
  private activeScenario: VizslaScenario = getScenario("counter");
  private readonly workspaceRootUri = `file:///workspace-${Math.random().toString(36).slice(2)}`;
  private activeUri = this.workspaceUri(entryFile(this.activeScenario).path);
  private diagnosticsByUri = new Map<string, LabDiagnostic[]>();
  private status: WorkerStatus = { engine: "unavailable", ready: false, detail: "Starting Vizsla WASM engine." };
  private inspectorOpen = false;
  private diagnosticsBusy = false;
  private diagnosticTimer: number | undefined;
  private diagnosticGeneration = 0;
  private clientGeneration = 0;
  private serverCapabilities: unknown;
  private colorScheme: VizslaColorScheme = "dark";
  private themeObserver?: MutationObserver;
  private themeMediaQuery?: MediaQueryList;
  private readonly handleThemeChange = () => this.syncColorScheme();

  constructor() {
    super();
    this.scenario = "counter";
    this.wasmBaseUrl = "/wasm/";
    this.vscodeAssetsUrl = "/vscode/";
    this.height = "";
    this.theme = "auto";
    this.docs = false;
    this.project = undefined;
    this.activeFile = "";
    this.cursorLine = 0;
    this.cursorColumn = 1;
    this.selection = "";
    this.diagnosticsOpen = false;
    this.focusEditor = false;
  }

  protected firstUpdated(): void {
    this.activeScenario = this.resolvedScenario();
    this.activeUri = this.workspaceUri(entryFile(this.activeScenario).path);
    this.inspectorOpen = this.diagnosticsOpen;
    this.installThemeSync();
    this.syncColorScheme();
    this.syncLabHeight();
    this.mountEditor();
    this.applyConfiguredState();
    this.restartClient();
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("height") || changed.has("docs")) {
      this.syncLabHeight();
    }

    if (changed.has("theme")) {
      this.syncColorScheme();
    }

    if ((changed.has("scenario") || changed.has("project")) && this.editor) {
      this.setScenario(this.resolvedScenario(), changed.has("project"));
    }

    if (
      this.editor &&
      (changed.has("activeFile") ||
        changed.has("cursorLine") ||
        changed.has("cursorColumn") ||
        changed.has("selection") ||
        changed.has("focusEditor"))
    ) {
      this.applyConfiguredState();
    }

    if (changed.has("diagnosticsOpen") && this.inspectorOpen !== this.diagnosticsOpen) {
      this.inspectorOpen = this.diagnosticsOpen;
      this.requestUpdate();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.clearDiagnosticTimer();
    this.disposeLanguageFeatures();
    this.disposeEditorDisposables();
    this.editor?.dispose();
    this.disposeModels();
    this.client?.dispose();
    this.themeObserver?.disconnect();
    this.removeThemeMediaListener();
  }

  protected render(): TemplateResult {
    return renderVizslaLabView(
      {
        scenarios: this.availableScenarios(),
        allowScenarioSelection: !this.project,
        activeScenario: this.activeScenario,
        activeUri: this.activeUri,
        workspaceRootUri: this.workspaceRootUri,
        diagnosticsByUri: this.diagnosticsByUri,
        status: this.status,
        inspectorOpen: this.inspectorOpen,
        diagnosticsBusy: this.diagnosticsBusy,
      },
      {
        onScenarioChange: (event) => this.onScenarioChange(event),
        refreshDiagnostics: () => void this.refreshDiagnosticsNow(),
        resetScenario: () => this.resetScenario(),
        copySource: () => void this.copySource(),
        activateFile: (uri) => this.activateFile(uri),
        revealDiagnostic: (diagnostic) => this.revealDiagnostic(diagnostic),
        toggleDiagnostics: () => this.toggleDiagnostics(),
        closeInspector: () => this.closeInspector(),
      },
    );
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
      theme: vizslaThemeName(this.colorScheme),
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
      this.monaco.editor.registerEditorOpener({
        openCodeEditor: (source, resource, selectionOrPosition) => {
          if (source !== this.editor) {
            return false;
          }

          const target = this.fileStates.get(resource.toString());
          if (!target || !this.editor) {
            return false;
          }

          this.activateFile(target.uri);
          this.revealLocation(selectionOrPosition);
          this.editor.focus();
          return true;
        },
      }),
    );

    this.editorDisposables.push(
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
      console.warn(error instanceof Error ? error.message : "Failed to load VS Code grammar assets.");
    });
  }

  private createModels(scenario: VizslaScenario): void {
    if (!this.monaco) {
      return;
    }
    this.disposeModels();
    for (const file of scenario.files) {
      const uri = this.workspaceUri(file.path);
      const model = this.monaco.editor.createModel(file.source, languageIdForPath(file.path), this.monaco.Uri.parse(uri));
      this.fileStates.set(uri, { file, uri, version: 1, model, opened: false });
    }
    this.activeUri = this.workspaceUri(entryFile(scenario).path);
  }

  private registerLanguageFeatures(serverCapabilities: unknown): void {
    const client = this.client;
    if (!this.monaco || !client || !this.status.ready) {
      return;
    }

    this.disposeLanguageFeatures();
    syncVizslaSemanticTheme(this.monaco, serverCapabilities, this.colorScheme);
    const commonOptions = {
      monaco: this.monaco,
      serverCapabilities,
      ownsModel: (model: Monaco.editor.ITextModel) => this.ownsSourceModel(model),
      uriForModel: (model: Monaco.editor.ITextModel) => model.uri.toString(),
      diagnosticsForModel: (model: Monaco.editor.ITextModel) => this.diagnosticsByUri.get(model.uri.toString()) ?? [],
      request: async (method: string, params?: unknown) => {
        if (client !== this.client || !this.status.ready) {
          return null;
        }
        try {
          return await client.request(method, params);
        } catch (error) {
          if (client === this.client && !isClientDisposedError(error)) {
            console.warn(error instanceof Error ? error.message : "LSP request failed.");
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
    const client = new VizslaBrowserClient(this.wasmBaseUrl, this.workspaceRootUri);
    this.client = client;
    this.serverCapabilities = undefined;
    this.status = { engine: "unavailable", ready: false, detail: "Starting Vizsla WASM engine." };
    client.onStatus = (status) => {
      if (generation !== this.clientGeneration || client !== this.client) {
        return;
      }
      this.status = status;
      if (status.ready) {
        this.openSourceDocuments();
        if (this.serverCapabilities) {
          this.registerLanguageFeatures(this.serverCapabilities);
        }
        this.scheduleDiagnostics(this.sourceUris(), false);
      }
      this.requestUpdate();
    };
    client.onServerCapabilities = (capabilities) => {
      if (generation !== this.clientGeneration || client !== this.client) {
        return;
      }
      this.serverCapabilities = capabilities;
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
    client.onLog = (message, level) => {
      if (generation !== this.clientGeneration || client !== this.client) {
        return;
      }
      const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
      logger(message);
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
      console.error(error instanceof Error ? error.message : "Diagnostics failed.");
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
    this.serverCapabilities = undefined;
    this.activeScenario = scenario;
    if (this.scenario !== scenario.id) {
      this.scenario = scenario.id;
    }
    this.diagnosticsByUri.clear();
    this.createModels(scenario);
    this.editor?.setModel(this.activeFileState()?.model ?? null);
    this.editor?.updateOptions({ readOnly: this.activeFileState()?.file.editable === false });
    this.applyConfiguredState();
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

  private applyConfiguredState(): void {
    this.applyConfiguredFile();
    this.applyConfiguredSelection();
    if (this.focusEditor) {
      this.editor?.focus();
    }
  }

  private applyConfiguredFile(): void {
    const uri = this.configuredActiveUri();
    if (!uri || uri === this.activeUri) {
      return;
    }
    this.activateFile(uri);
  }

  private configuredActiveUri(): string | undefined {
    if (!this.activeFile) {
      return undefined;
    }

    let uri: string;
    try {
      uri = this.workspaceUri(normalizeWorkspacePath(this.activeFile));
    } catch (error) {
      console.warn(error instanceof Error ? error.message : "Invalid active-file value.");
      return undefined;
    }

    if (!this.fileStates.has(uri)) {
      console.warn(`active-file '${this.activeFile}' is not part of scenario '${this.activeScenario.id}'.`);
      return undefined;
    }

    return uri;
  }

  private applyConfiguredSelection(): void {
    if (!this.editor) {
      return;
    }

    const range = this.configuredRange();
    if (range) {
      this.editor.setSelection(range);
      this.editor.revealRangeInCenterIfOutsideViewport(range);
      return;
    }

    if (this.cursorLine >= 1) {
      const model = this.editor.getModel();
      if (!model) {
        return;
      }
      const position = model.validatePosition({
        lineNumber: this.cursorLine,
        column: Math.max(1, this.cursorColumn || 1),
      });
      this.editor.setPosition(position);
      this.editor.revealLineInCenterIfOutsideViewport(position.lineNumber);
    }
  }

  private revealLocation(selectionOrPosition: Monaco.IRange | Monaco.IPosition | undefined): void {
    if (!this.editor || !this.monaco || !selectionOrPosition) {
      return;
    }

    if ("startLineNumber" in selectionOrPosition) {
      const range = new this.monaco.Range(
        selectionOrPosition.startLineNumber,
        selectionOrPosition.startColumn,
        selectionOrPosition.endLineNumber,
        selectionOrPosition.endColumn,
      );
      this.editor.setSelection(range);
      this.editor.revealRangeInCenter(range);
      return;
    }

    const position = {
      lineNumber: selectionOrPosition.lineNumber,
      column: selectionOrPosition.column,
    };
    this.editor.setPosition(position);
    this.editor.revealPositionInCenter(position);
  }

  private configuredRange(): Monaco.Range | undefined {
    if (!this.selection || !this.monaco || !this.editor) {
      return undefined;
    }

    const match = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(this.selection.trim());
    if (!match) {
      console.warn(`Invalid selection '${this.selection}'. Expected line:column-line:column.`);
      return undefined;
    }

    const model = this.editor.getModel();
    if (!model) {
      return undefined;
    }

    const start = model.validatePosition({
      lineNumber: Number(match[1]),
      column: Number(match[2]),
    });
    const end = model.validatePosition({
      lineNumber: Number(match[3]),
      column: Number(match[4]),
    });

    return new this.monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
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
  }

  private onScenarioChange(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    if (this.project && select.value !== this.project.id) {
      this.project = undefined;
    }
    this.setScenario(getScenario(select.value));
  }

  private toggleDiagnostics(): void {
    this.inspectorOpen = !this.inspectorOpen;
    this.diagnosticsOpen = this.inspectorOpen;
    this.requestUpdate();
  }

  private closeInspector(): void {
    this.inspectorOpen = false;
    this.diagnosticsOpen = false;
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
    return sourceFiles(this.activeScenario).map((file) => this.workspaceUri(file.path));
  }

  private workspaceUri(path: string): string {
    return workspaceUri(path, this.workspaceRootUri);
  }

  private resolvedScenario(): VizslaScenario {
    return this.project ?? getScenario(this.scenario);
  }

  private availableScenarios(): VizslaScenario[] {
    if (!this.project || SCENARIOS.some((scenario) => scenario.id === this.project?.id)) {
      return SCENARIOS;
    }
    return [this.project, ...SCENARIOS];
  }

  private clearDiagnosticTimer(): void {
    if (this.diagnosticTimer !== undefined) {
      window.clearTimeout(this.diagnosticTimer);
      this.diagnosticTimer = undefined;
    }
  }

  private installThemeSync(): void {
    if (typeof document !== "undefined") {
      this.themeObserver = new MutationObserver(this.handleThemeChange);
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });
    }

    if (typeof window !== "undefined" && "matchMedia" in window) {
      this.themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      this.themeMediaQuery.addEventListener("change", this.handleThemeChange);
    }
  }

  private removeThemeMediaListener(): void {
    if (!this.themeMediaQuery) {
      return;
    }

    this.themeMediaQuery.removeEventListener("change", this.handleThemeChange);
  }

  private syncColorScheme(): void {
    const colorScheme = this.resolveColorScheme();
    if (this.colorScheme === colorScheme && this.getAttribute("data-theme") === colorScheme) {
      return;
    }

    this.colorScheme = colorScheme;
    this.setAttribute("data-theme", colorScheme);
    if (this.monaco) {
      setVizslaMonacoTheme(this.monaco, colorScheme);
    }
    this.requestUpdate();
  }

  private resolveColorScheme(): VizslaColorScheme {
    if (this.theme === "light" || this.theme === "dark") {
      return this.theme;
    }

    if (typeof document !== "undefined") {
      const root = document.documentElement;
      const declaredTheme = (root.dataset.theme ?? root.getAttribute("data-theme") ?? "").toLowerCase();
      if (declaredTheme === "light" || declaredTheme === "dark") {
        return declaredTheme;
      }
      if (root.classList.contains("dark")) {
        return "dark";
      }
      if (root.classList.contains("light")) {
        return "light";
      }
    }

    return this.themeMediaQuery?.matches ? "dark" : "light";
  }

  private syncLabHeight(): void {
    this.style.setProperty("--vzlab-height", this.height || (this.docs ? "430px" : "100dvh"));
  }

  private disposeModels(): void {
    for (const state of this.fileStates.values()) {
      state.model.dispose();
    }
    this.fileStates.clear();
  }
}

if (!customElements.get("vizsla-lab")) {
  customElements.define("vizsla-lab", VizslaLabElement);
}
