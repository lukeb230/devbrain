"use client";

// Drag-and-drop (or pick, or paste) a context doc, Dusk-styled for the
// Specs list pane: a dashed drop target, a "paste text" alternative, an
// optional title, submit. Submits the real <form> so the server action
// handles it — no custom upload endpoint.

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="whitespace-nowrap rounded-lg bg-accent2 px-[11px] py-1.5 font-display text-[11.5px] font-semibold text-white disabled:opacity-50">
      {pending ? "Reading…" : label}
    </button>
  );
}

export function SpecDropzone({ repoId, action }: { repoId: string; action: (fd: FormData) => Promise<void> }) {
  const [over, setOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <form action={action} className="mx-4 mb-3">
      <input type="hidden" name="repoId" value={repoId} />
      {!paste ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f && inputRef.current) {
              const dt = new DataTransfer();
              dt.items.add(f);
              inputRef.current.files = dt.files;
              setFileName(f.name);
            }
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-[10px] border border-dashed px-3 py-4 text-center text-[12px] leading-[1.5] text-muted ${over ? "border-accent bg-coralink" : "border-line3 hover:border-line2"}`}
        >
          {fileName ?? "Drop a spec, brief, or braindump"}
          <br />
          <span className="text-[11px] text-faint">md · txt · html · pdf — or <button type="button" onClick={(e) => { e.stopPropagation(); setPaste(true); }} className="text-accent hover:underline">paste text</button></span>
          <input ref={inputRef} type="file" name="file" accept=".md,.markdown,.txt,.html,.htm,.pdf" className="hidden" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
        </div>
      ) : (
        <textarea name="text" rows={5} autoFocus placeholder="Paste the doc — everything you want this app to become." className="w-full resize-none rounded-lg border border-line2 bg-ink px-3 py-2.5 text-[12.5px] leading-[1.5] text-txt placeholder:text-faint focus:border-accent focus:outline-none" />
      )}
      {(fileName || paste) && (
        <div className="mt-2 flex items-center gap-2">
          <input name="title" placeholder="Title (optional)" className="min-w-0 flex-1 rounded-lg border border-line2 bg-ink px-2.5 py-1.5 text-[12px] text-txt placeholder:text-faint focus:border-accent focus:outline-none" />
          <Submit label="Add" />
        </div>
      )}
    </form>
  );
}
