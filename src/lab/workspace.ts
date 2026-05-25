import type * as Monaco from "monaco-editor";
import type { VizslaScenario, VizslaScenarioFile, WorkerWorkspaceFile } from "../types";

export const WORKSPACE_ROOT_URI = "file:///workspace";

const SOURCE_EXTENSIONS = new Set([".v", ".vh", ".sv", ".svh", ".svi"]);

export interface LabFileState {
  file: VizslaScenarioFile;
  uri: string;
  version: number;
  model: Monaco.editor.ITextModel;
  opened: boolean;
}

export function scenarioWorkspaceFiles(scenario: VizslaScenario): WorkerWorkspaceFile[] {
  return scenario.files.map((file) => ({
    path: normalizeWorkspacePath(file.path),
    text: file.source,
  }));
}

export function entryFile(scenario: VizslaScenario): VizslaScenarioFile {
  return scenario.files.find((file) => normalizeWorkspacePath(file.path) === normalizeWorkspacePath(scenario.entryFile)) ?? scenario.files[0];
}

export function sourceFiles(scenario: VizslaScenario): VizslaScenarioFile[] {
  return scenario.files.filter((file) => isSourceFile(file.path));
}

export function workspaceUri(path: string): string {
  return `${WORKSPACE_ROOT_URI}/${normalizeWorkspacePath(path).split("/").map(encodeURIComponent).join("/")}`;
}

export function pathFromWorkspaceUri(uri: string): string {
  const prefix = `${WORKSPACE_ROOT_URI}/`;
  if (!uri.startsWith(prefix)) {
    return uri;
  }
  return decodeURIComponent(uri.slice(prefix.length));
}

export function displayPath(path: string): string {
  return normalizeWorkspacePath(path);
}

export function fileName(path: string): string {
  const parts = normalizeWorkspacePath(path).split("/");
  return parts[parts.length - 1] ?? path;
}

export function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extension(path));
}

export function languageIdForPath(path: string): string {
  const ext = extension(path);
  if (ext === ".v" || ext === ".vh") {
    return "verilog";
  }
  if (SOURCE_EXTENSIONS.has(ext)) {
    return "systemverilog";
  }
  return "plaintext";
}

export function normalizeWorkspacePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new Error(`Invalid workspace path: ${path}`);
  }
  return parts.join("/");
}

function extension(path: string): string {
  const name = fileName(path).toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}
