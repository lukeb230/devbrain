"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Picker } from "./picker";
import { DESK_SECTIONS } from "./sections";

// The Desk's sidebar (Dusk, flush window): the mark + wordmark at the top,
// aligned with the items and sitting under the traffic lights; the team and
// repo pickers under it; then the grouped sections, no icons. Active item =
// coral ink + coral line.

export function DeskNav({ orgs, orgId, switchOrg, repos, remembered, appSlug, canLink }: {
  orgs: { id: string; name: string }[];
  orgId: string;
  switchOrg: (fd: FormData) => Promise<void>;
  repos: { id: string; name: string }[];
  remembered: string | null;
  appSlug: string;
  canLink: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [, start] = useTransition();
  const active = pathname.replace(/^\/desk\/?/, "").split("/")[0] ?? "";
  // URL wins; otherwise the remembered repo the pages are using; "all" is explicit.
  const q = params.get("repo");
  const repo = q === "all" ? "all" : q ?? remembered ?? "all";
  const pickRepo = (v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("repo", v);
    router.push(`${pathname}?${next}`);
  };
  const pickTeam = (id: string) => {
    const fd = new FormData();
    fd.set("orgId", id);
    fd.set("next", "/desk");
    start(() => { void switchOrg(fd); });
  };
  const openExternal = (e: React.MouseEvent, url: string) => {
    const core = (window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__?.core;
    if (!core) return;
    e.preventDefault();
    void core.invoke("open_external", { url }).catch(() => window.open(url, "_blank"));
  };

  return (
    <nav className="flex w-[180px] flex-shrink-0 flex-col gap-px overflow-y-auto border-r border-line bg-row px-2 pb-2.5 pt-0">
      <div className="flex items-center gap-[9px] px-3 pb-2 pt-0.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brain.png" width={25} height={20} alt="" />
        <span className="font-display text-[19px] font-medium tracking-[-.01em] text-txt">DevBrain</span>
      </div>
      <div className="mb-2 flex flex-col gap-px px-1">
        {orgs.length > 1 ? (
          <Picker items={orgs.map((o) => ({ key: o.id, label: o.name }))} value={orgId} onPick={pickTeam} width={200} title="Team" />
        ) : (
          <div className="px-1.5 py-1 text-[13px] text-txt">{orgs.find((o) => o.id === orgId)?.name ?? "team"}</div>
        )}
        {repos.length > 0 ? (
          <Picker
            items={[{ key: "all", label: "all repos" }, ...repos.map((r) => ({ key: r.id, label: r.name.split("/").pop() ?? r.name, hint: r.name.split("/")[0] }))]}
            value={repo}
            onPick={pickRepo}
            width={232}
            title="Repo scope — filters every page to one repo"
            footer={canLink ? <a href={`https://github.com/apps/${appSlug}/installations/new`} target="_blank" onClick={(e) => openExternal(e, `https://github.com/apps/${appSlug}/installations/new`)} className="block rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-accent hover:bg-row2">Link a repo ↗</a> : undefined}
          />
        ) : (
          <div className="px-1.5 py-1 font-mono text-[12px] text-faint">no repos linked</div>
        )}
      </div>
      {DESK_SECTIONS.map((g) => (
        <div key={g.group}>
          <div className="px-2.5 pb-1 pt-2.5 font-mono text-[9px] uppercase tracking-[.12em] text-faint">{g.group}</div>
          {g.items.map((it) => {
            const on = active === it.slug || (it.also ?? []).includes(active);
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
