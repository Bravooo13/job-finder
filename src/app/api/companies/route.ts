import { NextResponse } from "next/server";
import { findBoards, verifyBoard, type FoundBoard } from "@/lib/boards/detect";
import { PROVIDERS } from "@/lib/boards/types";
import { addCompanyBoard } from "@/lib/search/actions";

export const dynamic = "force-dynamic";

// GET /api/companies?q=Acme or ?q=https://acme.com/careers
// Finds a company's job boards (Greenhouse, Lever, Ashby, Workday).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "Pass ?q=company name or careers URL" }, { status: 400 });
  return NextResponse.json({ boards: await findBoards(q) });
}

// POST /api/companies  { provider, token, name?, host?, site? }
// Checks a board and adds it to your companies.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<FoundBoard> | null;
  if (!body?.provider || !body.token || !PROVIDERS.includes(body.provider)) {
    return NextResponse.json({ error: "provider and token are required" }, { status: 400 });
  }
  const board = await verifyBoard({
    provider: body.provider,
    token: body.token,
    name: body.name,
    host: body.host,
    site: body.site,
  });
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
  if (body.name?.trim()) board.name = body.name.trim(); // a name you give wins over the board's own
  await addCompanyBoard(board);
  return NextResponse.json({ board });
}
