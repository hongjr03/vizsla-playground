import VizslaWorker from "../workers/vizsla-lsp.worker?worker&inline";
import type { LspTraceEntry, WorkerRequest, WorkerResponse, WorkerStatus, WorkerWorkspaceFile } from "../types";
import { browserClientCapabilities, browserInitializationOptions } from "../workers/lsp-browser-config";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createProtocolConnection,
  type ProtocolConnection,
} from "vscode-languageserver-protocol/browser.js";

const CLIENT_DISPOSED_MESSAGE = "Vizsla LSP client has been disposed.";

export function isClientDisposedError(error: unknown): boolean {
  return error instanceof Error && error.message === CLIENT_DISPOSED_MESSAGE;
}

export class VizslaBrowserClient {
  private readonly worker = new VizslaWorker();
  private readonly wasmBaseUrl: string;
  private readonly rootUri: string;
  private connection?: ProtocolConnection;
  private initialized = false;
  private disposed = false;

  onStatus: (status: WorkerStatus) => void = () => undefined;
  onServerCapabilities: (capabilities: unknown) => void = () => undefined;
  onDiagnosticRefresh: () => void = () => undefined;
  onTrace: (entry: LspTraceEntry) => void = () => undefined;
  onLog: (message: string, level: "info" | "warn" | "error") => void = () => undefined;

  constructor(wasmBaseUrl = "/wasm/", rootUri = "file:///workspace") {
    this.wasmBaseUrl = new URL(wasmBaseUrl, window.location.href).href;
    this.rootUri = rootUri;
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      this.handleMessage(event.data);
    });
  }

  start(workspaceFiles: WorkerWorkspaceFile[]): void {
    const channel = new MessageChannel();
    this.connection = createProtocolConnection(new BrowserMessageReader(channel.port1), new BrowserMessageWriter(channel.port1));
    this.registerClientHandlers(this.connection);
    this.connection.listen();
    this.post({ kind: "boot", wasmBaseUrl: this.wasmBaseUrl, rootUri: this.rootUri, workspaceFiles, lspPort: channel.port2 }, [
      channel.port2,
    ]);
  }

  notify(method: string, params?: unknown): void {
    void this.requireConnection().sendNotification(method, params);
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

  writeFile(path: string, text: string): void {
    this.post({ kind: "writeFile", file: { path, text } });
  }

  didSave(uri: string): void {
    this.notify("textDocument/didSave", {
      textDocument: { uri },
    });
  }

  request(method: string, params?: unknown): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject(new Error(CLIENT_DISPOSED_MESSAGE));
    }
    return this.requireConnection().sendRequest(method, params);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.post({ kind: "stop" });
    this.disposed = true;
    if (this.connection) {
      void this.connection.sendRequest("shutdown").catch(() => undefined);
      void this.connection.sendNotification("exit").catch(() => undefined);
      this.connection.dispose();
    }
    this.worker.terminate();
  }

  private post(message: WorkerRequest, transfer: Transferable[] = []): void {
    if (this.disposed) {
      return;
    }
    this.worker.postMessage(message, transfer);
  }

  private requireConnection(): ProtocolConnection {
    if (!this.connection || this.disposed) {
      throw new Error(CLIENT_DISPOSED_MESSAGE);
    }
    return this.connection;
  }

  private registerClientHandlers(connection: ProtocolConnection): void {
    connection.onRequest("workspace/diagnostic/refresh", () => {
      this.onDiagnosticRefresh();
      return null;
    });
    connection.onRequest("workspace/inlayHint/refresh", () => null);
    connection.onRequest("workspace/codeLens/refresh", () => null);
    connection.onRequest("client/registerCapability", () => null);
    connection.onRequest("client/unregisterCapability", () => null);
    connection.onRequest("workspace/configuration", () => []);
    connection.onNotification("window/logMessage", (params: unknown) => {
      const record = isRecord(params) ? params : {};
      const message = typeof record.message === "string" ? record.message : "Vizsla language server log.";
      this.onLog(message, logLevel(record.type));
    });
  }

  private handleMessage(message: WorkerResponse): void {
    switch (message.kind) {
      case "status":
        if (message.status.ready) {
          void this.initializeLanguageServer(message.status);
        } else {
          this.onStatus(message.status);
        }
        break;
      case "trace":
        this.onTrace(message.entry);
        break;
      case "log":
        this.onLog(message.message, message.level);
        break;
    }
  }

  private async initializeLanguageServer(workerStatus: WorkerStatus): Promise<void> {
    if (this.disposed || this.initialized) {
      return;
    }
    try {
      const initializeResult = await this.requireConnection().sendRequest("initialize", {
        processId: null,
        rootUri: this.rootUri,
        capabilities: browserClientCapabilities(),
        initializationOptions: browserInitializationOptions(),
        trace: "off",
      });
      this.initialized = true;
      this.onServerCapabilities(isRecord(initializeResult) ? (initializeResult.capabilities ?? null) : null);
      await this.requireConnection().sendNotification("initialized", {});
      this.onStatus(workerStatus);
    } catch (error) {
      this.onStatus({
        engine: "unavailable",
        ready: false,
        detail: error instanceof Error ? error.message : "Vizsla LSP initialization failed.",
      });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function logLevel(type: unknown): "info" | "warn" | "error" {
  if (type === 1) {
    return "error";
  }
  if (type === 2) {
    return "warn";
  }
  return "info";
}
