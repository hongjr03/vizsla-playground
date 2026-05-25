import type * as Monaco from "monaco-editor";
import { arrayOf, isRecord, numberValue, stringValue } from "./guards";
import { markupContent } from "./markup";

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
