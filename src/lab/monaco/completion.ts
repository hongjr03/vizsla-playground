import type * as Monaco from "monaco-editor";
import type { MonacoModule } from "./types";
import { isDefined, isRecord, isString, numberValue, stringValue } from "./guards";
import { completionTextEditParts, textEditsToMonaco } from "./edits";
import { markupContent, toCommand } from "./markup";

export function toCompletionList(
  monaco: MonacoModule,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  result: unknown,
): Monaco.languages.CompletionList {
  const rawItems = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result.items)
      ? result.items
      : [];
  const defaultWord = model.getWordUntilPosition(position);
  const defaultRange = new monaco.Range(position.lineNumber, defaultWord.startColumn, position.lineNumber, defaultWord.endColumn);
  return {
    suggestions: rawItems.map((item) => toCompletionItem(monaco, item, defaultRange)).filter(isDefined),
    incomplete: isRecord(result) && result.isIncomplete === true,
  };
}

function toCompletionItem(
  monaco: MonacoModule,
  item: unknown,
  defaultRange: Monaco.Range,
): Monaco.languages.CompletionItem | null {
  if (!isRecord(item) || typeof item.label !== "string") {
    return null;
  }
  const kind = completionKind(monaco, numberValue(item.kind));
  if (kind === null) {
    return null;
  }
  const textEdit = completionTextEditParts(monaco, item.textEdit);
  const insertText = textEdit?.text ?? stringValue(item.insertText) ?? item.label;
  const insertTextFormat = numberValue(item.insertTextFormat);
  const labelDetails = isRecord(item.labelDetails) ? item.labelDetails : undefined;
  return {
    label: labelDetails
      ? {
          label: item.label,
          detail: stringValue(labelDetails.detail),
          description: stringValue(labelDetails.description),
        }
      : item.label,
    kind,
    tags: Array.isArray(item.tags) && item.tags.includes(1) ? [monaco.languages.CompletionItemTag.Deprecated] : undefined,
    detail: stringValue(item.detail),
    documentation: markupContent(item.documentation),
    sortText: stringValue(item.sortText),
    filterText: stringValue(item.filterText),
    preselect: item.preselect === true,
    insertText,
    insertTextRules:
      insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
    range: textEdit?.range ?? defaultRange,
    commitCharacters: Array.isArray(item.commitCharacters) ? item.commitCharacters.filter(isString) : undefined,
    additionalTextEdits: textEditsToMonaco(monaco, item.additionalTextEdits),
    command: toCommand(item.command),
  };
}

function completionKind(monaco: MonacoModule, kind: number | undefined): Monaco.languages.CompletionItemKind | null {
  switch (kind) {
    case 1:
      return monaco.languages.CompletionItemKind.Text;
    case 2:
      return monaco.languages.CompletionItemKind.Method;
    case 3:
      return monaco.languages.CompletionItemKind.Function;
    case 4:
      return monaco.languages.CompletionItemKind.Constructor;
    case 5:
      return monaco.languages.CompletionItemKind.Field;
    case 6:
      return monaco.languages.CompletionItemKind.Variable;
    case 7:
      return monaco.languages.CompletionItemKind.Class;
    case 8:
      return monaco.languages.CompletionItemKind.Interface;
    case 9:
      return monaco.languages.CompletionItemKind.Module;
    case 10:
      return monaco.languages.CompletionItemKind.Property;
    case 13:
      return monaco.languages.CompletionItemKind.Enum;
    case 14:
      return monaco.languages.CompletionItemKind.Keyword;
    case 15:
      return monaco.languages.CompletionItemKind.Snippet;
    case 20:
      return monaco.languages.CompletionItemKind.EnumMember;
    case 21:
      return monaco.languages.CompletionItemKind.Constant;
    case 22:
      return monaco.languages.CompletionItemKind.Struct;
    case 24:
      return monaco.languages.CompletionItemKind.Operator;
    case 25:
      return monaco.languages.CompletionItemKind.TypeParameter;
    default:
      return null;
  }
}
