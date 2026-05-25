import type * as Monaco from "monaco-editor";
import type { MonacoModule } from "./types";
import { arrayOf, isDefined, isRecord, numberValue, stringValue } from "./guards";
import { toMonacoRange } from "./ranges";

export function textEditsToMonaco(monaco: MonacoModule, result: unknown): Monaco.languages.TextEdit[] {
  return arrayOf(result)
    .map((edit) => textEditParts(monaco, edit))
    .filter(isDefined);
}

export function completionTextEditParts(
  monaco: MonacoModule,
  edit: unknown,
): { range: Monaco.IRange | Monaco.languages.CompletionItemRanges; text: string } | null {
  if (!isRecord(edit)) {
    return null;
  }
  const text = stringValue(edit.newText) ?? stringValue(edit.text);
  if (text === undefined) {
    return null;
  }
  if (isRecord(edit.range)) {
    const range = toMonacoRange(monaco, edit.range);
    return range ? { range, text } : null;
  }
  if (isRecord(edit.insert) && isRecord(edit.replace)) {
    const insert = toMonacoRange(monaco, edit.insert);
    const replace = toMonacoRange(monaco, edit.replace);
    return insert && replace ? { range: { insert, replace }, text } : null;
  }
  return null;
}

function textEditParts(monaco: MonacoModule, edit: unknown): Monaco.languages.TextEdit | null {
  if (!isRecord(edit)) {
    return null;
  }
  const text = stringValue(edit.newText) ?? stringValue(edit.text);
  const range = isRecord(edit.range) ? toMonacoRange(monaco, edit.range) : null;
  if (text === undefined || !range) {
    return null;
  }
  return { range, text };
}

export function toWorkspaceEdit(monaco: MonacoModule, value: unknown): Monaco.languages.WorkspaceEdit | null {
  if (!isRecord(value)) {
    return null;
  }
  const edits: Monaco.languages.IWorkspaceTextEdit[] = [];
  if (isRecord(value.changes)) {
    for (const [uri, uriEdits] of Object.entries(value.changes)) {
      for (const edit of textEditsToMonaco(monaco, uriEdits)) {
        edits.push({ resource: monaco.Uri.parse(uri), textEdit: edit, versionId: undefined });
      }
    }
  }
  for (const change of arrayOf(value.documentChanges)) {
    if (!isRecord(change) || !isRecord(change.textDocument) || typeof change.textDocument.uri !== "string") {
      continue;
    }
    const versionId = numberValue(change.textDocument.version);
    for (const edit of textEditsToMonaco(monaco, change.edits)) {
      edits.push({ resource: monaco.Uri.parse(change.textDocument.uri), textEdit: edit, versionId });
    }
  }
  return { edits };
}

export function toRenameLocation(
  monaco: MonacoModule,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  result: unknown,
): Monaco.languages.RenameLocation | null {
  if (isRecord(result) && result.defaultBehavior === true) {
    const wordRange = model.getWordAtPosition(position);
    if (!wordRange) {
      return null;
    }
    const range = new monaco.Range(position.lineNumber, wordRange.startColumn, position.lineNumber, wordRange.endColumn);
    return { range, text: model.getValueInRange(range) };
  }
  const rawRange = isRecord(result) && isRecord(result.range) ? result.range : result;
  const range = toMonacoRange(monaco, rawRange);
  if (!range) {
    return null;
  }
  return { range, text: stringValue(isRecord(result) ? result.placeholder : undefined) ?? model.getValueInRange(range) };
}
