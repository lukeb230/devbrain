"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

// Widget repo switcher — sets the same cookie the middleware writes when you
// visit a repo on the dashboard, so the widget and dashboard stay in sync on
// "the repo you're working in".
export async function setWidgetRepo(repoId: string): Promise<void> {
  const id = String(repoId || "");
  const isAll = id === "all";
  if (!isAll && !/^[0-9a-f-]{36}$/.test(id)) return;

  if (!isAll) {
    // RLS-scoped read proves the repo belongs to the caller's org.
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: repo } = await supabase
      .from("linked_repos")
      .select("id")
      .eq("id", id)
      .single();
    if (!repo) return;
  }

  (await cookies()).set("devbrain_last_repo", id, {
    maxAge: 60 * 60 * 24 * 90,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/widget");
}
