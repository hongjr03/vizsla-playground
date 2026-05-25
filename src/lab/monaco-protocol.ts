import type * as Monaco from "monaco-editor";
import type { LabDiagnostic, LspPosition, LspRange, LspSeverity } from "../types";

export type MonacoModule = typeof Monaco;
export type LspRequest = (method: string, params?: unknown) => Promise<unknown>;
export function diagnosticsFromLspReport(result: unknown, uri: string, filePath: string): LabDiagnostic[] {
  if (!isRecord(result)) {
    return [];
  }
  const items = Array.isArray(result.items) ? result.items : [];
  return items.filter(isLspDiagnostic).map((diagnostic) => {
    const data = isRecord(diagnostic.data) ? diagnostic.data : {};
    const diagnosticName = stringValue(data.name);
    const source = stringValue(diagnostic.source) ?? "vizsla";
    const rawCode = lspCodeToString(diagnostic.code);
    return {
      uri,
      filePath,
      range: diagnostic.range,
      severity: diagnostic.severity ?? 3,
      source,
      title: diagnosticName ?? source,
      code: diagnosticName ?? rawCode,
      rawCode,
      message: diagnostic.message,
    };
  });
}

export function toMarkerData(monaco: MonacoModule, diagnostic: LabDiagnostic): Monaco.editor.IMarkerData {
  return {
    severity: markerSeverity(monaco, diagnostic.severity),
    message: diagnostic.message,
    code: diagnostic.code,
    source: diagnostic.source,
    startLineNumber: diagnostic.range.start.line + 1,
    startColumn: diagnostic.range.start.character + 1,
    endLineNumber: diagnostic.range.end.line + 1,
    endColumn: diagnostic.range.end.character + 1,
  };
}

export function toLspPosition(position: Monaco.IPosition): LspPosition {
  return { line: position.lineNumber - 1, character: position.column - 1 };
}

export function toLspRange(range: Monaco.IRange): LspRange {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
  };
}

function toMonacoRange(monaco: MonacoModule, range: unknown): Monaco.Range | null {
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

export function toSignatureHelp(result: unknown): Monaco.languages.SignatureHelp {
  if (!isRecord(result)) {
    return { signatures: [], activeSignature: 0, activeParameter: 0 };
  }
  return {
    signatures: arrayOf(result.signatures).map((signature) => {
      if (!isRecord(signature)) {
        return { label: "", parameters: [] };
      }
      return {
        label: stringValue(signature.label) ?? "",
        documentation: markupContent(signature.documentation),
        parameters: arrayOf(signature.parameters).map((parameter) => {
          if (!isRecord(parameter)) {
            return { label: "" };
          }
          return {
            label: Array.isArray(parameter.label)
              ? [numberValue(parameter.label[0]) ?? 0, numberValue(parameter.label[1]) ?? 0]
              : stringValue(parameter.label) ?? "",
            documentation: markupContent(parameter.documentation),
          };
        }),
        activeParameter: numberValue(signature.activeParameter),
      };
    }),
    activeSignature: numberValue(result.activeSignature) ?? 0,
    activeParameter: numberValue(result.activeParameter) ?? 0,
  };
}

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

export function toLocations(monaco: MonacoModule, result: unknown): Monaco.languages.Location | Monaco.languages.Location[] | Monaco.languages.LocationLink[] | null {
  if (Array.isArray(result)) {
    return result.map((location) => toLocationOrLink(monaco, location)).filter(isDefined);
  }
  return toLocationOrLink(monaco, result);
}

export function toLocationArray(monaco: MonacoModule, result: unknown): Monaco.languages.Location[] {
  return arrayOf(result).map((location) => toLocation(monaco, location)).filter(isDefined);
}

function toLocationOrLink(monaco: MonacoModule, value: unknown): Monaco.languages.Location | Monaco.languages.LocationLink | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.targetUri === "string") {
    const range = toMonacoRange(monaco, value.targetRange);
    if (!range) {
      return null;
    }
    return {
      uri: monaco.Uri.parse(value.targetUri),
      range,
      targetSelectionRange: toMonacoRange(monaco, value.targetSelectionRange) ?? range,
      originSelectionRange: toMonacoRange(monaco, value.originSelectionRange) ?? undefined,
    };
  }
  return toLocation(monaco, value);
}

function toLocation(monaco: MonacoModule, value: unknown): Monaco.languages.Location | null {
  if (!isRecord(value) || typeof value.uri !== "string") {
    return null;
  }
  const range = toMonacoRange(monaco, value.range);
  return range ? { uri: monaco.Uri.parse(value.uri), range } : null;
}

export function toDocumentHighlight(monaco: MonacoModule, value: unknown): Monaco.languages.DocumentHighlight | null {
  if (!isRecord(value)) {
    return null;
  }
  const range = toMonacoRange(monaco, value.range);
  if (!range) {
    return null;
  }
  return {
    range,
    kind:
      value.kind === 2
        ? monaco.languages.DocumentHighlightKind.Read
        : value.kind === 3
          ? monaco.languages.DocumentHighlightKind.Write
          : monaco.languages.DocumentHighlightKind.Text,
  };
}

