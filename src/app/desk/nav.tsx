"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DESK_SECTIONS } from "./sections";

// The Desk's sidebar. Groups follow the function map: Work (what moves),
// Memory (what we know), Team (who and rules), This Mac. Sections without a
// ported page yet render the phase-4 placeholder — the nav is the contract.

export function DeskNav() {
  const pathname = usePathname();
  const active = pathname.replace(/^\/desk\/?/, "").split("/")[0] ?? "";
  return (
    <nav className="flex w-[196px] flex-shrink-0 flex-col gap-px overflow-y-auto border-r border-line px-2 py-2.5">
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
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] " +
                  (on ? "border border-[var(--wg-coral-line)] bg-[var(--wg-coral-deep)] text-txt" : "text-muted hover:bg-row hover:text-txt")
                }
              >
                <span className="w-4 text-center text-[11.5px]">{it.icon}</span>
                {it.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// Repo scope for the Desk. Phase 3 keeps it in the URL (?repo=<id>) so ported
// pages can read one thing; the last-visited cookie the widget uses is set
// by /dashboard routes and will follow in phase 4.
export function DeskRepoSwitcher({ repos }: { repos: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("repo") ?? "";
  if (repos.length === 0) return <span className="text-[12px] text-faint">no repos linked</span>;
  return (
    <select
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        const q = new URLSearchParams(params.toString());
        if (v) q.set("repo", v); else q.delete("repo");
        router.push(`${pathname}${q.toString() ? `?${q}` : ""}`);
      }}
      className="rounded-md border border-line2 bg-ink px-2 py-0.5 text-[12px] text-txt"
    >
      <option value="">all repos</option>
      {repos.map((r) => (
        <option key={r.id} value={r.id}>{r.name.split("/").pop()}</option>
      ))}
    </select>
  );
}
