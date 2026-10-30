import { NextResponse } from "next/server";
import { deleteResumeFile, getResumeFile, readResumeFile, saveResumeFile } from "@/lib/apply/auto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/apply/resume-file: the resume PDF you uploaded for applications ({ name, size, uploadedAt } or null).
// GET /api/apply/resume-file?download=1: the file itself.
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("download")) {
    const f = await readResumeFile();
    if (!f) return NextResponse.json({ error: "No resume file uploaded" }, { status: 404 });
    return new Response(new Uint8Array(f.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${f.fileName.replace(/"/g, "")}"`, "x-file-name": f.fileName } });
  }
  return NextResponse.json({ file: await getResumeFile() });
}

// POST /api/apply/resume-file (multipart, field "file"): upload the PDF to attach to applications.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the PDF as a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choose a PDF." }, { status: 400 });
  try {
    return NextResponse.json({ file: await saveResumeFile(file.name, Buffer.from(await file.arrayBuffer())) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

// DELETE /api/apply/resume-file: stop using the uploaded PDF.
export async function DELETE() {
  await deleteResumeFile();
  return NextResponse.json({ ok: true });
}
