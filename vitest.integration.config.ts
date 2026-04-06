import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/integration.setup.ts"],
    testTimeout: 120_000, // real HTTP calls + Modal cold starts can be slow
    hookTimeout: 60_000,
    setupFiles: ["tests/integration-env.ts"],
  },
});
