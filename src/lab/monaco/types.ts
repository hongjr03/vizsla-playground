import type * as Monaco from "monaco-editor";

export type MonacoModule = typeof Monaco;
export type LspRequest = (method: string, params?: unknown) => Promise<unknown>;
