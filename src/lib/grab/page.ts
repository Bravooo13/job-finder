import "server-only";
import { z } from "zod";
import { learnBoardRefs } from "@/lib/boards/learn";
import { boardsInText } from "@/lib/boards/detect";
import { AiError, runChat } from "@/lib/ai/providers";
import { getAiStatus } from "@/lib/ai/settings";
import { jobPostingsFromHtml, pageTextAndLinks } from "./html";
import type { GrabJob } from "./save";

export { jobPostingsFromHtml, pageTextAndLinks };

// Any careers page: read schema.org JobPosting data, spot the company's job
// board (Greenhouse, Lever, Ashby, Workday, SmartRecruiters) so searches cover
// it from now on, and as a last resort ask the AI to list the jobs on the page.
// Callers send the page's HTML (the extension, an agent driving a browser); with
// only a URL, Job Finder fetches the page itself.

export const pageSchema = z.object({
  url: z.string().url().max(2000),
  title: z.string().max(500).optional(),
  html: z.string().max(3_000_000).optional(),
  text: z.string().max(200_000).optional(),
  links: z.array(z.object({ text: z.string().max(300), href: z.string().max(2000) })).max(800).optional(),
  company: z.string().max(200).optional(),
  useAi: z.boolean().default(true),
});

export type PageInput = z.infer<typeof pageSchema>;

const aiJobsSchema = z.array(
  z.object({
    title: z.string().min(1),
    url: z.string().optional(),
    location: z.string().optional(),
    company: z.string().optional(),
  }),
);

/** Asks the AI to list the job openings on a careers page that has no structured data. */
async function jobsWithAi(input: PageInput): Promise<GrabJob[]> {
  const links = (input.links ?? []).filter((l) => l.text.trim() && /^https?:/.test(l.href)).slice(0, 400);
  const text = (input.text ?? "").slice(0, 30_000);
  if (!text && !links.length) return [];
  let reply = "";
  await runChat({
    system:
      "You read careers pages. List every job opening on the page as JSON: an array of {title, url, location, company}. Use the exact link for each job from the links list when there is one. Only real openings (not departments, blog posts or navigation). Reply with the JSON array only.",
    messages: [
      {
        role: "user",
        content: `Page: ${input.url}\nTitle: ${input.title ?? ""}\nCompany: ${input.company ?? ""}\n\nLinks (text -> url):\n${links.map((l) => `${l.text.trim().slice(0, 120)} -> ${l.href}`).join("\n")}\n\nPage text:\n${text}`,
      },
    ],
    maxTokens: 4000,
    feature: "grab-page",
    onText: (t) => (reply += t),
  });
  const json = /\[[\s\S]*\]/.exec(reply)?.[0];
  if (!json) return [];
  const parsed = aiJobsSchema.safeParse(JSON.parse(json));
  if (!parsed.success) return [];
  return parsed.data.slice(0, 150).map((j) => ({
    url: j.url && /^https?:/.test(j.url) ? j.url : `${input.url}#${encodeURIComponent(j.title)}`,
    title: j.title,
    company: j.company || input.company || "",
    location: j.location,
  }));
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd]|.*\.local$|.*\.internal$)/i;

/** Fetches a public page when the caller only sent its URL. */
async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || PRIVATE_HOST.test(u.hostname)) return null;
  try {
    const res = await fetch(u, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? "html")) return null;
    const html = (await res.text()).slice(0, 3_000_000);
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

export async function grabPage(input: PageInput) {
  if (!input.html && !input.text) {
    const page = await fetchPage(input.url);
    if (page) {
      const { text, links } = pageTextAndLinks(page.html, page.finalUrl);
      input = { ...input, html: page.html, text, links: [...(input.links ?? []), ...links] };
    }
  }
  const html = input.html ?? "";
  const jobs = html ? jobPostingsFromHtml(html, input.url) : [];
  const refs = boardsInText(`${input.url}\n${html.slice(0, 2_000_000)}\n${(input.links ?? []).map((l) => l.href).join("\n")}`);
  const learned = refs.length ? await learnBoardRefs(refs, "web", input.company) : { added: 0, boards: [] };

  let usedAi = false;
  let aiError: string | null = null;
  if (!jobs.length && input.useAi && !learned.boards.length) {
    const status = await getAiStatus();
    if (status.ready) {
      try {
        jobs.push(...(await jobsWithAi(input)));
        usedAi = true;
      } catch (error) {
        aiError = error instanceof AiError ? error.message : String(error);
      }
    }
  }
  return { jobs, boards: learned.boards, boardsAdded: learned.added, usedAi, aiError };
}
