import { DESK_SECTIONS } from "./nav";

// What a section will hold once its page is ported (phase 4). Named from the
// same list the sidebar renders, so the two can't drift.
export function DeskPlaceholder({ slug }: { slug: string }) {
  const item = DESK_SECTIONS.flatMap((g) => g.items).find((i) => i.slug === slug);
  if (!item) return null;
  return (
    <div className="rounded-xl border border-dashed border-line2 bg-row/60 px-4 py-3.5">
      <div className="font-display text-[10px] uppercase tracking-[.14em] text-muted">Arrives in phase 4</div>
      <div className="mt-1 text-[13px] text-txt">{item.arrives}.</div>
      <div className="mt-1 text-[11.5px] text-faint">Until then this lives on the browser dashboard. The Desk shell — window, sidebar, switchers, deep links — is what this phase proves.</div>
    </div>
  );
}
