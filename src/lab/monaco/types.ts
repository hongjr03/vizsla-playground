import type * as Monaco from "@codingame/monaco-vscode-editor-api";

export type MonacoModule = typeof Monaco;
export type LspRequest = (method: string, params?: unknown) => Promise<unknown>;
