"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GRAPH_COLORS } from "@/app/dashboard/[repoId]/brain/colors";
import type { NotePayload } from "@/app/dashboard/[repoId]/brain/explorer";
import { BrainGraph, type GEdge, type GNode } from "@/app/dashboard/[repoId]/brain/graph";
import type { StaleBranch } from "@/lib/brain-stale";
import { ListPane, ListRow } from "../panes";

// ============================================================================
// Desk · Brain explorer (Dusk). Renders BOTH panes: the list pane (search,
// branch pills, one row per note with its type dot, the stale-brain card)
// and the reading pane (article: eyebrow, title, touches, body, links out /
// linked from) with the 340px graph aside. Note switching is client state;
// the URL follows via replaceState so deep links keep working.
// ============================================================================

export const DARK_GRAPH_COLORS: Record<string, string> = {
  overview: "#2dd4bf", feature: "#34d399", module: "#60a5fa", service: "#b9a8ff",
  screen: "#22d3ee", data: "#a78bfa", decision: "#fbbf24", gotcha: "#f87171",
};

function useResolvedTheme(): "light" | "dark" {
  const [t, setT] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const read = () => {
      const forced = document.documentElement.dataset.wgTheme;
      if (forced === "light" || forced === "dark") return setT(forced);
      setT(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    };
    read();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", read);
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-wg-theme"] });
    return () => { mq.removeEventListener("change", read); mo.disconnect(); };
  }, []);
  return t;
}

