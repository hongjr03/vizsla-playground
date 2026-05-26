import type * as Monaco from "@codingame/monaco-vscode-editor-api";
import { isRecord, numberValue, numericArray, stringValue } from "./guards";

export function toSemanticTokens(result: unknown): Monaco.languages.SemanticTokens | Monaco.languages.SemanticTokensEdits | null {
  if (!isRecord(result)) {
    return null;
  }
  if (Array.isArray(result.edits)) {
    return {
      resultId: stringValue(result.resultId),
      edits: result.edits.map((edit) => {
        const record = isRecord(edit) ? edit : {};
        return {
          start: numberValue(record.start) ?? 0,
          deleteCount: numberValue(record.deleteCount) ?? 0,
          data: numericArray(record.data),
        };
      }),
    };
  }
  return toFullSemanticTokens(result);
}

export function toFullSemanticTokens(result: unknown): Monaco.languages.SemanticTokens | null {
  if (!isRecord(result)) {
    return null;
  }
  return {
    resultId: stringValue(result.resultId),
    data: numericArray(result.data) ?? new Uint32Array(),
  };
}
