import "server-only";
import { db } from "@/lib/db";
import { resumeEntries, resumeSkillGroups, resumes } from "@/lib/db/schema";
import type { ParsedResume } from "./parse";

const emptyToNull = (v: string) => (v.trim() ? v.trim() : null);

/** Saves a parsed resume as a new profile. The first one becomes the master. */
export async function saveParsedResume(parsed: ParsedResume, title: string, sourceText: string): Promise<string> {
  return db.transaction(async (tx) => {
    const any = await tx.select({ id: resumes.id }).from(resumes).limit(1);
    const [created] = await tx
      .insert(resumes)
      .values({
        title: title.slice(0, 150),
        isMaster: any.length === 0,
        fullName: emptyToNull(parsed.fullName),
        headline: emptyToNull(parsed.headline),
        email: emptyToNull(parsed.email),
        phone: emptyToNull(parsed.phone),
        location: emptyToNull(parsed.location),
        website: emptyToNull(parsed.website),
        linkedin: emptyToNull(parsed.linkedin),
        github: emptyToNull(parsed.github),
        summary: emptyToNull(parsed.summary),
        sourceText: sourceText.slice(0, 50_000),
      })
      .returning({ id: resumes.id });

    const order: Record<string, number> = {};
    if (parsed.entries.length) {
      await tx.insert(resumeEntries).values(
        parsed.entries.map((e) => {
          order[e.section] = (order[e.section] ?? -1) + 1;
          return {
            resumeId: created.id,
            section: e.section,
            title: e.title.slice(0, 200),
            organization: emptyToNull(e.organization.slice(0, 200)),
            location: emptyToNull(e.location.slice(0, 150)),
            startDate: emptyToNull(e.startDate),
            endDate: e.current ? null : emptyToNull(e.endDate),
            current: e.current,
            url: emptyToNull(e.url),
            description: emptyToNull(e.description.slice(0, 10_000)),
            sortOrder: order[e.section],
          };
        }),
      );
    }
    if (parsed.skillGroups.length) {
      await tx.insert(resumeSkillGroups).values(
        parsed.skillGroups.map((g, i) => ({
          resumeId: created.id,
          name: g.name.slice(0, 80),
          skills: g.skills.slice(0, 60),
          sortOrder: i,
        })),
      );
    }
    return created.id;
  });
}
