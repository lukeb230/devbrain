// One usage row: label · big value "of" allowance · hint. Shared by the Plan
// page and the Team settings summary. Fits a half-width column.
export function Counter({ label, value, of, hint, tone }: { label: string; value: number | string; of: number | string; hint: string; tone?: "stop" }) {
  const over = typeof value === "number" && typeof of === "number" && value > of;
  return (
    <div className="border-t border-line py-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[.08em] text-faint">{label}</span>
        <span className={`ml-auto font-display text-[24px] font-medium leading-none ${tone === "stop" || over ? "text-stop" : "text-txt"}`}>{value}</span>
        <span className="text-[12px] text-muted">of {of}</span>
      </div>
      <div className="mt-0.5 text-right text-[11px] text-muted">{hint}</div>
    </div>
  );
}

export const STATUS_LABEL: Record<string, string> = { trialing: "trial", active: "active", past_due: "payment failed", canceled: "canceled", comped: "complimentary" };
