// Job Finder Helper: talks to your local Job Finder app for the content scripts
// (web pages can't reach localhost themselves).

const DEFAULT_BASE = "http://localhost:3737";

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
    };
  } catch {
    return { ok: false, status: 0, error: "Can't reach Job Finder. Is it running?" };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
  return false;
});
