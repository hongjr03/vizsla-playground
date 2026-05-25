import { css, unsafeCSS, type CSSResultGroup } from "lit";
import monacoStyles from "monaco-editor/min/vs/editor/editor.main.css?inline";

export const vizslaLabStyles: CSSResultGroup = [
  unsafeCSS(monacoStyles),
  css`
    :host {
      display: block;
      color: #09090b;
      font-family:
        "Aptos",
        "Segoe UI",
        system-ui,
        sans-serif;
      --vzlab-height: 100dvh;
      --vzlab-background: #fafafa;
      --vzlab-panel: #ffffff;
      --vzlab-editor: #0a0a0a;
      --vzlab-border: #e4e4e7;
      --vzlab-border-strong: #d4d4d8;
      --vzlab-muted: #71717a;
      --vzlab-muted-surface: #f4f4f5;
      --vzlab-accent: #18181b;
      --vzlab-ring: #a1a1aa;
      --vzlab-danger: #dc2626;
      --vzlab-warning: #b45309;
      --vzlab-success: #16a34a;
    }

    :host([docs]) {
      --vzlab-height: 620px;
    }

    :host,
    .shell,
    .body,
    .editor-panel,
    .workspace-row,
    .file-strip,
    .file-strip button,
    .toolbar,
    .select,
    .select > span,
    .toolbar select,
    .toolbar button,
    .drawer,
    .drawer-header,
    .drawer-header button,
    .panel,
    .empty,
    .diagnostic,
    .status,
    .badge,
    .status-dot {
      box-sizing: border-box;
    }

    .shell {
      position: relative;
      height: var(--vzlab-height);
      min-height: 0;
      display: grid;
      grid-template-rows: 1fr;
      overflow: hidden;
      background: var(--vzlab-background);
      border: 0;
      border-radius: 0;
    }

    :host([docs]) .shell {
      border: 1px solid var(--vzlab-border);
      border-radius: 8px;
    }

    .body,
    .editor-panel,
    .editor {
      min-width: 0;
      min-height: 0;
    }

    .body {
      display: grid;
      background: var(--vzlab-editor);
    }

    .editor-panel {
      display: grid;
      grid-template-rows: auto 1fr;
    }

    .monaco-editor .reference-zone-widget .messages,
    .monaco-editor .reference-zone-widget .ref-tree,
    .monaco-editor .reference-zone-widget .ref-tree .monaco-list,
    .monaco-editor .reference-zone-widget .reference,
    .monaco-editor .reference-zone-widget .referenceMatch,
    .monaco-editor .reference-zone-widget .monaco-icon-label,
    .monaco-editor .reference-zone-widget .monaco-icon-label .label-name,
    .monaco-editor .reference-zone-widget .monaco-icon-label .label-description,
    .monaco-editor .reference-zone-widget .count {
      font-size: 12px;
    }

    .workspace-row {
      min-height: 36px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: stretch;
      background: var(--vzlab-panel);
      border-bottom: 1px solid var(--vzlab-border);
    }

    .file-strip {
      min-width: 0;
      display: flex;
      align-items: stretch;
      overflow-x: auto;
      scrollbar-width: thin;
    }

    .file-strip button {
      flex: 0 0 auto;
      max-width: 210px;
      height: 36px;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-right: 1px solid var(--vzlab-border);
      border-radius: 0;
      background: transparent;
      color: var(--vzlab-muted);
      padding: 0 10px;
      font:
        500 11px/1 "Cascadia Code",
        Consolas,
        monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-strip button:hover,
    .file-strip button:focus-visible {
      background: var(--vzlab-muted-surface);
      color: var(--vzlab-accent);
    }

    .file-strip button.is-active {
      background: var(--vzlab-panel);
      color: var(--vzlab-accent);
      box-shadow: inset 0 -2px 0 var(--vzlab-accent);
    }

    .file-strip button.has-diagnostic {
      color: var(--vzlab-warning);
    }

    .file-strip button.has-error {
      color: var(--vzlab-danger);
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px;
      border-left: 1px solid var(--vzlab-border);
      background: var(--vzlab-panel);
    }

    .select {
      display: inline-flex;
      align-items: center;
    }

    .select > span {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
    }

    .toolbar select,
    .toolbar button,
    .drawer-header button,
    .status,
    .diagnostic span {
      font:
        500 11px/1 "Cascadia Code",
        Consolas,
        monospace;
    }

    .toolbar select {
      height: 28px;
      min-width: 138px;
      color: var(--vzlab-accent);
      background: var(--vzlab-panel);
      border: 1px solid var(--vzlab-border);
      border-radius: 6px;
      padding: 0 24px 0 8px;
    }

    .toolbar button,
    .drawer-header button {
      height: 28px;
      min-width: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      border: 1px solid var(--vzlab-border);
      border-radius: 6px;
      background: var(--vzlab-panel);
      color: var(--vzlab-accent);
      cursor: pointer;
      transition:
        background 140ms ease,
        border-color 140ms ease,
        color 140ms ease,
        transform 140ms ease;
    }

    .toolbar button:hover,
    .toolbar button:focus-visible,
    .drawer-header button:hover,
    .drawer-header button:focus-visible,
    .toolbar select:focus-visible {
      background: var(--vzlab-muted-surface);
      border-color: var(--vzlab-ring);
      outline: none;
    }

    .toolbar button:active,
    .drawer-header button:active {
      transform: translateY(1px);
    }

    .toolbar button svg,
    .drawer-header button svg {
      width: 14px;
      height: 14px;
    }

    .toolbar button.is-busy svg {
      animation: spin 700ms linear infinite;
    }

    .diagnostics-toggle {
      min-width: 42px;
      padding: 0 7px;
    }

    .diagnostics-toggle.is-active {
      background: var(--vzlab-accent);
      border-color: var(--vzlab-accent);
      color: var(--vzlab-panel);
    }

    .badge {
      min-width: 18px;
      height: 16px;
      display: inline-grid;
      place-items: center;
      border-radius: 999px;
      background: var(--vzlab-muted-surface);
      color: var(--vzlab-muted);
      padding: 0 4px;
      font-size: 10px;
      font-variant-numeric: tabular-nums;
    }

    .diagnostics-toggle.is-active .badge {
      background: rgba(255, 255, 255, 0.16);
      color: #ffffff;
    }

    .status {
      height: 28px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 8px;
      border: 1px solid var(--vzlab-border);
      border-radius: 999px;
      background: var(--vzlab-panel);
      color: var(--vzlab-muted);
      white-space: nowrap;
    }

    .status.is-ready {
      color: var(--vzlab-success);
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: currentColor;
    }

    .drawer {
      position: absolute;
      right: 8px;
      bottom: 8px;
      left: 8px;
      max-height: min(240px, calc(100% - 76px));
      display: grid;
      grid-template-rows: auto 1fr;
      overflow: hidden;
      background: var(--vzlab-panel);
      border: 1px solid var(--vzlab-border);
      border-radius: 8px;
      box-shadow:
        0 20px 38px rgba(24, 24, 27, 0.16),
        0 2px 8px rgba(24, 24, 27, 0.08);
    }

    .drawer-header {
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 8px 6px 12px;
      border-bottom: 1px solid var(--vzlab-border);
    }

    .drawer-header strong {
      display: block;
      color: var(--vzlab-accent);
      font-size: 12px;
      line-height: 1.2;
    }

    .drawer-header span {
      display: block;
      margin-top: 2px;
      color: var(--vzlab-muted);
      font-size: 11px;
    }

    .panel {
      min-height: 0;
      display: none;
      overflow: auto;
      padding: 8px;
    }

    .panel.is-active {
      display: block;
    }

    .empty {
      min-height: 128px;
      display: grid;
      place-items: center;
      gap: 10px;
      align-content: center;
      color: var(--vzlab-muted);
      text-align: center;
      font-size: 12px;
    }

    .empty svg {
      width: 22px;
      height: 22px;
    }

    .diagnostic {
      display: block;
      width: 100%;
      height: auto;
      min-height: 0;
      border: 1px solid var(--vzlab-border);
      border-left: 3px solid var(--vzlab-danger);
      background: var(--vzlab-panel);
      color: var(--vzlab-accent);
      border-radius: 7px;
      padding: 8px 9px;
      margin-bottom: 6px;
      text-align: left;
      cursor: pointer;
    }

    .diagnostic:hover,
    .diagnostic:focus-visible {
      background: var(--vzlab-muted-surface);
      outline: none;
    }

    .diagnostic.severity-2 {
      border-left-color: var(--vzlab-warning);
    }

    .diagnostic strong {
      display: block;
      font-size: 12px;
      line-height: 1.3;
    }

    .diagnostic p {
      margin: 5px 0;
      color: #3f3f46;
      font-size: 12px;
      line-height: 1.45;
    }

    .diagnostic span {
      color: var(--vzlab-muted);
      font-size: 10px;
      overflow-wrap: anywhere;
    }

    @media (max-width: 920px) {
      .workspace-row {
        grid-template-columns: 1fr;
      }

      .toolbar {
        border-top: 1px solid var(--vzlab-border);
        border-left: 0;
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      .toolbar select {
        min-width: 150px;
      }
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .toolbar button,
      .drawer-header button,
      .toolbar button::before,
      .toolbar button::after,
      .drawer-header button::before,
      .drawer-header button::after {
        animation-duration: 1ms !important;
        transition-duration: 1ms !important;
      }
    }
  `,
];
