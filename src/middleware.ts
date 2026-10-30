import { NextResponse, type NextRequest } from "next/server";

// Job Finder is a local app with your personal data. This keeps other websites
// (and DNS-rebinding tricks) from reading or changing it through your browser.
// The Job Finder pages themselves, the browser extension and local scripts
// (curl, AI agents, the MCP server) are allowed.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function allowedHost(host: string | null): boolean {
  if (!host) return true;
  const name = host.replace(/:\d+$/, "").toLowerCase();
  if (LOCAL_HOSTS.has(name)) return true;
  const extra = (process.env.JOB_FINDER_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase());
  return extra.includes(name);
}

function isExtension(origin: string) {
  return origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://");
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  if (!allowedHost(host)) {
    return new NextResponse("Job Finder only answers on localhost.", { status: 403 });
  }
  if (!request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  const origin = request.headers.get("origin");
  const fromExtension = Boolean(origin && isExtension(origin));
  if (origin && origin !== "null" && !fromExtension) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === host;
    } catch {}
    if (!sameHost) return NextResponse.json({ error: "Requests from other websites aren't allowed." }, { status: 403 });
  }
  // A page on another site sending a no-CORS request (forms, images) shows up as cross-site.
  const site = request.headers.get("sec-fetch-site");
  if (!fromExtension && site === "cross-site") {
    return NextResponse.json({ error: "Requests from other websites aren't allowed." }, { status: 403 });
  }

  if (fromExtension) {
    const cors = {
      "access-control-allow-origin": origin!,
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-expose-headers": "x-file-name, x-resume-choice, content-disposition",
      "access-control-max-age": "600",
      vary: "origin",
    };
    if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: cors });
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
