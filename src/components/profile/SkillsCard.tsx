"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ResumeSkillGroup } from "@/lib/db/schema";
import { deleteSkillGroup, saveSkillGroup } from "@/lib/resumes/actions";

function GroupDialog({
  resumeId,
  group,
  onClose,
}: {
  resumeId: string;
  group: ResumeSkillGroup | null;
  onClose: () => void;
}) {
  const uid = useId();
  const [name, setName] = useState(group?.name ?? "");
  const [skills, setSkills] = useState(group?.skills.join(", ") ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{group ? "Edit skill group" : "Add skill group"}</DialogTitle>
        </DialogHeader>
        <form
          id={`${uid}-form`}
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await saveSkillGroup(resumeId, group?.id ?? null, { name, skills });
              if (!result.ok) return void toast.error(result.error);
              onClose();
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-name`}>Group name</Label>
            <Input id={`${uid}-name`} placeholder="Languages, Tools, Frameworks…" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-skills`}>Skills</Label>
            <Textarea
              id={`${uid}-skills`}
              rows={4}
              placeholder="Python, SQL, Tableau"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Separate with commas. Write them the way job posts do (e.g. “React”, not “React/Redux”) so matching finds them.
            </p>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${uid}-form`} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SkillsCard({ resumeId, groups }: { resumeId: string; groups: ResumeSkillGroup[] }) {
  const [editing, setEditing] = useState<{ group: ResumeSkillGroup | null } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Skills</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setEditing({ group: null })}>
          <Plus /> Add group
        </Button>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Group your skills, e.g. Languages, Data & analytics, Tools.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {groups.map((g) => (
              <li key={g.id} className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <p className="mb-1.5 text-sm font-medium">{g.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.skills.map((s) => (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-start gap-0.5">
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${g.name}`} onClick={() => setEditing({ group: g })}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={pending}
                    aria-label={`Delete ${g.name}`}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteSkillGroup(resumeId, g.id);
                        if (!result.ok) toast.error(result.error);
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing ? (
        <GroupDialog resumeId={resumeId} group={editing.group} onClose={() => setEditing(null)} />
      ) : null}
    </Card>
  );
}
