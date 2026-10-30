// Job Finder Helper: talks to your local Job Finder app for the content scripts
// (web pages can't reach localhost themselves), and runs Auto apply: it takes
// the next queued application from Job Finder, opens the form in a background
// tab, lets sites/apply.js fill it, then submits it or leaves it for you.

const DEFAULT_BASE = "http://localhost:3737";
const VERSION = chrome.runtime.getManifest().version;

async function base() {
  const { baseUrl } = await chrome.storage.local.get("baseUrl");
  return (baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
}

async function callApi({ method = "GET", path, body }) {
  const url = `${await base()}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const type = res.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: { error: `Can't reach Job Finder at ${url.split("/api")[0]}. Is it running?` } };
  }
}

async function fetchFile({ path }) {
  const url = `${await base()}${path}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, status: res.status, error: data.error || `HTTP ${res.status}` };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return {
      ok: true,
      base64: btoa(binary),
      mime: res.headers.get("content-type") || "application/pdf",
      name: res.headers.get("x-file-name") || "file.pdf",
      why: decodeURIComponent(res.headers.get("x-resume-choice") || ""),
    };
  } catch {
    return { ok: false, status: 0, error: "Can't reach Job Finder. Is it running?" };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ real input
// Some dropdowns (React Select on Greenhouse, for one) only answer real key
// presses. Chrome's debugger lets the helper type like a person in its own tab;
// Chrome shows a "started debugging this browser" bar while it does.

const attached = new Set();

async function attach(tabId) {
  if (attached.has(tabId)) return true;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    attached.add(tabId);
    // Pages in background tabs think they have focus, so dropdowns open.
    await chrome.debugger.sendCommand({ tabId }, "Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function detach(tabId) {
  if (!attached.has(tabId)) return;
  attached.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch {}
}

chrome.debugger.onDetach.addListener((source) => attached.delete(source.tabId));

const KEYS = {
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
};

async function input(tabId, op) {
  if (!(await attach(tabId))) return { ok: false, error: "Chrome didn't allow real input in this tab" };
  const send = (method, params) => chrome.debugger.sendCommand({ tabId }, method, params);
  try {
    if (op.kind === "text") await send("Input.insertText", { text: String(op.text ?? "") });
    else if (op.kind === "key") {
      const k = KEYS[op.key];
      if (!k) return { ok: false, error: `Unknown key ${op.key}` };
      for (let i = 0; i < (op.repeat || 1); i++) {
        await send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", ...k });
        await send("Input.dispatchKeyEvent", { type: "keyUp", ...k });
      }
    } else if (op.kind === "selectAll") {
      // Cmd/Ctrl+A, then the next text replaces it.
      const mod = (await chrome.runtime.getPlatformInfo()).os === "mac" ? 4 : 2;
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: mod });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: mod });
    } else if (op.kind === "click") {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await send("Input.dispatchMouseEvent", { type, x: op.x, y: op.y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
      }
    } else return { ok: false, error: "Unknown input" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Runs a small function in the page through the debugger (works on any site). */
async function evaluate(tabId, fn) {
  if (!(await attach(tabId))) return null;
  try {
    const r = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", { expression: `(${fn})()`, returnByValue: true, awaitPromise: true });
    return r?.result?.value ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ Auto apply

const STATE = "autoApply";
const getState = async () => (await chrome.storage.session.get(STATE))[STATE] || null;
const setState = (s) => chrome.storage.session.set({ [STATE]: s });

async function report(taskId, body) {
  return callApi({ method: "PATCH", path: `/api/apply/auto/${taskId}`, body });
}

async function finish(state, body) {
  if (!state) return;
  await report(state.task.id, body);
  await detach(state.tabId);
  const keep = state.settings?.keepTabs !== false && ["held", "needs_you"].includes(body.status);
  if (!keep) chrome.tabs.remove(state.tabId).catch(() => {});
  await setState(null);
  await chrome.storage.session.set({ autoApplyLastDone: Date.now() });
  const pause = Math.max(5, Number(state.settings?.pauseSeconds) || 20) * 1000;
  setTimeout(tick, pause + 500);
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const { autoApply = true } = await chrome.storage.local.get("autoApply");
    const state = await getState();
    if (state) {
      // A run that hung (the tab closed, the page never loaded): give it up.
      const alive = await chrome.tabs.get(state.tabId).then(() => true, () => false);
      if (!alive) await finish(state, { status: "failed", summary: "The application tab was closed before it finished." });
      else if (Date.now() - state.started > 12 * 60_000) await finish(state, { status: "failed", summary: "It took too long; the tab is closed. Press Retry." });
      return;
    }
    // Check in even when paused, so Job Finder knows the helper is installed.
    const { autoApplyLastDone = 0 } = await chrome.storage.session.get("autoApplyLastDone");
    if (!autoApply) {
      await callApi({ method: "GET", path: "/api/ext/status" });
      return;
    }
    const res = await callApi({ method: "POST", path: "/api/apply/auto/next", body: { version: VERSION } });
    const settings = res.data?.settings;
    if (!res.ok || !res.data?.task) return;
    const wait = Math.max(5, Number(settings?.pauseSeconds) || 20) * 1000 - (Date.now() - autoApplyLastDone);
    if (wait > 0) await sleep(Math.min(wait, 25_000));
    const task = res.data.task;
    const tab = await chrome.tabs.create({ url: task.url, active: false });
    await setState({ task, settings, ai: res.data.ai || { ready: false }, tabId: tab.id, started: Date.now(), phase: "load", redirects: 0 });
  } finally {
    ticking = false;
  }
}

/** Once the form page has loaded, hand the work to sites/apply.js. */
async function startFill(state) {
  if (state.phase !== "load") return;
  await setState({ ...state, phase: "fill" });
  await attach(state.tabId);
  await sleep(1500); // let the form's scripts build it
  const options = { taskId: state.task.id, jobId: state.task.jobId, foundId: state.task.foundId, settings: state.settings, ai: state.ai };
  let res = null;
  for (let i = 0; i < 4 && !res; i++) {
    if (i) await sleep(1500);
    res = await new Promise((resolve) =>
      chrome.tabs.sendMessage(state.tabId, { type: "jf:run", action: "auto", options }, (r) => resolve(chrome.runtime.lastError ? null : r)),
    );
  }
  // The page has no helper (a site the helper doesn't know), or no form helper (LinkedIn, Handshake).
  if (!res || res.error || !res.started) {
    const fresh = await getState();
    if (fresh?.phase === "fill" && fresh.task.id === state.task.id) {
      await finish(fresh, {
        status: "needs_you",
        summary: "The helper doesn't work on this site yet. Open the tab and apply yourself (or use the toolbar's “Fill an application on this page”).",
        needs: ["Apply on this site yourself"],
      });
    }
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const state = await getState();
  if (!state || state.tabId !== tabId) return;
  if (state.phase === "load") startFill(state);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  attached.delete(tabId);
  const state = await getState();
  if (state?.tabId === tabId && state.phase !== "done") await finish(state, { status: "failed", summary: "The application tab was closed before it finished." });
});

/** What the page says after Submit: a thank-you, errors, or a CAPTCHA. */
function outcomeProbe() {
  const text = (document.body && document.body.innerText) || "";
  const thanks = /thank you for (applying|your application|submitting)|application (has been |was )?(submitted|received)|we('ve| have) received your application|successfully submitted|your application is complete|thanks for applying/i.test(text);
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 40 && r.height > 40 && s.visibility !== "hidden" && s.display !== "none";
  };
  const captcha = [...document.querySelectorAll('iframe[src*="recaptcha/api2/bframe"], iframe[src*="recaptcha/enterprise/bframe"], iframe[src*="hcaptcha.com"], iframe[title*="challenge" i]')].some(visible);
  const errors = [...document.querySelectorAll('[aria-invalid="true"]')]
    .map((el) => (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText) || el.getAttribute("aria-label") || el.name || "")
    .concat([...document.querySelectorAll('.error, .error-message, .field-error, [class*="error-text" i], [role="alert"]')].filter(visible).map((e) => e.innerText))
    .map((t) => (t || "").replace(/\s+/g, " ").trim())
    .filter((t) => t && t.length < 200);
  const fields = document.querySelectorAll("form input:not([type=hidden]), form select, form textarea").length;
  return { thanks, captcha, errors: [...new Set(errors)].slice(0, 8), fields, url: location.href };
}

async function submitAndWatch(state, result) {
  await report(state.task.id, { status: "submitting", summary: "Pressing Submit…", answers: result.answers, checks: result.checks });
  await setState({ ...state, phase: "submit" });
  const before = await evaluate(state.tabId, outcomeProbe);
  const clicked = result.submit && (await input(state.tabId, { kind: "click", x: result.submit.x, y: result.submit.y })).ok;
  if (!clicked) await evaluate(state.tabId, () => document.querySelector("[data-jf-submit]")?.click());
  let last = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1500);
    const now = await evaluate(state.tabId, outcomeProbe);
    if (!now) continue; // navigating
    last = now;
    const moved = before && now.url !== before.url;
    if ((now.thanks && (!before?.thanks || moved)) || (moved && now.fields === 0 && !now.errors.length)) {
      return finish(state, { status: "submitted", summary: "Submitted. Marked applied in Job Finder.", url: before?.url, answers: result.answers, checks: result.checks });
    }
    if (now.captcha) {
      return finish(state, {
        status: "needs_you",
        summary: "The site asked for a CAPTCHA after Submit. Solve it in the open tab and press Submit, then mark it submitted here.",
        needs: ["Solve the CAPTCHA and press Submit"],
        answers: result.answers,
        checks: result.checks,
      });
    }
    if (i >= 3 && now.errors.length && !moved) {
      return finish(state, {
        status: "needs_you",
        summary: `The form wasn't accepted: ${now.errors.slice(0, 3).join("; ")}`,
        needs: now.errors,
        answers: result.answers,
        checks: result.checks,
      });
    }
  }
  return finish(state, {
    status: "held",
    summary: "Pressed Submit but didn't see a confirmation. Check the open tab; if it went through, press “I submitted it”.",
    needs: last?.errors?.length ? last.errors : [],
    answers: result.answers,
    checks: result.checks,
  });
}