export function BrainDesk({ notes, nodes, edges, initialSlug, branchNames, currentRef, defaultBranch, base, stale, repoName }: {
  notes: NotePayload[]; nodes: GNode[]; edges: GEdge[]; initialSlug: string; branchNames: string[]; currentRef: string; defaultBranch: string; base: string; stale: StaleBranch[]; repoName: string;
}) {
  const bySlug = useMemo(() => new Map(notes.map((n) => [n.slug, n])), [notes]);
  const linksOut = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of edges) { m.set(e.a, [...(m.get(e.a) ?? []), e.b]); m.set(e.b, [...(m.get(e.b) ?? []), e.a]); }
    return m;
  }, [edges]);
  const [selected, setSelected] = useState<string | null>(bySlug.has(initialSlug) ? initialSlug : notes[0]?.slug ?? null);
  const [q, setQ] = useState("");
  const theme = useResolvedTheme();
  const COLORS = theme === "light" ? GRAPH_COLORS : DARK_GRAPH_COLORS;
  const current = selected ? bySlug.get(selected) : undefined;
  const typeOf = useMemo(() => new Map(nodes.map((n) => [n.slug, n.type])), [nodes]);

  const select = useCallback((slug: string | null) => {
    if (slug !== null && !bySlug.has(slug)) return;
    setSelected(slug);
    const u = new URL(window.location.href);
    if (slug) u.searchParams.set("note", slug); else u.searchParams.delete("note");
    window.history.replaceState(null, "", u.pathname + u.search);
  }, [bySlug]);

  const onNoteClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const m = (a.getAttribute("href") ?? "").match(/[?&]note=([^&]+)/);
    if (m) { e.preventDefault(); select(decodeURIComponent(m[1])); }
  };

  const query = q.trim().toLowerCase();
  const shown = query ? notes.filter((n) => n.title.toLowerCase().includes(query) || n.slug.includes(query)) : notes;
  const backlinks = current?.backlinks ?? [];
  const outs = current ? (linksOut.get(current.slug) ?? []).filter((s) => !backlinks.some((b) => b.slug === s)) : [];

  return (
    <>
      <ListPane title="Brain" count={`${notes.length} notes`}>
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-line bg-row px-2.5 py-1.5 text-[12.5px] text-faint">
          <span>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes…" className="min-w-0 flex-1 bg-transparent text-[12.5px] text-txt placeholder:text-faint focus:outline-none" />
        </div>
        <div className="mx-4 mb-2.5 flex flex-wrap gap-1 font-mono text-[10.5px]">
          {branchNames.slice(0, 4).map((b) => (
            <Link key={b} href={`${base}${b === defaultBranch ? "" : `&branch=${encodeURIComponent(b)}`}`} className={`rounded-full px-2 py-0.5 ${b === currentRef ? "bg-txt text-ink" : "border border-line text-muted hover:text-txt"}`}>{b}</Link>
          ))}
          {branchNames.length > 4 && <span className="rounded-full border border-line px-2 py-0.5 text-muted">+{branchNames.length - 4}</span>}
        </div>
        {shown.map((n) => (
          <ListRow key={n.slug} selected={selected === n.slug} pad="7px 10px">
            <button onClick={() => select(n.slug)} className="flex w-full items-center gap-2.5 text-left">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: COLORS[n.type] ?? "#8e8a99" }} />
              <span className={`min-w-0 flex-1 truncate text-[13px] ${selected === n.slug ? "font-medium" : ""}`}>{n.title}</span>
              <span className="font-mono text-[10px] text-faint">{n.type}</span>
            </button>
          </ListRow>
        ))}
        {shown.length === 0 && <p className="px-4 py-1 text-[12px] text-faint">No notes match &ldquo;{q.trim()}&rdquo;.</p>}
        {stale.length > 0 && (
          <div className="mx-4 mt-3.5 rounded-lg border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-3 py-2.5 text-[11.5px] leading-[1.5] text-wait">
            <b>{stale.length} merge{stale.length === 1 ? "" : "s"} without a brain update</b> (72h) — {stale.map((s) => (s.pr ? `#${s.pr} ` : "") + (s.title ?? s.branch)).join(", ")}. Tell your Claude &ldquo;repair the brain notes for the files that changed&rdquo;.
          </div>
        )}
        <div className="pb-4" />
      </ListPane>

      <main className="min-w-0 flex-1 overflow-y-auto px-10 pb-12 pt-8">
        <div className="grid grid-cols-[1fr_340px] gap-9">
          <article>
            {current ? (
              <>
                <div className="font-mono text-[11px] text-faint">.brain/{current.slug}.md · <span style={{ color: COLORS[current.type] }}>{current.type}</span> · {outs.length} out · {backlinks.length} in</div>
                <h1 className="mt-1.5 font-display text-[36px] font-medium leading-[1.05] tracking-[-.02em] text-txt">{current.title}</h1>
                {current.touches.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5">{current.touches.map((f) => <code key={f} className="rounded-md bg-row2 px-2 py-0.5 font-mono text-[11px] text-txt">{f}</code>)}</div>
                )}
                <div className="brain-prose desk-prose mt-5 max-w-[600px] font-display text-[17px] leading-[1.7] text-prose" onClick={onNoteClick} dangerouslySetInnerHTML={{ __html: current.html }} />
                <div className="mt-7 border-t border-line pt-3.5 text-[13px] leading-[1.9] text-muted">
                  Links out: {outs.length === 0 ? <span className="text-faint">none</span> : outs.map((s, i) => <span key={s}>{i > 0 && " · "}<button onClick={() => select(s)} className="text-accent hover:underline">{bySlug.get(s)?.title ?? s}</button></span>)}
                  <br />
                  Linked from: {backlinks.length === 0 ? <span className="text-faint">none</span> : backlinks.map((b, i) => <span key={b.slug}>{i > 0 && " · "}<button onClick={() => select(b.slug)} className="text-accent hover:underline">{b.title}</button></span>)}
                </div>
              </>
            ) : (
              <p className="text-[13px] text-faint">Click a note to read it here.</p>
            )}
            <div className="mt-7 rounded-[10px] border border-line bg-row px-4 py-3.5 text-[12.5px] leading-[1.6] text-muted">
              No brain on a branch yet? Tell your Claude, in a session on {repoName}: <code className="font-mono text-[11.5px] text-txt">generate the brain for this repo</code> — the generate-brain skill builds the linked graph and opens it as a PR.
            </div>
          </article>
          <aside>
            <div className="desk-graph relative overflow-hidden rounded-xl border border-line bg-row">
              <BrainGraph nodes={nodes} edges={edges} selected={selected} onSelect={select} colors={COLORS} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2.5 font-mono text-[10px] text-muted">
              {Object.entries(COLORS).map(([t, c]) => (
                <span key={t}><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: c }} />{t}</span>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.6] text-faint">Drag nodes, drag the background to pan, scroll to zoom, click a node to read it here.</p>
            {(typeOf.size === 0) && null}
          </aside>
        </div>
      </main>
    </>
  );
}
