import Link from "next/link";
import { Suspense } from "react";
import { DeniedNotice } from "@/components/DeniedNotice";
import { BrainMark } from "@/components/BrainMark";
import { currentOrg, hasRole } from "@/lib/org";
import { switchOrg } from "@/app/settings/org/actions";

// Global top bar — wordmark, contextual tabs, account actions. Rendered on
// every authed page so navigation is consistent and no page wastes a header.

export async function AppNav({
  tabs,
  live,
}: {
  tabs?: { label: string; href: string; active?: boolean }[];
  live?: React.ReactNode;
}) {
  const appSlug = process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain";
  const org = await currentOrg();
  return (
    <>
    <nav className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 overflow-x-auto px-4 sm:gap-6 sm:px-6">
        <Link href="/dashboard" className="flex flex-shrink-0 items-center gap-2">
          <BrainMark size={26} id="nav" className="flex-shrink-0 text-brand-600" title="DevBrain" />
          <span className="hidden text-[15px] font-semibold tracking-tight text-slate-900 sm:inline">
            DevBrain
          </span>
        </Link>
        {org && org.orgs.length > 1 ? (
          <form action={switchOrg} className="flex-shrink-0">
            <select
              name="orgId"
              defaultValue={org.orgId}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700"
            >
              {org.orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <button className="ml-1 text-xs text-slate-500 hover:text-slate-900">Switch</button>
          </form>
        ) : org ? (
          <Link href="/settings/org" className="hidden flex-shrink-0 text-sm text-slate-500 hover:text-slate-900 md:inline">
            {org.orgName}
          </Link>
        ) : null}

        {tabs && tabs.length > 0 && (
          <div className="flex flex-shrink-0 items-center gap-1 text-sm">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "rounded-md px-3 py-1.5 " +
                  (t.active
                    ? "bg-slate-100 font-medium text-slate-900"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")
                }
              >
                {t.label}
              </Link>
            ))}
          </div>
        )}

        <div className="ml-auto flex flex-shrink-0 items-center gap-3 text-sm sm:gap-4">
          {live}
          {org && hasRole(org.role, "admin") && (
            <a
              href={`https://github.com/apps/${appSlug}/installations/new`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              Link repo
            </a>
          )}
          <Link href="/settings/setup" className="text-slate-500 hover:text-slate-900">
            Setup
          </Link>
          <Link href="/settings/members" className="hidden text-slate-500 hover:text-slate-900 sm:inline">
            Members
          </Link>
          <Link href="/settings/org" className="hidden text-slate-500 hover:text-slate-900 sm:inline">
            Team
          </Link>
          <Link href="/settings/reminders" className="hidden text-slate-500 hover:text-slate-900 sm:inline">
            Reminders
          </Link>
          <Link href="/settings/tokens" className="hidden text-slate-500 hover:text-slate-900 sm:inline">
            Tokens
          </Link>
          <form action="/auth/sign-out" method="post">
            <button className="text-slate-500 hover:text-slate-900">Sign out</button>
          </form>
        </div>
      </div>
    </nav>
    <Suspense fallback={null}><DeniedNotice /></Suspense>
    </>
  );
}
