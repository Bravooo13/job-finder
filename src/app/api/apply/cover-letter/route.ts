import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { findJobById, findJobForUrl } from "@/lib/apply/jobs";
import { letterForApplication } from "@/lib/apply/letter";
import { AiError } from "@/lib/ai/providers";
import { asRequester } from "@/lib/control/context";
import { db } from "@/lib/db";
import { coverLetters, resumes } from "@/lib/db/schema";
import { letterToLatex } from "@/lib/latex/template";
import { compileLatex } from "@/lib/latex/tectonic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/apply/cover-letter?url=… | ?jobId=… | ?foundId=… | ?id=…: your latest cover letter for a job as a PDF.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  let letter = null;
  if (p.get("id")) {
    letter = await db.query.coverLetters.findFirst({ where: eq(coverLetters.id, p.get("id")!) });
  } else {
    const jobId =
      (await findJobById({ jobId: p.get("jobId"), foundId: p.get("foundId") }))?.jobId ??
      (p.get("url") ? ((await findJobForUrl(p.get("url")!))?.jobId ?? null) : null);
    if (jobId) {
      const rows = await db.select().from(coverLetters).where(eq(coverLetters.jobId, jobId)).orderBy(desc(coverLetters.updatedAt)).limit(1);
      letter = rows[0] ?? null;
    }
  }
  if (!letter?.content.trim()) return NextResponse.json({ error: "No cover letter for this job yet" }, { status: 404 });
  const resume = letter.resumeId
    ? (await db.select().from(resumes).where(eq(resumes.id, letter.resumeId)).limit(1))[0]
    : undefined;
  const result = await compileLatex(
    letterToLatex({ fullName: resume?.fullName, email: resume?.email, phone: resume?.phone, location: resume?.location, content: letter.content }),
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.notInstalled ? 409 : 422 });
  const name = `${(resume?.fullName ?? "Cover").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_")}_Cover_Letter.pdf`;
  return new Response(new Uint8Array(result.pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"`, "x-file-name": name, "cache-control": "no-store" },
  });
}

const writeSchema = z.object({
  url: z.string().url().optional(),
  jobId: z.string().max(100).nullish(),
  foundId: z.string().max(100).nullish(),
  /** Write one with the Cover letter writer when the job has none (default true). */
  write: z.boolean().optional(),
});

// POST /api/apply/cover-letter { url? | jobId? | foundId?, write? } → { id, jobId, content, written }
// The job's cover letter, or a new one from the Cover letter writer (saved on the Cover letters page).
// Found jobs are saved to My jobs first. GET the PDF afterwards with ?jobId=.
export async function POST(request: Request) {
  const parsed = writeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const b = parsed.data;
  const match = (await findJobById(b)) ?? (b.url ? await findJobForUrl(b.url) : null);
  try {
    const r = await asRequester(request, () =>
      letterForApplication({ jobId: match?.jobId ?? b.jobId, foundId: match?.foundId ?? b.foundId }, { write: b.write !== false }),
    );
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 404 });
    return NextResponse.json(r);
  } catch (error) {
    return NextResponse.json({ error: error instanceof AiError ? error.message : String(error) }, { status: 502 });
  }
}
