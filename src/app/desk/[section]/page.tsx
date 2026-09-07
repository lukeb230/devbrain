import { notFound } from "next/navigation";
import { DESK_SECTIONS } from "../sections";
import { DeskPlaceholder } from "../placeholder";
import { IpcProbe } from "../ipc-probe";

// One route per sidebar section. Phase 3: the placeholder. Phase 4 replaces
// this file with real pages, one section at a time, keeping these URLs —
// they are what the panel's deep links and devbrain://desk/<section> target.
export default async function DeskSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = DESK_SECTIONS.flatMap((g) => g.items).find((i) => i.slug === section);
  if (!item) notFound();
  return (
    <>
      <h1 className="font-display text-[21px] font-bold tracking-tight">{item.label}</h1>
      <p className="mb-4 text-[12px] text-muted">/desk/{section}</p>
      <DeskPlaceholder slug={section} />
      {section === "mac" && <IpcProbe />}
    </>
  );
}
