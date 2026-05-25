import { html, type TemplateResult } from "lit";
import { ClipboardCopy, FileCode2, RefreshCw, SearchCode, X } from "lucide";
import { displayPath, workspaceUri } from "../lab/workspace";
import type { LabDiagnostic, VizslaScenario, VizslaScenarioFile, WorkerStatus } from "../types";
import { renderIcon as icon } from "./icons";

interface VizslaLabViewState {
  scenarios: readonly VizslaScenario[];
  activeScenario: VizslaScenario;
  activeUri: string;
  diagnosticsByUri: ReadonlyMap<string, LabDiagnostic[]>;
  status: WorkerStatus;
  inspectorOpen: boolean;
  diagnosticsBusy: boolean;
  cursor: string;
}

interface VizslaLabViewActions {
  onScenarioChange(event: Event): void;
  refreshDiagnostics(): void;
  resetScenario(): void;
  copySource(): void;
  activateFile(uri: string): void;
  revealDiagnostic(diagnostic: LabDiagnostic): void;
  toggleDiagnostics(): void;
  closeInspector(): void;
}

export function renderVizslaLabView(state: VizslaLabViewState, actions: VizslaLabViewActions): TemplateResult {
  const diagnostics = allDiagnostics(state);
  return html`
    <section class="shell" aria-label="Vizsla Lab">
      <div class="body">
        <section class="editor-panel" aria-label="SystemVerilog editor">
          <div class="workspace-row">
            <div class="file-strip" role="tablist" aria-label="Workspace files">
              ${state.activeScenario.files.map((file) => renderFileTab(file, state, actions))}
            </div>
            <div class="toolbar">
              <label class="select">
                <span>Scenario</span>
                <select @change=${actions.onScenarioChange}>
                  ${state.scenarios.map(
                    (scenario) =>
                      html`<option value=${scenario.id} ?selected=${scenario.id === state.activeScenario.id}>
                        ${scenario.label}
                      </option>`,
                  )}
                </select>
              </label>
              <button
                class=${state.inspectorOpen ? "diagnostics-toggle is-active" : "diagnostics-toggle"}
                type="button"
                @click=${actions.toggleDiagnostics}
                title="Show diagnostics"
              >
                ${icon(SearchCode)}
                <span class="badge">${diagnostics.length}</span>
              </button>
              <button
                class=${state.diagnosticsBusy ? "is-busy" : ""}
                type="button"
                @click=${actions.refreshDiagnostics}
                title="Refresh diagnostics"
              >
                ${icon(RefreshCw)}
              </button>
              <div class=${state.status.ready ? "status is-ready" : "status"} title=${state.status.detail}>
                <span class="status-dot"></span>
                <strong>${state.status.ready ? "Ready" : "Starting"}</strong>
              </div>
              <div class="cursor" title="Cursor position">${state.cursor}</div>
              <button type="button" @click=${actions.resetScenario} title="Reset workspace">${icon(FileCode2)}</button>
              <button type="button" @click=${actions.copySource} title="Copy current file">${icon(ClipboardCopy)}</button>
            </div>
          </div>
          <div class="editor"></div>
        </section>
      </div>

      ${state.inspectorOpen
        ? html`
            <aside class="drawer" aria-label="LSP inspector">
              <div class="drawer-header">
                <div>
                  <strong>Diagnostics</strong>
                  <span>${diagnostics.length === 1 ? "1 diagnostic" : `${diagnostics.length} diagnostics`}</span>
                </div>
                <button type="button" @click=${actions.closeInspector} title="Close inspector">${icon(X)}</button>
              </div>
              <div class="panel is-active">${renderDiagnostics(diagnostics, actions)}</div>
            </aside>
          `
        : null}
    </section>
  `;
}

function renderFileTab(
  file: VizslaScenarioFile,
  state: VizslaLabViewState,
  actions: VizslaLabViewActions,
): TemplateResult {
  const uri = workspaceUri(file.path);
  const diagnostics = state.diagnosticsByUri.get(uri) ?? [];
  const classes = [
    uri === state.activeUri ? "is-active" : "",
    diagnostics.length > 0 ? "has-diagnostic" : "",
    diagnostics.some((diagnostic) => diagnostic.severity === 1) ? "has-error" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return html`
    <button type="button" role="tab" class=${classes} @click=${() => actions.activateFile(uri)} title=${displayPath(file.path)}>
      ${displayPath(file.path)}
    </button>
  `;
}

function renderDiagnostics(
  diagnostics: LabDiagnostic[],
  actions: VizslaLabViewActions,
): TemplateResult | TemplateResult[] {
  if (diagnostics.length === 0) {
    return html`<div class="empty">${icon(SearchCode)}<span>No diagnostics</span></div>`;
  }

  return diagnostics.map(
    (diagnostic) => html`
      <button type="button" class="diagnostic severity-${diagnostic.severity}" @click=${() => actions.revealDiagnostic(diagnostic)}>
        <strong>${diagnostic.title}</strong>
        <p>${diagnostic.message}</p>
        <span>${diagnostic.source} - ${diagnostic.filePath}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}</span>
      </button>
    `,
  );
}

function allDiagnostics(state: VizslaLabViewState): LabDiagnostic[] {
  return Array.from(state.diagnosticsByUri.values()).flat();
}
