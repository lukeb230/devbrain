"use server";

import { headers } from "next/headers";
import { publicLimit } from "@/lib/api-guard";
import { isLeadSource, normaliseEmail } from "@/lib/leads";
import { supabaseAdmin } from "@/lib/supabase/server";

// The landing page's email capture. Deliberately forgiving: a duplicate, a
// flood and a database hiccup all end the same way the happy path does,
// because the person on the other side gave you their address and does not
// need to be told which of those happened. The only thing worth an error is
// an address that is not one — that they can fix.

export type LeadState = { ok: boolean; message: string } | null;

export async function captureLead(_prev: LeadState, formData: FormData): Promise<LeadState> {
  const email = normaliseEmail(formData.get("email"));
  if (!email) return { ok: false, message: "That doesn't look like an email address." };

  const rawSource = formData.get("source");
  const source = isLeadSource(rawSource) ? rawSource : "landing";

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip")?.trim() || "unknown";
  // Same ceiling as the other public endpoints. Over it, say thank you and
  // write nothing — a scraper stuffing the list gets no signal either way.
  if (await publicLimit(ip, "lead")) return { ok: true, message: "Thanks — you're on the list." };

  const { error } = await supabaseAdmin().from("leads").insert({ email, source });
  // 23505 is the unique index: they already signed up. Same answer.
  if (error && error.code !== "23505") {
    return { ok: false, message: "Something went wrong saving that. Try again in a moment." };
  }
  return { ok: true, message: "Thanks — you're on the list." };
}
