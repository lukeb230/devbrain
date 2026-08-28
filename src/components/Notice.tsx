// Amber banner for ?error=<code> after a refused server action
// (see requireRoleOrRedirect in src/lib/org.ts).
const MESSAGES: Record<string, string> = {
  admin_only: "Only team admins and owners can do that.",
  owner_only: "Only the team owner can do that.",
  link_repo_admin:
    "Only admins and owners can link repositories. Ask an admin to install the GitHub App (or to make you an admin on Members), then it links on its own.",
};

export function Notice({ error, compact }: { error?: string | null; compact?: boolean }) {
  if (!error) return null;
  const text = MESSAGES[error] ?? "That didn't work.";
  return (
    <p className={"mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 " + (compact ? "text-xs" : "text-sm")}>
      {text}
    </p>
  );
}
