"use server";

import { redirect } from "next/navigation";
import { createCheckout, SITE } from "@/lib/billing/checkout";
import { type PlanId } from "@/lib/billing/plans";
import { requireRoleOrRedirect } from "@/lib/org";

// Site-side Checkout: a plain form post from /welcome/plan, /open or /pricing
// that lands on Stripe. Success returns to /open, which shows the download
// once the webhook has flipped the team.
export async function checkoutFromSite(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("admin", "/open");
  const planId = (String(formData.get("plan") || "base") === "scale" ? "scale" : "base") as PlanId;
  const back = String(formData.get("back") || "/open");
  const r = await createCheckout(me.orgId, planId, {
    success: `${SITE()}/open?checkout=success`,
    cancel: `${SITE()}${back.startsWith("/") ? back : "/open"}${back.includes("?") ? "&" : "?"}checkout=canceled`,
  });
  if ("error" in r) redirect(`${back.startsWith("/") ? back : "/open"}${back.includes("?") ? "&" : "?"}billing_error=${encodeURIComponent(r.error)}`);
  redirect(r.url);
}
