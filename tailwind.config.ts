import type { Config } from "tailwindcss";

// Industrial dark-first palette — familiar territory for the Flow-Sync team.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0e14",
          900: "#111827",
          800: "#1a2233",
          700: "#232d42",
        },
        brand: {
          400: "#5eead4",
          500: "#2dd4bf",
          600: "#14b8a6",
        },
      },
    },
  },
  plugins: [],
};

export default config;
