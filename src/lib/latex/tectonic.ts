import "server-only";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Tectonic is a small, self-contained LaTeX engine. Job Finder uses one you
// already have (Homebrew, PATH or TECTONIC_PATH), or downloads the official
// build into data/bin the first time you compile. LaTeX packages are fetched
// and cached by Tectonic on first use.

const BIN_DIR = path.join(process.cwd(), "data", "bin");
const APP_BIN = path.join(BIN_DIR, "tectonic");
const FALLBACK_VERSION = "0.15.0";
const COMPILE_TIMEOUT_MS = 240_000; // the first compile downloads packages

export interface TectonicInfo {
  installed: boolean;
  path?: string;
  version?: string;
  source?: "app" | "system";
  platformSupported: boolean;
  error?: string;
}

function targetTriple(): string | null {
  const { platform, arch } = process;
  if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  if (platform === "linux" && arch === "x64") return "x86_64-unknown-linux-musl";
  if (platform === "linux" && arch === "arm64") return "aarch64-unknown-linux-musl";
  return null;
}

interface RunResult {
  code: number | null;
  output: string;
  timedOut: boolean;
}

function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs: number; env?: NodeJS.ProcessEnv }): Promise<RunResult> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    const collect = (chunk: Buffer) => {
      if (output.length < 400_000) output += chunk.toString("utf8");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, output: output + String(error), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    });
  });
}

async function isExecutable(file: string) {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function candidates(): { file: string; source: "app" | "system" }[] {
  const list: { file: string; source: "app" | "system" }[] = [];
  if (process.env.TECTONIC_PATH) list.push({ file: process.env.TECTONIC_PATH, source: "system" });
  list.push({ file: APP_BIN, source: "app" });
  const dirs = [...(process.env.PATH ?? "").split(path.delimiter), "/opt/homebrew/bin", "/usr/local/bin"];
  for (const dir of dirs) if (dir) list.push({ file: path.join(dir, "tectonic"), source: "system" });
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.file) ? false : (seen.add(c.file), true)));
}

const globalForTex = globalThis as unknown as {
  jobFinderTectonic?: { info: TectonicInfo; at: number };
  jobFinderTectonicInstall?: Promise<TectonicInfo>;
  jobFinderTexQueue?: Promise<unknown>;
};

export async function tectonicStatus(fresh = false): Promise<TectonicInfo> {
  const cached = globalForTex.jobFinderTectonic;
  if (!fresh && cached && cached.info.installed && Date.now() - cached.at < 10 * 60_000) return cached.info;
  let lastError: string | undefined;
  for (const c of candidates()) {
    if (!(await isExecutable(c.file))) continue;
    const result = await run(c.file, ["--version"], { timeoutMs: 20_000 });
    if (result.code === 0) {
      const version = result.output.trim().split("\n")[0].replace(/^tectonic\s*/i, "");
      const info: TectonicInfo = { installed: true, path: c.file, version, source: c.source, platformSupported: true };
      globalForTex.jobFinderTectonic = { info, at: Date.now() };
      return info;
    }
    lastError = result.output.trim().slice(0, 600);
  }
  return { installed: false, platformSupported: Boolean(targetTriple()), error: lastError };
}

async function releaseFor(triple: string): Promise<{ url: string; version: string }> {
  try {
    const res = await fetch("https://api.github.com/repos/tectonic-typesetting/tectonic/releases?per_page=40", {
      headers: { accept: "application/vnd.github+json", "user-agent": "job-finder" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const releases = (await res.json()) as {
        tag_name: string;
        prerelease: boolean;
        draft: boolean;
        assets: { name: string; browser_download_url: string }[];
      }[];
      for (const r of releases) {
        if (r.prerelease || r.draft || !r.tag_name.startsWith("tectonic@")) continue;
        const asset = r.assets.find((a) => a.name.endsWith(`-${triple}.tar.gz`));
        if (asset) return { url: asset.browser_download_url, version: r.tag_name.slice("tectonic@".length) };
      }
    }
  } catch {
    // Fall back to a known release below.
  }
  return {
    url: `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${FALLBACK_VERSION}/tectonic-${FALLBACK_VERSION}-${triple}.tar.gz`,
    version: FALLBACK_VERSION,
  };
}

async function findFile(dir: string, name: string): Promise<string | null> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const found = await findFile(full, name);
      if (found) return found;
    }
  }
  return null;
}

