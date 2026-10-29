import "server-only";
import { db } from "@/lib/db";
import { companyBoards } from "@/lib/db/schema";
import { boardFromUrl } from "./adapters";
import { directoryBoards } from "./directory";
import { boardKey, type BoardRef } from "./types";

// Job links from LinkedIn, Handshake and the Simplify lists often point at a
// company's own Greenhouse, Lever, Ashby, Workday or SmartRecruiters board.
// Remembering those boards means every later search reads the company's whole
// board, not just the one posting we happened to see.

let known: Set<string> | null = null;

async function knownKeys(): Promise<Set<string>> {
  if (!known) {
    known = new Set(directoryBoards().map(boardKey));
    for (const b of await db.select().from(companyBoards)) {
      known.add(boardKey({ provider: b.provider as BoardRef["provider"], token: b.token, site: b.site || undefined }));
    }
  }
  return known;
}

/** Adds the boards behind these job links to your companies. Returns how many were new. */
export async function learnBoards(
  links: { url: string | null | undefined; company?: string | null }[],
  origin: string,
): Promise<number> {
  const keys = await knownKeys();
  const fresh = new Map<string, { board: BoardRef; name: string }>();
  for (const l of links) {
    if (!l.url) continue;
    const found = boardFromUrl(l.url);
    if (!found || found.board.provider === "simplify") continue;
    const key = boardKey(found.board);
    if (keys.has(key) || fresh.has(key)) continue;
    fresh.set(key, { board: found.board, name: l.company?.trim() || found.board.token });
  }
  if (!fresh.size) return 0;
  const rows = [...fresh.values()].map(({ board, name }) => ({
    provider: board.provider,
    token: board.token,
    name,
    host: board.host ?? null,
    site: board.site ?? "",
    careersUrl: null,
    jobCount: null,
    origin,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(companyBoards).values(rows.slice(i, i + 200)).onConflictDoNothing();
  }
  for (const k of fresh.keys()) keys.add(k);
  return fresh.size;
}

/** Call after boards are added or removed elsewhere. */
export function forgetKnownBoards() {
  known = null;
}

/** Checks boards found on a page (careers links, embedded widgets) and adds the real ones. */
export async function learnBoardRefs(
  refs: Omit<BoardRef, "name">[],
  origin: string,
  name?: string,
): Promise<{ added: number; boards: { provider: string; token: string; name: string; jobCount: number }[] }> {
  const { verifyBoard } = await import("./detect");
  const keys = await knownKeys();
  const fresh = refs.filter((r) => !keys.has(boardKey(r))).slice(0, 8);
  const verified = (await Promise.all(fresh.map((r) => verifyBoard({ ...r, name })))).filter(
    (b): b is NonNullable<typeof b> => Boolean(b),
  );
  for (const b of verified) {
    await db
      .insert(companyBoards)
      .values({
        provider: b.provider,
        token: b.token,
        name: b.name,
        host: b.host ?? null,
        site: b.site ?? "",
        careersUrl: b.careersUrl,
        jobCount: b.jobCount,
        origin,
      })
      .onConflictDoNothing();
    keys.add(boardKey(b));
  }
  return { added: verified.length, boards: verified.map((b) => ({ provider: b.provider, token: b.token, name: b.name, jobCount: b.jobCount })) };
}
