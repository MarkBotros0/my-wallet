import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the pure modules under src/lib and the framework-free glue
// under src/app/lib. Nothing here touches React, Next or the database, so the
// default Node environment is all that is needed.
export default defineConfig({
  resolve: {
    alias: {
      // Mirror tsconfig's `@/*` → `src/*`.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
