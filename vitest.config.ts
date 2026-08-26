import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests over the pure libs (src/lib/__tests__). No Supabase, no network:
// anything that needs a database is out of scope here by design — the point
// of this suite is the CONTRACTS teammates' plugins depend on (digest shape,
// traffic lights, lanes, merge order, reminders title parsing).
export default defineConfig({
  test: {
    include: ["src/lib/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
