"use client";

// Brain explorer — client-side note switching. The server page renders every
// note's HTML once and hands the whole set here; clicking a graph node (or a
// wikilink inside a note) swaps the panel instantly with zero server trips.
// The URL is kept in sync via history.replaceState so deep links still work.

import { useCallback, useState } from "react";
import { GRAPH_COLORS } from "./colors";
import { BrainGraph, type GEdge, type GNode } from "./graph";

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
}: {
  notes: NotePayload[];
  nodes: GNode[];
  edges: GEdge[];
  initialSlug: string;
  repoId: string;
  branch: string | null;
}) {
  const bySlug = new Map(notes.map((n) => [n.slug, n]));
  const [selected, setSelected] = useState(
    bySlug.has(initialSlug) ? initialSlug : (notes[0]?.slug ?? ""),
  );
  const current = bySlug.get(selected);

  const select = useCallback(
    (slug: string) => {
      if (!bySlug.has(slug)) return;
      setSelected(slug);
      const params = new URLSearchParams({
        ...(branch ? { branch } : {}),
        note: slug,
      });
      window.history.replaceState(null, "", `/dashboard/${repoId}/brain?${params.toString()}`);
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
        <BrainGraph nodes={nodes} edges={edges} selected={selected} onSelect={select} />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          {Object.entries(GRAPH_COLORS).map(([t, c]) => (
            <span key={t} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {t}
            </span>
          ))}
        </div>
      </section>

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
