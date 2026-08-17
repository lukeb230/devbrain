// At-a-glance PR status chips — used on the team home and repo pages.

export function PrBadges({
  pr,
  defaultBranch,
}: {
  pr: {
    draft?: boolean;
    review_state?: string | null;
    mergeable_state?: string | null;
  };
  defaultBranch: string;
}) {
  const chips: { text: string; cls: string }[] = [];

  if (pr.draft) chips.push({ text: "draft", cls: "bg-slate-500/15 text-slate-400" });

  switch (pr.mergeable_state) {
    case "dirty":
      chips.push({ text: `⚠ CONFLICTS with ${defaultBranch}`, cls: "bg-red-500/20 text-red-400 font-semibold" });
      break;
    case "behind":
      chips.push({ text: `behind ${defaultBranch}`, cls: "bg-amber-500/15 text-amber-400" });
      break;
    case "clean":
      chips.push({ text: "✓ merges clean", cls: "bg-emerald-500/15 text-emerald-400" });
      break;
    default:
      chips.push({ text: "merge check pending", cls: "bg-slate-500/15 text-slate-500" });
  }

  switch (pr.review_state) {
    case "approved":
      chips.push({ text: "✓ approved", cls: "bg-emerald-500/15 text-emerald-400" });
      break;
    case "changes_requested":
      chips.push({ text: "changes requested", cls: "bg-amber-500/15 text-amber-400" });
      break;
    default:
      chips.push({ text: "awaiting review", cls: "bg-blue-500/15 text-blue-300" });
  }

  return (
    <span className="ml-2 inline-flex flex-wrap gap-1.5 align-middle">
      {chips.map((c) => (
        <span key={c.text} className={`rounded px-1.5 py-0.5 text-xs ${c.cls}`}>
          {c.text}
        </span>
      ))}
    </span>
  );
}
