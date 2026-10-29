import { NextResponse } from "next/server";
import { tectonicStatus } from "@/lib/latex/tectonic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/latex/status: is the LaTeX engine (Tectonic) ready?
export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.has("fresh");
  return NextResponse.json(await tectonicStatus(fresh));
}
