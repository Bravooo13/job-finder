"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { JobNote } from "@/lib/db/schema";
import { addNote, deleteNote, updateNote } from "@/lib/jobs/actions";
import { formatDate } from "@/lib/utils";

function NoteEditor({
  initial = "",
  onSave,
  onCancel,
  saveLabel,
}: {
  initial?: string;
  onSave: (content: string) => Promise<boolean>;
  onCancel?: () => void;
  saveLabel: string;
}) {
  const [content, setContent] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        aria-label={initial ? "Edit note" : "New note"}
        rows={4}
        value={content}
        placeholder="Recruiter name, what you discussed, follow-up ideas…"
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={pending || !content.trim()}
          onClick={() =>
            startTransition(async () => {
              if (await onSave(content)) setContent(initial ? content : "");
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

export function NotesSection({ jobId, notes }: { jobId: string; notes: JobNote[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <NoteEditor
        saveLabel="Add note"
        onSave={async (content) => {
          const result = await addNote(jobId, content);
          if (!result.ok) toast.error(result.error);
          return result.ok;
        }}
      />
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border p-3">
              {editing === note.id ? (
                <NoteEditor
                  initial={note.content}
                  saveLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSave={async (content) => {
                    const result = await updateNote(note.id, jobId, content);
                    if (!result.ok) toast.error(result.error);
                    else setEditing(null);
                    return result.ok;
                  }}
                />
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(note.createdAt, "MMM d, yyyy · h:mm a")}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(note.id)} aria-label="Edit note">
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deleting}
                        aria-label="Delete note"
                        onClick={() =>
                          startDelete(async () => {
                            const result = await deleteNote(note.id, jobId);
                            if (!result.ok) toast.error(result.error);
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
