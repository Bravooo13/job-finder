// Any careers page: send its job data to Job Finder. Job Finder reads
// schema.org job data, spots the company's job board (so future searches cover
// the whole company), and, when neither works, asks the AI to list the openings.

(() => {
  if (window.JF_GENERIC) return;
  window.JF_GENERIC = true;
  const { api, register } = window.JF;

  function links() {
    const out = [];
    const seen = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      const text = (a.innerText || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 200) continue;
      let href;
      try {
        href = new URL(a.getAttribute("href"), location.href).toString();
      } catch {
        continue;
      }
      if (!/^https?:/.test(href) || seen.has(href)) continue;
      seen.add(href);
      out.push({ text, href });
      if (out.length >= 800) break;
    }
    return out;
  }

  async function grabPage(options, progress) {
    progress("Reading this page…");
    const site = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || "";
    const res = await api("POST", "/api/grab/page", {
      url: location.href,
      title: document.title,
      company: options.company || site || undefined,
      html: document.documentElement.outerHTML.slice(0, 2_500_000),
      text: document.body.innerText.slice(0, 100_000),
      links: links(),
      useAi: options.useAi !== false,
      save: Boolean(options.save),
      by: options.by || "extension",
    });
    if (!res.ok) throw new Error(res.data?.error || "Job Finder couldn't read this page");
    const d = res.data;
    const parts = [];
    if (d.received) parts.push(`${d.received} jobs sent: ${d.added} new${d.updated ? `, ${d.updated} updated` : ""}`);
    if (d.boardsAdded) parts.push(`learned ${d.boards.map((b) => `${b.name} (${b.jobCount} open jobs)`).join(", ")}; your searches will check it from now on`);
    if (d.usedAi) parts.push("the AI listed the openings");
    if (d.aiError) parts.push(`AI: ${d.aiError}`);
    return { message: parts.length ? `${parts.join("; ")}.` : "No jobs or job board found on this page.", ...d };
  }

  register({ name: "generic", panel: false, actions: { grabPage } });
})();
