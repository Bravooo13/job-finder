import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { grabRuns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// GET /api/grab/runs: the latest grabs from job sites.
export async function GET() {
  return NextResponse.json(await db.select().from(grabRuns).orderBy(desc(grabRuns.createdAt)).limit(50));
}
