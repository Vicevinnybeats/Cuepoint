import { describe, it, expect } from "vitest";
import { generateSyncKey } from "../src/generate-key.js";

describe("generateSyncKey", () => {
  it("returns a 32-character hex string", () => {
    const key = generateSyncKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is different on each call", () => {
    expect(generateSyncKey()).not.toBe(generateSyncKey());
  });
});
