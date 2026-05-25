import { html, type TemplateResult } from "lit";
import { ClipboardCopy, FileCode2, RefreshCw, SearchCode, SquareTerminal } from "lucide";
import { displayPath, pathFromWorkspaceUri, workspaceUri } from "../lab/workspace";
import type { LabDiagnostic, LspTraceEntry, VizslaScenario, VizslaScenarioFile, WorkerStatus } from "../types";
import { renderIcon as icon } from "./icons";

interface VizslaLabViewState {
  scenarios: readonly VizslaScenario[];
  activeScenario: VizslaScenario;
  activeUri: string;
  diagnosticsByUri: ReadonlyMap<string, LabDiagnostic[]>;
  trace: readonly LspTraceEntry[];
  status: WorkerStatus;
  activeTab: string;
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
  activateTab(tab: string): void;
}

export function renderVizslaLabView(state: VizslaLabViewState, actions: VizslaLabViewActions): TemplateResult {
  const activePath = pathFromWorkspaceUri(state.activeUri);
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
            class=${state.diagnosticsBusy ? "is-busy" : ""}
            type="button"
            @click=${actions.refreshDiagnostics}
            title="Refresh diagnostics"
          >
            ${icon(RefreshCw)}
          </button>
          <button type="button" @click=${actions.resetScenario} title="Reset workspace">${icon(FileCode2)}</button>
          <button type="button" @click=${actions.copySource} title="Copy current file">${icon(ClipboardCopy)}</button>
        </div>

        <div class=${state.status.ready ? "status is-ready" : "status"}>
          <span class="status-dot"></span>
          <strong>${state.status.ready ? "WASM ready" : "WASM starting"}</strong>
        </div>
      </header>

      <div class="body">
        <section class="editor-panel" aria-label="SystemVerilog editor">
          <div class="editor-header">
            <span>${icon(FileCode2)}${activePath}</span>
            <span>${state.cursor}</span>
          </div>
          <div class="file-strip" role="tablist" aria-label="Workspace files">
            ${state.activeScenario.files.map((file) => renderFileTab(file, state, actions))}
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
                  class=${state.activeTab === tab ? "is-active" : ""}
                  @click=${() => actions.activateTab(tab)}
                >
                  ${tab}
                </button>`,
            )}
          </div>
          <div class=${state.activeTab === "diagnostics" ? "panel is-active" : "panel"}>
            ${renderDiagnostics(allDiagnostics(state), actions)}
          </div>
          <div class=${state.activeTab === "protocol" ? "panel is-active" : "panel"}>${renderTrace(state.trace)}</div>
          <div class=${state.activeTab === "project" ? "panel is-active" : "panel"}>${renderProject(state)}</div>
        </aside>
      </div>
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
      <article class="diagnostic severity-${diagnostic.severity}" @click=${() => actions.revealDiagnostic(diagnostic)}>
        <strong>${diagnostic.title}</strong>
        <p>${diagnostic.message}</p>
        <span>${diagnostic.source} - ${diagnostic.filePath}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}</span>
      </article>
    `,
  );
}

function renderTrace(trace: readonly LspTraceEntry[]): TemplateResult | TemplateResult[] {
  if (trace.length === 0) {
    return html`<div class="empty">${icon(SquareTerminal)}<span>No protocol events</span></div>`;
  }

  return trace.map(
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

function renderProject(state: VizslaLabViewState): TemplateResult {
  return html`
    <dl class="project">
      <div><dt>Scenario</dt><dd>${state.activeScenario.description}</dd></div>
      <div><dt>Workspace</dt><dd>/workspace</dd></div>
      <div><dt>Entry</dt><dd>${state.activeScenario.entryFile}</dd></div>
      <div><dt>Files</dt><dd>${state.activeScenario.files.map((file) => file.path).join(", ")}</dd></div>
      <div><dt>Engine</dt><dd>${state.status.engine}</dd></div>
      <div><dt>State</dt><dd>${state.status.detail}</dd></div>
    </dl>
  `;
}

function allDiagnostics(state: VizslaLabViewState): LabDiagnostic[] {
  return Array.from(state.diagnosticsByUri.values()).flat();
}
