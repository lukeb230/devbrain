"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DESK_SECTIONS } from "./sections";

// The Desk's sidebar (Dusk): 180px, row bg, right hairline, grouped labels
// with mono 9px eyebrows, no icons. Active item = coral ink + coral line.

export function DeskNav() {
  const pathname = usePathname();
  const active = pathname.replace(/^\/desk\/?/, "").split("/")[0] ?? "";
  return (
    <nav className="flex w-[180px] flex-shrink-0 flex-col gap-px overflow-y-auto border-r border-line bg-row px-2 py-2.5">
      {DESK_SECTIONS.map((g) => (
        <div key={g.group}>
          <div className="px-2.5 pb-1 pt-2.5 font-mono text-[9px] uppercase tracking-[.12em] text-faint">{g.group}</div>
          {g.items.map((it) => {
            const on = active === it.slug;
            return (
              <Link
                key={it.slug}
                href={`/desk${it.slug ? `/${it.slug}` : ""}`}
                className={
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] " +
                  (on ? "border-coralline bg-coralink font-semibold text-txt" : "border-transparent text-muted hover:bg-row2 hover:text-txt")
                }
              >
                {it.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// Repo scope for the Desk, in the title bar: "Team / <repo>" with a borderless
// mono select (design). URL wins; otherwise the remembered repo; "all" is explicit.
export function DeskRepoSwitcher({ repos, remembered }: { repos: { id: string; name: string }[]; remembered: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("repo");
  const current = q === "all" ? "" : q ?? remembered ?? "";
  if (repos.length === 0) return <span className="font-mono text-[12px] text-faint">no repos linked</span>;
  return (
    <select
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        const q = new URLSearchParams(params.toString());
        if (v) q.set("repo", v); else q.set("repo", "all");
        router.push(`${pathname}${q.toString() ? `?${q}` : ""}`);
      }}
      className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[12px] text-txt focus:outline-none"
    >
      <option value="">all repos</option>
      {repos.map((r) => (
        <option key={r.id} value={r.id}>{r.name}</option>
      ))}
    </select>
  );
}
