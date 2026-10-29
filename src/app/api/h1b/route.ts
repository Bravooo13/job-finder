import { NextResponse } from "next/server";
import { h1bStats, importH1bCsv } from "@/lib/classify/store";

export const dynamic = "force-dynamic";

/** How much H-1B employer data is loaded. */
export async function GET() {
  return NextResponse.json(await h1bStats());
}

/** Upload one or more USCIS H-1B Employer Data Hub CSV files (form field "file"). */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the CSV as a file upload." }, { status: 400 });
  }
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  if (!files.length) return NextResponse.json({ error: "Choose a CSV file." }, { status: 400 });
  const results = [];
  try {
    for (const f of files) {
      if (f.size > 200 * 1024 * 1024) throw new Error(`${f.name} is larger than 200 MB.`);
      results.push({ file: f.name, ...(await importH1bCsv(await f.text())) });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), results }, { status: 400 });
  }
  return NextResponse.json({ results, stats: await h1bStats() });
}
