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
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
