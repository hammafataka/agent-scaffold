import { describe, it, expect } from "vitest";
import { checklistBody, parseCustom } from "../src/core/prompter";

describe("parseCustom", () => {
  it("splits on commas, trims, drops empties", () => {
    expect(parseCustom("X, Y ,, Z ")).toEqual(["X", "Y", "Z"]);
    expect(parseCustom("")).toEqual([]);
    expect(parseCustom("   ")).toEqual([]);
    expect(parseCustom("Solo")).toEqual(["Solo"]);
  });
});

describe("checklistBody", () => {
  it("renders selected options as a markdown bullet list", () => {
    expect(checklistBody(["Alpha", "Gamma"])).toBe("- Alpha\n- Gamma");
  });

  it("appends custom additions after the selected options", () => {
    expect(checklistBody(["Alpha"], "X, Y")).toBe("- Alpha\n- X\n- Y");
  });

  it("supports custom-only and selection-only", () => {
    expect(checklistBody([], "Solo")).toBe("- Solo");
    expect(checklistBody(["Only"])).toBe("- Only");
  });

  it("returns empty string when nothing is selected or added", () => {
    expect(checklistBody([], "")).toBe("");
    expect(checklistBody([])).toBe("");
  });
});
