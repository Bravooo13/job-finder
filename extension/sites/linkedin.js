// LinkedIn: grab the jobs in your search results (or the job you're viewing)
// into Job Finder. Details come from LinkedIn's public job pages, one at a
// time with a pause between them, so it reads at a human pace.

(() => {
  const { sleep, clean, htmlText, register, sendJobs, summary, api } = window.JF;
  const DETAIL_PAUSE_MS = 1200;

  function jobIdsOnPage() {
    const ids = new Set();
    // Current LinkedIn (2025+): job cards carry componentkey="job-card-component-ref-<id>".
    for (const el of document.querySelectorAll('[componentkey^="job-card-component-ref-"]')) {
      const id = el.getAttribute("componentkey").replace("job-card-component-ref-", "");
      if (/^\d+$/.test(id)) ids.add(id);
    }
    // Older layout.
    for (const el of document.querySelectorAll("[data-job-id], [data-occludable-job-id]")) {
      const id = el.getAttribute("data-job-id") || el.getAttribute("data-occludable-job-id");
      if (/^\d+$/.test(id || "")) ids.add(id);
    }
    for (const a of document.querySelectorAll('a[href*="/jobs/view/"]')) {
      const m = /\/jobs\/view\/(?:[^/]*-)?(\d{6,})/.exec(a.getAttribute("href") || "");
      if (m) ids.add(m[1]);
    }
    const current = new URL(location.href).searchParams.get("currentJobId");
    if (current && /^\d+$/.test(current)) ids.add(current);
    return [...ids];
  }

  function cardFor(id) {
    return (
      document.querySelector(`[componentkey="job-card-component-ref-${id}"]`) ||
      document.querySelector(`[data-job-id="${id}"], [data-occludable-job-id="${id}"]`)
    );
  }

  /** Title, company and location from a result card, used when details can't be fetched. */
  function fromCard(id) {
    const card = cardFor(id);
    const lines = clean(card?.innerText || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((l) => !/^(selected,|promoted|viewed|easy apply|be an early applicant|\d+ (school|company) alumni|actively reviewing)/i.test(l));
    const title = (lines[0] || "").replace(/\s*\(verified job\)$/i, "").replace(/\s+with verification$/i, "");
    const rest = lines.slice(1).filter((l) => l !== title);
    const posted = rest.find((l) => /\bago\b/i.test(l));
    return { title, company: rest[0] || "", location: rest[1] || "", postedAt: posted };
  }

  function scrollParent(el) {
    let p = el?.parentElement;
    while (p && p !== document.body) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 20) return p;
      p = p.parentElement;
    }
    return document.scrollingElement;
  }

  /** LinkedIn only renders cards near the screen; scroll the list so all of them load. */
  async function loadAllCards(progress) {
    const first = cardFor(jobIdsOnPage()[0]);
    const scroller = scrollParent(first);
    let last = -1;
    let still = 0;
    for (let i = 0; i < 40 && still < 3; i++) {
      scroller.scrollBy({ top: scroller.clientHeight * 0.8, behavior: "smooth" });
      await sleep(650);
      const n = jobIdsOnPage().length;
      progress(`Loading the list… ${n} jobs`);
      if (n === last) still++;
      else still = 0;
      last = n;
    }
    scroller.scrollTo({ top: 0 });
  }

  const parser = new DOMParser();

  async function detail(id) {
    const res = await fetch(`/jobs-guest/jobs/api/jobPosting/${id}`, {
      credentials: "omit",
      headers: { "accept-language": "en-US,en;q=0.9" },
    });
    if (res.status === 429) throw Object.assign(new Error("LinkedIn asked us to slow down"), { rateLimited: true });
    if (!res.ok) return null;
    const doc = parser.parseFromString(await res.text(), "text/html");
    const q = (s) => clean(doc.querySelector(s)?.textContent || "");
    const criteria = {};
    for (const li of doc.querySelectorAll(".description__job-criteria-item")) {
      criteria[clean(li.querySelector("h3")?.textContent || "").toLowerCase()] = clean(li.querySelector("span")?.textContent || "");
    }
    let applyUrl;
    const offsite = doc.querySelector('[data-tracking-control-name*="apply-link-offsite"]');
    const href = offsite?.getAttribute("href");
    if (href) {
      try {
        const u = new URL(href, location.origin);
        applyUrl = u.searchParams.get("url") || (u.hostname.endsWith("linkedin.com") ? undefined : u.toString());
      } catch {}
    }
    const description = htmlText(doc.querySelector(".show-more-less-html__markup, .description__text"));
    return {
      title: q(".top-card-layout__title, .topcard__title"),
      company: q(".topcard__org-name-link, .top-card-layout__second-subline a"),
      location: q(".topcard__flavor--bullet"),
      postedAt: q(".posted-time-ago__text"),
      salary: q(".compensation__salary") || undefined,
      description,
      jobType: criteria["employment type"],
      industry: criteria["industries"],
      seniority: criteria["seniority level"],
      applyUrl,
    };
  }

  async function grabIds(ids, opts, progress) {
    const jobs = [];
    let rateLimited = false;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const card = fromCard(id);
      let d = null;
      if (opts.details !== false && !rateLimited) {
        progress(`Reading job ${i + 1} of ${ids.length}…`);
        try {
          d = await detail(id);
        } catch (e) {
          if (e.rateLimited) rateLimited = true;
        }
        await sleep(DETAIL_PAUSE_MS + Math.random() * 600);
      }
      const title = d?.title || card.title;
      if (!title) continue;
      jobs.push({
        url: `https://www.linkedin.com/jobs/view/${id}/`,
        title,
        company: d?.company || card.company,
        location: d?.location || card.location || undefined,
        description: d?.description || undefined,
        postedAt: d?.postedAt || card.postedAt || undefined,
        salary: d?.salary,
        jobType: d?.jobType,
        industry: d?.industry,
        workplace: /\b(remote|hybrid|on-site|onsite)\b/i.exec(card.location || "")?.[1],
        applyUrl: d?.applyUrl,
      });
    }
    return { jobs, rateLimited };
  }

  function nextPageButton() {
    return (
      document.querySelector('button[aria-label="View next page"]') ||
      [...document.querySelectorAll("button[aria-label]")].find((b) => /next/i.test(b.getAttribute("aria-label")) && !b.disabled)
    );
  }

  async function grab(options, progress) {
    const pages = Math.max(1, Math.min(10, Number(options.pages) || 1));
    let all = [];
    let rateLimited = false;
    const seen = new Set();
    const totals = { received: 0, added: 0, updated: 0, duplicates: 0, boardsLearned: 0 };
    for (let page = 1; page <= pages; page++) {
      if (/\/jobs\/(search|search-results|collections)/.test(location.pathname)) await loadAllCards(progress);
      const ids = jobIdsOnPage().filter((id) => !seen.has(id));
      ids.forEach((id) => seen.add(id));
      progress(`Page ${page}: ${ids.length} jobs`);
      const r = await grabIds(ids, { ...options, details: options.details !== false && !rateLimited }, (m) => progress(`Page ${page}: ${m}`));
      rateLimited ||= r.rateLimited;
      all = all.concat(r.jobs);
      if (r.jobs.length) {
        const t = await sendJobs("linkedin", r.jobs, (m) => progress(`Page ${page}: ${m}`), options);
        for (const k of Object.keys(totals)) totals[k] += t[k];
      }
      if (page === pages) break;
      const next = nextPageButton();
      if (!next) break;
      next.click();
      await sleep(3000 + Math.random() * 1000);
    }
    return {
      message: `${summary(totals, "LinkedIn jobs")}${rateLimited ? " LinkedIn asked to slow down, so some were saved without details." : ""}`,
      ...totals,
      jobs: all.map((j) => ({ url: j.url, title: j.title, company: j.company })),
    };
  }

  /** Hands this search to Job Finder, which reads every results page itself: no scrolling here. */
  async function grabSearch(options, progress) {
    const pages = Math.max(1, Math.min(10, Number(options.pages) || 1));
    const start = await api("POST", "/api/grab/linkedin", { searchUrl: location.href, pages, by: options.by || "extension", save: Boolean(options.save) });
    if (!start.ok) throw new Error(start.data?.error || `Job Finder said ${start.status}`);
    let run = start.data;
    while (run.state === "running") {
      progress(run.message || "Working…");
      await sleep(3000);
      const r = await api("GET", `/api/grab/linkedin?id=${encodeURIComponent(run.id)}`);
      if (r.ok) run = r.data;
    }
    if (run.state === "error") throw new Error(run.error || "The grab failed.");
    return { message: run.message, ...(run.result || {}) };
  }

  async function grabThis(options, progress) {
    const m = /\/jobs\/view\/(?:[^/]*-)?(\d{6,})/.exec(location.pathname);
    const id = m?.[1] || new URL(location.href).searchParams.get("currentJobId");
    if (!id) throw new Error("Open a job first.");
    const r = await grabIds([id], { details: true }, progress);
    if (!r.jobs.length) throw new Error("Couldn't read this job.");
    const t = await sendJobs("linkedin", r.jobs, progress, { ...options, save: options.save !== false });
    return { message: options.save !== false ? `Saved “${r.jobs[0].title}” to My jobs.` : summary(t), ...t };
  }

  const pagesSelect = `<label>Pages <select data-pages><option>1</option><option>2</option><option>3</option><option>5</option></select></label>`;
  register({
    name: "linkedin",
    hello: "On LinkedIn. Grab the jobs in this search, or save the one you're viewing.",
    showOn: () => /^\/jobs\/(search|search-results|collections|view)/.test(location.pathname),
    actions: { grab, grabSearch, grabThis },
    panelActions: [
      { html: pagesSelect },
      { id: "grabSearch", label: "Grab this search (no scrolling)", primary: true, options: (root) => ({ pages: root.querySelector("[data-pages]")?.value || 1 }) },
      { id: "grab", label: "Grab the jobs shown here", options: (root) => ({ pages: root.querySelector("[data-pages]")?.value || 1 }) },
      { id: "grabThis", label: "Save the job I'm viewing" },
    ],
  });
})();
