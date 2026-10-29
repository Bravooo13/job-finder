import { NextResponse } from "next/server";
import { installTectonic } from "@/lib/latex/tectonic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/latex/install: downloads Tectonic into data/bin.
export async function POST() {
  try {
    return NextResponse.json(await installTectonic());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
