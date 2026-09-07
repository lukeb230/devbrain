import Link from "next/link";
import { redirect } from "next/navigation";
import { uploadSpec } from "@/app/dashboard/[repoId]/specs/actions";
import { SpecDropzone } from "@/app/dashboard/[repoId]/specs/dropzone";
import { deskScope, withScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { RepoChooser } from "../repo-chooser";
import { Card, Chip, Empty, PageTitle } from "../ui";

// ============================================================================
// Desk · Specs — drop a brief, a braindump, a PDF; the AI extracts what it
// asks for and checks each item against the brain, the repo and the board.
// The dropzone is the dashboard's client component; its upload goes through
// a bound action that adds the Desk's return path (the dropzone can't carry
// <DeskNext/> itself).
// ============================================================================

export const dynamic = "force-dynamic";
export const maxDuration = 60; // extraction calls Claude

const VERDICT_TONE: Record<string, string> = { done: "text-go", partial: "text-wait", missing: "text-muted", conflict: "text-stop" };

export default async function DeskSpecs({ searchParams }: { searchParams: Promise<{ repo?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const { data: repos } = await supabase.from("linked_repos").select("id, full_name").eq("org_id", org.orgId).is("unlinked_at", null).order("created_at");
  const scope = await deskScope(sp, (repos ?? []).map((r) => r.id));
  if (!scope.repoId) {
    return (
      <>
        <PageTitle title="Specs" sub="Context documents for one repo." />
        <RepoChooser repos={repos ?? []} route="/desk/specs" what="specs" />
      </>
    );
  }
  const repo = (repos ?? []).find((r) => r.id === scope.repoId)!;
  const here = withScope("/desk/specs", scope);

  async function uploadFromDesk(fd: FormData) {
    "use server";
    fd.set("next", here);
    return uploadSpec(fd);
  }

  const [{ data: specs }, { data: items }] = await Promise.all([
    supabase.from("specs").select("id, title, source_name, source_kind, status, error, uploaded_by, created_at, analyzed_at").eq("repo_id", repo.id).order("created_at", { ascending: false }),
    supabase.from("spec_items").select("spec_id, verdict, dismissed_at, task_id").eq("repo_id", repo.id),
  ]);
  const countsFor = (specId: string) => {
    const mine = (items ?? []).filter((i) => i.spec_id === specId && !i.dismissed_at);
    const by: Record<string, number> = { done: 0, partial: 0, missing: 0, conflict: 0 };
    for (const i of mine) by[i.verdict] = (by[i.verdict] ?? 0) + 1;
    return { by, total: mine.length, tasks: mine.filter((i) => i.task_id).length };
  };

  return (
    <>
      <PageTitle title="Specs" sub={`${repo.full_name} · drop anything that describes where this app is going; DevBrain shows what's built, half-built, missing, or contradicts a decision you already made`} />
      <div className="mb-3 rounded-xl border border-line bg-row px-3.5 py-3">
        <SpecDropzone repoId={repo.id} action={uploadFromDesk} />
      </div>
      {(!specs || specs.length === 0) && <Empty>No context docs yet.</Empty>}
      {(specs ?? []).map((s) => {
        const { by, total, tasks } = countsFor(s.id);
        return (
          <Link key={s.id} href={withScope(`/desk/specs/${s.id}`, scope)} className="mb-1.5 block rounded-xl border border-line bg-row px-3.5 py-2.5 hover:border-brand-500">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-txt">{s.title}</span>
              <Chip tone="muted">{s.source_kind}</Chip>
              <span className={"font-mono text-[10px] " + (s.status === "ready" ? "text-muted" : s.status === "failed" ? "text-stop" : "text-wait")}>{s.status}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[10.5px] text-muted">
              <span>{s.uploaded_by} · {new Date(s.created_at).toLocaleDateString()}</span>
              {s.status === "ready" && <span>{total} requirements{tasks ? ` · ${tasks} → tasks` : ""}</span>}
              {s.status === "ready" && Object.entries(by).filter(([, n]) => n > 0).map(([k, n]) => <span key={k} className={VERDICT_TONE[k]}>{n} {k}</span>)}
              {s.status === "failed" && s.error && <span className="text-stop">{s.error}</span>}
            </div>
          </Link>
        );
      })}
      {sp.error && <p className="mt-2 text-[11.5px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
    </>
  );
}
