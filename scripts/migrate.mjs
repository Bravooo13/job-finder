// Creates the database file if needed and applies any new migrations.
// Runs automatically before `npm run dev` and `npm start`.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.DATABASE_URL ?? "file:./data/job-finder.db";

if (url.startsWith("file:")) {
  mkdirSync(dirname(resolve(url.slice("file:".length))), { recursive: true });
}

const client = createClient({ url });
await client.execute("PRAGMA foreign_keys = ON");
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
client.close();
console.log("Database is up to date.");
