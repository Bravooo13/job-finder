import "server-only";
import ashby from "./directory/ashby.json";
import greenhouse from "./directory/greenhouse.json";
import lever from "./directory/lever.json";
import workday from "./directory/workday.json";
import type { BoardRef } from "./types";

// Built-in list of public company job boards. Greenhouse, Lever and Ashby lists
// come from JobSync (MIT); the Workday list was checked by hand. Searches set
// to "all companies" read every board here plus the ones you add.

type Entry = { name: string; token: string; host?: string; site?: string };

let cache: BoardRef[] | null = null;

export function directoryBoards(): BoardRef[] {
  if (cache) return cache;
  cache = [
    ...(greenhouse as Entry[]).map((e) => ({ provider: "greenhouse" as const, name: e.name, token: e.token })),
    ...(lever as Entry[]).map((e) => ({ provider: "lever" as const, name: e.name, token: e.token, host: e.host })),
    ...(ashby as Entry[]).map((e) => ({ provider: "ashby" as const, name: e.name, token: e.token })),
    ...(workday as Entry[]).map((e) => ({
      provider: "workday" as const,
      name: e.name,
      token: e.token,
      host: e.host,
      site: e.site,
    })),
  ];
  return cache;
}

export function directoryCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of directoryBoards()) counts[b.provider] = (counts[b.provider] ?? 0) + 1;
  return counts;
}
