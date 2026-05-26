import type * as Monaco from "@codingame/monaco-vscode-editor-api";
import { isDefined, isRecord, stringValue } from "./guards";

export function markupContents(value: unknown): Monaco.IMarkdownString[] {
  if (Array.isArray(value)) {
    return value.map(markupContent).filter(isDefined);
  }
  const content = markupContent(value);
  return content ? [content] : [];
}

export function markupContent(value: unknown): Monaco.IMarkdownString | undefined {
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

export function toCommand(value: unknown): Monaco.languages.Command | undefined {
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
