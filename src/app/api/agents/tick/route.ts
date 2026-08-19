import { NextResponse } from "next/server";
import {
  agentConfigured,
  agentModel,
  askClaude,
  DIGEST_SYSTEM,
  extractJson,
  prDiff,
  REVIEW_SYSTEM,
} from "@/lib/agent";
import { supabaseAdmin } from "@/lib/supabase/server";

// ============================================================================
// Agent tick — called every 2 minutes by pg_cron (Supabase) via pg_net.
//   Auth: x-devbrain-cron header must match DEVBRAIN_CRON_SECRET.
//   Work per tick (bounded, so we always fit the function window):
//     1. Review ONE open PR whose head_sha has no review yet.
//     2. Once per day (after DEVBRAIN_DIGEST_HOUR_UTC), write the standup digest.
//   No API key configured → cheap no-op, so the schedule can exist before the key.
// ============================================================================

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DIGEST_HOUR_UTC = Number(process.env.DEVBRAIN_DIGEST_HOUR_UTC ?? 13); // 13:00 UTC ≈ 9am ET

export async function POST(request: Request) {
  const secret = process.env.DEVBRAIN_CRON_SECRET || "";
  if (!secret) return NextResponse.json({ error: "agent tick not configured" }, { status: 503 });
  if (request.headers.get("x-devbrain-cron") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!agentConfigured()) return NextResponse.json({ skipped: "no API key configured" });

  const admin = supabaseAdmin();
  const did: Record<string, unknown> = {};

  // ---- 1. PR review: pick one unreviewed open PR --------------------------
  try {
    const { data: openPrs } = await admin
      .from("prs")
      .select("repo_id, org_id, number, title, author, head_branch, base_branch, head_sha, changed_files")
      .eq("state", "open")
      .eq("draft", false)
      .not("head_sha", "is", null)
      .order("updated_at", { ascending: false })
      .limit(20);

    let target: NonNullable<typeof openPrs>[number] | null = null;
    for (const pr of openPrs ?? []) {
      const { data: existing } = await admin
        .from("pr_reviews")
        .select("id")
        .eq("repo_id", pr.repo_id)
        .eq("pr_number", pr.number)
        .eq("head_sha", pr.head_sha)
        .limit(1);
      if (!existing || existing.length === 0) {
        target = pr;
        break;
      }
    }

    if (target) {
      const { data: repo } = await admin
        .from("linked_repos")
        .select("id, full_name, installation_id")
        .eq("id", target.repo_id)
        .single();
      if (repo?.installation_id) {
        const diff = await prDiff(repo.installation_id, repo.full_name, target.number);
        const files = Array.isArray(target.changed_files) ? (target.changed_files as string[]) : [];
        const raw = await askClaude(
          REVIEW_SYSTEM,
          `Repo: ${repo.full_name}\nPR #${target.number}: ${target.title}\nAuthor: ${target.author ?? "unknown"}\nBranch: ${target.head_branch} -> ${target.base_branch}\nFiles changed: ${files.join(", ") || "(none listed)"}\n\nDiff:\n${diff}`,
        );
        const parsed = extractJson(raw);
        const verdictRaw = String(parsed?.verdict ?? "caution");
        const verdict = ["looks_good", "caution", "risky"].includes(verdictRaw) ? verdictRaw : "caution";
        const points = Array.isArray(parsed?.points)
          ? (parsed!.points as { kind?: string; text?: string }[])
              .filter((p) => p && typeof p.text === "string" && p.text.trim())
              .slice(0, 5)
              .map((p) => ({
                kind: p.kind === "risk" || p.kind === "brain" ? p.kind : "suggestion",
                text: String(p.text).slice(0, 500),
              }))
          : [];
        // Deterministic brain-rule check (no model needed): behavior files
        // changed but no .brain/ doc rode along, while the rule is enabled.
        const { data: brainRule } = await admin
          .from("policies")
          .select("enabled")
          .eq("repo_id", repo.id)
          .eq("rule", "brain_updates_required")
          .maybeSingle();
        const brainRuleOn = brainRule?.enabled ?? true;
        const touchesCode = files.some((f) => !f.startsWith(".brain/") && !f.startsWith(".github/") && /\.(ts|tsx|js|jsx|mjs|py|go|rs|rb|java|swift|css|sql)$/.test(f));
        const touchesBrain = files.some((f) => f.startsWith(".brain/"));
        if (brainRuleOn && touchesCode && !touchesBrain) {
          points.push({
            kind: "brain",
            text: "Code changes with no .brain/ update in the same PR — the team rule expects the matching brain note to ride along.",
          });
        }
        await admin.from("pr_reviews").insert({
          org_id: target.org_id,
          repo_id: target.repo_id,
          pr_number: target.number,
          head_sha: target.head_sha,
          verdict,
          summary: String(parsed?.summary ?? raw.slice(0, 300)).slice(0, 600),
          points,
          model: agentModel(),
        });
        did.reviewed = `#${target.number} (${verdict})`;
      }
    }
  } catch (err) {
    did.review_error = String(err).slice(0, 300);
  }

  // ---- 2. Standup digest: once per org per day, after the digest hour -----
  try {
    if (new Date().getUTCHours() >= DIGEST_HOUR_UTC) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: orgs } = await admin.from("orgs").select("id").limit(5);
      for (const org of orgs ?? []) {
        const { data: existing } = await admin
          .from("digests")
          .select("id")
          .eq("org_id", org.id)
          .eq("day", today)
          .limit(1);
        if (existing && existing.length > 0) continue;

        const since = new Date(Date.now() - 24 * 3600_000).toISOString();
        const [{ data: acts }, { data: evts }, { data: prs }, { data: tasks }, { data: handoffs }] =
          await Promise.all([
            admin.from("activity").select("dev_label, label, file, at").eq("org_id", org.id).gte("at", since).order("at", { ascending: false }).limit(300),
            admin.from("events").select("kind, payload, at").eq("org_id", org.id).gte("at", since).in("kind", ["broadcast", "decision", "main_push"]).limit(50),
            admin.from("prs").select("number, title, author, state, review_state, mergeable_state, updated_at").eq("org_id", org.id).gte("updated_at", since).limit(30),
            admin.from("tasks").select("title, priority, status, created_by, done_by, assigned_to").eq("org_id", org.id).limit(50),
            admin.from("handoffs").select("dev_label, summary, picked_up_by").eq("org_id", org.id).is("picked_up_at", null).limit(10),
          ]);

        if ((acts ?? []).length === 0 && (evts ?? []).length === 0 && (prs ?? []).length === 0) {
          // Quiet day — record a stub so we don't re-check every 2 minutes.
          await admin.from("digests").insert({ org_id: org.id, day: today, body: "Quiet day — no recorded activity in the last 24 hours.", model: "none" });
          continue;
        }

        // Compress activity into per-dev work lines.
        const byDev = new Map<string, Map<string, number>>();
        for (const a of acts ?? []) {
          const dev = a.dev_label ?? "unknown";
          const label = a.label ?? "working";
          if (!byDev.has(dev)) byDev.set(dev, new Map());
          const m = byDev.get(dev)!;
          m.set(label, (m.get(label) ?? 0) + 1);
        }
        const actLines = [...byDev.entries()]
          .map(([dev, labels]) => `${dev}: ` + [...labels.entries()].map(([l, n]) => `${l} (${n} edits)`).join("; "))
          .join("\n");

        const telemetry = [
          `ACTIVITY (last 24h):\n${actLines || "(none)"}`,
          `EVENTS:\n${(evts ?? []).map((e) => `${e.kind}: ${JSON.stringify(e.payload).slice(0, 200)}`).join("\n") || "(none)"}`,
          `PRS TOUCHED:\n${(prs ?? []).map((p) => `#${p.number} ${p.title} — ${p.state}${p.review_state ? "/" + p.review_state : ""}${p.mergeable_state === "dirty" ? " CONFLICTS" : ""} by ${p.author}`).join("\n") || "(none)"}`,
          `TASKS:\n${(tasks ?? []).map((t) => `[P${t.priority}/${t.status}] ${t.title}${t.assigned_to ? " -> " + t.assigned_to : ""}`).join("\n") || "(none)"}`,
          `UNCLAIMED HANDOFFS:\n${(handoffs ?? []).map((h) => `${h.dev_label}: ${h.summary}`).join("\n") || "(none)"}`,
        ].join("\n\n");

        const body = (await askClaude(DIGEST_SYSTEM, telemetry, 700)).trim().slice(0, 4000);
        await admin.from("digests").insert({ org_id: org.id, day: today, body, model: agentModel() });
        did.digest = today;
      }
    }
  } catch (err) {
    did.digest_error = String(err).slice(0, 300);
  }

  return NextResponse.json({ ok: true, ...did });
}
