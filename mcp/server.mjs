#!/usr/bin/env node
// Job Finder MCP server: lets an AI agent (Claude Code, Claude Desktop, any MCP
// client) use Job Finder's local API as tools: search and triage found jobs,
// send jobs it grabbed in the browser, learn company boards, run searches, and
// answer application forms from the owner's saved answers.
//
// No dependencies: it speaks MCP (JSON-RPC 2.0, one message per line) over
// stdio and calls http://127.0.0.1:3737 (or JOB_FINDER_URL).
//
//   claude mcp add job-finder -- node /path/to/Job-Finder/mcp/server.mjs
//
// It never submits an application; the person reviews and presses Submit.

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const BASE = (process.env.JOB_FINDER_URL || "http://127.0.0.1:3737").replace(/\/$/, "");
const VERSION = "0.3.0";
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

// ------------------------------------------------------------------ helpers

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(180_000),
    });
  } catch (e) {
    throw new Error(`Job Finder isn't reachable at ${BASE} (${e.message}). Start it with "Start Job Finder.command".`);
  }
  const type = res.headers.get("content-type") || "";
  const data = type.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(typeof data === "object" && data?.error ? data.error : `Job Finder said ${res.status}`);
  return data;
}

function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Trims big found-job rows so lists stay readable for the model. */
function slimFound(j) {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    state: j.state,
    workplace: j.workplace,
    jobType: j.jobType,
    level: j.level,
    industry: j.industry,
    roleType: j.roleType,
    visa: j.visa,
    visaNote: j.visaNote,
    h1bApprovals: j.h1bApprovals ?? undefined,
    salary: j.salary,
    score: j.score,
    keywords: j.reasons?.keywords,
    yearsAsked: j.reasons?.experienceYears,
    postedAt: j.postedAt,
    status: j.status,
    source: j.provider,
    url: j.url,
    applyUrl: j.applyUrl,
    savedJobId: j.jobId,
  };
}

/** The PDF routes look jobs up by URL; turn a found job id into its URL. */
async function targetQuery(a) {
  let url = a.url;
  if (!url && !a.jobId && a.foundId) {
    const f = await call("GET", `/api/found/${encodeURIComponent(a.foundId)}`);
    url = f.applyUrl || f.url;
  }
  return query({ url, jobId: a.jobId, resumeId: a.resumeId });
}

