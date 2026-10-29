import "server-only";
import { findBoards, verifyBoard } from "@/lib/boards/detect";
import { PROVIDERS, type Provider } from "@/lib/boards/types";
import { filtersFromParams } from "@/lib/found/filters";
import { getFoundMany, listFound } from "@/lib/found/queries";
import { grabLinkedIn } from "@/lib/grab/linkedin";
import { grabPage } from "@/lib/grab/page";
import { saveGrabbed } from "@/lib/grab/save";
import { addCompanyBoard, runSearch, saveFoundJob, setFoundStatus } from "@/lib/search/actions";
import { listSearches } from "@/lib/search/queries";
import { CLAUDE_MODELS, type AiSettings } from "./models";
import { AiError, CLAUDE_URL, claudeError, type ChatMessage, type ChatResult } from "./providers";
import { getClaudeKey } from "./settings";

// The Job scout: Claude with tools that act on Job Finder itself, so it can
// search LinkedIn, company job boards and careers pages, then shortlist.

type Json = Record<string, unknown>;
interface Tool {
  name: string;
  description: string;
  input_schema: Json;
  status: (a: Json) => string;
  run: (a: Json) => Promise<unknown>;
}

const str = (description: string) => ({ type: "string", description });
const list = (description: string) => ({ type: "array", items: { type: "string" }, description });
const clip = (s: string | null | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : s ?? "");

function slim(j: Awaited<ReturnType<typeof listFound>>["rows"][number]) {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    workplace: j.workplace,
    jobType: j.jobType,
    level: j.level,
    industry: j.industry,
    role: j.roleType,
    visa: j.visa,
    visaNote: j.visaNote,
    h1bApprovals: j.h1bApprovals ?? undefined,
    salary: j.salary,
    score: j.score,
    yearsAsked: j.reasons?.experienceYears,
    postedAt: j.postedAt,
    source: j.provider,
    url: j.url,
    applyUrl: j.applyUrl,
    saved: Boolean(j.jobId),
  };
}

