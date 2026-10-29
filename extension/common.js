// Shared helpers for the Job Finder Helper content scripts.
// Each site script registers itself with JF.register({ ... }) and gets a small
// floating panel with its actions. Agents can trigger the same actions with
// window.postMessage({ jobFinder: "grab", options }) and read progress from
// <html data-job-finder-status="…">.

(() => {
  if (window.JF) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => (s || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  function api(method, path, body) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "jf:api", method, path, body }, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false, status: 0, data: { error: chrome.runtime.lastError.message } });
        else resolve(res);
      });
    });
  }

  function file(path) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "jf:file", path }, (res) => resolve(res || { ok: false, error: "No answer" }));
    });
  }

  /** Text of an element with line breaks for blocks and bullets for list items (works on DOMParser docs too). */
  function htmlText(root) {
    if (!root) return "";
    const BLOCK = /^(P|DIV|SECTION|ARTICLE|H[1-6]|UL|OL|TABLE|TR|BR|HEADER|FOOTER|BLOCKQUOTE)$/;
    let out = "";
    const walk = (node) => {
      if (node.nodeType === 3) {
        out += node.nodeValue;
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;
      if (tag === "BR") {
        out += "\n";
        return;
      }
      if (tag === "LI") out += "\n• ";
      else if (BLOCK.test(tag)) out += "\n";
      for (const child of node.childNodes) walk(child);
      if (BLOCK.test(tag) || tag === "LI") out += "\n";
    };
    walk(root);
    return clean(out.replace(/[ \t]*\n[ \t]*/g, "\n"));
  }

  function setStatus(state) {
    const value = { ...state, at: new Date().toISOString() };
    document.documentElement.dataset.jobFinderStatus = JSON.stringify(value);
    window.postMessage({ jobFinderStatus: value }, "*");
    panel.update(state);
  }

  // ------------------------------------------------------------- the panel
  const panel = (() => {
    let host, shadow, statusEl, actionsEl, body, collapsed;
    const STYLE = `
      :host { all: initial; }
      .box { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; width: 300px; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 30px rgba(15,23,42,.18); overflow: hidden; }
      .head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #4f46e5; color: #fff; cursor: pointer; user-select: none; }
      .head b { flex: 1; font-size: 13px; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #a5b4fc; }
      .dot.busy { background: #fde68a; animation: pulse 1s infinite; }
      .dot.ok { background: #86efac; } .dot.err { background: #fca5a5; }
      @keyframes pulse { 50% { opacity: .4; } }
      .body { padding: 10px; display: grid; gap: 8px; }
      .status { color: #334155; white-space: pre-wrap; max-height: 140px; overflow: auto; }
      .actions { display: grid; gap: 6px; }
      button { all: unset; box-sizing: border-box; text-align: center; padding: 7px 10px; border-radius: 8px; background: #eef2ff; color: #3730a3; font-weight: 600; cursor: pointer; }
      button:hover { background: #e0e7ff; } button.primary { background: #4f46e5; color: #fff; } button.primary:hover { background: #4338ca; }
      button:disabled { opacity: .5; cursor: default; }
      .row { display: flex; gap: 6px; align-items: center; color: #475569; }
      select { font: inherit; padding: 3px 4px; border-radius: 6px; border: 1px solid #cbd5e1; }
      .collapsed .body { display: none; } .collapsed { width: auto; }
      a { color: #4f46e5; }
      @media (prefers-color-scheme: dark) { .box { background: #0f172a; color: #e2e8f0; border-color: #334155; } .status { color: #cbd5e1; } button { background: #1e1b4b; color: #c7d2fe; } button:hover { background: #312e81; } .row { color: #94a3b8; } select { background: #1e293b; color: #e2e8f0; border-color: #475569; } }
    `;
    function ensure() {
      if (host) return;
      host = document.createElement("div");
      host.id = "job-finder-helper";
      shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${STYLE}</style><div class="box"><div class="head"><span class="dot"></span><b>Job Finder</b><span class="toggle">–</span></div><div class="body"><div class="status">Ready.</div><div class="actions"></div></div></div>`;
      statusEl = shadow.querySelector(".status");
      actionsEl = shadow.querySelector(".actions");
      body = shadow.querySelector(".box");
      shadow.querySelector(".head").addEventListener("click", () => {
        collapsed = !collapsed;
        body.classList.toggle("collapsed", collapsed);
        shadow.querySelector(".toggle").textContent = collapsed ? "+" : "–";
        chrome.storage.local.set({ panelCollapsed: collapsed });
      });
      chrome.storage.local.get("panelCollapsed", ({ panelCollapsed }) => {
        collapsed = Boolean(panelCollapsed);
        body.classList.toggle("collapsed", collapsed);
        shadow.querySelector(".toggle").textContent = collapsed ? "+" : "–";
      });
      document.documentElement.appendChild(host);
    }
    return {
      setActions(actions) {
        ensure();
        actionsEl.innerHTML = "";
        for (const a of actions) {
          if (a.html) {
            const div = document.createElement("div");
            div.className = "row";
            div.innerHTML = a.html;
            actionsEl.appendChild(div);
            continue;
          }
          const b = document.createElement("button");
          b.textContent = a.label;
          if (a.primary) b.className = "primary";
          b.dataset.action = a.id;
          b.addEventListener("click", (e) => {
            e.stopPropagation();
            run(a.id, a.options ? a.options(shadow) : {});
          });
          actionsEl.appendChild(b);
        }
      },
      update(state) {
        ensure();
        if (state.message !== undefined) statusEl.textContent = state.message;
        const dot = shadow.querySelector(".dot");
        dot.className = `dot ${state.state === "busy" ? "busy" : state.state === "done" ? "ok" : state.state === "error" ? "err" : ""}`;
        for (const b of actionsEl.querySelectorAll("button")) b.disabled = state.state === "busy";
      },
      root: () => shadow,
      show(visible) {
        if (host) host.style.display = visible ? "" : "none";
      },
      remove() {
        host?.remove();
        host = null;
      },
    };
  })();

  // -------------------------------------------------------------- actions
  let site = null;
  let busy = false;

  async function run(action, options = {}) {
    if (!site || busy) return { error: busy ? "Busy" : "Nothing to do on this page" };
    const handler = site.actions[action];
    if (!handler) return { error: `Unknown action ${action}` };
    busy = true;
    setStatus({ state: "busy", action, message: "Working…" });
    try {
      const result = await handler(options, (message, extra = {}) => setStatus({ state: "busy", action, message, ...extra }));
      setStatus({ state: "done", action, message: result?.message || "Done.", result });
      return result;
    } catch (error) {
      const message = error?.message || String(error);
      setStatus({ state: "error", action, message });
      return { error: message };
    } finally {
      busy = false;
    }
  }

  /** Sends grabbed jobs to Job Finder in batches; returns totals. */
  async function sendJobs(source, jobs, progress, extra = {}) {
    const totals = { received: 0, added: 0, updated: 0, duplicates: 0, boardsLearned: 0 };
    for (let i = 0; i < jobs.length; i += 15) {
      const batch = jobs.slice(i, i + 15);
      const res = await api("POST", "/api/grab", { source, pageUrl: location.href, by: extra.by || "extension", save: Boolean(extra.save), jobs: batch });
      if (!res.ok) throw new Error(res.data?.error || `Job Finder said ${res.status}`);
      for (const k of Object.keys(totals)) totals[k] += res.data[k] || 0;
      progress?.(`Sent ${Math.min(i + 15, jobs.length)} of ${jobs.length} to Job Finder…`);
    }
    return totals;
  }

  function summary(t, label = "jobs") {
    const parts = [`${t.received} ${label} sent: ${t.added} new`];
    if (t.updated) parts.push(`${t.updated} updated`);
    if (t.duplicates) parts.push(`${t.duplicates} already found`);
    if (t.boardsLearned) parts.push(`${t.boardsLearned} company boards learned`);
    return parts.join(", ") + ".";
  }

  function register(definition) {
    // Several helpers can share a page (say, the any-page grabber on a Greenhouse form); merge their actions.
    site = site ? { ...site, ...definition, name: site.name, actions: { ...site.actions, ...definition.actions } } : definition;
    if (definition.panel === false) return;
    panel.setActions(definition.panelActions || []);
    setStatus({ state: "idle", message: definition.hello || "Ready." });
    if (definition.showOn) {
      // Single-page sites change pages without reloading; show the panel only where it helps.
      const check = () => panel.show(busy || definition.showOn());
      check();
      setInterval(check, 1500);
    }
  }

  // Popup and agents can call actions too.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "jf:run") {
      run(msg.action, msg.options || {}).then(sendResponse);
      return true;
    }
    if (msg?.type === "jf:site") {
      sendResponse({ site: site?.name || null, actions: Object.keys(site?.actions || {}) });
      return false;
    }
    return false;
  });
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || typeof e.data.jobFinder !== "string") return;
    run(e.data.jobFinder, e.data.options || {});
  });

  window.JF = { sleep, clean, api, file, htmlText, setStatus, register, run, sendJobs, summary, panel };
})();
