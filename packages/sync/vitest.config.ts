import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "sync", globals: true, environment: "node", include: ["test/**/*.test.ts"] },
});
