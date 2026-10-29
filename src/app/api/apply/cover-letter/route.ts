import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { findJobForUrl } from "@/lib/apply/jobs";
import { db } from "@/lib/db";
import { coverLetters, resumes } from "@/lib/db/schema";
import { letterToLatex } from "@/lib/latex/template";
import { compileLatex } from "@/lib/latex/tectonic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/apply/cover-letter?url=… | ?jobId=… | ?id=…: your latest cover letter for a job as a PDF.
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  let letter = null;
  if (p.get("id")) {
    letter = await db.query.coverLetters.findFirst({ where: eq(coverLetters.id, p.get("id")!) });
  } else {
    const jobId = p.get("jobId") ?? (p.get("url") ? (await findJobForUrl(p.get("url")!))?.jobId ?? null : null);
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
