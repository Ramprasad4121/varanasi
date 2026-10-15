import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["sdk/test/**/*.test.ts", "mcp-server/test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
