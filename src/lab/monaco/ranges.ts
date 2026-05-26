import type * as Monaco from "@codingame/monaco-vscode-editor-api";
import type { LspPosition, LspRange } from "../../types";
import type { MonacoModule } from "./types";
import { isLspRange } from "./guards";

export function toLspPosition(position: Monaco.IPosition): LspPosition {
  return { line: position.lineNumber - 1, character: position.column - 1 };
}

export function toLspRange(range: Monaco.IRange): LspRange {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
  };
}

export function toMonacoRange(monaco: MonacoModule, range: unknown): Monaco.Range | null {
  if (!isLspRange(range)) {
    return null;
  }
  return new monaco.Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1,
  );
}
