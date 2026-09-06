import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // Unit tests below never touch a real Postgres/Redis/SMTP connection
    // (everything infra-shaped is dependency-injected and mocked), so this
    // suite is safe to run with no external services present.
  },
});
