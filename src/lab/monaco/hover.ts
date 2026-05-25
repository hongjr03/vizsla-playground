import type * as Monaco from "monaco-editor";
import type { MonacoModule } from "./types";
import { isRecord } from "./guards";
import { markupContents } from "./markup";
import { toMonacoRange } from "./ranges";

export function toMonacoHover(monaco: MonacoModule, result: unknown): Monaco.languages.Hover | null {
  if (!isRecord(result)) {
    return null;
  }
  const contents = markupContents(result.contents);
  if (contents.length === 0) {
    return null;
  }
  const range = toMonacoRange(monaco, result.range);
  return {
    contents,
    range: range ?? undefined,
  };
}
