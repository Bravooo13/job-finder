#!/usr/bin/env node
// Job Finder MCP server: gives an AI agent (Claude Code, Claude Desktop, any MCP
// client) the same actions the Job Finder assistant uses inside the app: find and
// triage jobs, ask the specialist agents, make resume versions and cover letters,
// queue Auto apply, track jobs and change settings.
//
// The tool list comes from the running app (GET /api/actions), so a new action
// shows up here by itself. Each call runs through Job Finder's permissions
// (Settings → What AI may do): allowed actions run, "Ask me first" ones wait in
// the owner's Waiting for you list, "Never" ones are refused, and everything is
// in the activity log.
//
// No dependencies: it speaks MCP (JSON-RPC 2.0, one message per line) over
// stdio and calls http://127.0.0.1:3737 (or JOB_FINDER_URL).
//
//   claude mcp add job-finder -- node /path/to/Job-Finder/mcp/server.mjs

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const BASE = (process.env.JOB_FINDER_URL || "http://127.0.0.1:3737").replace(/\/$/, "");
const VERSION = "0.4.0";
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const CACHE_DIR = join(tmpdir(), "job-finder");
const CACHE = join(CACHE_DIR, "mcp-tools.json");

let clientName = "MCP";

// ------------------------------------------------------------------ helpers

const unreachable = (e) => new Error(`Job Finder isn't reachable at ${BASE} (${e.message}). Start it with "Start Job Finder.command".`);

async function request(method, path, body) {
  try {
    return await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        "x-job-finder-actor": "outside",
        "x-job-finder-client": clientName,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(300_000),
    });
  } catch (e) {
    throw unreachable(e);
  }
}

