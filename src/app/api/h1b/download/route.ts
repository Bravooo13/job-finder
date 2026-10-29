import { NextResponse } from "next/server";
import { downloadH1b, h1bStats, USCIS_DATA_HUB } from "@/lib/classify/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Tries to download the latest Data Hub files straight from USCIS. */
export async function POST() {
  const years = await downloadH1b();
  if (!years.length) {
    return NextResponse.json(
      {
        error: `USCIS didn't let Job Finder download the files. Download a CSV from ${USCIS_DATA_HUB} in your browser and upload it here.`,
        page: USCIS_DATA_HUB,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ years, stats: await h1bStats() });
}
