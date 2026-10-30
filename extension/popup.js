// The toolbar popup: connection status and the actions for the current tab.

const $ = (id) => document.getElementById(id);

function bg(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (res) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(res);
    });
  });
}

async function inject(tabId, files) {
  await chrome.scripting.executeScript({ target: { tabId }, files });
}

function showResult(text) {
  $("result").hidden = !text;
  $("result").textContent = text || "";
}

async function runAction(tab, action, options = {}, inject_files = null) {
  for (const b of document.querySelectorAll("#actions button")) b.disabled = true;
  showResult("Working… (you can close this popup; progress shows on the page)");
  try {
    if (inject_files) await inject(tab.id, inject_files);
    const res = await sendToTab(tab.id, { type: "jf:run", action, options });
    showResult(res?.error ? `Problem: ${res.error}` : res?.message || "Done.");
  } catch (e) {
    showResult(`Problem: ${e.message || e}`);
  } finally {
    for (const b of document.querySelectorAll("#actions button")) b.disabled = false;
  }
}

function button(label, onClick, secondary = false) {
  const b = document.createElement("button");
  b.textContent = label;
  if (secondary) b.className = "secondary";
  b.addEventListener("click", onClick);
  $("actions").appendChild(b);
}

async function showAuto() {
  const s = await bg({ type: "jf:auto-state" });
  $("autoOn").checked = s?.enabled !== false;
  $("autoState").textContent = !s
    ? ""
    : s.current
      ? `Working on ${s.current.title} at ${s.current.company}…`
      : s.enabled
        ? "On: runs the applications you queue on Job Finder's Apply page."
        : "Paused. Queued applications wait until you turn it on.";
}

async function init() {
  const { baseUrl } = await chrome.storage.local.get("baseUrl");
  $("base").value = baseUrl || "";
  showAuto();

  const status = await bg({ type: "jf:api", method: "GET", path: "/api/ext/status" });
  if (status?.ok && status.data?.app === "job-finder") {
    $("conn").textContent = "Connected";
    $("conn").className = "pill ok";
    $("conn").title = `AI: ${status.data.ai.ready ? status.data.ai.label : "not set up"} · Answers: ${status.data.profile.ready ? "ready" : "not set up"}`;
  } else {
    $("conn").textContent = "Not running";
    $("conn").className = "pill err";
    showResult(status?.data?.error || "Start Job Finder on this computer, then reopen this popup.");
  }

  const tab = await currentTab();
  if (!tab?.id || !/^https?:/.test(tab.url || "")) {
    $("where").textContent = "Open a job site or an application page to use the helper.";
    return;
  }
  const info = await sendToTab(tab.id, { type: "jf:site" });
  const host = new URL(tab.url).hostname;
  if (info?.site === "linkedin" || info?.site === "handshake") {
    $("where").textContent = info.site === "linkedin" ? "LinkedIn: grab the jobs in your search." : "Handshake: grab the jobs in your search.";
    $("pagesRow").hidden = false;
    button("Grab jobs on this page", () => runAction(tab, "grab", { pages: $("pages").value }));
    button("Save the job I'm viewing", () => runAction(tab, "grabThis", {}), true);
    return;
  }
  if (info?.site === "apply") {
    $("where").textContent = `Application page (${host}). Fill it, check it, submit it yourself (or queue it for Auto apply in Job Finder).`;
    button("Fill this application", () => runAction(tab, "fill"));
    button("Write answers with AI", () => runAction(tab, "write"), true);
    button("Save this job", () => runAction(tab, "savePosting"), true);
    button("I submitted it: mark applied", () => runAction(tab, "applied"), true);
    return;
  }
  $("where").textContent = `${host}: send this page's jobs to Job Finder, or fill an application form here.`;
  button("Grab jobs from this page", () => runAction(tab, "grabPage", {}, ["common.js", "sites/generic.js"]));
  button("Fill an application on this page", () => runAction(tab, "fill", {}, ["common.js", "sites/apply.js"]), true);
  button("I submitted it: mark applied", () => runAction(tab, "applied", {}, ["common.js", "sites/apply.js"]), true);
}

for (const a of document.querySelectorAll("[data-open]")) {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: "jf:open", path: a.dataset.open });
  });
}
$("autoOn").addEventListener("change", async () => {
  await chrome.storage.local.set({ autoApply: $("autoOn").checked });
  if ($("autoOn").checked) chrome.runtime.sendMessage({ type: "jf:auto-kick" });
  showAuto();
});
$("saveBase").addEventListener("click", async () => {
  const value = $("base").value.trim().replace(/\/+$/, "");
  await chrome.storage.local.set({ baseUrl: value || "" });
  location.reload();
});

init();