export function toDocumentSymbol(monaco: MonacoModule, value: unknown): Monaco.languages.DocumentSymbol | null {
  if (!isRecord(value) || typeof value.name !== "string") {
    return null;
  }
  const kind = symbolKind(numberValue(value.kind));
  if (kind === null) {
    return null;
  }
  if (isRecord(value.location)) {
    const range = toMonacoRange(monaco, value.location.range);
    if (!range) {
      return null;
    }
    return {
      name: value.name,
      detail: stringValue(value.containerName) ?? "",
      kind,
      tags: [],
      range,
      selectionRange: range,
    };
  }
  const range = toMonacoRange(monaco, value.range);
  const selectionRange = toMonacoRange(monaco, value.selectionRange);
  if (!range || !selectionRange) {
    return null;
  }
  return {
    name: value.name,
    detail: stringValue(value.detail) ?? "",
    kind,
    tags: Array.isArray(value.tags) && value.tags.includes(1) ? [1] : [],
    range,
    selectionRange,
    children: arrayOf(value.children).map((child) => toDocumentSymbol(monaco, child)).filter(isDefined),
  };
}

export function toFoldingRange(monaco: MonacoModule, value: unknown): Monaco.languages.FoldingRange | null {
  if (!isRecord(value)) {
    return null;
  }
  const startLine = numberValue(value.startLine);
  const endLine = numberValue(value.endLine);
  if (startLine === undefined || endLine === undefined) {
    return null;
  }
  return {
    start: startLine + 1,
    end: endLine + 1,
    kind: typeof value.kind === "string" ? monaco.languages.FoldingRangeKind.fromValue(value.kind) : undefined,
  };
}

export function toSelectionRangeChain(monaco: MonacoModule, value: unknown): Monaco.languages.SelectionRange[] {
  const ranges: Monaco.languages.SelectionRange[] = [];
  let current = value;
  while (isRecord(current)) {
    const range = toMonacoRange(monaco, current.range);
    if (range) {
      ranges.push({ range });
    }
    current = current.parent;
  }
  return ranges;
}

export function textEditsToMonaco(monaco: MonacoModule, result: unknown): Monaco.languages.TextEdit[] {
  return arrayOf(result)
    .map((edit) => textEditParts(monaco, edit))
    .filter(isDefined);
}

function completionTextEditParts(
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

function markerSeverity(monaco: MonacoModule, severity: LspSeverity): Monaco.MarkerSeverity {
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error;
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    default:
      return monaco.MarkerSeverity.Hint;
  }
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

function symbolKind(kind: number | undefined): Monaco.languages.SymbolKind | null {
  if (kind === undefined || kind < 1 || kind > 26) {
    return null;
  }
  const index = kind - 1;
  return index as Monaco.languages.SymbolKind;
}

function markupContents(value: unknown): Monaco.IMarkdownString[] {
  if (Array.isArray(value)) {
    return value.map(markupContent).filter(isDefined);
  }
  const content = markupContent(value);
  return content ? [content] : [];
}

function markupContent(value: unknown): Monaco.IMarkdownString | undefined {
  if (typeof value === "string") {
    return { value };
  }
  if (isRecord(value)) {
    if (typeof value.value === "string") {
      return { value: value.value };
    }
    if (typeof value.language === "string" && typeof value.value === "string") {
      return { value: `\`\`\`${value.language}\n${value.value}\n\`\`\`` };
    }
  }
  return undefined;
}

function toCommand(value: unknown): Monaco.languages.Command | undefined {
  if (!isRecord(value) || typeof value.command !== "string" || typeof value.title !== "string") {
    return undefined;
  }
  return {
    id: value.command,
    title: value.title,
    tooltip: stringValue(value.tooltip),
    arguments: Array.isArray(value.arguments) ? value.arguments : undefined,
  };
}

function isLspDiagnostic(
  value: unknown,
): value is { range: LspRange; severity?: LspSeverity; source?: unknown; code?: unknown; data?: unknown; message: string } {
  return isRecord(value) && isLspRange(value.range) && typeof value.message === "string";
}

function isLspRange(value: unknown): value is LspRange {
  return isRecord(value) && isLspPosition(value.start) && isLspPosition(value.end);
}

function isLspPosition(value: unknown): value is LspPosition {
  return isRecord(value) && typeof value.line === "number" && typeof value.character === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter(isString);
  return items.length > 0 ? items : undefined;
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function codeActionKinds(provider: Record<string, unknown> | undefined): string[] | undefined {
  if (!provider) {
    return undefined;
  }
  if (Array.isArray(provider.codeActionKinds)) {
    const kinds = provider.codeActionKinds.filter(isString);
    return kinds.length > 0 ? kinds : undefined;
  }
  return undefined;
}

function numericArray(value: unknown): Uint32Array | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return new Uint32Array(value.filter((item): item is number => typeof item === "number"));
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function lspCodeToString(code: unknown): string | undefined {
  if (typeof code === "string" || typeof code === "number") {
    return String(code);
  }
  return undefined;
}
