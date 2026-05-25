import type * as Monaco from "monaco-editor";
import type { MonacoModule } from "./types";
import { arrayOf, isDefined, isRecord, numberValue, stringValue } from "./guards";
import { toMonacoRange } from "./ranges";

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

export function toLocation(monaco: MonacoModule, value: unknown): Monaco.languages.Location | null {
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

function symbolKind(kind: number | undefined): Monaco.languages.SymbolKind | null {
  if (kind === undefined || kind < 1 || kind > 26) {
    return null;
  }
  const index = kind - 1;
  return index as Monaco.languages.SymbolKind;
}
