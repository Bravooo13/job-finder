"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { updateJobStatus } from "@/lib/jobs/actions";
import { saveApplyProfile } from "./profile";
import type { ApplyProfile } from "./profile-schema";

export async function saveMyAnswers(input: Partial<ApplyProfile>): Promise<ActionResult<ApplyProfile>> {
  try {
    const profile = await saveApplyProfile(input);
    revalidatePath("/apply");
    return { ok: true, data: profile };
  } catch (error) {
    return { ok: false, error: error instanceof ZodError ? (error.issues[0]?.message ?? "Invalid answers") : String(error) };
  }
}

export async function markJobApplied(jobId: string): Promise<ActionResult> {
  const r = await updateJobStatus(jobId, "applied");
  revalidatePath("/apply");
  return r;
}
