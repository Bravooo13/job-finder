import { NextResponse } from "next/server";
import { applyQueue } from "@/lib/apply/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/apply/queue?status=new,draft: saved jobs to apply to, with their resume, cover letter and answers.
export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get("status");
  const items = await applyQueue(status ? status.split(",") : undefined);
  return NextResponse.json({ count: items.length, jobs: items });
}
