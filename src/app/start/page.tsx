import type { Metadata } from "next";
import { StartBody } from "./start-body";

// /start: where the Download button lands. With ?dl=1 the page starts the
// DMG download itself; either way it shows the five things to do next. The
// app is menu-bar only, so without this page a first launch looks like
// nothing happened.

export const metadata: Metadata = { title: "Start", description: "What to do after downloading DevBrain: install it, sign in with GitHub, link a repo." };
// Reading searchParams makes this page dynamic. Do not add force-static: it
// would make searchParams empty and ?dl=1 would never start the download.

export default async function StartPage({ searchParams }: { searchParams: Promise<{ dl?: string }> }) {
  const { dl } = await searchParams;
  return <StartBody dl={dl === "1"} />;
}
