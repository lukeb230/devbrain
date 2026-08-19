"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// Human creating a claim from the dashboard — the manual-presence path for
// teammates who code outside Claude Code (Cowork, an IDE). Their claim flows
// into every plugin-connected Claude's context and pre-edit guard, so the
// rest of the team routes around them automatically.
export async function createClaim(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const pathsRaw = String(formData.get("paths") || "");
  const note = String(formData.get("note") || "").trim().slice(0, 300);
  const hours = Math.min(72, Math.max(1, Number(formData.get("hours")) || 4));
  const paths = [
    ...new Set(
      pathsRaw
        .split(/[\n,]/)
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
  if (!repoId || paths.length === 0) return;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id")
    .eq("id", repoId)
    .single();
  if (!repo) return;

  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "someone");
  await supabaseAdmin().from("claims").insert({
    org_id: repo.org_id,
    repo_id: repo.id,
    user_id: user.id,
    dev_label: name,
    paths,
    note: note || null,
    expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
  });
  revalidatePath(`/dashboard/${repoId}`);
}

// Human releasing a claim from the dashboard. Any member may — claims are
// soft locks, and a stale lock is worse than a generous unlock.
export async function releaseClaim(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const id = String(formData.get("id") || "");
  if (!repoId || !id) return;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id")
    .eq("id", repoId)
    .single();
  if (!repo) return;

  await supabaseAdmin()
    .from("claims")
    .update({ released_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", repo.org_id)
    .is("released_at", null);
  revalidatePath(`/dashboard/${repoId}`);
}
