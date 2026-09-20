import { describe, it, expect } from "vitest";
import { ANALYSIS_IMPLEMENTED } from "../src/index.js";

describe("analysis package", () => {
  it("is a documented stub, not silently missing", () => {
    expect(ANALYSIS_IMPLEMENTED).toBe(false);
  });
});
