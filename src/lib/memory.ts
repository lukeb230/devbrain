// ============================================================================
// Team memory — PURE helpers for the search index. Each source table maps to
// a MemoryRow (title / body / author / time); the tick upserts them into
// memory_index and Postgres FTS does the rest. Tested in __tests__/memory.
//
// Rule for bodies: everything a teammate might search FOR goes in the body,
// plainly worded, and the author always rides along as by_label so every hit
// can say who it came from.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export type MemoryKind = "journal" | "decision" | "broadcast" | "handoff" | "pr_review" | "task" | "brain";

export interface MemoryRow {
  repo_id: string;
  kind: MemoryKind;
  source_id: string;
  title: string;
  body: string;
  by_label: string | null;
  at: string;
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function journalToMemory(j: Row): MemoryRow {
  const body = [
    j.summary,
    ...strs(j.learned).map((s) => `Learned: ${s}`),
    ...strs(j.decisions).map((s) => `Decided: ${s}`),
    ...strs(j.tried_and_failed).map((s) => `Did not work: ${s}`),
    j.remaining ? `Remaining: ${j.remaining}` : "",
    strs(j.files).length ? `Files: ${strs(j.files).join(" ")}` : "",
  ].filter(Boolean).join("\n");
  return {
    repo_id: j.repo_id,
    kind: "journal",
    source_id: String(j.id),
    title: clip(j.summary, 140) || "Session journal",
    body: body.slice(0, 8000),
    by_label: j.dev_label ?? null,
    at: j.at,
  };
}

/** events rows of kind 'decision' | 'broadcast' — payload {text, by}. */
export function eventToMemory(e: Row): MemoryRow | null {
  if (e.kind !== "decision" && e.kind !== "broadcast") return null;
  const p = (e.payload ?? {}) as { text?: string; by?: string };
  const text = clip(p.text, 2000);
  if (!text) return null;
  return {
    repo_id: e.repo_id,
    kind: e.kind,
    source_id: String(e.id),
    title: clip(text, 140),
    body: text,
    by_label: p.by ?? null,
    at: e.at,
  };
}

export function handoffToMemory(h: Row): MemoryRow {
  const body = [
    h.summary,
    h.done ? `Done: ${h.done}` : "",
    h.remaining ? `Remaining: ${h.remaining}` : "",
    h.warnings ? `Warnings: ${h.warnings}` : "",
    h.branch ? `Branch: ${h.branch}` : "",
    h.picked_up_by ? `Picked up by ${h.picked_up_by}` : "",
  ].filter(Boolean).join("\n");
  return {
    repo_id: h.repo_id,
    kind: "handoff",
    source_id: String(h.id),
    title: clip(h.summary, 140) || "Handoff",
    body: body.slice(0, 6000),
    by_label: h.dev_label ?? null,
    at: h.created_at,
  };
}

export function reviewToMemory(r: Row): MemoryRow {
  const points = Array.isArray(r.points) ? (r.points as { kind?: string; text?: string }[]) : [];
  const body = [
    r.summary,
    ...points.filter((p) => p?.text).map((p) => `${p.kind === "risk" ? "Risk" : p.kind === "brain" ? "Brain" : "Suggestion"}: ${p.text}`),
  ].filter(Boolean).join("\n");
  return {
    repo_id: r.repo_id,
    kind: "pr_review",
    source_id: `${r.pr_number}:${r.head_sha}`,
    title: `PR #${r.pr_number} review: ${String(r.verdict ?? "").replace("_", " ")}`,
    body: body.slice(0, 6000),
    by_label: "DevBrain review",
    at: r.created_at,
  };
}

export function taskToMemory(t: Row): MemoryRow {
  const tags = strs(t.tags);
  const body = [
    t.title,
    t.detail ?? "",
    tags.length ? `Tags: ${tags.join(" ")}` : "",
    t.status === "done" ? `Done${t.done_by ? ` by ${t.done_by}` : ""}` : `Open, P${t.priority}`,
    t.assigned_to ? `Assigned to ${t.assigned_to}` : "",
  ].filter(Boolean).join("\n");
  return {
    repo_id: t.repo_id,
    kind: "task",
    source_id: String(t.id),
    title: clip(t.title, 140),
    body: body.slice(0, 4000),
    by_label: t.created_by ?? null,
    at: t.created_at,
  };
}

/** A .brain/ note: frontmatter title if present, else the filename. */
export function brainToMemory(repoId: string, name: string, content: string, at: string): MemoryRow {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
  const titleLine = fm?.[1].match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  const body = content.replace(/^---\s*\n[\s\S]*?\n---\s*/, "").replace(/\[\[([^\]]+)\]\]/g, "$1");
  return {
    repo_id: repoId,
    kind: "brain",
    source_id: name,
    title: titleLine || name.replace(/^.*\//, "").replace(/\.md$/, ""),
    body: body.slice(0, 12000),
    by_label: "brain",
    at,
  };
}

/** Search hit → the compact shape served in the digest / tool output. */
export interface MemoryHit {
  kind: string;
  source_id: string;
  title: string;
  snippet: string;
  by_label: string | null;
  at: string;
  rank?: number;
}
export function formatHit(h: MemoryHit) {
  return {
    kind: h.kind,
    id: h.source_id,
    by: h.by_label,
    at: h.at,
    title: h.title,
    snippet: clip(h.snippet, 400),
  };
}
