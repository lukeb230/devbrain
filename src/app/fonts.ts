import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

// The three faces, self-hosted by next/font so the Tauri webviews never reach
// out for fonts. Display (variable, with the optical-size axis the design
// uses) for headlines; Plex Sans for UI; Plex Mono for anything that is data.
export const display = Bricolage_Grotesque({ subsets: ["latin"], weight: "variable", axes: ["opsz"], variable: "--font-display", display: "swap" });
export const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });
export const FONT_VARS = `${display.variable} ${body.variable} ${mono.variable}`;
