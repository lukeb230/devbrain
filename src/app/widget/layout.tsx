import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

// The desktop panel's typography, self-hosted by next/font so the Tauri
// webview never reaches out for fonts. Display face for the wordmark, section
// heads and tabs; Plex Sans for text; Plex Mono for anything that is data.
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <div className={`wg ${display.variable} ${body.variable} ${mono.variable} font-body`}>{children}</div>;
}
