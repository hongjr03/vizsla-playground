import "vscode/localExtensionHost";
import { initialize, type IWorkbenchConstructionOptions } from "@codingame/monaco-vscode-api";
import { waitServicesReady } from "@codingame/monaco-vscode-api/lifecycle";
import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";

let startPromise: Promise<void> | undefined;

export function startVizslaVscodePlatform(): Promise<void> {
  startPromise ??= initialize({}, undefined, workspaceConfiguration()).then(() => waitServicesReady());
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