async function savePdf(path, fallbackName) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(180_000) }).catch((e) => {
    throw new Error(`Job Finder isn't reachable at ${BASE} (${e.message}).`);
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Job Finder said ${res.status}`);
  }
  const name = (res.headers.get("x-file-name") || fallbackName).replace(/[^\w.\- ]+/g, "_");
  const dir = join(tmpdir(), "job-finder");
  await mkdir(dir, { recursive: true });
  const file = join(dir, name);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return { path: file, name };
}

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const strList = (description) => ({ type: "array", items: { type: "string" }, description });
const jobTarget = {
  url: str("The posting or application URL (Job Finder matches it to a saved or found job)."),
  jobId: str("A My jobs id."),
  foundId: str("A found job id."),
};

// -------------------------------------------------------------------- tools

const TOOLS = [
  {
    name: "job_finder_status",
    description: "Checks that Job Finder is running and whether its AI and application answers are set up.",
    inputSchema: { type: "object", properties: {} },
    run: () => call("GET", "/api/ext/status"),
  },
  {
    name: "search_found_jobs",
    description:
      "Lists jobs Job Finder found (company boards, Simplify lists, LinkedIn/Handshake grabs, careers pages), best match first. Same filters as the Found jobs page. Use facets=true for counts per filter option.",
    inputSchema: {
      type: "object",
      properties: {
        q: str("Words to look for in title, company or description."),
        status: str("new (default), saved, dismissed or all."),
        visa: str(
          "One of: friendly (sponsors, open to OPT/CPT, or a known H-1B sponsor that doesn't rule it out), nored (hides 'no sponsorship' and 'US citizens only'), sponsors, h1b (known H-1B sponsors), red (only red flags).",
        ),
        industry: strList(
          "Industry ids: quant, finance, fintech, insurance, consulting, tech, hardware, healthcare, aerospace, government, education, energy, consumer, media, manufacturing, realestate, transport, telecom, legal, nonprofit, other.",
        ),
        role: strList(
          "Role ids: data-science, analytics, quant, finance, consulting, economics, software, product, risk, accounting, operations, marketing, hardware, other.",
        ),
        level: strList("internship, entry or other."),
        type: strList("internship, full_time, part_time, contract."),
        work: strList("remote, hybrid, onsite."),
        state: strList("US state codes like NY, IL, CA, or Remote."),
        posted: { type: "number", description: "Posted within this many days (1, 3, 7, 14, 30)." },
        source: strList("greenhouse, lever, ashby, workday, smartrecruiters, simplify, linkedin, handshake, web."),
        years: { type: "number", description: "Hide jobs asking for more than this many years of experience." },
        pay: { type: "boolean", description: "Only jobs that show pay." },
        min: { type: "number", description: "Minimum match score (0-100)." },
        sort: str("score (default), newest (found most recently), posted or deadline."),
        limit: { type: "number", description: "How many (default 25, up to 200)." },
        offset: { type: "number" },
        facets: { type: "boolean", description: "Include counts per filter option." },
      },
    },
    run: async (a) => {
      const data = await call("GET", `/api/found${query({ ...a, pay: a.pay ? 1 : undefined, limit: a.limit ?? 25, facets: a.facets ? 1 : undefined })}`);
      return { total: data.total, count: data.count, jobs: data.jobs.map(slimFound), facets: data.facets };
    },
  },
  {
    name: "get_found_job",
    description: "Full details of one found job, including the description.",
    inputSchema: { type: "object", properties: { id: str("Found job id.") }, required: ["id"] },
    run: (a) => call("GET", `/api/found/${encodeURIComponent(a.id)}`),
  },
  {
    name: "save_found_job",
    description: "Saves a found job to My jobs (status New) so it shows up in the Apply queue.",
    inputSchema: { type: "object", properties: { id: str("Found job id.") }, required: ["id"] },
    run: (a) => call("POST", `/api/found/${encodeURIComponent(a.id)}/save`),
  },
  {
    name: "dismiss_found_job",
    description: "Hides a found job (status dismissed). Use restore=true to bring it back.",
    inputSchema: { type: "object", properties: { id: str("Found job id."), restore: { type: "boolean" } }, required: ["id"] },
    run: (a) => call("PATCH", `/api/found/${encodeURIComponent(a.id)}`, { status: a.restore ? "new" : "dismissed" }),
  },
  {
    name: "list_my_jobs",
    description: "Jobs the owner is tracking (My jobs). Filter by status: new, draft, applied, interview, offer, rejected, withdrawn.",
    inputSchema: { type: "object", properties: { status: strList("Statuses to include.") } },
    run: (a) => call("GET", `/api/jobs${query({ status: a.status })}`),
  },
  {
    name: "get_my_job",
    description: "One tracked job with notes, resume and description.",
    inputSchema: { type: "object", properties: { id: str("My jobs id.") }, required: ["id"] },
    run: (a) => call("GET", `/api/jobs/${encodeURIComponent(a.id)}`),
  },
  {
    name: "update_my_job",
    description: "Changes a tracked job's status and/or adds a note.",
    inputSchema: {
      type: "object",
      properties: { id: str("My jobs id."), status: str("new, draft, applied, interview, offer, rejected, withdrawn."), note: str("A note to add.") },
      required: ["id"],
    },
    run: (a) => call("PATCH", `/api/jobs/${encodeURIComponent(a.id)}`, { status: a.status, note: a.note }),
  },
  {
    name: "grab_linkedin",
    description:
      "Reads a LinkedIn job search and adds every job to Found jobs, with no scrolling: pass the search page's address-bar URL (searchUrl), or keywords + location. Job Finder reads LinkedIn's public job pages itself, one at a time with a pause (about 2 seconds a job), skips jobs it already has, and stops if LinkedIn asks it to slow down. No LinkedIn login is used. Takes about a minute per page of 25.",
    inputSchema: {
      type: "object",
      properties: {
        searchUrl: str("A LinkedIn job search URL, e.g. https://www.linkedin.com/jobs/search/?keywords=data%20analyst&location=Chicago&f_TPR=r604800"),
        keywords: str("Search words, when there's no searchUrl."),
        location: str("City, state or country (default United States)."),
        postedDays: { type: "number", description: "Only jobs posted in the last N days." },
        remote: { type: "boolean", description: "Remote jobs only." },
        ids: strList("LinkedIn job ids to read, e.g. from the page you're looking at."),
        pages: { type: "number", description: "Results pages of 25 to read (1 to 10, default 1)." },
        save: { type: "boolean", description: "Also save them to My jobs." },
      },
    },
    run: async (a) => {
      let run = await call("POST", "/api/grab/linkedin", { ...a, by: "agent", wait: 150 });
      const end = Date.now() + 10 * 60_000;
      while (run.state === "running" && Date.now() < end) {
        await new Promise((r) => setTimeout(r, 5000));
        run = await call("GET", `/api/grab/linkedin?id=${encodeURIComponent(run.id)}`);
      }
      return run;
    },
  },
  {
    name: "send_grabbed_jobs",
    description:
      "Adds jobs you read from a website (LinkedIn, Handshake, Indeed, a company careers page) to Found jobs. Job Finder scores them against the owner's searches, classifies industry/visa, dedupes, and learns company boards from applyUrl. Send up to 200 per call.",
    inputSchema: {
      type: "object",
      properties: {
        source: str("linkedin, handshake, indeed or web."),
        pageUrl: str("The page you read them from."),
        save: { type: "boolean", description: "Also save them to My jobs." },
        jobs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: str("Link to the posting (required)."),
              title: str("Job title (required)."),
              company: str("Company name (required)."),
              location: str(""),
              description: str("The full description text if you have it."),
              postedAt: str("ISO date, unix time, or text like '3 days ago'."),
              salary: str(""),
              jobType: str("Internship, Full-time…"),
              workplace: str("Remote, Hybrid, Onsite"),
              industry: str("The site's industry label, if shown."),
              workAuth: str("Any work-authorization / sponsorship line shown."),
              applyUrl: str("The company's own application link, if different."),
              deadline: str("Apply-by date, if shown."),
            },
            required: ["url", "title", "company"],
          },
        },
      },
      required: ["source", "jobs"],
    },
    run: (a) => call("POST", "/api/grab", { source: a.source, pageUrl: a.pageUrl, by: "agent", save: Boolean(a.save), jobs: a.jobs }),
  },
  {
    name: "grab_page",
    description:
      "Gives Job Finder a careers page so it can pull the openings itself: it reads JSON-LD job data, learns Greenhouse/Lever/Ashby/Workday/SmartRecruiters boards linked from the page (and scans them on every search run), and can ask the AI to list openings when nothing else works. Pass the page's html or text and its links when you have them; with only a url, Job Finder fetches it.",
    inputSchema: {
      type: "object",
      properties: {
        url: str("The careers page URL."),
        title: str("Page title."),
        html: str("Page HTML (optional, up to ~2 MB)."),
        text: str("Visible text (optional)."),
        links: {
          type: "array",
          description: "Links on the page: absolute URLs, or {text, href} objects.",
          items: { anyOf: [{ type: "string" }, { type: "object", properties: { text: { type: "string" }, href: { type: "string" } }, required: ["href"] }] },
        },
        company: str("Company name, if known."),
        useAi: { type: "boolean", description: "Allow the AI fallback (default true)." },
        save: { type: "boolean", description: "Also save the jobs to My jobs." },
      },
      required: ["url"],
    },
    run: (a) =>
      call("POST", "/api/grab/page", {
        ...a,
        links: a.links?.map((l) => (typeof l === "string" ? { text: "", href: l } : { text: l.text ?? "", href: l.href })),
        by: "agent",
      }),
  },
  {
    name: "find_company_boards",
    description: "Finds a company's public job board (Greenhouse, Lever, Ashby, Workday, SmartRecruiters) from its name or careers URL.",
    inputSchema: { type: "object", properties: { q: str("Company name or careers URL.") }, required: ["q"] },
    run: (a) => call("GET", `/api/companies${query({ q: a.q })}`),
  },
  {
    name: "add_company_board",
    description: "Adds a company board to Job Finder so every search run scans it. Use a board from find_company_boards.",
    inputSchema: {
      type: "object",
      properties: {
        provider: str("greenhouse, lever, ashby, workday or smartrecruiters."),
        token: str("The board token (e.g. 'stripe' for boards.greenhouse.io/stripe)."),
        name: str("Company name."),
        host: str("Workday host, e.g. acme.wd5.myworkdayjobs.com."),
        site: str("Workday site name."),
      },
      required: ["provider", "token"],
    },
    run: (a) => call("POST", "/api/companies", a),
  },
  {
    name: "list_searches",
    description: "The owner's saved searches with their latest run.",
    inputSchema: { type: "object", properties: {} },
    run: () => call("GET", "/api/searches"),
  },
  {
    name: "run_search",
    description: "Starts a saved search in the background (scans all its boards and lists). New jobs land in Found jobs in a few minutes.",
    inputSchema: { type: "object", properties: { id: str("Search id from list_searches.") }, required: ["id"] },
    run: (a) => call("POST", `/api/searches/${encodeURIComponent(a.id)}/run`),
  },
  {
    name: "apply_queue",
    description: "Saved jobs not applied to yet, with whether a tailored resume, cover letter and written answers are ready.",
    inputSchema: { type: "object", properties: {} },
    run: () => call("GET", "/api/apply/queue"),
  },
  {
    name: "get_apply_profile",
    description:
      "The owner's standard application answers: contact, education, work authorization (authorized to work, sponsorship now/later, visa status), preferred offices and work arrangement, availability, EEO choices and his own Q&A. Read it before answering any form.",
    inputSchema: { type: "object", properties: {} },
    run: () => call("GET", "/api/apply/profile"),
  },
  {
    name: "answer_application_fields",
    description:
      "Answers an application form's questions from the owner's profile. Send every field with its exact label and options; get back the value to enter for each, a confidence (high/medium/low) and a reason. Fields marked needsWriting are open questions: use write_application_answer for them. Never submit the form; the owner reviews and submits.",
    inputSchema: {
      type: "object",
      properties: {
        url: str("The application page URL."),
        pageTitle: str(""),
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: str("Your own id for the field."),
              label: str("The question text exactly as shown."),
              type: str("text, email, tel, url, number, date, month, textarea, select, radio, checkbox, combobox or file."),
              options: strList("Choices, for select/radio/checkbox/combobox."),
              required: { type: "boolean" },
              placeholder: str(""),
              maxLength: { type: "number" },
            },
            required: ["key", "label", "type"],
          },
        },
      },
      required: ["url", "fields"],
    },
    run: (a) => call("POST", "/api/apply/fill", a),
  },
  {
    name: "write_application_answer",
    description:
      "Drafts an answer to an open application question (why this company, a project you're proud of…) in the owner's voice, from the resume and the job. The answer is remembered for that job.",
    inputSchema: {
      type: "object",
      properties: { question: str("The question as shown."), maxLength: { type: "number", description: "Character limit, if any." }, ...jobTarget },
      required: ["question"],
    },
    run: (a) => call("POST", "/api/apply/answer", a),
  },
  {
    name: "get_resume_pdf",
    description:
      "Builds the resume PDF to upload for a job (its tailored resume, else the master) and saves it to a temporary file. Returns the file path, for a browser tool's file upload.",
    inputSchema: { type: "object", properties: { ...jobTarget, resumeId: str("A specific resume id.") } },
    run: async (a) => savePdf(`/api/apply/resume${await targetQuery(a)}`, "Resume.pdf"),
  },
  {
    name: "get_cover_letter_pdf",
    description: "Saves the job's latest cover letter as a PDF in a temporary file and returns the path.",
    inputSchema: { type: "object", properties: { ...jobTarget } },
    run: async (a) => savePdf(`/api/apply/cover-letter${await targetQuery({ ...a, resumeId: undefined })}`, "Cover letter.pdf"),
  },
  {
    name: "mark_applied",
    description: "Marks a job as applied (today) after the owner has submitted the application. Saves found jobs to My jobs first.",
    inputSchema: { type: "object", properties: { url: str("The posting or application URL."), jobId: str("A My jobs id.") } },
    run: (a) => call("POST", "/api/apply/applied", a),
  },
  {
    name: "auto_apply",
    description:
      "Queues applications for Auto apply. The Job Finder Helper extension in the owner's Chrome opens each form in a background tab, fills it from My answers, attaches the resume, and submits it or holds it, following the owner's Auto apply settings (default: submit only when every answer came from My answers; anything guessed or AI-written waits for the owner's OK). One call per batch; then check progress with auto_apply_status. Jobs already applied to, already queued, or with only a LinkedIn/Handshake link are skipped with a reason.",
    inputSchema: {
      type: "object",
      properties: {
        foundIds: strList("Found job ids (from search_found_jobs)."),
        jobIds: strList("My jobs ids (from list_my_jobs or apply_queue)."),
        urls: strList("Application page URLs."),
      },
    },
    run: (a) => call("POST", "/api/apply/auto", { ...a, by: "agent" }),
  },
  {
    name: "auto_apply_status",
    description:
      "Auto apply's applications with their status (queued, running, submitting, held = waiting for the owner's OK, needs_you, submitted, failed), a summary, what only the owner can do (needs), answers to check (checks), plus whether the browser helper is running and the settings. Use batchId from auto_apply to follow one batch.",
    inputSchema: {
      type: "object",
      properties: {
        batchId: str("Only this batch."),
        status: str("Comma-separated statuses, e.g. held,needs_you."),
        limit: { type: "number", description: "Default 50." },
      },
    },
    run: async (a) => {
      const r = await call("GET", `/api/apply/auto${query({ batch: a.batchId, status: a.status, limit: a.limit ?? 50 })}`);
      return {
        counts: r.counts,
        helper: r.helper,
        ai: r.ai,
        settings: r.settings,
        applications: r.tasks.map((t) => ({ id: t.id, title: t.title, company: t.company, status: t.status, summary: t.summary, needs: t.needs, checks: t.checks, url: t.url, updatedAt: t.updatedAt })),
      };
    },
  },
  {
    name: "auto_apply_action",
    description:
      "Acts on one Auto apply application: retry (try again), cancel (a queued one), remove (from the list), or submitted (the owner sent it himself; marks the job applied). Approving a held application is the owner's call: only use approve when the owner has said so in the conversation for that application.",
    inputSchema: {
      type: "object",
      properties: {
        id: str("The application id (from auto_apply_status)."),
        action: { type: "string", enum: ["approve", "retry", "cancel", "remove", "submitted"] },
      },
      required: ["id", "action"],
    },
    run: (a) => call("POST", `/api/apply/auto/${encodeURIComponent(a.id)}`, { action: a.action }),
  },
];

// --------------------------------------------------------------- protocol

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      reply(id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "job-finder", title: "Job Finder", version: VERSION },
        instructions:
          "Job Finder is the owner's local job-search dashboard. Use these tools to find and triage jobs, send jobs you read in the browser, learn company boards, and fill application forms from the owner's saved answers. To apply, prefer auto_apply: one call queues a batch and the owner's browser helper fills (and, per the owner's own settings, submits) each form, which costs far fewer steps than driving the browser yourself; follow it with auto_apply_status. Read the repo's CLAUDE.md for the full procedure. Never submit an application yourself, create an account, type a password or tick consent boxes for the owner; Auto apply does only what the owner switched on in its settings.",
      });
      return;
    }
    case "ping":
      if (isRequest) reply(id, {});
      return;
    case "tools/list":
      reply(id, { tools: TOOLS.map(({ run: _run, ...t }) => t) });
      return;
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${params?.name}`);
      try {
        const result = await tool.run(params.arguments || {});
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        reply(id, { content: [{ type: "text", text }], isError: false });
      } catch (e) {
        reply(id, { content: [{ type: "text", text: e.message || String(e) }], isError: true });
      }
      return;
    }
    default:
      if (method?.startsWith("notifications/")) return; // initialized, cancelled…
      if (isRequest) fail(id, -32601, `Method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return fail(null, -32700, "Parse error");
  }
  for (const m of Array.isArray(msg) ? msg : [msg]) void handle(m);
});
rl.on("close", () => process.exit(0));
