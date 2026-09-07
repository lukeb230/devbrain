import Link from "next/link";
import { Card, Empty } from "./ui";

// Repo pages (Board, Specs, Brain, History, Rules) need one repo. With none
// chosen and none remembered, choose here — the link stamps the cookie via
// the middleware, so the choice sticks for the panel and the Desk alike.
export function RepoChooser({ repos, route, what }: { repos: { id: string; full_name: string }[]; route: string; what: string }) {
  return (
    <Card title={`Which repo's ${what}?`}>
      {repos.length === 0 ? (
        <Empty>No repositories linked to this team yet. Link one from the repo switcher in the title bar.</Empty>
      ) : (
        <div className="flex flex-wrap gap-2 py-1">
          {repos.map((r) => (
            <Link key={r.id} href={`${route}?repo=${r.id}`} className="rounded-lg border border-line2 bg-ink px-3 py-1.5 text-[12.5px] text-txt hover:border-brand-500">
              {r.full_name}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
