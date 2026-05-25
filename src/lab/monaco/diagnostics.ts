import type * as Monaco from "monaco-editor";
import type { LabDiagnostic, LspRange, LspSeverity } from "../../types";
import type { MonacoModule } from "./types";
import { isLspRange, isRecord, stringValue } from "./guards";

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

function isLspDiagnostic(
  value: unknown,
): value is { range: LspRange; severity?: LspSeverity; source?: unknown; code?: unknown; data?: unknown; message: string } {
  return isRecord(value) && isLspRange(value.range) && typeof value.message === "string";
}

function lspCodeToString(code: unknown): string | undefined {
  if (typeof code === "string" || typeof code === "number") {
    return String(code);
  }
  return undefined;
}
