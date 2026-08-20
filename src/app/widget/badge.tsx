"use client";

// Smart corner badge — turns the always-on-screen dot into the ambient layer.
//
// The badge window is local to the shell and has no session, so the PANEL
// (which is authenticated and keeps running while hidden) computes the
// attention state and emits it over Tauri's event bus. The shell listens too:
// when there's something to say the badge stays visible instead of only
// appearing on corner-hover.
//
// Levels, most urgent first:
//   red    — your PR just went conflicted, or a teammate is in a file you claimed
//   green  — your PR is cleared to land (approved, clean, your turn)
//   amber  — a P1 assigned to you, an unclaimed handoff, or a spec to review
//   idle   — nothing needs you; badge behaves exactly as before (hover only)
//
// No-op outside the shell, so /widget in a browser is unaffected.

import { useEffect, useRef } from "react";

export type BadgeLevel = "red" | "green" | "amber" | "idle";

export interface BadgeInput {
  self: string | null;
  prs: {
    author: string | null;
    number: number;
    mergeable_state: string | null;
    light: { state: string; reason: string } | null;
  }[];
  tasks: { priority: number; status: string; assigned_to: string | null }[];
  claims: { dev_label: string; paths: string[] }[];
  collisions: { file: string; branches: string[] }[];
  handoffs: { id: string; by: string | null }[];
}

export function computeBadge(d: BadgeInput): { level: BadgeLevel; reason: string } {
  const me = (d.self ?? "").toLowerCase();
  const mine = (name: string | null | undefined) =>
    Boolean(me && name && name.toLowerCase() === me);

  // red — your PR broke, or someone is working inside a lane you claimed
  const conflicted = d.prs.find((p) => mine(p.author) && p.mergeable_state === "dirty");
  if (conflicted) return { level: "red", reason: `PR #${conflicted.number} has conflicts` };

  const myPaths = d.claims.filter((c) => mine(c.dev_label)).flatMap((c) => c.paths);
  const intruded = myPaths.length
    ? d.collisions.find((c) => myPaths.some((p) => c.file.startsWith(p.replace(/\/$/, ""))))
    : undefined;
  if (intruded) return { level: "red", reason: `${intruded.file} is contested in your lane` };

  // green — your merge is cleared
  const cleared = d.prs.find((p) => mine(p.author) && p.light?.state === "green");
  if (cleared) return { level: "green", reason: `PR #${cleared.number} is cleared to land` };

  // amber — something is waiting on you
  const p1 = d.tasks.find((t) => t.status === "open" && t.priority === 1 && mine(t.assigned_to));
  if (p1) return { level: "amber", reason: "a P1 task is assigned to you" };
  const handoff = d.handoffs.find((h) => !mine(h.by));
  if (handoff) return { level: "amber", reason: "unclaimed handoff waiting" };

  return { level: "idle", reason: "" };
}

interface TauriEventApi {
  emit(event: string, payload?: unknown): Promise<void>;
}

export function WidgetBadge({ input }: { input: BadgeInput }) {
  const last = useRef<string>("");
  const { level, reason } = computeBadge(input);

  useEffect(() => {
    const t = (window as unknown as { __TAURI__?: { event?: TauriEventApi } }).__TAURI__;
    const api = t?.event;
    if (!api) return; // plain browser — nothing to do
    const key = `${level}|${reason}`;
    if (key === last.current) return; // only emit on change
    last.current = key;
    void api.emit("badge-state", { level, reason }).catch(() => {
      /* shell too old to listen — badge just stays neutral */
    });
  }, [level, reason]);

  return null;
}
