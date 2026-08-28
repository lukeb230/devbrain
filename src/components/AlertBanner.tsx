import { hasRole, type OrgContext } from "@/lib/org";
import { openAlerts } from "@/lib/alerts";
import { dismissAlert } from "@/app/settings/org/alert-actions";

// Open team alerts, shown to owners/admins at the top of the dashboard and
// the widget. Dismiss = resolve (by name), which also stops re-notification.
export async function AlertBanner({ org, compact }: { org: OrgContext; compact?: boolean }) {
  if (!hasRole(org.role, "admin")) return null;
  const alerts = await openAlerts(org.orgId);
  if (alerts.length === 0) return null;
  return (
    <div className={"mb-4 space-y-2 " + (compact ? "text-xs" : "text-sm")}>
      {alerts.map((a) => (
        <div
          key={a.id}
          className={
            "flex items-start gap-3 rounded-md border px-3 py-2 " +
            (a.severity === "error" ? "border-red-200 bg-red-50 text-red-800" : a.severity === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700")
          }
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium">{a.title}{a.count > 1 ? ` (×${a.count})` : ""}</div>
            {a.detail && !compact && <div className="mt-0.5 whitespace-pre-line break-words opacity-80">{a.detail.slice(0, 300)}</div>}
          </div>
          <form action={dismissAlert}>
            <input type="hidden" name="id" value={a.id} />
            <button className="whitespace-nowrap opacity-70 hover:opacity-100">Dismiss</button>
          </form>
        </div>
      ))}
    </div>
  );
}
