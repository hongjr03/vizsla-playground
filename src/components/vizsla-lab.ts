import { LitElement, type PropertyValues, type TemplateResult } from "lit";
import type * as Monaco from "@codingame/monaco-vscode-editor-api";
import { renderVizslaLabView, type FileDialogState } from "./vizsla-lab.view";
import { vizslaLabStyles } from "./vizsla-lab.styles";
import { VizslaBrowserClient } from "../lab/lsp-client";
import { diagnosticsFromLspReport, toMarkerData } from "../lab/monaco-lsp";
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
  fileName,
  isSourceFile,
  languageIdForPath,
  normalizeWorkspacePath,
  scenarioWorkspaceFiles,
  sourceFiles,
  workspaceUri,
  type LabFileState,
} from "../lab/workspace";
import { getScenario } from "../scenarios";
import type { LabDiagnostic, VizslaScenario, WorkerStatus } from "../types";

const DIAGNOSTIC_DEBOUNCE_MS = 260;
const FILE_STRIP_SCROLL_IDLE_MS = 850;

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
  private editorDisposables: Monaco.IDisposable[] = [];
  private fileStates = new Map<string, LabFileState>();
  private activeScenario: VizslaScenario = getScenario("counter");
  private initialScenario: VizslaScenario = cloneScenario(getScenario("counter"));
  private readonly workspaceRootUri = `file:///workspace-${Math.random().toString(36).slice(2)}`;
  private activeUri = this.workspaceUri(entryFile(this.activeScenario).path);
  private diagnosticsByUri = new Map<string, LabDiagnostic[]>();
  private status: WorkerStatus = { engine: "unavailable", ready: false, detail: "Starting Vizsla WASM engine." };
  private inspectorOpen = false;
  private diagnosticsBusy = false;
  private fileStripOverflowing = false;
  private fileStripScrolling = false;
  private fileStripDragging = false;
  private fileStripThumbLeft = 0;
  private fileStripThumbWidth = 100;
  private fileDialog: FileDialogState | undefined;
  private pendingSaveUris = new Set<string>();
  private diagnosticTimer: number | undefined;
  private fileStripScrollTimer: number | undefined;
  private fileStripMeasureFrame: number | undefined;
  private fileStripDrag:
    | {
        startClientX: number;
        startScrollLeft: number;
        maxScrollLeft: number;
        trackWidth: number;
        thumbWidth: number;
      }
    | undefined;
  private diagnosticGeneration = 0;
  private clientGeneration = 0;
  private serverCapabilities: unknown;
  private colorScheme: VizslaColorScheme = "dark";
  private themeObserver?: MutationObserver;
  private themeMediaQuery?: MediaQueryList;
  private readonly handleThemeChange = () => this.syncColorScheme();
  private readonly handleFileStripThumbDrag = (event: PointerEvent) => this.dragFileStripThumb(event);
  private readonly handleFileStripThumbRelease = () => this.endFileStripThumbDrag();

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
    this.activeScenario = cloneScenario(this.resolvedScenario());
    this.initialScenario = cloneScenario(this.activeScenario);
    this.activeUri = this.workspaceUri(entryFile(this.activeScenario).path);
    this.inspectorOpen = this.diagnosticsOpen;
    this.installThemeSync();
    this.syncColorScheme();
    this.syncLabHeight();
    void this.mountEditor()
      .then(() => {
        this.applyConfiguredState();
        this.restartClient();
        this.queueFileStripMeasurement();
      })
      .catch((error: unknown) => {
        this.status = {
          engine: "unavailable",
          ready: false,
          detail: error instanceof Error ? error.message : "Failed to start the editor runtime.",
        };
        this.requestUpdate();
      });
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("height") || changed.has("docs")) {
      this.syncLabHeight();
    }

    if (changed.has("theme")) {
      this.syncColorScheme();
    }

    if ((changed.has("scenario") || changed.has("project")) && this.editor) {
      this.setScenario(this.resolvedScenario(), true, true);
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

    this.queueFileStripMeasurement();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.clearDiagnosticTimer();
    this.clearFileStripTimers();
    this.removeFileStripDragListeners();
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
        activeScenario: this.activeScenario,
        activeUri: this.activeUri,
        workspaceRootUri: this.workspaceRootUri,
        diagnosticsByUri: this.diagnosticsByUri,
        status: this.status,
        inspectorOpen: this.inspectorOpen,
        diagnosticsBusy: this.diagnosticsBusy,
        fileStripOverflowing: this.fileStripOverflowing,
        fileStripScrolling: this.fileStripScrolling,
        fileStripDragging: this.fileStripDragging,
        fileStripThumbLeft: this.fileStripThumbLeft,
        fileStripThumbWidth: this.fileStripThumbWidth,
        fileDialog: this.fileDialog,
      },
      {
        updateFileStripScroll: (event) => this.updateFileStripScroll(event),
        jumpFileStripScrollbar: (event) => this.jumpFileStripScrollbar(event),
        beginFileStripThumbDrag: (event) => this.beginFileStripThumbDrag(event),
        createFile: () => this.createFile(),
        renameFile: () => this.renameFile(),
        deleteFile: () => this.deleteFile(),
        updateFileDialogValue: (event) => this.updateFileDialogValue(event),
        submitFileDialog: (event) => this.submitFileDialog(event),
        closeFileDialog: () => this.closeFileDialog(),
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

  private async mountEditor(): Promise<void> {
    this.monaco = await configureMonaco();
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
      hover: { enabled: "on", delay: 250, sticky: true },
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
        if (!state) {
          return;
        }
        state.version += 1;
        const text = state.model.getValue();
        this.client?.writeFile(state.file.path, text);
        this.queueDocumentSave(state.uri);
        this.scheduleDiagnostics(this.sourceUris());
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
      const model = this.monaco.editor.createModel(
        file.source,
        file.languageId ?? languageIdForPath(file.path),
        this.monaco.Uri.parse(uri),
      );
      this.fileStates.set(uri, { file, uri, version: 1, model, opened: false });
    }
    this.activeUri = this.workspaceUri(entryFile(scenario).path);
  }

  private syncLanguageServerCapabilities(serverCapabilities: unknown): void {
    if (!this.monaco || !this.status.ready) {
      return;
    }

    syncVizslaSemanticTheme(this.monaco, serverCapabilities, this.colorScheme);
  }

  private restartClient(): void {
    this.clearDiagnosticTimer();
    this.pendingSaveUris.clear();
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
        if (this.serverCapabilities) {
          this.syncLanguageServerCapabilities(this.serverCapabilities);
        }
        this.scheduleDiagnostics(this.sourceUris());
      }
      this.requestUpdate();
    };
    client.onServerCapabilities = (capabilities) => {
      if (generation !== this.clientGeneration || client !== this.client) {
        return;
      }
      this.serverCapabilities = capabilities;
      if (this.status.ready) {
        this.syncLanguageServerCapabilities(capabilities);
      }
    };
    client.onDiagnosticRefresh = () => {
      if (generation !== this.clientGeneration || client !== this.client) {
        return;
      }
      this.scheduleDiagnostics(this.sourceUris());
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

  private async refreshDiagnosticsNow(): Promise<void> {
    await this.refreshDiagnostics(this.sourceUris());
  }

  private queueDocumentSave(uri: string): void {
    this.pendingSaveUris.add(uri);
  }

  private scheduleDiagnostics(uris: string[]): void {
    this.clearDiagnosticTimer();
    this.diagnosticTimer = window.setTimeout(() => {
      const saveUris = [...this.pendingSaveUris];
      this.pendingSaveUris.clear();
      void this.refreshDiagnostics(uris, saveUris);
    }, DIAGNOSTIC_DEBOUNCE_MS);
  }

  private async refreshDiagnostics(uris: string[], saveUris: string[] = []): Promise<void> {
    if (!this.client || !this.status.ready || (uris.length === 0 && saveUris.length === 0)) {
      return;
    }

    const generation = ++this.diagnosticGeneration;
    this.diagnosticsBusy = true;
    this.requestUpdate();

    try {
      for (const uri of saveUris) {
        const state = this.fileStates.get(uri);
        if (!state) {
          continue;
        }
        this.client.didSave(uri);
      }

      for (const uri of uris) {
        const state = this.fileStates.get(uri);
        if (!state || !isSourceFile(state.file.path)) {
          continue;
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
    this.setScenario(this.initialScenario, true);
  }

  private setScenario(scenario: VizslaScenario, force = false, updateInitial = false, activePath?: string): void {
    if (!force && scenario.id === this.activeScenario.id) {
      return;
    }
    const nextScenario = cloneScenario(scenario);
    this.client?.dispose();
    this.client = undefined;
    this.clientGeneration += 1;
    this.serverCapabilities = undefined;
    this.activeScenario = nextScenario;
    if (updateInitial) {
      this.initialScenario = cloneScenario(nextScenario);
    }
    if (this.scenario !== nextScenario.id) {
      this.scenario = nextScenario.id;
    }
    this.diagnosticsByUri.clear();
    this.createModels(nextScenario);
    if (activePath) {
      const uri = this.workspaceUri(activePath);
      if (this.fileStates.has(uri)) {
        this.activeUri = uri;
      }
    }
    this.editor?.setModel(this.activeFileState()?.model ?? null);
    this.editor?.updateOptions({ readOnly: this.activeFileState()?.file.editable === false });
    if (activePath) {
      this.editor?.focus();
    } else {
      this.applyConfiguredState();
    }
    this.restartClient();
    this.requestUpdate();
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
    if (isSourceFile(state.file.path)) {
      this.scheduleDiagnostics(this.sourceUris());
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

  private createFile(): void {
    this.fileDialog = { mode: "create", value: this.defaultNewFilePath() };
    this.requestUpdate();
  }

  private renameFile(): void {
    const state = this.activeFileState();
    if (!state) {
      return;
    }

    this.fileDialog = { mode: "rename", value: state.file.path, targetPath: state.file.path };
    this.requestUpdate();
  }

  private deleteFile(): void {
    const state = this.activeFileState();
    if (!state) {
      return;
    }
    if (this.activeScenario.files.length <= 1) {
      this.fileDialog = {
        mode: "delete",
        value: state.file.path,
        targetPath: state.file.path,
        error: "The workspace must keep at least one file.",
      };
      this.requestUpdate();
      return;
    }

    this.fileDialog = { mode: "delete", value: state.file.path, targetPath: state.file.path };
    this.requestUpdate();
  }

  private updateFileDialogValue(event: Event): void {
    if (!this.fileDialog || !(event.currentTarget instanceof HTMLInputElement)) {
      return;
    }
    this.fileDialog = {
      ...this.fileDialog,
      value: event.currentTarget.value,
      error: undefined,
    };
    this.requestUpdate();
  }

  private submitFileDialog(event: Event): void {
    event.preventDefault();
    const dialog = this.fileDialog;
    if (!dialog) {
      return;
    }

    if (dialog.mode === "delete") {
      this.commitDeleteFile(dialog.targetPath);
      return;
    }

    const path = this.validatedDialogPath(dialog);
    if (!path) {
      return;
    }

    if (dialog.mode === "create") {
      this.commitCreateFile(path);
    } else {
      this.commitRenameFile(dialog.targetPath, path);
    }
  }

  private closeFileDialog(): void {
    this.fileDialog = undefined;
    this.requestUpdate();
    this.editor?.focus();
  }

  private commitCreateFile(path: string): void {
    const files = [
      ...this.currentWorkspaceFiles(),
      {
        path,
        source: defaultSourceForPath(path),
      },
    ];
    this.fileDialog = undefined;
    this.setScenario({ ...this.activeScenario, files, entryFile: path }, true, false, path);
  }

  private commitRenameFile(currentPath: string | undefined, nextPath: string): void {
    const state = this.activeFileState();
    const fromPath = currentPath ?? state?.file.path;
    if (!fromPath) {
      this.setFileDialogError("No active file to rename.");
      return;
    }
    if (nextPath === fromPath) {
      this.fileDialog = undefined;
      this.requestUpdate();
      return;
    }

    const files = this.currentWorkspaceFiles().map((file) =>
      file.path === fromPath
        ? {
            ...file,
            path: nextPath,
            languageId: file.languageId && languageIdForPath(nextPath) === "plaintext" ? file.languageId : undefined,
          }
        : file,
    );
    const entry = normalizeWorkspacePath(this.activeScenario.entryFile) === fromPath ? nextPath : this.activeScenario.entryFile;
    this.fileDialog = undefined;
    this.setScenario({ ...this.activeScenario, files, entryFile: entry }, true, false, nextPath);
  }

  private commitDeleteFile(path: string | undefined): void {
    if (!path) {
      this.setFileDialogError("No active file to delete.");
      return;
    }
    const currentFiles = this.currentWorkspaceFiles();
    if (currentFiles.length <= 1) {
      this.setFileDialogError("The workspace must keep at least one file.");
      return;
    }
    const deletedIndex = currentFiles.findIndex((file) => file.path === path);
    if (deletedIndex < 0) {
      this.setFileDialogError("The file is no longer in the workspace.");
      return;
    }
    const files = currentFiles.filter((file) => file.path !== path);
    const fallback = files[Math.min(deletedIndex, files.length - 1)] ?? files[0];
    const entry = normalizeWorkspacePath(this.activeScenario.entryFile) === path ? fallback.path : this.activeScenario.entryFile;
    this.fileDialog = undefined;
    this.setScenario({ ...this.activeScenario, files, entryFile: entry }, true, false, fallback.path);
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

  private updateFileStripScroll(event: Event): void {
    if (event.currentTarget instanceof HTMLElement) {
      this.updateFileStripScrollbar(event.currentTarget, true);
    }
  }

  private jumpFileStripScrollbar(event: PointerEvent): void {
    if (!this.fileStripOverflowing) {
      return;
    }
    event.preventDefault();

    const strip = this.fileStripElement();
    const track = this.fileStripScrollbarElement();
    if (!strip || !track) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
    const thumbWidth = (this.fileStripThumbWidth / 100) * rect.width;
    const travelWidth = Math.max(1, rect.width - thumbWidth);
    const thumbLeft = clamp(event.clientX - rect.left - thumbWidth / 2, 0, travelWidth);
    strip.scrollLeft = (thumbLeft / travelWidth) * maxScrollLeft;
    this.updateFileStripScrollbar(strip, true);
  }

  private beginFileStripThumbDrag(event: PointerEvent): void {
    if (!this.fileStripOverflowing) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const strip = this.fileStripElement();
    const track = this.fileStripScrollbarElement();
    if (!strip || !track) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
    if (maxScrollLeft <= 0 || rect.width <= 0) {
      return;
    }

    this.fileStripDrag = {
      startClientX: event.clientX,
      startScrollLeft: strip.scrollLeft,
      maxScrollLeft,
      trackWidth: rect.width,
      thumbWidth: (this.fileStripThumbWidth / 100) * rect.width,
    };
    this.fileStripDragging = true;
    this.fileStripScrolling = true;
    this.clearFileStripScrollTimer();
    this.addFileStripDragListeners();
    this.requestUpdate();
  }

  private dragFileStripThumb(event: PointerEvent): void {
    const drag = this.fileStripDrag;
    const strip = this.fileStripElement();
    if (!drag || !strip) {
      return;
    }

    const travelWidth = Math.max(1, drag.trackWidth - drag.thumbWidth);
    const delta = event.clientX - drag.startClientX;
    strip.scrollLeft = clamp(drag.startScrollLeft + (delta / travelWidth) * drag.maxScrollLeft, 0, drag.maxScrollLeft);
    this.updateFileStripScrollbar(strip, true);
  }

  private endFileStripThumbDrag(): void {
    if (!this.fileStripDrag) {
      return;
    }

    this.fileStripDrag = undefined;
    this.fileStripDragging = false;
    this.removeFileStripDragListeners();
    this.scheduleFileStripScrollbarFade();
    this.requestUpdate();
  }

  private queueFileStripMeasurement(): void {
    if (this.fileStripMeasureFrame !== undefined || typeof window === "undefined") {
      return;
    }

    this.fileStripMeasureFrame = window.requestAnimationFrame(() => {
      this.fileStripMeasureFrame = undefined;
      const strip = this.fileStripElement();
      if (strip) {
        this.updateFileStripScrollbar(strip);
      }
    });
  }

  private updateFileStripScrollbar(strip: HTMLElement, reveal = false): void {
    const clientWidth = Math.max(0, strip.clientWidth);
    const scrollWidth = Math.max(clientWidth, strip.scrollWidth);
    const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
    const overflowing = maxScrollLeft > 1;
    const trackWidth = Math.max(1, clientWidth - 16);
    const minThumbWidth = Math.min(100, (20 / trackWidth) * 100);
    const thumbWidth = overflowing ? Math.min(100, Math.max(minThumbWidth, (clientWidth / scrollWidth) * 100)) : 100;
    const thumbTravel = Math.max(0, 100 - thumbWidth);
    const thumbLeft = overflowing && maxScrollLeft > 0 ? (strip.scrollLeft / maxScrollLeft) * thumbTravel : 0;

    const changed =
      this.fileStripOverflowing !== overflowing ||
      Math.abs(this.fileStripThumbWidth - thumbWidth) > 0.1 ||
      Math.abs(this.fileStripThumbLeft - thumbLeft) > 0.1;

    this.fileStripOverflowing = overflowing;
    this.fileStripThumbWidth = thumbWidth;
    this.fileStripThumbLeft = clamp(thumbLeft, 0, thumbTravel);

    if (!overflowing && this.fileStripScrolling) {
      this.clearFileStripScrollTimer();
      this.fileStripScrolling = false;
      this.fileStripDragging = false;
    }

    if (changed) {
      this.requestUpdate();
    }

    if (reveal && overflowing) {
      this.revealFileStripScrollbar();
    }
  }

  private revealFileStripScrollbar(): void {
    this.clearFileStripScrollTimer();
    if (!this.fileStripScrolling) {
      this.fileStripScrolling = true;
      this.requestUpdate();
    }
    this.scheduleFileStripScrollbarFade();
  }

  private scheduleFileStripScrollbarFade(): void {
    this.clearFileStripScrollTimer();
    this.fileStripScrollTimer = window.setTimeout(() => {
      this.fileStripScrollTimer = undefined;
      if (!this.fileStripDragging && this.fileStripScrolling) {
        this.fileStripScrolling = false;
        this.requestUpdate();
      }
    }, FILE_STRIP_SCROLL_IDLE_MS);
  }

  private addFileStripDragListeners(): void {
    window.addEventListener("pointermove", this.handleFileStripThumbDrag);
    window.addEventListener("pointerup", this.handleFileStripThumbRelease, { once: true });
    window.addEventListener("pointercancel", this.handleFileStripThumbRelease, { once: true });
  }

  private removeFileStripDragListeners(): void {
    window.removeEventListener("pointermove", this.handleFileStripThumbDrag);
    window.removeEventListener("pointerup", this.handleFileStripThumbRelease);
    window.removeEventListener("pointercancel", this.handleFileStripThumbRelease);
  }

  private fileStripElement(): HTMLElement | undefined {
    return this.renderRoot.querySelector<HTMLElement>(".file-strip") ?? undefined;
  }

  private fileStripScrollbarElement(): HTMLElement | undefined {
    return this.renderRoot.querySelector<HTMLElement>(".file-strip-scrollbar") ?? undefined;
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

  private currentWorkspaceFiles(): VizslaScenario["files"] {
    return this.activeScenario.files.map((file) => {
      const state = this.fileStates.get(this.workspaceUri(file.path));
      return {
        ...file,
        source: state?.model.getValue() ?? file.source,
      };
    });
  }

  private hasWorkspacePath(path: string): boolean {
    const normalized = normalizeWorkspacePath(path);
    return this.activeScenario.files.some((file) => normalizeWorkspacePath(file.path) === normalized);
  }

  private validatedDialogPath(dialog: FileDialogState): string | undefined {
    let path: string;
    try {
      path = normalizeWorkspacePath(dialog.value.trim());
    } catch (error) {
      this.setFileDialogError(error instanceof Error ? error.message : "Invalid workspace path.");
      return undefined;
    }

    if (!path) {
      this.setFileDialogError("Enter a file path inside the virtual workspace.");
      return undefined;
    }
    if (this.hasWorkspacePath(path) && path !== dialog.targetPath) {
      this.setFileDialogError(`A file already exists at '${path}'.`);
      return undefined;
    }

    return path;
  }

  private setFileDialogError(error: string): void {
    if (!this.fileDialog) {
      return;
    }
    this.fileDialog = { ...this.fileDialog, error };
    this.requestUpdate();
  }

  private defaultNewFilePath(): string {
    for (let index = 1; index < 1000; index += 1) {
      const suffix = index === 1 ? "" : `_${index}`;
      const candidate = `rtl/new_module${suffix}.sv`;
      if (!this.hasWorkspacePath(candidate)) {
        return candidate;
      }
    }

    return "new_file.sv";
  }

  private clearDiagnosticTimer(): void {
    if (this.diagnosticTimer !== undefined) {
      window.clearTimeout(this.diagnosticTimer);
      this.diagnosticTimer = undefined;
    }
  }

  private clearFileStripTimers(): void {
    this.clearFileStripScrollTimer();
    if (this.fileStripMeasureFrame !== undefined) {
      window.cancelAnimationFrame(this.fileStripMeasureFrame);
      this.fileStripMeasureFrame = undefined;
    }
  }

  private clearFileStripScrollTimer(): void {
    if (this.fileStripScrollTimer !== undefined) {
      window.clearTimeout(this.fileStripScrollTimer);
      this.fileStripScrollTimer = undefined;
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

function cloneScenario(scenario: VizslaScenario): VizslaScenario {
  return {
    ...scenario,
    files: scenario.files.map((file) => ({ ...file })),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function defaultSourceForPath(path: string): string {
  const languageId = languageIdForPath(path);
  if (languageId !== "verilog" && languageId !== "systemverilog") {
    return "";
  }

  return `module ${moduleNameForPath(path)};
endmodule
`;
}

function moduleNameForPath(path: string): string {
  const withoutExtension = fileName(path).replace(/\.[^.]+$/, "");
  const normalized = withoutExtension.replace(/\W+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) {
    return "new_module";
  }
  return /^\d/.test(normalized) ? `m_${normalized}` : normalized;
}

if (!customElements.get("vizsla-lab")) {
  customElements.define("vizsla-lab", VizslaLabElement);
}
