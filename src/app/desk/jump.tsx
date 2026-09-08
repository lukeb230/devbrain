"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DESK_SECTIONS } from "./sections";

// ============================================================================
// ⌘K — jump to anything (Dusk). The toolbar field opens a palette: type to
// filter pages, repos, teams, open tasks, open pull requests and brain notes;
// ↑ ↓ to move, Enter to go, Esc to close. Pages, repos and teams come from
// the layout; tasks, PRs and notes are fetched once per open from
// /api/desk/jump for the current repo scope.
// ============================================================================

type Hit = { key: string; group: "Pages" | "Repos" | "Teams" | "Tasks" | "Pull requests" | "Notes"; label: string; hint?: string; current?: boolean; go: () => void };
type Index = { tasks: { id: string; repo_id: string; repo: string; title: string; priority: number; who: string | null }[]; prs: { repo_id: string; repo: string; number: number; title: string; author: string | null }[]; notes: { slug: string; title: string; type: string }[]; noteRepo: string | null };

const ORDER: Hit["group"][] = ["Pages", "Tasks", "Pull requests", "Notes", "Repos", "Teams"];

function score(q: string, text: string): number {
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 3;
  if (t.split(/[\s/_\-.:#]+/).some((w) => w.startsWith(q))) return 2;
  if (t.includes(q)) return 1;
  // loose: every character in order
  let i = 0;
  for (const c of t) if (c === q[i]) i++;
  return i === q.length ? 0.5 : 0;
}

export function Jump({ orgs, orgId, switchOrg, repos, remembered }: {
  orgs: { id: string; name: string }[];
  orgId: string;
  switchOrg: (fd: FormData) => Promise<void>;
  repos: { id: string; name: string }[];
  remembered: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [index, setIndex] = useState<Index | null>(null);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const qp = params.get("repo");
  const repo = qp === "all" ? "all" : qp ?? remembered ?? "all";
  const rq = repo === "all" ? "" : `?repo=${repo}`;

  const close = useCallback(() => { setOpen(false); setQ(""); setCursor(0); }, []);
  const show = useCallback(() => {
    setOpen(true);
    setLoading(true);
    const get = (part: string) => fetch(`/api/desk/jump?repo=${encodeURIComponent(repo)}&part=${part}`, { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    // Tasks and PRs are one query each; the brain's note titles can mean a
    // GitHub round-trip, so they arrive second and never hold up the list.
    get("core").then((j) => { if (j) setIndex((i) => ({ ...(i ?? { notes: [], noteRepo: null }), ...j })); }).finally(() => setLoading(false));
    get("notes").then((j) => { if (j) setIndex((i) => ({ ...(i ?? { tasks: [], prs: [] }), ...j })); });
  }, [repo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (open) close(); else show(); }
      else if (e.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, show]);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); }, [open]);

  const go = (path: string) => { close(); router.push(path); };
  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase();
    const out: (Hit & { s: number })[] = [];
    const add = (h: Hit, text: string) => { const s = score(query, text); if (s > 0) out.push({ ...h, s }); };
    for (const g of DESK_SECTIONS) for (const it of g.items) {
      const path = `/desk${it.slug ? `/${it.slug}` : ""}${rq}`;
      add({ key: `p:${it.slug}`, group: "Pages", label: it.label, hint: g.group, current: pathname === `/desk${it.slug ? `/${it.slug}` : ""}`, go: () => go(path) }, `${it.label} ${g.group}`);
    }
    for (const t of index?.tasks ?? []) add({ key: `t:${t.id}`, group: "Tasks", label: t.title, hint: `P${t.priority}${t.who ? ` · ${t.who}` : ""}${repo === "all" ? ` · ${t.repo}` : ""}`, go: () => go(`/desk/board?repo=${t.repo_id}&task=${t.id}`) }, t.title);
    for (const p of index?.prs ?? []) add({ key: `pr:${p.repo_id}:${p.number}`, group: "Pull requests", label: `#${p.number} ${p.title}`, hint: `${p.author ?? ""}${repo === "all" ? ` · ${p.repo}` : ""}`, go: () => go(`/desk/prs/${p.number}?repo=${p.repo_id}`) }, `#${p.number} ${p.title}`);
    for (const n of index?.notes ?? []) add({ key: `n:${n.slug}`, group: "Notes", label: n.title, hint: n.type, go: () => go(`/desk/brain?repo=${index?.noteRepo}&note=${n.slug}`) }, `${n.title} ${n.type}`);
    add({ key: "r:all", group: "Repos", label: "all repos", current: repo === "all", go: () => { const n = new URLSearchParams(params.toString()); n.set("repo", "all"); go(`${pathname}?${n}`); } }, "all repos");
    for (const r of repos) add({ key: `r:${r.id}`, group: "Repos", label: r.name.split("/").pop() ?? r.name, hint: r.name.split("/")[0], current: repo === r.id, go: () => { const n = new URLSearchParams(params.toString()); n.set("repo", r.id); go(`${pathname}?${n}`); } }, r.name);
    for (const o of orgs) add({ key: `o:${o.id}`, group: "Teams", label: o.name, current: o.id === orgId, go: () => { close(); const fd = new FormData(); fd.set("orgId", o.id); fd.set("next", "/desk"); start(() => { void switchOrg(fd); }); } }, o.name);
    // Best matches first within each group; groups in a fixed order; cap per group.
    const byGroup = new Map<Hit["group"], (Hit & { s: number })[]>();
    for (const h of out) byGroup.set(h.group, [...(byGroup.get(h.group) ?? []), h]);
    const result: Hit[] = [];
    for (const g of ORDER) {
      const rows = (byGroup.get(g) ?? []).sort((a, b) => b.s - a.s).slice(0, query ? 6 : g === "Pages" ? 14 : 5);
      result.push(...rows);
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, index, repo, pathname, params, repos, orgs, orgId]);

  useEffect(() => setCursor(0), [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" }); }, [cursor]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); hits[cursor]?.go(); }
  };

  return (
    <>
      <button type="button" onClick={show} className="flex w-[320px] items-center gap-2 rounded-lg border border-line bg-ink px-2.5 py-1.5 text-left text-[12.5px] text-faint hover:border-line2" title="Jump to anything (⌘K)">
        ⌕ <span className="flex-1">Jump to anything</span><span className="font-mono text-[10px]">⌘K</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-[var(--wg-dim)] pt-[14vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="w-[520px] overflow-hidden rounded-xl border border-line2 bg-row shadow-[var(--wg-shadow)]" onKeyDown={onKey}>
            <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
              <span className="text-[13px] text-faint">⌕</span>
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="team, repo, page, task, PR, note…" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} className="min-w-0 flex-1 bg-transparent text-[14px] text-txt placeholder:text-faint focus:outline-none" />
              {loading && <span className="font-mono text-[10px] text-faint">loading…</span>}
              <span className="font-mono text-[10px] text-faint">esc</span>
            </div>
            <div ref={list} className="max-h-[52vh] overflow-y-auto p-1.5">
              {hits.length === 0 && <p className="px-2.5 py-3 text-[12.5px] text-faint">Nothing matches &ldquo;{q.trim()}&rdquo;.</p>}
              {hits.map((h, i) => (
                <div key={h.key}>
                  {(i === 0 || hits[i - 1].group !== h.group) && <div className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[.1em] text-faint">{h.group}</div>}
                  <button type="button" data-i={i} onMouseEnter={() => setCursor(i)} onClick={h.go} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${i === cursor ? "bg-row2" : ""} text-txt`}>
                    <span className="min-w-0 flex-1 truncate">{h.label}</span>
                    {h.hint && <span className="truncate font-mono text-[10.5px] text-muted">{h.hint}</span>}
                    {h.current && <span className="font-mono text-[11px] text-accent">✓</span>}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-4 border-t border-line px-3.5 py-2 font-mono text-[10px] text-faint"><span>↑↓ move</span><span>↵ go</span><span>esc close</span></div>
          </div>
        </div>
      )}
    </>
  );
}
