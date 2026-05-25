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

    * {
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
      grid-template-rows: auto auto 1fr;
    }

    .workspace-row {
      min-height: 44px;
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
      max-width: 240px;
      height: 44px;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-right: 1px solid var(--vzlab-border);
      border-radius: 0;
      background: transparent;
      color: var(--vzlab-muted);
      padding: 0 14px;
      font:
        500 12px/1 "Cascadia Code",
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
      padding: 6px;
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

    select,
    button,
    .status,
    .editor-header,
    .diagnostic span {
      font:
        500 12px/1 "Cascadia Code",
        Consolas,
        monospace;
    }

    select {
      height: 32px;
      min-width: 164px;
      color: var(--vzlab-accent);
      background: var(--vzlab-panel);
      border: 1px solid var(--vzlab-border);
      border-radius: 6px;
      padding: 0 32px 0 10px;
    }

    button {
      height: 32px;
      min-width: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
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

    button:hover,
    button:focus-visible,
    select:focus-visible {
      background: var(--vzlab-muted-surface);
      border-color: var(--vzlab-ring);
      outline: none;
    }

    button:active {
      transform: translateY(1px);
    }

    button svg {
      width: 15px;
      height: 15px;
    }

    button.is-busy svg {
      animation: spin 700ms linear infinite;
    }

    .diagnostics-toggle {
      min-width: 48px;
      padding: 0 9px;
    }

    .diagnostics-toggle.is-active {
      background: var(--vzlab-accent);
      border-color: var(--vzlab-accent);
      color: var(--vzlab-panel);
    }

    .badge {
      min-width: 18px;
      height: 18px;
      display: inline-grid;
      place-items: center;
      border-radius: 999px;
      background: var(--vzlab-muted-surface);
      color: var(--vzlab-muted);
      padding: 0 5px;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }

    .diagnostics-toggle.is-active .badge {
      background: rgba(255, 255, 255, 0.16);
      color: #ffffff;
    }

    .status {
      height: 32px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 0 10px;
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
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: currentColor;
    }

    .editor-header {
      min-height: 34px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 12px;
      background: #111113;
      color: #a1a1aa;
      border-bottom: 1px solid #27272a;
    }

    .editor-header span:first-child {
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .editor-header svg {
      width: 14px;
      height: 14px;
    }

    .drawer {
      position: absolute;
      right: 10px;
      bottom: 10px;
      left: 10px;
      max-height: min(284px, calc(100% - 110px));
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
      min-height: 46px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 10px 8px 14px;
      border-bottom: 1px solid var(--vzlab-border);
    }

    .drawer-header strong {
      display: block;
      color: var(--vzlab-accent);
      font-size: 13px;
      line-height: 1.2;
    }

    .drawer-header span {
      display: block;
      margin-top: 3px;
      color: var(--vzlab-muted);
      font-size: 12px;
    }

    .panel {
      min-height: 0;
      display: none;
      overflow: auto;
      padding: 10px;
    }

    .panel.is-active {
      display: block;
    }

    .empty {
      min-height: 160px;
      display: grid;
      place-items: center;
      gap: 10px;
      align-content: center;
      color: var(--vzlab-muted);
      text-align: center;
      font-size: 13px;
    }

    .empty svg {
      width: 24px;
      height: 24px;
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
      padding: 10px 11px;
      margin-bottom: 8px;
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
      font-size: 13px;
      line-height: 1.3;
    }

    .diagnostic p {
      margin: 6px 0;
      color: #3f3f46;
      font-size: 12px;
      line-height: 1.45;
    }

    .diagnostic span {
      color: var(--vzlab-muted);
      font-size: 11px;
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

      select {
        min-width: 150px;
      }
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 1ms !important;
        transition-duration: 1ms !important;
      }
    }
  `,
];
