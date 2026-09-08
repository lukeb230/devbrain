import { FONT_VARS } from "@/app/fonts";

// The desktop panel's typography, self-hosted by next/font so the Tauri
// webview never reaches out for fonts. Display face for the wordmark, section
// heads and tabs; Plex Sans for text; Plex Mono for anything that is data.

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  // Apply the saved appearance before first paint (no flash of the wrong theme).
  const early = `try{var t=localStorage.getItem("devbrain_theme");if(t==="light"||t==="dark")document.documentElement.dataset.wgTheme=t;}catch(e){}`;
  return (
    <div className={`wg ${FONT_VARS} font-body`}>
      <script dangerouslySetInnerHTML={{ __html: early }} />
      {children}
    </div>
  );
}
