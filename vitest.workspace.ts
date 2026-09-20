import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/engine",
  "packages/analysis",
  "packages/library",
  "packages/sync",
  "packages/dsp",
]);
