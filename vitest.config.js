import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.js", "server.js"],
      exclude: ["src/parser/numbersParser.js"],
    },
  },
});
