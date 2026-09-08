"use client";

import { supabaseBrowser } from "@/lib/supabase/client";

type TauriCore = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
function tauriCore(): TauriCore | null {
  const t = (window as unknown as { __TAURI__?: { core?: TauriCore } }).__TAURI__;
  return t?.core ?? null;
}

export function SignInButton({ next, size = "lg" }: { next?: string; size?: "lg" | "sm" }) {
  async function signIn() {
    // Inside the desktop app: never log in to GitHub in the panel's webview
    // (Google/SSO-backed GitHub accounts can't). Hand off to the user's real
    // browser; it comes back through the app's devbrain:// URL scheme.
    const core = tauriCore();
    if (core) {
      try { await core.invoke("start_browser_login"); return; } catch { /* older shell: fall through */ }
    }
    const supabase = supabaseBrowser();
    // Remember where to land after OAuth in a cookie too: the desktop panel
    // must come back to /widget, and the query-string hint alone can be lost
    // between the provider hops. The callback reads either.
    if (next) document.cookie = `devbrain_next=${encodeURIComponent(next)}; path=/; max-age=3600; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`,
      },
    });
  }

  return (
    <button onClick={signIn} className={size === "lg" ? "rounded-[10px] bg-accent2 px-[22px] py-3 text-[14px] font-semibold text-white hover:brightness-110" : "rounded-lg bg-accent2 px-[11px] py-1.5 font-display text-[11.5px] font-semibold text-white"}>
      Sign in with GitHub
    </button>
  );
}
