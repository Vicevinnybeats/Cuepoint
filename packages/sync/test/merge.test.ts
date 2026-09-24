import { describe, it, expect } from "vitest";
import { remoteWins } from "../src/merge.js";

describe("remoteWins", () => {
  it("takes the remote copy when there's nothing local", () => {
    expect(remoteWins(undefined, 1)).toBe(true);
  });
  it("takes a strictly newer remote copy", () => {
    expect(remoteWins(100, 101)).toBe(true);
  });
  it("keeps local on a tie, so a device doesn't churn on its own echo", () => {
    expect(remoteWins(100, 100)).toBe(false);
  });
  it("keeps a newer local copy", () => {
    expect(remoteWins(200, 100)).toBe(false);
  });
});
