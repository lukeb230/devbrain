import { currentOrg } from "@/lib/org";
import { teamHints } from "@/lib/desk/team-hints";
import { TeamPane } from "./team-pane";

// Team pages share this layout: the list pane persists across navigations
// and only the reading pane (each page) is swapped in. The desk layout above
// already guarantees a signed-in user with a team.
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const org = await currentOrg();
  const hints = org ? await teamHints(org.orgId, org.userId, null) : {};
  return (
    <>
      <TeamPane hints={hints} />
      {children}
    </>
  );
}
