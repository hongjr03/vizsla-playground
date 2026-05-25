import type * as Monaco from "monaco-editor";
import type { LabDiagnostic } from "../types";
import type { LspRequest, MonacoModule } from "./monaco";
import {
  arrayOf,
  codeActionKinds,
  isDefined,
  recordValue,
  stringArray,
  textEditsToMonaco,
  toCodeAction,
  toCodeLens,
  toCompletionList,
  toDocumentHighlight,
  toDocumentSymbol,
  toFoldingRange,
  toFullSemanticTokens,
  toInlayHint,
  toLocationArray,
  toLocations,
  toLspPosition,
  toLspRange,
  toMonacoHover,
  toRenameLocation,
  toSelectionRangeChain,
  toSemanticTokens,
  toSignatureHelp,
  toWorkspaceEdit,
} from "./monaco";

export { diagnosticsFromLspReport, toMarkerData } from "./monaco";

export interface MonacoLspBridgeOptions {
  monaco: MonacoModule;
  languageId: string;
  serverCapabilities: unknown;
  ownsModel: (model: Monaco.editor.ITextModel) => boolean;
  uriForModel: (model: Monaco.editor.ITextModel) => string;
  diagnosticsForModel?: (model: Monaco.editor.ITextModel) => readonly LabDiagnostic[];
  request: LspRequest;
}

