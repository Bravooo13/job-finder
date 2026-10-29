import { NextResponse } from "next/server";
import { getAiStatus } from "@/lib/ai/settings";
import { getApplyProfile } from "@/lib/apply/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ext/status: lets the browser extension (and agents) check the connection.
export async function GET() {
  const [ai, profile] = await Promise.all([getAiStatus(), getApplyProfile()]);
  return NextResponse.json({
    app: "job-finder",
    version: 1,
    ai: { ready: ai.ready, label: ai.label },
    profile: { ready: Boolean(profile.firstName && profile.email), name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") },
  });
}
