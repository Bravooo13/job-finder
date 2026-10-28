import "server-only";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/job-finder.db";
const migrationsFolder = path.join(process.cwd(), "drizzle");

// Keep one connection across hot reloads.
const globalForDb = globalThis as unknown as {
  libsql?: Client;
  jobFinderMigratedTag?: string;
  jobFinderMigrating?: Promise<void>;
};

if (url.startsWith("file:")) {
  mkdirSync(path.dirname(path.resolve(url.slice("file:".length))), { recursive: true });
}

const client = globalForDb.libsql ?? createClient({ url });
globalForDb.libsql = client;

function latestMigrationTag(): string {
  try {
    const journal = JSON.parse(readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"));
    return journal.entries?.at(-1)?.tag ?? "";
  } catch {
    return "";
  }
}

// Apply new migrations before the first query, so updating the code is enough
// even while the app keeps running. Already-applied migrations are skipped.
function ready(): Promise<void> {
  const latest = latestMigrationTag();
  if (globalForDb.jobFinderMigratedTag !== latest || !globalForDb.jobFinderMigrating) {
    globalForDb.jobFinderMigratedTag = latest;
    globalForDb.jobFinderMigrating = (async () => {
      await client.execute("PRAGMA busy_timeout = 5000");
      await client.execute("PRAGMA foreign_keys = ON");
      await migrate(drizzle(client), { migrationsFolder });
    })();
  }
  return globalForDb.jobFinderMigrating;
}

const migrated = ready();

// Every query waits for the migrations above.
const GATED = new Set(["execute", "batch", "transaction", "executeMultiple"]);
const gatedClient = new Proxy(client, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value !== "function") return value;
    if (typeof prop === "string" && GATED.has(prop)) {
      return async (...args: unknown[]) => {
        await migrated;
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    }
    return value.bind(target);
  },
});

export const db = drizzle(gatedClient, { schema });
export { schema };
