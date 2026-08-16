import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// POST /api/v1/restore-points — called from deploy.sh (curl) or CI.
// Body: { repo, tag?, sha, bundle_hash?, migration_version?, lambda_versions?,
//         db_snapshot_id?, environment?, notes? }
export async function POST(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.repo || !body?.sha) {
    return NextResponse.json({ error: "repo and sha required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id, org_id")
    .eq("full_name", body.repo)
    .eq("org_id", auth.org_id)
    .single();
  if (!repo) {
    return NextResponse.json({ error: "repo not linked" }, { status: 404 });
  }

  const { data, error } = await admin
    .from("restore_points")
    .insert({
      org_id: repo.org_id,
      repo_id: repo.id,
      tag: body.tag ?? null,
      sha: body.sha,
      bundle_hash: body.bundle_hash ?? null,
      migration_version: body.migration_version ?? null,
      lambda_versions: body.lambda_versions ?? {},
      db_snapshot_id: body.db_snapshot_id ?? null,
      environment: body.environment ?? "prod",
      notes: body.notes ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
