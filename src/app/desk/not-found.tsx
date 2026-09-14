import Link from "next/link";
import { Reading } from "./panes";
import { H1 } from "./ui";

// Desk-level 404. notFound() resolves to the nearest boundary, so this one
// catches every notFound() call under /desk (a bad PR number, a missing
// spec) and renders inside desk/layout.tsx with the app's own chrome,
// instead of falling through to the marketing site's root not-found.tsx.
// Static: no session, no DB.

export default function DeskNotFound() {
  return (
    <Reading>
      <H1 title="Not found" sub={<>That page does not exist in this team. <Link href="/desk" className="text-accenttext hover:underline">Back to the Desk</Link>.</>} />
    </Reading>
  );
}
