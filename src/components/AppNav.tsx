import Link from "next/link";

// Global top bar — wordmark, contextual tabs, account actions. Rendered on
// every authed page so navigation is consistent and no page wastes a header.

export function AppNav({
  tabs,
  live,
}: {
  tabs?: { label: string; href: string; active?: boolean }[];
  live?: React.ReactNode;
}) {
  const appSlug = process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain";
  return (
    <nav className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
            D
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">
            DevBrain
          </span>
        </Link>

        {tabs && tabs.length > 0 && (
          <div className="flex items-center gap-1 text-sm">
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

        <div className="ml-auto flex items-center gap-4 text-sm">
          {live}
          <a
            href={`https://github.com/apps/${appSlug}/installations/new`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
          >
            Link repo
          </a>
          <Link href="/settings/tokens" className="text-slate-500 hover:text-slate-900">
            Tokens
          </Link>
          <form action="/auth/sign-out" method="post">
            <button className="text-slate-500 hover:text-slate-900">Sign out</button>
          </form>
        </div>
      </div>
    </nav>
  );
}
