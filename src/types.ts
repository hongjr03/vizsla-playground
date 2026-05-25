export interface VizslaScenarioFile {
  path: string;
  source: string;
  languageId?: string;
  editable?: boolean;
}

export interface VizslaScenario {
  id: string;
  label: string;
  entryFile: string;
  description: string;
  files: VizslaScenarioFile[];
}

export type LspSeverity = 1 | 2 | 3 | 4;

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LabDiagnostic {
  uri: string;
  filePath: string;
  range: LspRange;
  severity: LspSeverity;
  source: string;
  title: string;
  code?: string;
  rawCode?: string;
  message: string;
}

export interface LspTraceEntry {
  id: number;
  direction: "client" | "server";
  method: string;
  detail: string;
}

export interface WorkerStatus {
  engine: "wasm" | "unavailable";
  ready: boolean;
  detail: string;
}

export interface WorkerWorkspaceFile {
  path: string;
  text: string;
}

export type WorkerRequest =
  | { kind: "boot"; wasmBaseUrl: string; workspaceFiles: WorkerWorkspaceFile[] }
  | { kind: "lspNotification"; method: string; params?: unknown }
  | { kind: "lspRequest"; method: string; params?: unknown; requestId: number };

export type WorkerResponse =
  | { kind: "status"; status: WorkerStatus }
  | { kind: "serverCapabilities"; capabilities: unknown }
  | { kind: "diagnosticRefresh" }
  | { kind: "trace"; entry: LspTraceEntry }
  | { kind: "lspResponse"; requestId: number; result: unknown }
  | { kind: "lspError"; requestId: number; message: string }
  | { kind: "log"; level: "info" | "warn" | "error"; message: string };
