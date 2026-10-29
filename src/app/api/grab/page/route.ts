import { NextResponse } from "next/server";
import { grabPage, pageSchema } from "@/lib/grab/page";
import { saveGrabbed } from "@/lib/grab/save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/grab/page: any careers page. Reads its job data, learns the company's
// job board, and (when nothing else works) asks the AI to list the openings.
// Body: { url, title?, html?, text?, links?: [{ text, href }], company?, useAi?, by?, save? }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = pageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const page = await grabPage(parsed.data);
  const by = body?.by === "agent" ? "agent" : body?.by === "you" ? "you" : "extension";
  const saved = page.jobs.length
    ? await saveGrabbed({ source: "web", pageUrl: parsed.data.url, by, save: Boolean(body?.save), jobs: page.jobs.slice(0, 200) })
    : { received: 0, added: 0, updated: 0, duplicates: 0, boardsLearned: 0, results: [] };
  return NextResponse.json({ ...saved, boards: page.boards, boardsAdded: page.boardsAdded, usedAi: page.usedAi, aiError: page.aiError });
}
