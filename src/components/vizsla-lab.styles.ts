import { css, unsafeCSS, type CSSResultGroup } from "lit";
import monacoStyles from "monaco-editor/min/vs/editor/editor.main.css?inline";

export const vizslaLabStyles: CSSResultGroup = [
  unsafeCSS(monacoStyles),
  css`
      :host {
        display: block;
        color: #efe8d2;
        font-family:
          "Aptos",
          "Segoe UI",
          system-ui,
          sans-serif;
        --vzlab-height: min(860px, calc(100vh - 28px));
      }

      :host([docs]) {
        --vzlab-height: 620px;
      }

      * {
        box-sizing: border-box;
      }

      .shell {
        min-height: var(--vzlab-height);
        background: #ece5d0;
        color: #171813;
        display: grid;
        grid-template-rows: auto 1fr;
        border: 1px solid #20221c;
        overflow: hidden;
      }

      .topbar {
        display: grid;
        grid-template-columns: minmax(230px, 1fr) auto auto;
        align-items: center;
        gap: 14px;
        padding: 12px;
        background: #f8f0da;
        border-bottom: 1px solid #20221c;
      }

      .brand {
        min-width: 0;
        display: grid;
        grid-template-columns: 42px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
      }

      .mark {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        background: #171813;
        color: #b8dd47;
        font-family:
          "Cascadia Code",
          Consolas,
          monospace;
        font-weight: 800;
        border-radius: 6px;
      }

      h1,
      p,
      dl,
      dd {
        margin: 0;
      }

      h1 {
        font-size: 18px;
        line-height: 1.1;
      }

      .brand p,
      .editor-header,
      .file-strip,
      .status,
      select,
      button,
      .diagnostic span,
      .trace p,
      .project dt,
      .project dd {
        font-family:
          "Cascadia Code",
          Consolas,
          monospace;
      }

      .brand p {
        margin-top: 4px;
        color: #5d5849;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .select {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #5d5849;
        font-size: 12px;
      }

      select {
        height: 36px;
        min-width: 184px;
        color: #171813;
        background: #fffaf0;
        border: 1px solid #beb49b;
        border-radius: 6px;
        padding: 0 10px;
      }

      button {
        height: 36px;
        min-width: 36px;
        display: inline-grid;
        place-items: center;
        border: 1px solid #20221c;
        border-radius: 6px;
        background: #fffaf0;
        color: #171813;
        cursor: pointer;
        transition:
          background 150ms ease,
          transform 150ms ease;
      }

      button:hover,
      button:focus-visible {
        background: #b8dd47;
      }

      button:active {
        transform: translateY(1px);
      }

      button svg {
        width: 17px;
        height: 17px;
      }

      button.is-busy svg {
        animation: spin 700ms linear infinite;
      }

      .status {
        justify-self: end;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding: 0 12px;
        border: 1px solid #20221c;
        border-radius: 999px;
        background: #fffaf0;
        color: #8d2b1f;
        font-size: 12px;
      }

      .status.is-ready {
        color: #244c25;
      }

      .status-dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: currentColor;
      }

      .body {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(330px, 28vw);
        background: #10110f;
      }

      .editor-panel {
        min-width: 0;
        min-height: 0;
        display: grid;
        grid-template-rows: auto auto 1fr;
        border-right: 1px solid #383b32;
      }

      .editor-header {
        min-height: 42px;
        color: #d8cfb6;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0 14px;
        border-bottom: 1px solid #383b32;
        font-size: 12px;
      }

      .editor-header span:first-child {
        min-width: 0;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .editor-header svg {
        width: 15px;
        height: 15px;
      }

      .file-strip {
        min-height: 38px;
        display: flex;
        align-items: stretch;
        overflow-x: auto;
        border-bottom: 1px solid #383b32;
        background: #171915;
      }

      .file-strip button {
        flex: 0 0 auto;
        height: 38px;
        min-width: 0;
        max-width: 220px;
        border: 0;
        border-right: 1px solid #383b32;
        border-radius: 0;
        background: transparent;
        color: #9c947e;
        padding: 0 12px;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .file-strip button.is-active {
        background: #10110f;
        color: #efe8d2;
        box-shadow: inset 0 -2px 0 #b8dd47;
      }

      .file-strip button.has-diagnostic {
        color: #ffb02e;
      }

      .file-strip button.has-error {
        color: #ef6f6c;
      }

      .editor {
        min-height: 0;
      }

      .inspector {
        min-width: 0;
        min-height: 0;
        display: grid;
        grid-template-rows: 118px auto 1fr;
        background: #171915;
      }

      .waveform {
        width: 100%;
        height: 118px;
        border-bottom: 1px solid #383b32;
      }

      .tabs {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        border-bottom: 1px solid #383b32;
      }

      .tabs button {
        border: 0;
        border-right: 1px solid #383b32;
        border-radius: 0;
        background: #171915;
        color: #d8cfb6;
        font-size: 12px;
      }

      .tabs button:last-child {
        border-right: 0;
      }

      .tabs button.is-active {
        background: #ece5d0;
        color: #171813;
      }

      .panel {
        min-height: 0;
        display: none;
        overflow: auto;
        padding: 12px;
      }

      .panel.is-active {
        display: block;
      }

      .empty {
        min-height: 180px;
        display: grid;
        place-items: center;
        gap: 10px;
        align-content: center;
        color: #8a856f;
        text-align: center;
      }

      .empty svg {
        width: 28px;
        height: 28px;
      }

      .diagnostic,
      .trace,
      .project div {
        border: 1px solid #383b32;
        background: #10110f;
        color: #efe8d2;
        border-radius: 6px;
        padding: 10px;
        margin-bottom: 10px;
      }

      .diagnostic {
        border-left: 4px solid #ef6f6c;
      }

      .diagnostic.severity-2 {
        border-left-color: #ffb02e;
      }

      .diagnostic strong,
      .trace strong {
        display: block;
        font-size: 13px;
      }

      .diagnostic p,
      .trace p {
        color: #d8cfb6;
        margin: 7px 0;
        font-size: 12px;
        line-height: 1.45;
      }

      .diagnostic span {
        color: #8a856f;
        font-size: 11px;
      }

      .trace {
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr);
        column-gap: 8px;
      }

      .trace span {
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        border-radius: 4px;
        background: #293423;
        color: #b8dd47;
        font-weight: 800;
        font-size: 12px;
      }

      .trace.server span {
        background: #213632;
        color: #13b9a5;
      }

      .project {
        display: grid;
        gap: 10px;
      }

      .project div {
        margin-bottom: 0;
      }

      .project dt {
        color: #8a856f;
        font-size: 11px;
        text-transform: uppercase;
      }

      .project dd {
        margin-top: 5px;
        color: #efe8d2;
        font-size: 13px;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }

      @media (max-width: 860px) {
        .topbar {
          grid-template-columns: 1fr;
        }

        .controls,
        .status {
          justify-self: stretch;
        }

        .controls {
          flex-wrap: wrap;
        }

        .body {
          grid-template-columns: 1fr;
          grid-template-rows: minmax(420px, 1fr) 360px;
        }

        .editor-panel {
          border-right: 0;
          border-bottom: 1px solid #383b32;
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
    `
];
