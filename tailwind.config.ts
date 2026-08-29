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
        // Values live in globals.css (.wg dark set, light set under
        // [data-wg-theme="light"] / prefers-color-scheme) so the panel can switch.
        ink: "var(--wg-ink)", row: "var(--wg-row)", row2: "var(--wg-row2)", line: "var(--wg-line)", line2: "var(--wg-line2)",
        txt: "var(--wg-txt)", muted: "var(--wg-muted)", faint: "var(--wg-faint)",
        go: "var(--wg-go)", wait: "var(--wg-wait)", stop: "var(--wg-stop)",
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
