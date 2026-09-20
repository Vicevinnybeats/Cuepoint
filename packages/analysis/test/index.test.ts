import { describe, it, expect } from "vitest";
import { KEY_DETECTION_IMPLEMENTED } from "../src/index.js";

describe("analysis package", () => {
  it("documents key detection as not implemented rather than silently missing", () => {
    expect(KEY_DETECTION_IMPLEMENTED).toBe(false);
  });
});
