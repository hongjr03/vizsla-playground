import type * as Monaco from "monaco-editor";
import type { MonacoModule } from "./types";
import { booleanValue, isRecord, stringValue } from "./guards";
import { toWorkspaceEdit } from "./edits";
import { toCommand } from "./markup";
import { toMonacoRange } from "./ranges";

export function toCodeAction(
  monaco: MonacoModule,
  value: unknown,
  rawCodeActions: WeakMap<Monaco.languages.CodeAction, unknown>,
): Monaco.languages.CodeAction | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.command === "string" && typeof value.title === "string") {
    return { title: value.title, command: toCommand(value), kind: stringValue(value.kind) };
  }
  if (typeof value.title !== "string") {
    return null;
  }
  const action: Monaco.languages.CodeAction = {
    title: value.title,
    kind: stringValue(value.kind),
    diagnostics: [],
    edit: toWorkspaceEdit(monaco, value.edit) ?? undefined,
    command: toCommand(value.command),
    isPreferred: booleanValue(value.isPreferred),
    disabled: isRecord(value.disabled) ? stringValue(value.disabled.reason) : undefined,
  };
  rawCodeActions.set(action, value);
  return action;
}

export function toCodeLens(
  monaco: MonacoModule,
  value: unknown,
  rawCodeLenses: WeakMap<Monaco.languages.CodeLens, unknown>,
): Monaco.languages.CodeLens | null {
  if (!isRecord(value)) {
    return null;
  }
  const range = toMonacoRange(monaco, value.range);
  if (!range) {
    return null;
  }
  const lens: Monaco.languages.CodeLens = { range, command: toCommand(value.command) };
  rawCodeLenses.set(lens, value);
  return lens;
}
