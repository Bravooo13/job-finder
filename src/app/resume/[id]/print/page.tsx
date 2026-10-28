import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/profile/PrintToolbar";
import { RESUME_SECTIONS } from "@/lib/constants";
import type { ResumeEntry } from "@/lib/db/schema";
import { getResume } from "@/lib/resumes/queries";
import { dateRange } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const resume = await getResume((await params).id);
  return { title: resume?.fullName || resume?.title || "Resume" };
}

function Description({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-•*]\s*/.test(l));
  if (bullets.length === lines.length) {
    return (
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {lines.map((l, i) => (
          <li key={i}>{l.replace(/^[-•*]\s*/, "")}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="mt-1 space-y-1">
      {lines.map((l, i) =>
        /^[-•*]\s*/.test(l) ? (
          <p key={i} className="pl-4 -indent-3">• {l.replace(/^[-•*]\s*/, "")}</p>
        ) : (
          <p key={i}>{l}</p>
        ),
      )}
    </div>
  );
}

function Entry({ entry }: { entry: ResumeEntry }) {
  const dates = dateRange(entry.startDate, entry.endDate, entry.current);
  return (
    <div className="break-inside-avoid">
      <div className="flex items-baseline justify-between gap-4">
        <p>
          <span className="font-semibold">{entry.title}</span>
          {entry.organization ? <span>, {entry.organization}</span> : null}
        </p>
        <p className="shrink-0 text-[0.8rem] text-neutral-600">{dates}</p>
      </div>
      {entry.location || entry.url ? (
        <p className="text-[0.8rem] text-neutral-600">
          {[entry.location, entry.url?.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {entry.description ? <Description text={entry.description} /> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-[0.8rem] font-bold tracking-[0.12em] text-neutral-800 uppercase">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const PRINT_ORDER = ["experience", "education", "project", "skills", "certification", "volunteer", "award"];

export default async function PrintResumePage({ params }: { params: Promise<{ id: string }> }) {
  const resume = await getResume((await params).id);
  if (!resume) notFound();

  const contact = [
    resume.email,
    resume.phone,
    resume.location,
    resume.website,
    resume.linkedin,
    resume.github,
  ]
    .filter(Boolean)
    .map((c) => c!.replace(/^https?:\/\/(www\.)?/, ""));

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <PrintToolbar backHref={`/profile/resumes/${resume.id}`} />
      <article className="mx-auto w-full max-w-[8.5in] bg-white px-[0.6in] py-[0.5in] text-[0.9rem] leading-snug text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="text-center">
          <h1 className="text-[1.7rem] font-bold tracking-tight">{resume.fullName || resume.title}</h1>
          {resume.headline ? <p className="mt-0.5 text-neutral-700">{resume.headline}</p> : null}
          {contact.length ? (
            <p className="mt-1 text-[0.8rem] text-neutral-600">{contact.join("  ·  ")}</p>
          ) : null}
        </header>

        {resume.summary ? (
          <Section title="Summary">
            <p>{resume.summary}</p>
          </Section>
        ) : null}

        {PRINT_ORDER.map((key) => {
          if (key === "skills") {
            return resume.skillGroups.length ? (
              <Section key={key} title="Skills">
                <div className="space-y-1">
                  {resume.skillGroups.map((g) => (
                    <p key={g.id}>
                      <span className="font-semibold">{g.name}: </span>
                      {g.skills.join(", ")}
                    </p>
                  ))}
                </div>
              </Section>
            ) : null;
          }
          const meta = RESUME_SECTIONS.find((s) => s.value === key)!;
          const entries = resume.entries.filter((e) => e.section === key);
          return entries.length ? (
            <Section key={key} title={meta.label}>
              {entries.map((e) => (
                <Entry key={e.id} entry={e} />
              ))}
            </Section>
          ) : null;
        })}
      </article>
    </div>
  );
}
