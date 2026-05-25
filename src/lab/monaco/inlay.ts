import type * as Monaco from "monaco-editor";
import type { MonacoModule } from "./types";
import { arrayOf, booleanValue, isDefined, isLspPosition, isRecord, stringValue } from "./guards";
import { textEditsToMonaco } from "./edits";
import { markupContent, toCommand } from "./markup";
import { toLocation } from "./navigation";

export function toInlayHint(monaco: MonacoModule, hint: unknown): Monaco.languages.InlayHint | null {
  if (!isRecord(hint) || !isLspPosition(hint.position)) {
    return null;
  }
  return {
    label: inlayLabel(monaco, hint.label),
    tooltip: markupContent(hint.tooltip),
    textEdits: textEditsToMonaco(monaco, hint.textEdits),
    position: new monaco.Position(hint.position.line + 1, hint.position.character + 1),
    kind: hint.kind === 1 ? monaco.languages.InlayHintKind.Type : hint.kind === 2 ? monaco.languages.InlayHintKind.Parameter : undefined,
    paddingLeft: booleanValue(hint.paddingLeft),
    paddingRight: booleanValue(hint.paddingRight),
  };
}

function inlayLabel(monaco: MonacoModule, label: unknown): string | Monaco.languages.InlayHintLabelPart[] {
  if (typeof label === "string") {
    return label;
  }
  return arrayOf(label)
    .map((part) => {
      if (!isRecord(part)) {
        return null;
      }
      return {
        label: stringValue(part.value) ?? stringValue(part.label) ?? "",
        tooltip: markupContent(part.tooltip),
        location: toLocation(monaco, part.location) ?? undefined,
        command: toCommand(part.command),
      };
    })
    .filter(isDefined);
}