/** Downloads the official Tectonic build for this computer into data/bin. */
export function installTectonic(): Promise<TectonicInfo> {
  globalForTex.jobFinderTectonicInstall ??= (async () => {
    const triple = targetTriple();
    if (!triple) {
      throw new Error(`There's no ready-made Tectonic for ${process.platform}/${process.arch}. Install it yourself and restart Job Finder.`);
    }
    const { url } = await releaseFor(triple);
    await mkdir(BIN_DIR, { recursive: true });
    const work = await mkdtemp(path.join(BIN_DIR, "install-"));
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(300_000) });
      if (!res.ok) throw new Error(`Couldn't download Tectonic (${res.status}) from ${url}`);
      const archive = path.join(work, "tectonic.tar.gz");
      await writeFile(archive, Buffer.from(await res.arrayBuffer()));
      const untar = await run("tar", ["-xzf", archive, "-C", work], { timeoutMs: 120_000 });
      if (untar.code !== 0) throw new Error(`Couldn't unpack Tectonic: ${untar.output.slice(0, 300)}`);
      const binary = await findFile(work, "tectonic");
      if (!binary) throw new Error("The Tectonic download didn't contain the program.");
      await chmod(binary, 0o755);
      await rename(binary, APP_BIN);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
    const info = await tectonicStatus(true);
    if (!info.installed) {
      throw new Error(
        `Tectonic was downloaded but won't start${info.error ? `: ${info.error}` : "."} On a Mac you can also run: brew install tectonic`,
      );
    }
    return info;
  })().finally(() => {
    globalForTex.jobFinderTectonicInstall = undefined;
  });
  return globalForTex.jobFinderTectonicInstall;
}

export type CompileResult =
  | { ok: true; pdf: Buffer; log: string; ms: number }
  | { ok: false; error: string; log: string; notInstalled?: boolean };

/** Pulls the useful lines out of a Tectonic/TeX log. */
export function summarizeLog(log: string): string {
  const lines = log.split("\n");
  const picked: string[] = [];
  for (let i = 0; i < lines.length && picked.length < 8; i++) {
    const line = lines[i];
    if (/^error:|^! |^l\.\d+/.test(line.trim())) {
      if (/halted on potentially-recoverable error/.test(line)) continue;
      picked.push(line.trim());
    }
  }
  return Array.from(new Set(picked)).join("\n") || lines.filter(Boolean).slice(-6).join("\n");
}

/** Compiles LaTeX to PDF. Runs one compile at a time. */
export function compileLatex(source: string): Promise<CompileResult> {
  const job = (globalForTex.jobFinderTexQueue ?? Promise.resolve()).then(() => doCompile(source));
  globalForTex.jobFinderTexQueue = job.catch(() => {});
  return job;
}

async function doCompile(source: string): Promise<CompileResult> {
  const info = await tectonicStatus();
  if (!info.installed || !info.path) return { ok: false, error: "Tectonic isn't installed yet.", log: "", notInstalled: true };
  const started = Date.now();
  const dir = await mkdtemp(path.join(os.tmpdir(), "job-finder-tex-"));
  try {
    const input = path.join(dir, "resume.tex");
    await writeFile(input, source, "utf8");
    const result = await run(info.path, ["--chatter", "minimal", "--keep-logs", "--outdir", dir, input], {
      cwd: dir,
      timeoutMs: COMPILE_TIMEOUT_MS,
      // Untrusted mode turns off shell escape and other risky TeX features.
      env: { ...process.env, TECTONIC_UNTRUSTED_MODE: "1" },
    });
    const texLog = await readFile(path.join(dir, "resume.log"), "utf8").catch(() => "");
    const log = `${result.output.trim()}\n${texLog ? `\n--- resume.log ---\n${texLog.slice(-20_000)}` : ""}`.trim();
    if (result.timedOut) return { ok: false, error: "Compiling took too long and was stopped.", log };
    const pdf = await readFile(path.join(dir, "resume.pdf")).catch(() => null);
    if (result.code === 0 && pdf) return { ok: true, pdf, log: result.output.trim(), ms: Date.now() - started };
    return { ok: false, error: summarizeLog(`${result.output}\n${texLog}`) || "LaTeX couldn't compile this document.", log };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