const TOOLS: Tool[] = [
  {
    name: "search_found_jobs",
    description:
      "Lists jobs already in Job Finder, best match first, with filters. visa: friendly | nored | sponsors | h1b | red. industry ids: quant, finance, fintech, insurance, consulting, tech, hardware, healthcare, aerospace, government, education, energy, consumer, media, manufacturing, realestate, transport, telecom, legal, nonprofit. role ids: data-science, analytics, quant, finance, consulting, economics, software, product, risk, accounting, operations, marketing. level: internship, entry. state: two-letter codes or Remote. posted: days. sort: score | newest | posted.",
    input_schema: {
      type: "object",
      properties: {
        q: str("Words in the title, company or description."),
        visa: str("One visa filter."),
        industry: list("Industry ids."),
        role: list("Role ids."),
        level: list("internship and/or entry."),
        state: list("State codes or Remote."),
        source: list("linkedin, greenhouse, lever, ashby, workday, smartrecruiters, simplify, handshake, web."),
        posted: { type: "number" },
        min: { type: "number", description: "Minimum match score." },
        sort: str("score (default), newest or posted."),
        limit: { type: "number", description: "Default 15, at most 40." },
      },
    },
    status: (a) => `Looking through found jobs${a.q ? ` for “${a.q}”` : ""}`,
    run: async (a) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(a)) if (v !== undefined && v !== null && v !== "") p.set(k, Array.isArray(v) ? v.join(",") : String(v));
      p.set("limit", String(Math.min(40, Number(a.limit) || 15)));
      const { rows, total } = await listFound(filtersFromParams(p));
      return { total, jobs: rows.map(slim) };
    },
  },
  {
    name: "get_found_job",
    description: "One found job with its description.",
    input_schema: { type: "object", properties: { id: str("Found job id.") }, required: ["id"] },
    status: () => "Reading a job",
    run: async (a) => {
      const [r] = await getFoundMany([String(a.id)]);
      if (!r) return { error: "Not found" };
      return { ...slim({ ...r.found, h1bApprovals: r.h1bApprovals, h1bYear: r.h1bYear } as never), description: clip(r.found.description, 5000) };
    },
  },
  {
    name: "search_linkedin",
    description:
      "Searches LinkedIn's public job search and adds the jobs to Job Finder (classified and scored). Takes about a minute per page of 25, so ask for 1 to 3 pages. Afterwards use search_found_jobs with source ['linkedin'] and sort 'newest' to see them.",
    input_schema: {
      type: "object",
      properties: {
        keywords: str("What to search, e.g. 'data analyst intern'."),
        location: str("City, state, country. Default United States."),
        remote: { type: "boolean", description: "Remote jobs only." },
        postedDays: { type: "number", description: "Posted in the last N days (default 7)." },
        pages: { type: "number", description: "1 to 3." },
      },
      required: ["keywords"],
    },
    status: (a) => `Searching LinkedIn: ${a.keywords}${a.remote ? ", remote" : a.location ? `, ${a.location}` : ""}`,
    run: async (a) => {
      const r = await grabLinkedIn({
        keywords: String(a.keywords),
        location: a.location ? String(a.location) : undefined,
        remote: Boolean(a.remote),
        postedDays: Number(a.postedDays) || 7,
        pages: Math.max(1, Math.min(3, Number(a.pages) || 1)),
        by: "agent",
      });
      return r;
    },
  },
  {
    name: "find_company_boards",
    description: "Finds a company's public job board (Greenhouse, Lever, Ashby, Workday, SmartRecruiters) from its name or careers URL. Check the returned name is really that company.",
    input_schema: { type: "object", properties: { q: str("Company name or careers URL.") }, required: ["q"] },
    status: (a) => `Looking for ${a.q}'s job board`,
    run: async (a) => ({ boards: (await findBoards(String(a.q))).slice(0, 5) }),
  },
  {
    name: "add_company_board",
    description: "Adds a company job board so every search scans it from now on.",
    input_schema: {
      type: "object",
      properties: { provider: str(PROVIDERS.join(", ")), token: str("Board token."), name: str("Company name."), host: str("Workday host."), site: str("Workday site.") },
      required: ["provider", "token", "name"],
    },
    status: (a) => `Adding ${a.name}'s job board`,
    run: async (a) => {
      if (!PROVIDERS.includes(a.provider as Provider)) return { error: "Unknown provider" };
      const board = await verifyBoard({ provider: a.provider as Provider, token: String(a.token), name: String(a.name), host: a.host as string | undefined, site: a.site as string | undefined });
      if (!board) return { error: "That board doesn't exist" };
      board.name = String(a.name);
      const r = await addCompanyBoard(board);
      return r.ok ? { added: board.name, jobs: board.jobCount } : { error: r.error };
    },
  },
  {
    name: "grab_careers_page",
    description: "Reads a company careers page: adds the jobs it lists (from its job data) and learns its job board if it links to one.",
    input_schema: { type: "object", properties: { url: str("Careers page URL."), company: str("Company name.") }, required: ["url"] },
    status: (a) => `Reading ${a.url}`,
    run: async (a) => {
      const page = await grabPage({ url: String(a.url), company: a.company ? String(a.company) : undefined, useAi: false });
      const saved = page.jobs.length ? await saveGrabbed({ source: "web", pageUrl: String(a.url), by: "agent", save: false, jobs: page.jobs.slice(0, 200) }) : null;
      return { jobsFound: page.jobs.length, added: saved?.added ?? 0, boards: page.boards, boardsAdded: page.boardsAdded };
    },
  },
  {
    name: "list_saved_searches",
    description: "The owner's saved searches (titles, places, schedule) and their last run.",
    input_schema: { type: "object", properties: {} },
    status: () => "Checking your saved searches",
    run: async () =>
      (await listSearches()).map((s) => ({
        id: s.id,
        name: s.name,
        titles: s.titles,
        locations: s.locations,
        levels: s.levels,
        running: s.running,
        lastRun: s.lastRun ? { status: s.lastRun.status, newJobs: s.lastRun.newJobs, finishedAt: s.lastRun.finishedAt } : null,
      })),
  },
  {
    name: "run_saved_search",
    description: "Starts a saved search in the background (thousands of company boards plus LinkedIn). New jobs arrive over several minutes.",
    input_schema: { type: "object", properties: { id: str("Saved search id.") }, required: ["id"] },
    status: () => "Starting a saved search",
    run: async (a) => runSearch(String(a.id)),
  },
  {
    name: "save_found_job",
    description: "Saves a found job to My jobs (the Apply queue). Do this for jobs the owner asked you to save or clearly wants.",
    input_schema: { type: "object", properties: { id: str("Found job id.") }, required: ["id"] },
    status: () => "Saving a job to My jobs",
    run: async (a) => saveFoundJob(String(a.id)),
  },
  {
    name: "dismiss_found_job",
    description: "Hides a found job. Only when the owner asked you to clear out misfits.",
    input_schema: { type: "object", properties: { id: str("Found job id.") }, required: ["id"] },
    status: () => "Hiding a job",
    run: async (a) => setFoundStatus([String(a.id)], "dismissed"),
  },
];

