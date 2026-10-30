import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

/** One stored setting (key/value in the settings table). */
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  return row[0]?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}
