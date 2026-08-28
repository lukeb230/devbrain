import type { Config } from "tailwindcss";

// Light professional palette: white surfaces on a cool gray canvas,
// indigo accent, semantic status colors (emerald/amber/red/violet).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Coral, sampled from the brain mark (#e88078 = brand-500). Hand-tuned
        // so the deeper steps stay coral rather than sliding into error red.
        // Widget "instrument" palette (scoped to the desktop panel via .wg).
        ink: "#0f1420", row: "#151b28", row2: "#1a2130", line: "#242c3c", line2: "#2e3748",
        txt: "#ece7de", muted: "#8a92a6", faint: "#5d6579",
        go: "#5ad18e", wait: "#f0b652", stop: "#ff5a5f",
        brand: {
          50: "#fdf1ef",
          100: "#fadfdb",
          200: "#f5c5bf",
          300: "#f0a59d",
          400: "#ec8b82",
          500: "#e88078",
          600: "#d9645b",
          700: "#bf4d44",
          800: "#9c3d36",
          900: "#7a2f2a",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
