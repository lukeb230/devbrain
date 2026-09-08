import Link from "next/link";
import { Reading } from "./panes";
import { Card, Empty, H1, LinkButton } from "./ui";

// Repo pages (Board, Specs, Brain, History, Rules) need one repo. With none
// chosen and none remembered, choose here — the link stamps the cookie via
// the middleware, so the choice sticks for the panel and the Desk alike.
// With no repo linked at all: the design's "No repo linked" card.
const APP_SLUG = process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain";

export function RepoChooser({ repos, route, what, title }: { repos: { id: string; full_name: string }[]; route: string; what: string; title?: string }) {
  return (
    <Reading>
      <H1 title={title ?? what[0].toUpperCase() + what.slice(1)} />
      <Card pad="sm" className="mt-6 max-w-[420px]">
        <div className="font-display text-[13px] font-semibold text-txt">Which repo&apos;s {what}?</div>
        {repos.length === 0 ? (
          <>
            <Empty className="mt-2 py-0">No repositories linked to this team yet. Link one and it appears in the repo switcher.</Empty>
            <div className="mt-2.5"><a href={`https://github.com/apps/${APP_SLUG}/installations/new`}><LinkButton>Link a repo ↗</LinkButton></a></div>
            <p className="mt-2 text-[11.5px] text-faint">Installs the DevBrain GitHub App on the repo.</p>
          </>
        ) : (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {repos.map((r) => (
              <Link key={r.id} href={`${route}?repo=${r.id}`} className="rounded-lg border border-line2 bg-ink px-3 py-1.5 font-mono text-[12px] text-txt hover:border-line3">
                {r.full_name}
              </Link>
            ))}
          </div>
        )}
      </Card>
    </Reading>
  );
}