async function autoResult(sender, result) {
  const state = await getState();
  if (!state || state.tabId !== sender.tab?.id || result.taskId !== state.task.id) return;
  if (result.redirect && state.redirects < 2) {
    await setState({ ...state, phase: "load", redirects: state.redirects + 1 });
    await chrome.tabs.update(state.tabId, { url: result.redirect });
    return;
  }
  if (result.action === "submit") return submitAndWatch(state, result);
  await finish(state, {
    status: result.action === "needs_you" ? "needs_you" : result.action === "hold" ? "held" : "failed",
    summary: result.summary || result.error || "Stopped.",
    needs: result.needs || [],
    checks: result.checks || [],
    answers: result.answers || [],
  });
}

chrome.alarms.create("jf-auto", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "jf-auto") tick();
});
chrome.runtime.onStartup.addListener(tick);
chrome.runtime.onInstalled.addListener(tick);

// ------------------------------------------------------------ messages

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "jf:api") {
    callApi(msg).then(sendResponse);
    return true;
  }
  if (msg?.type === "jf:file") {
    fetchFile(msg).then(sendResponse);
    return true;
  }
  if (msg?.type === "jf:open") {
    base().then((b) => chrome.tabs.create({ url: `${b}${msg.path || "/found"}` }));
    return false;
  }
  if (msg?.type === "jf:input" && sender.tab?.id) {
    input(sender.tab.id, msg.op || {}).then(sendResponse);
    return true;
  }
  if (msg?.type === "jf:input-done" && sender.tab?.id) {
    // Keep the debugger on a tab Auto apply is working in; let go of the others.
    getState().then((s) => (s?.tabId === sender.tab.id ? null : detach(sender.tab.id)));
    return false;
  }
  if (msg?.type === "jf:auto-result") {
    autoResult(sender, msg.result || {});
    return false;
  }
  if (msg?.type === "jf:auto-kick") {
    tick();
    return false;
  }
  if (msg?.type === "jf:auto-state") {
    Promise.all([getState(), chrome.storage.local.get("autoApply")]).then(([s, { autoApply = true }]) =>
      sendResponse({ enabled: autoApply, current: s ? { title: s.task.title, company: s.task.company, phase: s.phase } : null }),
    );
    return true;
  }
  return false;
});
