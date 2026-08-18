import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// /widget — entry point for the desktop edge panel. The panel shows the
// FULL dashboard; this route just lands it on the right page: the last repo
// the user worked in (remembered by middleware), else the team home.
export const dynamic = "force-dynamic";

export default async function WidgetPage() {
  const jar = await cookies();
  const last = jar.get("devbrain_last_repo")?.value;
  redirect(last ? `/dashboard/${last}` : "/dashboard");
}
