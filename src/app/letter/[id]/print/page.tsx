import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/profile/PrintToolbar";
import { getCoverLetter } from "@/lib/cover-letters/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const letter = await getCoverLetter((await params).id);
  return { title: letter ? `Cover letter · ${letter.title}` : "Cover letter" };
}

export default async function PrintLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const letter = await getCoverLetter((await params).id);
  if (!letter) notFound();
  const r = letter.resume;
  const contact = [r?.email, r?.phone, r?.location].filter(Boolean);
  const paragraphs = letter.content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <PrintToolbar backHref={`/cover-letters/${letter.id}`} />
      <article className="mx-auto w-full max-w-[8.5in] bg-white px-[0.9in] py-[0.8in] font-serif text-[11.5pt] leading-[1.55] text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        {r?.fullName ? (
          <header className="mb-8">
            <p className="text-[15pt] font-semibold">{r.fullName}</p>
            {contact.length ? <p className="text-[10pt] text-neutral-600">{contact.join("  ·  ")}</p> : null}
          </header>
        ) : null}
        <p className="mb-6">{today}</p>
        <div className="space-y-4">
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
      </article>
    </div>
  );
}
