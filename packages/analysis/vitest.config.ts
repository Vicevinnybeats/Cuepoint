import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "analysis", globals: true, environment: "node", include: ["test/**/*.test.ts"] },
});