interface Block {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Json;
}

/** Runs the scout: Claude calls tools until it has an answer. Streams its words and a line per step. */
export async function runScout(
  req: { system: string; messages: ChatMessage[]; maxTokens: number; signal?: AbortSignal; onText: (t: string) => void },
  s: AiSettings,
): Promise<ChatResult> {
  if (s.provider !== "claude") throw new AiError("The Job scout needs Claude, because it uses tools. Pick Claude in Settings.");
  const key = await getClaudeKey();
  if (!key) throw new AiError("Add your Claude API key in Settings first.");
  const model = s.claudeModel || CLAUDE_MODELS[0].id;
  const tools: Json[] = TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
  let webSearch = true;
  const messages: { role: "user" | "assistant"; content: unknown }[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
  let actualModel = model;
  let stopReason: string | null = null;

  for (let round = 0; round < 14; round++) {
    if (req.signal?.aborted) break;
    const body = {
      model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages,
      tools: webSearch ? [...tools, { type: "web_search_20250305", name: "web_search", max_uses: 5 }] : tools,
    };
    let res: Response;
    try {
      res = await fetch(`${CLAUDE_URL()}/v1/messages`, {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (e) {
      if (req.signal?.aborted) throw e;
      throw new AiError("Couldn't reach Claude. Check your internet connection.");
    }
    if (!res.ok) {
      const text = await res.text();
      // Web search isn't on for every API key; carry on without it.
      if (webSearch && res.status === 400 && /web_search|server tool/i.test(text)) {
        webSearch = false;
        round--;
        continue;
      }
      throw claudeError(res.status, text, model);
    }
    const data = (await res.json()) as { content: Block[]; stop_reason: string; model: string };
    actualModel = data.model ?? model;
    stopReason = data.stop_reason;
    for (const b of data.content) {
      if (b.type === "text" && b.text) req.onText(b.text);
      if (b.type === "server_tool_use" && b.name === "web_search") req.onText(`\n\n_Searching the web: ${String(b.input?.query ?? "")}_\n\n`);
    }
    messages.push({ role: "assistant", content: data.content });
    if (data.stop_reason !== "tool_use") break;

    const results: Json[] = [];
    for (const b of data.content.filter((x) => x.type === "tool_use")) {
      const tool = TOOLS.find((t) => t.name === b.name);
      if (!tool) {
        results.push({ type: "tool_result", tool_use_id: b.id, content: "Unknown tool", is_error: true });
        continue;
      }
      req.onText(`\n\n_${tool.status(b.input ?? {})}…_\n\n`);
      try {
        const out = await tool.run(b.input ?? {});
        results.push({ type: "tool_result", tool_use_id: b.id, content: clip(JSON.stringify(out), 14_000) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: b.id, content: e instanceof Error ? e.message : String(e), is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { model: actualModel, stopReason };
}
