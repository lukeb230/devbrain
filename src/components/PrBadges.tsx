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

  if (pr.draft) chips.push({ text: "draft", cls: "bg-slate-100 text-slate-500" });

  switch (pr.mergeable_state) {
    case "dirty":
      chips.push({ text: `conflicts with ${defaultBranch}`, cls: "bg-red-50 text-red-700 border border-red-200 font-semibold" });
      break;
    case "behind":
      chips.push({ text: `behind ${defaultBranch}`, cls: "bg-amber-50 text-amber-700" });
      break;
    case "clean":
      chips.push({ text: "merges clean", cls: "bg-emerald-50 text-emerald-700" });
      break;
    default:
      chips.push({ text: "merge check pending", cls: "bg-slate-100 text-slate-500" });
  }

  switch (pr.review_state) {
    case "approved":
      chips.push({ text: "approved", cls: "bg-emerald-50 text-emerald-700" });
      break;
    case "changes_requested":
      chips.push({ text: "changes requested", cls: "bg-amber-50 text-amber-700" });
      break;
    default:
      chips.push({ text: "awaiting review", cls: "bg-brand-50 text-brand-700" });
  }

  return (
    <span className="inline-flex flex-wrap gap-1.5 align-middle">
      {chips.map((c) => (
        <span key={c.text} className={`chip ${c.cls}`}>
          {c.text}
        </span>
      ))}
    </span>
  );
}
