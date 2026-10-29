import { NextResponse } from "next/server";
import { z } from "zod";
import { getAboutMe, getAiStatus, saveAiSettings, setAboutMe } from "@/lib/ai/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/settings: AI setup (never the key itself) and your notes.
export async function GET() {
  const [status, aboutMe] = await Promise.all([getAiStatus(), getAboutMe()]);
  return NextResponse.json({ ...status, aboutMe });
}

const patchSchema = z.object({
  aboutMe: z.string().max(8000).optional(),
  provider: z.enum(["claude", "ollama"]).optional(),
  claudeModel: z.string().trim().min(1).max(100).optional(),
  ollamaUrl: z.string().trim().url().max(300).optional(),
  ollamaModel: z.string().trim().max(200).optional(),
});

// PUT /api/settings: change any of the fields above. The API key is set in the Settings page only.
export async function PUT(request: Request) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const { aboutMe, ...ai } = parsed.data;
  if (aboutMe !== undefined) await setAboutMe(aboutMe);
  if (Object.keys(ai).length) await saveAiSettings(ai);
  return GET();
}
