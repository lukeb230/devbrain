"use client";

import { supabaseBrowser } from "@/lib/supabase/client";

type TauriCore = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
function tauriCore(): TauriCore | null {
  const t = (window as unknown as { __TAURI__?: { core?: TauriCore } }).__TAURI__;
  return t?.core ?? null;
}

export function SignInButton({ next }: { next?: string }) {
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
    <button
      onClick={signIn}
      className="rounded-lg bg-brand-600 px-6 py-3 font-medium text-white transition hover:bg-brand-700"
    >
      Sign in with GitHub
    </button>
  );
}
