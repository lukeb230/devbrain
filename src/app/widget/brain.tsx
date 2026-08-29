"use client";

// Brain tab, option 3 — "Trail + Read/Map". Two clean modes instead of a
// split screen: Read shows a breadcrumb trail, the note, then links out and
// backlinks as rows; Map shows the live force graph with a footer card for
// the selected note. Search (typeahead over titles) works in both.

import { useCallback, useMemo, useState } from "react";
import { BrainSearch, type NotePayload } from "../dashboard/[repoId]/brain/explorer";
import { BrainGraph, type GEdge, type GNode } from "../dashboard/[repoId]/brain/graph";

// Dashboard type hues, lifted for the ink ground.
export const DARK_GRAPH_COLORS: Record<string, string> = {
  overview: "#2dd4bf", feature: "#34d399", module: "#60a5fa", service: "#818cf8",
  screen: "#22d3ee", data: "#a78bfa", decision: "#fbbf24", gotcha: "#f87171",
};

export function WidgetBrain({ notes, nodes, edges, initialSlug, repoName }: { notes: NotePayload[]; nodes: GNode[]; edges: GEdge[]; initialSlug: string; repoName: string }) {
  const bySlug = useMemo(() => new Map(notes.map((n) => [n.slug, n])), [notes]);
  const typeOf = useMemo(() => new Map(nodes.map((n) => [n.slug, n.type])), [nodes]);
  const degree = useMemo(() => new Map(nodes.map((n) => [n.slug, n.degree])), [nodes]);
  const first = bySlug.has(initialSlug) ? initialSlug : (notes[0]?.slug ?? null);
  const [mode, setMode] = useState<"read" | "map">("read");
  const [trail, setTrail] = useState<string[]>(first ? [first] : []);
  const selected = trail[trail.length - 1] ?? null;
  const current = selected ? bySlug.get(selected) : undefined;

  const select = useCallback((slug: string | null) => {
    if (!slug || !bySlug.has(slug)) return;
    setTrail((t) => (t[t.length - 1] === slug ? t : [...t.filter((x) => x !== slug), slug].slice(-6)));
    try { window.history.replaceState(null, "", `/widget?note=${encodeURIComponent(slug)}`); } catch { /* ignore */ }
  }, [bySlug]);
  const jump = (i: number) => setTrail((t) => t.slice(0, i + 1));

  const onNoteClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const m = (a.getAttribute("href") ?? "").match(/[?&]note=([^&]+)/);
    if (m) { e.preventDefault(); select(decodeURIComponent(m[1])); }
  };

  // Links out = graph edges from this note that aren't backlinks; in = backlinks.
  const backlinks = current?.backlinks ?? [];
  const backSet = new Set(backlinks.map((b) => b.slug));
  const out = selected
    ? edges.filter((e) => e.a === selected || e.b === selected).map((e) => (e.a === selected ? e.b : e.a)).filter((s, i, arr) => s !== selected && !backSet.has(s) && arr.indexOf(s) === i)
    : [];
  const Dot = ({ t }: { t?: string }) => <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: DARK_GRAPH_COLORS[t ?? ""] ?? "#8a92a6" }} />;
  const Row = ({ slug, dir }: { slug: string; dir: "→" | "←" }) => (
    <button onClick={() => select(slug)} className="flex w-full items-center gap-2 border-t border-line px-3.5 py-1.5 text-left text-[12.5px] text-txt hover:bg-row">
      <Dot t={typeOf.get(slug)} />
      <span className="min-w-0 flex-1 truncate">{bySlug.get(slug)?.title ?? slug}</span>
      <span className="font-mono text-[10px] text-faint">{typeOf.get(slug) ?? ""}</span>
      <span className="font-mono text-[10px] text-faint">{dir}</span>
    </button>
  );

  return (
    <div className="-mx-3 -my-2.5 flex h-full flex-col">
      <div className="mx-3.5 mb-1 flex h-8 flex-shrink-0 items-center border-b border-line font-mono text-[10px] tracking-wider text-muted">
        BRAIN · <span className="text-brand-400">&nbsp;{nodes.length} notes</span>&nbsp;· {edges.length} links · <span className="truncate">{repoName.split("/")[1]}</span>
        <span className="ml-auto inline-flex rounded-md border border-line2 bg-ink p-0.5">
          {(["read", "map"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={"rounded px-2.5 py-0.5 font-display text-[10.5px] font-semibold tracking-normal " + (mode === m ? "bg-row2 text-txt" : "text-muted")}>{m === "read" ? "Read" : "Map"}</button>
          ))}
        </span>
      </div>
      <div className="wg-brain-search mx-3.5 mb-1 flex-shrink-0">
        <BrainSearch notes={notes.map((n) => ({ slug: n.slug, title: n.title, type: n.type }))} onPick={(s) => { select(s); setMode("read"); }} />
      </div>

      {mode === "read" ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {trail.length > 1 && (
            <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap px-3.5 pt-1 font-mono text-[11px] text-faint">
              {trail.map((s, i) => (
                <span key={s} className="flex items-center gap-1">
                  {i > 0 && <span>›</span>}
                  <button onClick={() => jump(i)} className={i === trail.length - 1 ? "text-txt" : "text-muted hover:text-txt"}>{bySlug.get(s)?.title ?? s}</button>
                </span>
              ))}
            </div>
          )}
          {current ? (
            <>
              <div className="px-3.5 pt-2">
                <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight text-txt">
                  {current.title}
                  <span className="rounded border border-line2 px-1.5 py-px font-mono text-[10px] font-normal text-muted">{current.type}</span>
                </h3>
                <div className="mb-2 mt-1 font-mono text-[10px] text-faint">.brain/{current.slug}.md · {out.length} out · {backlinks.length} in</div>
                {current.touches.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">{current.touches.map((f) => <code key={f} className="rounded bg-row2 px-1.5 py-px font-mono text-[10px] text-[#b8bfcf]">{f}</code>)}</div>
                )}
                <div className="brain-prose text-[12.5px] leading-relaxed text-txt" onClick={onNoteClick} dangerouslySetInnerHTML={{ __html: current.html }} />
              </div>
              {out.length > 0 && (
                <section className="mt-3"><h2 className="wg-sec">Links out <span className="n">{out.length}</span></h2>{out.map((s) => <Row key={s} slug={s} dir="→" />)}</section>
              )}
              {backlinks.length > 0 && (
                <section className="mt-3"><h2 className="wg-sec">Linked from <span className="n">{backlinks.length}</span></h2>{backlinks.map((b) => <Row key={b.slug} slug={b.slug} dir="←" />)}</section>
              )}
            </>
          ) : (
            <p className="wg-empty mt-3">Pick a note from the map or the search box.</p>
          )}
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 overflow-hidden [&_svg]:h-full [&_svg]:w-full" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px)", backgroundSize: "12px 12px" }}>
            <BrainGraph nodes={nodes} edges={edges} selected={selected} onSelect={(s) => select(s)} colors={DARK_GRAPH_COLORS} />
          </div>
          <div className="pointer-events-none absolute left-3.5 top-2 flex flex-wrap gap-x-2.5 gap-y-0.5 font-mono text-[10px] text-muted">
            {Object.entries(DARK_GRAPH_COLORS).filter(([t]) => nodes.some((n) => n.type === t)).map(([t, c]) => <span key={t} className="inline-flex items-center gap-1"><i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c }} />{t}</span>)}
          </div>
          {current && (
            <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center gap-2 rounded-xl border border-line2 bg-row px-3 py-2 text-[12.5px] text-txt">
              <Dot t={current.type} />
              <span className="min-w-0 flex-1 truncate font-display font-semibold">{current.title}</span>
              <span className="font-mono text-[10px] text-faint">{current.type} · {out.length} out · {backlinks.length} in</span>
              <button onClick={() => setMode("read")} className="font-display text-[11px] font-semibold text-brand-400 hover:underline">Read →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
