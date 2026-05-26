import { initialize, type IWorkbenchConstructionOptions } from "@codingame/monaco-vscode-api";
import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";

let startPromise: Promise<void> | undefined;

export function startVizslaVscodePlatform(): Promise<void> {
  startPromise ??= initialize({}, undefined, workspaceConfiguration());
  return startPromise;
}

function workspaceConfiguration(): IWorkbenchConstructionOptions {
  return {
    workspaceProvider: {
      trusted: true,
      workspace: {
        workspaceUri: URI.parse("file:///workspace.code-workspace"),
      },
      async open() {
        return false;
      },
    },
  };
}
