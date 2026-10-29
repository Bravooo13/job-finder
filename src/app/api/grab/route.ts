import { NextResponse } from "next/server";
import { grabSchema, saveGrabbed } from "@/lib/grab/save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/grab: jobs read from a site you browse (the extension or an AI agent).
// Body: { source: "linkedin" | "handshake" | "indeed" | "web", pageUrl?, by?, save?, jobs: [{ url, title, company, location?, description?, postedAt?, salary?, jobType?, workplace?, industry?, workAuth?, applyUrl? }] }
export async function POST(request: Request) {
  const parsed = grabSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}` }, { status: 400 });
  }
  return NextResponse.json(await saveGrabbed(parsed.data));
}
