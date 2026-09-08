import { FONT_VARS } from "@/app/fonts";

// The browser pages (landing, welcome, open, setup) re-themed to Dusk: the
// same .wg tokens and faces as the app, dark warm ink, coral accent. The
// theme follows the same localStorage key as the app so a signed-in Mac
// that chose Light sees Light here too.
export function BrowserShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const early = `try{var t=localStorage.getItem("devbrain_theme");if(t==="dark"||t==="system")document.documentElement.dataset.wgTheme=t;}catch(e){}`;
  return (
    <div className={`wg ${FONT_VARS} font-body min-h-screen bg-ink text-[13.5px] text-txt ${className}`}>
      <script dangerouslySetInnerHTML={{ __html: early }} />
      {children}
    </div>
  );
}
