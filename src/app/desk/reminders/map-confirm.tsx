"use client";
import { ConfirmButton } from "../confirm-button";

// The describer has to live in a client module: a server component can't
// hand a function to a client component (that crashed the page once).
export function MapConfirm() {
  return (
    <ConfirmButton
      label="Map list"
      describe={(form) => {
        const list = (form.elements.namedItem("list") as HTMLInputElement | null)?.value ?? "";
        const sel = form.elements.namedItem("repoId") as HTMLSelectElement | null;
        const repo = sel?.selectedOptions[0]?.text ?? "";
        return `Every item on "${list}" becomes a task in ${repo} and stays in sync (every 3 min) until unmapped.`;
      }}
    />
  );
}
