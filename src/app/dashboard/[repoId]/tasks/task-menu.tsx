"use client";

// Three-dots menu on every task: Edit (everything — title, detail, priority,
// assignee, tags) and Delete (two-click confirm). Used on the dashboard tasks
// page and the widget's Tasks tab.

import { useEffect, useRef, useState } from "react";
import { deleteTask, updateTask } from "./actions";

export interface EditableTask {
  id: string;
  repo_id: string;
  title: string;
  detail: string | null;
  priority: number;
  tags: string[];
  assigned_to: string | null;
}

export function TaskMenu({
  task,
  members,
  compact,
}: {
  task: EditableTask;
  members: string[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Click-away closes the dropdown (not the edit panel — that's deliberate,
  // so a stray click can't eat a half-written edit).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        onClick={() => { setOpen((o) => !o); setConfirmDelete(false); }}
        aria-label="Task options"
        title="Edit task"
        className={
          "flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 " +
          (compact ? "h-4 w-4" : "h-6 w-6")
        }
      >
        <svg viewBox="0 0 24 24" className={compact ? "h-3 w-3" : "h-4 w-4"} fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && !editing && (
        <div className="absolute right-0 top-6 z-20 w-36 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <button
            onClick={() => { setEditing(true); setOpen(false); }}
            className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
          >
            Edit task
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              Delete
            </button>
          ) : (
            <form action={deleteTask} onSubmit={() => { setOpen(false); setConfirmDelete(false); }}>
              <input type="hidden" name="repoId" value={task.repo_id} />
              <input type="hidden" name="id" value={task.id} />
              <button className="block w-full px-3 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50">
                Really delete?
              </button>
            </form>
          )}
        </div>
      )}

      {editing && (
        <div className="absolute right-0 top-6 z-20 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <form action={updateTask} onSubmit={() => setEditing(false)} className="space-y-2">
            <input type="hidden" name="repoId" value={task.repo_id} />
            <input type="hidden" name="id" value={task.id} />
            <input
              name="title"
              required
              defaultValue={task.title}
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-medium focus:border-brand-500 focus:outline-none"
            />
            <textarea
              name="detail"
              rows={2}
              defaultValue={task.detail ?? ""}
              placeholder="Detail (optional)"
              className="w-full resize-y rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
            />
            <div className="flex gap-1.5">
              <select name="priority" defaultValue={String(task.priority)} className="rounded border border-slate-200 px-1 py-1 text-xs">
                <option value="1">P1 · Critical</option>
                <option value="2">P2 · High</option>
                <option value="3">P3 · Medium</option>
                <option value="4">P4 · Low</option>
              </select>
              <select name="assignee" defaultValue={task.assigned_to ?? ""} className="min-w-0 flex-1 rounded border border-slate-200 px-1 py-1 text-xs">
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <input
              name="tags"
              defaultValue={task.tags.join(", ")}
              placeholder="Tags, comma-separated"
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button className="rounded bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
