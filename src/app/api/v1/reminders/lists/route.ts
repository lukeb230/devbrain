import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

// ============================================================================
// Reminders list sightings — POST /api/v1/reminders/lists
// Auth: Bearer <dev token>. Body: { lists: [{ name, count? }] }
// A collector reports every Reminders list it can see so Settings → Reminders
// can offer them for mapping. Nothing is synced from this; it's discovery.
// ============================================================================

export async function POST(request: Request) {
  const auth = await apiAuth(request);
  if ("denied" in auth) return auth.denied;
  const body = await request.json().catch(() => null);
  const lists = Array.isArray(body?.lists) ? body.lists : [];
  const rows = lists
    .map((l: { name?: string; count?: number }) => ({
      org_id: auth.org_id,
      list_name: String(l?.name ?? "").trim().slice(0, 120),
      seen_by: auth.label,
      item_count: Number.isFinite(Number(l?.count)) ? Number(l.count) : null,
      last_seen: new Date().toISOString(),
    }))
    .filter((r: { list_name: string }) => r.list_name)
    .slice(0, 100);
  if (rows.length === 0) return NextResponse.json({ ok: true, seen: 0 });
  const admin = supabaseAdmin();
  const { error } = await admin.from("reminder_sightings").upsert(rows, { onConflict: "org_id,list_name" });
  if (error) return NextResponse.json({ error: "could not record lists" }, { status: 500 });
  return NextResponse.json({ ok: true, seen: rows.length });
}
