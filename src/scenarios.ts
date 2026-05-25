import type { VizslaScenario } from "./types";

const RTL_MANIFEST = `sources = ["rtl/**"]
`;

const RTL_TB_MANIFEST = `sources = ["rtl/**", "tb/**"]
`;

const RTL_WITH_INCLUDES_MANIFEST = `sources = ["rtl/**"]
include_dirs = ["include"]
`;

export const SCENARIOS: VizslaScenario[] = [
  {
    id: "counter",
    label: "Counter Workspace",
    entryFile: "rtl/counter.sv",
    description: "Configured workspace with RTL and a small testbench.",
    files: [
      {
        path: "vizsla_config.toml",
        languageId: "toml",
        editable: false,
        source: RTL_TB_MANIFEST,
      },
      {
        path: "rtl/counter.sv",
        source: `module counter #(
  parameter int WIDTH = 8
) (
  input  logic clk,
  input  logic rst_n,
  output logic [WIDTH-1:0] value
);

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      value <= '0;
    end else begin
      value <= value + 1'b1;
    end
  end
endmodule
`,
      },
      {
        path: "tb/counter_tb.sv",
        source: `module counter_tb;
  logic clk;
  logic rst_n;
  logic [7:0] value;

  counter dut (
    .clk(clk),
    .rst_n(rst_n),
    .value(value)
  );
endmodule
`,
      },
    ],
  },
  {
    id: "syntax-error",
    label: "Syntax Diagnostic",
    entryFile: "rtl/broken.sv",
    description: "Configured workspace with a parse error that always produces a diagnostic.",
    files: [
      {
        path: "vizsla_config.toml",
        languageId: "toml",
        editable: false,
        source: RTL_MANIFEST,
      },
      {
        path: "rtl/broken.sv",
        source: `module broken(;
endmodule
`,
      },
    ],
  },
  {
    id: "bad-port",
    label: "Port Mismatch",
    entryFile: "rtl/top.sv",
    description: "Multi-file semantic diagnostic from a configured source root.",
    files: [
      {
        path: "vizsla_config.toml",
        languageId: "toml",
        editable: false,
        source: RTL_MANIFEST,
      },
      {
        path: "rtl/child.sv",
        source: `module child(input logic a, input logic b);
endmodule
`,
      },
      {
        path: "rtl/top.sv",
        source: `module top;
  logic sig;

  child u(.a(sig));
endmodule
`,
      },
    ],
  },
  {
    id: "macro-guard",
    label: "Macro Include",
    entryFile: "rtl/feature_gate.sv",
    description: "Include directory and macro flow for docs embeds.",
    files: [
      {
        path: "vizsla_config.toml",
        languageId: "toml",
        editable: false,
        source: RTL_WITH_INCLUDES_MANIFEST,
      },
      {
        path: "include/feature_defs.svh",
        source: "`define VIZSLA_LAB_ENABLE\n",
      },
      {
        path: "rtl/feature_gate.sv",
        source: `\`include "feature_defs.svh"

module feature_gate(input logic clk, output logic pulse);
\`ifdef VIZSLA_LAB_ENABLE
  always_ff @(posedge clk) begin
    pulse <= ~pulse;
  end
\`else
  assign pulse = 1'b0;
\`endif
endmodule
`,
      },
    ],
  },
];

export function getScenario(id: string | null | undefined): VizslaScenario {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0];
}
