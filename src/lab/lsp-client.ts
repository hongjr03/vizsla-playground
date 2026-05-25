import VizslaWorker from "../workers/vizsla-lsp.worker?worker&inline";
import type { LspTraceEntry, WorkerRequest, WorkerResponse, WorkerStatus, WorkerWorkspaceFile } from "../types";

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export class VizslaBrowserClient {
  private readonly worker = new VizslaWorker();
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private readonly wasmBaseUrl: string;

  onStatus: (status: WorkerStatus) => void = () => undefined;
  onServerCapabilities: (capabilities: unknown) => void = () => undefined;
  onDiagnosticRefresh: () => void = () => undefined;
  onTrace: (entry: LspTraceEntry) => void = () => undefined;
  onLog: (message: string, level: "info" | "warn" | "error") => void = () => undefined;

  constructor(wasmBaseUrl = "/wasm/") {
    this.wasmBaseUrl = new URL(wasmBaseUrl, window.location.href).href;
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      this.handleMessage(event.data);
    });
  }

  start(workspaceFiles: WorkerWorkspaceFile[]): void {
    this.post({ kind: "boot", wasmBaseUrl: this.wasmBaseUrl, workspaceFiles });
  }

  notify(method: string, params?: unknown): void {
    this.post({ kind: "lspNotification", method, params });
  }

  didOpen(uri: string, languageId: string, text: string, version: number): void {
    this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version, text },
    });
  }

  didChange(uri: string, text: string, version: number): void {
    this.notify("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    });
  }

  didSave(uri: string): void {
    this.notify("textDocument/didSave", {
      textDocument: { uri },
    });
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const requestId = this.nextRequestId++;
    this.post({ kind: "lspRequest", method, params, requestId });
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.pending.clear();
  }

  private post(message: WorkerRequest): void {
    this.worker.postMessage(message);
  }

  private handleMessage(message: WorkerResponse): void {
    switch (message.kind) {
      case "status":
        this.onStatus(message.status);
        break;
      case "serverCapabilities":
        this.onServerCapabilities(message.capabilities);
        break;
      case "diagnosticRefresh":
        this.onDiagnosticRefresh();
        break;
      case "trace":
        this.onTrace(message.entry);
        break;
      case "log":
        this.onLog(message.message, message.level);
        break;
      case "lspResponse": {
        const request = this.pending.get(message.requestId);
        if (request) {
          request.resolve(message.result);
        }
        this.pending.delete(message.requestId);
        break;
      }
      case "lspError": {
        const request = this.pending.get(message.requestId);
        if (request) {
          request.reject(new Error(message.message));
        }
        this.pending.delete(message.requestId);
        break;
      }
    }
  }
}
