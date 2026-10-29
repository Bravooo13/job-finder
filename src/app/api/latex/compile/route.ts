import { NextResponse } from "next/server";
import { compileLatex } from "@/lib/latex/tectonic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/latex/compile {latex}: returns the PDF, or JSON {error, log}.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { latex?: unknown } | null;
  const latex = typeof body?.latex === "string" ? body.latex : "";
  if (!latex.trim()) return NextResponse.json({ error: "There's no LaTeX to compile." }, { status: 400 });
  if (latex.length > 500_000) return NextResponse.json({ error: "That document is too large." }, { status: 413 });

  const result = await compileLatex(latex);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, log: result.log, notInstalled: result.notInstalled ?? false },
      { status: result.notInstalled ? 409 : 422 },
    );
  }
  return new Response(new Uint8Array(result.pdf), {
    headers: {
      "content-type": "application/pdf",
      "cache-control": "no-store",
      "x-compile-ms": String(result.ms),
    },
  });
}
