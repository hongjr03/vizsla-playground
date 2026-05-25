import type { LspPosition, LspRange } from "../../types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isLspRange(value: unknown): value is LspRange {
  return isRecord(value) && isLspPosition(value.start) && isLspPosition(value.end);
}

export function isLspPosition(value: unknown): value is LspPosition {
  return isRecord(value) && typeof value.line === "number" && typeof value.character === "number";
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

export function numericArray(value: unknown): Uint32Array | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return new Uint32Array(value.filter((item): item is number => typeof item === "number"));
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
