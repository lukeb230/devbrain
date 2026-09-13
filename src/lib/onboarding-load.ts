// src/lib/onboarding-load.ts
import { cache } from "react";
import { onboardingState, type OnboardingState } from "@/lib/onboarding";
import { openRequest, type RequestEvent } from "@/lib/onboarding-request";
import type { OrgContext } from "@/lib/org";
import type { TeamRepo } from "@/lib/desk/repos";
import { supabaseAdmin } from "@/lib/supabase/server";

// Fetch the rows the pure function needs, once per request. The layout and
// the voluntary page both call this; react's cache() dedupes them.
export const loadOnboarding = cache(async (org: OrgContext, repos: TeamRepo[]): Promise<OnboardingState & { openRequestBy: string | null }> => {
  const admin = supabaseAdmin();
  const repoIds = repos.map((r) => r.id);
  const [{ data: tokens }, { data: sessions }, { data: activity }, { data: policies }, { data: events }, { data: me }, { data: linkEvents }] = await Promise.all([
    admin.from("dev_tokens").select("revoked_at").eq("org_id", org.orgId).eq("user_id", org.userId),
    admin.from("sessions").select("repo_id").eq("org_id", org.orgId).eq("user_id", org.userId).order("started_at", { ascending: false }).limit(20),
    admin.from("activity").select("repo_id").eq("org_id", org.orgId).eq("user_id", org.userId).order("at", { ascending: false }).limit(20),
    repoIds.length ? admin.from("policies").select("repo_id, rule").in("repo_id", repoIds) : Promise.resolve({ data: [] as { repo_id: string; rule: string }[] }),
    admin.from("events").select("kind, at, payload").eq("org_id", org.orgId).in("kind", ["repo_link_requested", "repo_link_cancelled"]).order("at", { ascending: false }).limit(50),
    admin.from("org_members").select("onboarding").eq("org_id", org.orgId).eq("user_id", org.userId).maybeSingle(),
    // Attribution for the teammate view: who linked (repo_linked, written by
    // the setup route), who chose rules (rule_change, written by applyPreset).
    admin.from("events").select("kind, payload").eq("org_id", org.orgId).in("kind", ["repo_linked", "rule_change"]).order("at", { ascending: false }).limit(20),
  ]);

  const requestEvents = (events ?? []) as RequestEvent[];
  const open = openRequest(requestEvents, repos.map((r) => ({ created_at: r.created_at, unlinked_at: null })));
  const state = onboardingState({
    role: org.role,
    userId: org.userId,
    repos: repos.map((r) => ({ id: r.id, full_name: r.full_name, installation_id: r.installation_id, created_at: r.created_at, unlinked_at: null })),
    tokens: (tokens ?? []) as { revoked_at: string | null }[],
    sessions: (sessions ?? []) as { repo_id: string | null }[],
    activity: (activity ?? []) as { repo_id: string | null }[],
    policies: (policies ?? []) as { repo_id: string; rule: string }[],
    requestEvents,
    attribution: {
      linked: ((linkEvents ?? []).find((e) => e.kind === "repo_linked")?.payload as { by?: string } | undefined)?.by ?? null,
      rules: ((linkEvents ?? []).find((e) => e.kind === "rule_change")?.payload as { by?: string } | undefined)?.by ?? null,
    },
    onboarding: ((me?.onboarding as { dismissed_at?: string | null; preset?: string | null } | null) ?? {}),
  });
  return { ...state, openRequestBy: open?.payload.by ?? null };
});