async function call(method, path, body) {
  const res = await request(method, path, body);
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
  const res = await request("GET", path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Job Finder said ${res.status}`);
  }
  const name = (res.headers.get("x-file-name") || fallbackName).replace(/[^\w.\- ]+/g, "_");
  await mkdir(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, name);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return { path: file, name };
}

const str = (description) => ({ type: "string", description });
const jobTarget = {
  url: str("The posting or application URL (Job Finder matches it to a saved or found job)."),
  jobId: str("A My jobs id."),
  foundId: str("A found job id."),
};

// ------------------------------------------------------- local-only tools
// Files can't travel through the JSON actions, so these two save a PDF here.

const LOCAL = [
  {
    name: "get_resume_pdf",
    description:
      "Builds the resume PDF to upload for a job and saves it to a temporary file: the resume tailored for the job, else the owner's version for the job's field (e.g. a Data engineering version for a data engineering job), else the PDF he uploaded, else his master resume. Returns the file path, for a browser tool's file upload.",
    inputSchema: { type: "object", properties: { ...jobTarget, resumeId: str("A specific resume id.") } },
    run: async (a) => savePdf(`/api/apply/resume${await targetQuery(a)}`, "Resume.pdf"),
  },
  {
    name: "get_cover_letter_pdf",
    description: "Saves the job's latest cover letter as a PDF in a temporary file and returns the path. Write one first with write_cover_letter.",
    inputSchema: { type: "object", properties: { ...jobTarget } },
    run: async (a) => savePdf(`/api/apply/cover-letter${await targetQuery({ ...a, resumeId: undefined })}`, "Cover letter.pdf"),
  },
];

// ---------------------------------------------------- tools from the app

const LEVEL_NOTE = {
  ask: " [Asks the owner first: the call puts it in his Waiting for you list and returns a request id.]",
  never: "",
  allow: "",
};

let remote = null; // [{ name, description, inputSchema, level }]
let signature = "";

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE, "utf8"));
  } catch {
    return null;
  }
}

/** Fetches the action list from the running app (and remembers it for when the app is closed). */
async function loadActions() {
  const data = await call("GET", "/api/actions");
  const list = data.actions
    .filter((a) => a.level !== "never") // turned off for AIs: not offered at all
    .map((a) => ({ name: a.name, description: a.description + (LEVEL_NOTE[a.level] ?? ""), inputSchema: a.inputSchema, level: a.level }));
  remote = list;
  await mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
  await writeFile(CACHE, JSON.stringify(list)).catch(() => {});
  return list;
}

async function toolList() {
  let list = remote;
  try {
    list = await loadActions();
  } catch {
    list = remote ?? (await readCache()) ?? [
      { name: "job_finder_status", description: "Checks that Job Finder is running and set up. (Job Finder isn't running right now; start it, then list tools again.)", inputSchema: { type: "object", properties: {} } },
    ];
  }
  signature = JSON.stringify(list.map((t) => [t.name, t.level]));
  return [...list.map(({ level: _level, ...t }) => t), ...LOCAL.map(({ run: _run, ...t }) => t)];
}

/** Tells the client when the list changed (the owner changed permissions, or the app started). */
let watching = false;
function watchForChanges() {
  if (watching) return;
  watching = true;
  setInterval(async () => {
    try {
      const list = await loadActions();
      const next = JSON.stringify(list.map((t) => [t.name, t.level]));
      if (signature && next !== signature) send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
      signature = next;
    } catch {
      // App closed; try again next time.
    }
  }, 60_000).unref();
}

async function runRemote(name, args) {
  const res = await request("POST", `/api/actions/${encodeURIComponent(name)}`, args || {});
  const data = await res.json().catch(() => ({ error: `Job Finder said ${res.status}` }));
  if (data.status === "waiting") return { text: `Waiting for the owner: ${data.message}`, isError: false };
  if (!res.ok || data.status !== "done") return { text: data.error || data.message || `Job Finder said ${res.status}`, isError: true };
  let result = data.result;
  // LinkedIn grabs take about a minute a page: follow a long one to the end.
  if (name === "grab_linkedin" && result?.state === "running") {
    const end = Date.now() + 10 * 60_000;
    while (result?.state === "running" && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 5000));
      const r = await call("POST", "/api/actions/grab_linkedin_status", { id: result.id });
      result = r.result;
    }
  }
  return { text: typeof result === "string" ? result : JSON.stringify(result, null, 2), isError: false };
}

// --------------------------------------------------------------- protocol

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

const INSTRUCTIONS =
  "Job Finder is the owner's local job-search dashboard. These tools are its actions, the same ones its in-app Job Finder assistant uses: find and triage jobs (search_found_jobs, grab_linkedin, grab_page, save_found_job…), ask its specialist agents (ask_agent: resume tailor, cover letter writer, job fit reviewer…), make resume versions and cover letters, queue applications with auto_apply (the owner's browser helper fills each form and submits or holds it by his settings), and track jobs. " +
  "The owner sets what AIs may do in Settings → What AI may do. A tool that answers 'Waiting for the owner' put the step in his Waiting for you list: don't retry it; tell him, and check list_waiting later. A refused tool is turned off for AIs. Everything you do appears in his activity log. " +
  "Start with job_finder_status. Never type passwords, create accounts or tick consent boxes for the owner yourself. Read the repo's CLAUDE.md for the full procedure.";

async function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      if (params?.clientInfo?.name) clientName = String(params.clientInfo.name).replace(/[^\w .@/-]/g, "").slice(0, 60) || "MCP";
      reply(id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: "job-finder", title: "Job Finder", version: VERSION },
        instructions: INSTRUCTIONS,
      });
      watchForChanges();
      return;
    }
    case "ping":
      if (isRequest) reply(id, {});
      return;
    case "tools/list":
      reply(id, { tools: await toolList() });
      return;
    case "tools/call": {
      const name = params?.name;
      const local = LOCAL.find((t) => t.name === name);
      try {
        if (local) {
          const result = await local.run(params.arguments || {});
          reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false });
        } else {
          const { text, isError } = await runRemote(name, params?.arguments);
          reply(id, { content: [{ type: "text", text }], isError });
        }
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