export function registerVizslaLspProviders(options: MonacoLspBridgeOptions): Monaco.IDisposable[] {
  const { monaco, languageId, request } = options;
  const rawCodeActions = new WeakMap<Monaco.languages.CodeAction, unknown>();
  const rawCodeLenses = new WeakMap<Monaco.languages.CodeLens, unknown>();
  const capabilities = recordValue(options.serverCapabilities);
  const completionProvider = recordValue(capabilities?.completionProvider);
  const signatureHelpProvider = recordValue(capabilities?.signatureHelpProvider);
  const codeActionProvider = recordValue(capabilities?.codeActionProvider);
  const semanticTokensProvider = recordValue(capabilities?.semanticTokensProvider);
  const semanticTokenLegend = recordValue(semanticTokensProvider?.legend);
  const semanticTokenTypes = stringArray(semanticTokenLegend?.tokenTypes) ?? [];
  const semanticTokenModifiers = stringArray(semanticTokenLegend?.tokenModifiers) ?? [];

  const sameModel = (model: Monaco.editor.ITextModel) => options.ownsModel(model);
  const textDocument = (model: Monaco.editor.ITextModel) => ({ uri: options.uriForModel(model) });
  const textDocumentPosition = (model: Monaco.editor.ITextModel, position: Monaco.Position) => ({
    textDocument: textDocument(model),
    position: toLspPosition(position),
  });

  return [
    monaco.languages.registerHoverProvider(languageId, {
      provideHover: async (model, position) => {
        if (!sameModel(model)) {
          return null;
        }
        const result = await request("textDocument/hover", {
          textDocument: textDocument(model),
          position: toLspPosition(position),
        });
        return toMonacoHover(monaco, result);
      },
    }),
    monaco.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: stringArray(completionProvider?.triggerCharacters),
      provideCompletionItems: async (model, position, context) => {
        if (!sameModel(model)) {
          return { suggestions: [] };
        }
        const result = await request("textDocument/completion", {
          textDocument: textDocument(model),
          position: toLspPosition(position),
          context: {
            triggerKind: context.triggerKind + 1,
            triggerCharacter: context.triggerCharacter,
          },
        });
        return toCompletionList(monaco, model, position, result);
      },
    }),
    monaco.languages.registerSignatureHelpProvider(languageId, {
      signatureHelpTriggerCharacters: stringArray(signatureHelpProvider?.triggerCharacters),
      signatureHelpRetriggerCharacters: stringArray(signatureHelpProvider?.retriggerCharacters),
      provideSignatureHelp: async (model, position, _token, context) => {
        if (!sameModel(model)) {
          return null;
        }
        const result = await request("textDocument/signatureHelp", {
          ...textDocumentPosition(model, position),
          context: {
            triggerKind: context.triggerKind,
            triggerCharacter: context.triggerCharacter,
            isRetrigger: context.isRetrigger,
            activeSignatureHelp: context.activeSignatureHelp,
          },
        });
        return result ? { value: toSignatureHelp(result), dispose: () => undefined } : null;
      },
    }),
    monaco.languages.registerInlayHintsProvider(languageId, {
      displayName: "Vizsla",
      provideInlayHints: async (model, range) => {
        if (!sameModel(model)) {
          return { hints: [], dispose: () => undefined };
        }
        const result = await request("textDocument/inlayHint", {
          textDocument: textDocument(model),
          range: toLspRange(range),
        });
        return {
          hints: arrayOf(result).map((hint) => toInlayHint(monaco, hint)).filter(isDefined),
          dispose: () => undefined,
        };
      },
    }),
    monaco.languages.registerDefinitionProvider(languageId, {
      provideDefinition: async (model, position) =>
        sameModel(model) ? toLocations(monaco, await request("textDocument/definition", textDocumentPosition(model, position))) : null,
    }),
    monaco.languages.registerDeclarationProvider(languageId, {
      provideDeclaration: async (model, position) =>
        sameModel(model) ? toLocations(monaco, await request("textDocument/declaration", textDocumentPosition(model, position))) : null,
    }),
    monaco.languages.registerTypeDefinitionProvider(languageId, {
      provideTypeDefinition: async (model, position) =>
        sameModel(model) ? toLocations(monaco, await request("textDocument/typeDefinition", textDocumentPosition(model, position))) : null,
    }),
    monaco.languages.registerReferenceProvider(languageId, {
      provideReferences: async (model, position, context) =>
        sameModel(model)
          ? toLocationArray(
              monaco,
              await request("textDocument/references", {
                ...textDocumentPosition(model, position),
                context: { includeDeclaration: context.includeDeclaration },
              }),
            )
          : null,
    }),
    monaco.languages.registerDocumentHighlightProvider(languageId, {
      provideDocumentHighlights: async (model, position) =>
        sameModel(model)
          ? arrayOf(await request("textDocument/documentHighlight", textDocumentPosition(model, position)))
              .map((highlight) => toDocumentHighlight(monaco, highlight))
              .filter(isDefined)
          : null,
    }),
    monaco.languages.registerDocumentSymbolProvider(languageId, {
      displayName: "Vizsla",
      provideDocumentSymbols: async (model) =>
        sameModel(model)
          ? arrayOf(await request("textDocument/documentSymbol", { textDocument: textDocument(model) }))
              .map((symbol) => toDocumentSymbol(monaco, symbol))
              .filter(isDefined)
          : null,
    }),
    monaco.languages.registerFoldingRangeProvider(languageId, {
      provideFoldingRanges: async (model) =>
        sameModel(model)
          ? arrayOf(await request("textDocument/foldingRange", { textDocument: textDocument(model) }))
              .map((range) => toFoldingRange(monaco, range))
              .filter(isDefined)
          : null,
    }),
    monaco.languages.registerSelectionRangeProvider(languageId, {
      provideSelectionRanges: async (model, positions) =>
        sameModel(model)
          ? arrayOf(
              await request("textDocument/selectionRange", {
                textDocument: textDocument(model),
                positions: positions.map(toLspPosition),
              }),
            ).map((range) => toSelectionRangeChain(monaco, range))
          : null,
    }),
    monaco.languages.registerDocumentFormattingEditProvider(languageId, {
      provideDocumentFormattingEdits: async (model, formatOptions) =>
        sameModel(model)
          ? textEditsToMonaco(
              monaco,
              await request("textDocument/formatting", {
                textDocument: textDocument(model),
                options: formatOptions,
              }),
            )
          : null,
    }),
    monaco.languages.registerDocumentRangeFormattingEditProvider(languageId, {
      provideDocumentRangeFormattingEdits: async (model, range, formatOptions) =>
        sameModel(model)
          ? textEditsToMonaco(
              monaco,
              await request("textDocument/rangeFormatting", {
                textDocument: textDocument(model),
                range: toLspRange(range),
                options: formatOptions,
              }),
            )
          : null,
    }),
    monaco.languages.registerOnTypeFormattingEditProvider(languageId, {
      autoFormatTriggerCharacters: ["\n"],
      provideOnTypeFormattingEdits: async (model, position, ch, formatOptions) =>
        sameModel(model)
          ? textEditsToMonaco(
              monaco,
              await request("textDocument/onTypeFormatting", {
                textDocument: textDocument(model),
                position: toLspPosition(position),
                ch,
                options: formatOptions,
              }),
            )
          : null,
    }),
    monaco.languages.registerRenameProvider(languageId, {
      resolveRenameLocation: async (model, position) => {
        if (!sameModel(model)) {
          return null;
        }
        const result = await request("textDocument/prepareRename", textDocumentPosition(model, position));
        return toRenameLocation(monaco, model, position, result);
      },
      provideRenameEdits: async (model, position, newName) =>
        sameModel(model)
          ? toWorkspaceEdit(
              monaco,
              await request("textDocument/rename", {
                ...textDocumentPosition(model, position),
                newName,
              }),
            )
          : null,
    }),
    monaco.languages.registerCodeActionProvider(
      languageId,
      {
        provideCodeActions: async (model, range, context) => {
          if (!sameModel(model)) {
            return null;
          }
          const lspRange = toLspRange(range);
          const result = await request("textDocument/codeAction", {
            textDocument: textDocument(model),
            range: lspRange,
            context: {
              diagnostics: codeActionDiagnostics(options.diagnosticsForModel?.(model) ?? [], lspRange),
              only: context.only ? [context.only] : undefined,
              triggerKind: context.trigger,
            },
          });
          const actions = arrayOf(result)
            .map((action) => toCodeAction(monaco, action, rawCodeActions))
            .filter(isDefined);
          return { actions, dispose: () => undefined };
        },
        resolveCodeAction: async (codeAction) => {
          const rawAction = rawCodeActions.get(codeAction);
          if (!rawAction) {
            return codeAction;
          }
          const resolved = await request("codeAction/resolve", rawAction);
          return toCodeAction(monaco, resolved, rawCodeActions) ?? codeAction;
        },
      },
      {
        providedCodeActionKinds: codeActionKinds(codeActionProvider),
      },
    ),
    monaco.languages.registerCodeLensProvider(languageId, {
      provideCodeLenses: async (model) => {
        if (!sameModel(model)) {
          return { lenses: [], dispose: () => undefined };
        }
        const lenses = arrayOf(await request("textDocument/codeLens", { textDocument: textDocument(model) }))
          .map((lens) => toCodeLens(monaco, lens, rawCodeLenses))
          .filter(isDefined);
        return { lenses, dispose: () => undefined };
      },
      resolveCodeLens: async (_model, codeLens) => {
        const rawLens = rawCodeLenses.get(codeLens);
        if (!rawLens) {
          return codeLens;
        }
        const resolved = await request("codeLens/resolve", rawLens);
        return toCodeLens(monaco, resolved, rawCodeLenses) ?? codeLens;
      },
    }),
    ...(semanticTokenTypes.length > 0
      ? [
          monaco.languages.registerDocumentSemanticTokensProvider(languageId, {
            getLegend: () => ({
              tokenTypes: semanticTokenTypes,
              tokenModifiers: semanticTokenModifiers,
            }),
            provideDocumentSemanticTokens: async (model, lastResultId) => {
              if (!sameModel(model)) {
                return null;
              }
              const method = lastResultId ? "textDocument/semanticTokens/full/delta" : "textDocument/semanticTokens/full";
              const result = await request(method, {
                textDocument: textDocument(model),
                previousResultId: lastResultId,
              });
              return toSemanticTokens(result);
            },
            releaseDocumentSemanticTokens: () => undefined,
          }),
          monaco.languages.registerDocumentRangeSemanticTokensProvider(languageId, {
            getLegend: () => ({
              tokenTypes: semanticTokenTypes,
              tokenModifiers: semanticTokenModifiers,
            }),
            provideDocumentRangeSemanticTokens: async (model, range) =>
              sameModel(model)
                ? toFullSemanticTokens(
                    await request("textDocument/semanticTokens/range", {
                      textDocument: textDocument(model),
                      range: toLspRange(range),
                    }),
                  )
                : null,
          }),
        ]
      : []),
  ];
}

function codeActionDiagnostics(diagnostics: readonly LabDiagnostic[], range: ReturnType<typeof toLspRange>): unknown[] {
  return diagnostics.filter((diagnostic) => rangesOverlap(diagnostic.range, range)).map((diagnostic) => {
    const lspDiagnostic: Record<string, unknown> = {
      range: diagnostic.range,
      severity: diagnostic.severity,
      source: diagnostic.source,
      message: diagnostic.message,
    };

    if (diagnostic.rawCode ?? diagnostic.code) {
      lspDiagnostic.code = diagnostic.rawCode ?? diagnostic.code;
    }

    if (diagnostic.data !== undefined) {
      lspDiagnostic.data = diagnostic.data;
    }

    return lspDiagnostic;
  });
}

function rangesOverlap(left: ReturnType<typeof toLspRange>, right: ReturnType<typeof toLspRange>): boolean {
  return comparePosition(left.start, right.end) <= 0 && comparePosition(right.start, left.end) <= 0;
}

function comparePosition(left: ReturnType<typeof toLspRange>["start"], right: ReturnType<typeof toLspRange>["start"]): number {
  return left.line === right.line ? left.character - right.character : left.line - right.line;
}
