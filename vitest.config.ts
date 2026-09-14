import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests over the pure libs (src/lib/__tests__). No Supabase, no network:
// anything that needs a database is out of scope here by design — the point
// of this suite is the CONTRACTS teammates' plugins depend on (digest shape,
// traffic lights, lanes, merge order, reminders title parsing).
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/lib/__tests__/**/*.test.ts", "src/lib/__tests__/**/*.test.tsx", "plugin/hooks/__tests__/**/*.test.ts", "cli/bin/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // next/font/google only has real exports inside Next's own build (its
      // compiler swaps each call for a generated CSS module); site-copy.test.tsx
      // renders src/app/landing/landing.tsx, which now imports src/app/fonts.ts
      // for siteDisplay, so tests need a callable stand-in. See the mock file.
      "next/font/google": fileURLToPath(new URL("./src/test/next-font-google.mock.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
