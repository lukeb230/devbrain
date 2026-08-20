"use client";

// Drag-and-drop (or pick, or paste) a context doc. Submits the real <form>
// so the server action handles it — no custom upload endpoint.

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
    >
      {pending ? "Reading…" : label}
    </button>
  );
}

export function SpecDropzone({
  repoId,
  action,
}: {
  repoId: string;
  action: (fd: FormData) => Promise<void>;
}) {
  const [over, setOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <form ref={formRef} action={action} className="card card-pad">
      <input type="hidden" name="repoId" value={repoId} />

      <div className="mb-3 flex gap-2 text-xs">
        {(["file", "paste"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={
              "rounded-md px-2.5 py-1 " +
              (mode === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            {m === "file" ? "Drop a file" : "Paste text"}
          </button>
        ))}
      </div>

      {mode === "file" ? (
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
          className={
            "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors " +
            (over ? "border-brand-500 bg-brand-50" : "border-slate-300 hover:border-brand-400 hover:bg-slate-50")
          }
        >
          <svg viewBox="0 0 24 24" className="mb-2 h-7 w-7 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-medium text-slate-700">
            {fileName ?? "Drop a spec, brief, or braindump here"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Markdown, text, HTML, or PDF (mockups and screenshots inside PDFs get read too)
          </p>
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".md,.markdown,.txt,.html,.htm,.pdf"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </div>
      ) : (
        <textarea
          name="text"
          rows={6}
          placeholder="Paste the doc — everything you want this app to become. DevBrain works out what already exists and what doesn't."
          className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          name="title"
          placeholder="Title (optional — we'll name it from the doc)"
          className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <Submit label="Add context" />
      </div>
    </form>
  );
}
