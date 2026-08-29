"use client";

// Brain explorer — client-side note switching. The server page renders every
// note's HTML once and hands the whole set here; clicking a graph node (or a
// wikilink inside a note) swaps the panel instantly with zero server trips.
// The URL is kept in sync via history.replaceState so deep links still work.

import { useCallback, useMemo, useState } from "react";
import { GRAPH_COLORS } from "./colors";
import { BrainGraph, type GEdge, type GNode } from "./graph";

// Typeahead search over note titles. Prefix matches rank first, then
// word-boundary matches, then anywhere-substring. Arrow keys + Enter,
// click to open; selecting a result opens the note AND highlights its node.
export function BrainSearch({
  notes,
  onPick,
}: {
  notes: { slug: string; title: string; type: string }[];
  onPick: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const scored: { slug: string; title: string; type: string; score: number }[] = [];
    for (const n of notes) {
      const t = n.title.toLowerCase();
      let score = -1;
      if (t.startsWith(query)) score = 0;
      else if (t.split(/[\s-_/]+/).some((w) => w.startsWith(query))) score = 1;
      else if (t.includes(query)) score = 2;
      else if (n.slug.includes(query)) score = 3;
      if (score >= 0) scored.push({ ...n, score });
    }
    return scored.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title)).slice(0, 6);
  }, [q, notes]);

  const pick = (slug: string) => {
    onPick(slug);
    setQ("");
    setOpen(false);
    setCursor(0);
  };

  return (
    <div className="relative mb-2">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setCursor(0); }}
        onFocus={() => q && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} // let clicks land
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); pick(results[Math.min(cursor, results.length - 1)].slug); }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search notes…"
        className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-8 z-20 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {results.map((r, i) => (
            <button
              key={r.slug}
              onMouseDown={(e) => { e.preventDefault(); pick(r.slug); }}
              onMouseEnter={() => setCursor(i)}
              className={
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs " +
                (i === cursor ? "bg-brand-50 text-brand-900" : "text-slate-700")
              }
            >
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ background: GRAPH_COLORS[r.type] ?? "#94a3b8" }}
              />
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="flex-shrink-0 text-[10px] text-slate-400">{r.type}</span>
            </button>
          ))}
        </div>
      )}
      {open && q.trim() && results.length === 0 && (
        <div className="absolute left-0 right-0 top-8 z-20 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-400 shadow-lg">
          No notes match &ldquo;{q.trim()}&rdquo;
        </div>
      )}
    </div>
  );
}

export interface NotePayload {
  slug: string;
  title: string;
  type: string;
  touches: string[];
  html: string;
  backlinks: { slug: string; title: string }[];
}

export function BrainExplorer({
  notes,
  nodes,
  edges,
  initialSlug,
  repoId,
  branch,
  searchable,
}: {
  notes: NotePayload[];
  nodes: GNode[];
  edges: GEdge[];
  initialSlug: string;
  repoId: string;
  branch: string | null;
  searchable?: boolean;
}) {
  const bySlug = new Map(notes.map((n) => [n.slug, n]));
  const [selected, setSelected] = useState<string | null>(
    bySlug.has(initialSlug) ? initialSlug : (notes[0]?.slug ?? null),
  );
  const current = selected ? bySlug.get(selected) : undefined;

  const select = useCallback(
    (slug: string | null) => {
      if (slug !== null && !bySlug.has(slug)) return;
      setSelected(slug);
      const params = new URLSearchParams({
        ...(branch ? { branch } : {}),
        ...(slug ? { note: slug } : {}),
      });
      const qs = params.toString();
      // Deep-link sync must stay on the SURFACE we're embedded in. Inside the
      // widget, writing a dashboard URL here silently retargeted the panel —
      // the next background refresh then rendered the dashboard (and, with
      // WidgetGuard, reloaded to the Home tab). Widget stays on /widget.
      const base = window.location.pathname.startsWith("/widget")
        ? "/widget"
        : `/dashboard/${repoId}/brain`;
      window.history.replaceState(null, "", `${base}${qs ? `?${qs}` : ""}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repoId, branch, notes],
  );

  // Wikilinks inside note bodies are rendered as <a href="?note=slug"> —
  // intercept them so in-brain navigation is instant too.
  const onNoteClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    const m = href.match(/[?&]note=([^&]+)/);
    if (m) {
      e.preventDefault();
      select(decodeURIComponent(m[1]));
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      <section className="card col-span-12 self-start card-pad lg:col-span-7">
        <h2 className="card-title mb-2">
          {nodes.length} notes · {edges.length} connections — drag nodes, click to open
        </h2>
        {searchable && (
          <BrainSearch
            notes={notes.map((n) => ({ slug: n.slug, title: n.title, type: n.type }))}
            onPick={select}
          />
        )}
        <BrainGraph nodes={nodes} edges={edges} selected={selected} onSelect={select} />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          {Object.entries(GRAPH_COLORS).map(([t, c]) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {t}
            </span>
          ))}
        </div>
      </section>

      {!current && (
        <section className="card col-span-12 self-start card-pad lg:col-span-5">
          <p className="py-10 text-center text-sm text-slate-400">
            Click a node to open its note.
          </p>
        </section>
      )}
      {current && (
        <section className="card col-span-12 self-start card-pad lg:col-span-5">
          <div className="mb-3 flex items-baseline justify-between border-b border-slate-100 pb-2">
            <h2 className="text-lg font-semibold text-slate-900">{current.title}</h2>
            <span className="chip bg-slate-100 text-slate-500">{current.type}</span>
          </div>
          {current.touches.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {current.touches.map((f) => (
                <code key={f} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{f}</code>
              ))}
            </div>
          )}
          <div
            className="brain-prose text-sm leading-relaxed text-slate-700"
            onClick={onNoteClick}
            dangerouslySetInnerHTML={{ __html: current.html }}
          />
          {current.backlinks.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              Linked from:{" "}
              {current.backlinks.map((b, i) => (
                <span key={b.slug}>
                  {i > 0 && " · "}
                  <button
                    onClick={() => select(b.slug)}
                    className="text-brand-600 hover:underline"
                  >
                    {b.title}
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
