"use client";

import { supabaseBrowser } from "@/lib/supabase/client";

export function SignInButton() {
  async function signIn() {
    const supabase = supabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <button
      onClick={signIn}
      className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-ink-950 transition hover:bg-brand-500"
    >
      Sign in with GitHub
    </button>
  );
}
