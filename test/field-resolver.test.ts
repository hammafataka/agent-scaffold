import { describe, it, expect, vi } from "vitest";
import { resolveFields } from "../src/core/field-resolver";
import { FieldSpec, FieldKind } from "../src/plugins/types";

const fields: FieldSpec[] = [
  { key: "detected", question: "Q1", detectedValue: "auto", required: true, kind: FieldKind.Text },
  { key: "needed", question: "Q2", required: true, kind: FieldKind.Text },
  { key: "optional", question: "Q3", required: false, kind: FieldKind.Text },
];

describe("resolveFields", () => {
  it("--yes: uses detected, prompts only required-unknown, blanks optional-unknown", async () => {
    const ask = vi.fn(async () => "answered");
    const values = await resolveFields(fields, { yes: true, ask });
    expect(values).toEqual({ detected: "auto", needed: "answered", optional: "" });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(fields[1]);
  });

  it("interactive: asks every field (ask returns user input, default-aware)", async () => {
    const ask = vi.fn(async (f: FieldSpec) => `${f.key}-val`);
    const values = await resolveFields(fields, { yes: false, ask });
    expect(values).toEqual({ detected: "detected-val", needed: "needed-val", optional: "optional-val" });
    expect(ask).toHaveBeenCalledTimes(3);
  });
});
