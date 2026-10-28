import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { extractResumeLines } from "@/lib/resume-import/extract";
import { parseResume } from "@/lib/resume-import/parse";
import { saveParsedResume } from "@/lib/resume-import/save";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a resume file to import." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is larger than 10 MB." }, { status: 400 });
  }
  try {
    const data = Buffer.from(await file.arrayBuffer());
    const lines = await extractResumeLines({ name: file.name, type: file.type, data });
    if (lines.length < 3) {
      return NextResponse.json(
        { error: "Couldn't read any text from that file. If it's a scanned image, try a Word or text version." },
        { status: 422 },
      );
    }
    const parsed = parseResume(lines);
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    const id = await saveParsedResume(parsed, base || parsed.fullName || "Imported resume", lines.join("\n"));
    revalidatePath("/profile");
    revalidatePath("/dashboard");
    return NextResponse.json({
      id,
      summary: {
        entries: parsed.entries.length,
        skills: parsed.skillGroups.reduce((n, g) => n + g.skills.length, 0),
        name: parsed.fullName,
      },
    });
  } catch (error) {
    console.error("Resume import failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't read that resume." },
      { status: 422 },
    );
  }
}
