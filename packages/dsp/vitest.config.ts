import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "dsp", globals: true, environment: "node", include: ["test/**/*.test.ts"] },
});
