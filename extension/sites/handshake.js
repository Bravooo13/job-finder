// Handshake: grab the jobs in your job search into Job Finder. Handshake shows
// a job's details when you click its card, so this clicks each card in turn
// (like you would), reads the details pane, and moves on.

(() => {
  const { sleep, clean, register, sendJobs, summary } = window.JF;

  function cards() {
    return [...document.querySelectorAll('[data-hook^="job-result-card"]')]
      .map((el) => {
        const m = /\|\s*(\d+)/.exec(el.getAttribute("data-hook") || "");
        return m ? { id: m[1], el } : null;
      })
      .filter(Boolean);
  }

  const pane = () => document.querySelector('[data-hook="right-content"]');

  async function openCard(card) {
    const link = card.el.querySelector('a[role="button"], a[href*="/job-search/"], a[href*="/jobs/"]') || card.el;
    const lines = clean(card.el.innerText).split("\n").map((s) => s.trim()).filter(Boolean);
    const title = lines[1] || lines[0] || "";
    link.scrollIntoView({ block: "center" });
    link.click();
    for (let i = 0; i < 25; i++) {
      await sleep(250);
      const text = pane()?.innerText || "";
      if (title && text.includes(title) && location.pathname.includes(card.id)) break;
    }
    // Expand the full description.
    const more = [...(pane()?.querySelectorAll("button") || [])].find((b) => b.innerText.trim() === "More");
    if (more) {
      more.click();
      await sleep(400);
    }
    return { cardLines: lines, text: pane()?.innerText || "" };
  }

  const STOP = /^(What they're looking for|Similar jobs|About the employer|Meet the team|Other jobs|Jobs you might like|People you may know|Alumni in similar roles|Report this job)/i;

  function parse(id, cardLines, text) {
    const lines = clean(text).split("\n").map((s) => s.trim()).filter(Boolean);
    const company = lines[0] || cardLines[0] || "";
    const industry = lines[1] && !/^(posted|apply)/i.test(lines[1]) ? lines[1] : undefined;
    const title = lines[2] || cardLines[1] || "";
    const postedLine = lines.find((l) => /^posted\b/i.test(l)) || "";
    const postedAt = /posted\s+([^∙]+)/i.exec(postedLine)?.[1]?.trim();
    const deadline = /apply by\s+([^∙]+?)(?:\s+at\s+\d|$)/i.exec(postedLine)?.[1]?.trim();

    const glance = lines.indexOf("At a glance");
    const descStart = lines.findIndex((l) => /^job description$/i.test(l));
    const glanceLines = glance >= 0 ? lines.slice(glance + 1, descStart > glance ? descStart : glance + 12) : [];
    const salary = glanceLines.find((l) => /\$\s?[\d,.]+/.test(l));
    const where = glanceLines.find((l) => /\bbased in\b/i.test(l));
    const workplace = where ? /^(onsite|remote|hybrid)/i.exec(where)?.[1] : undefined;
    const location = where ? where.replace(/^.*?based in\s+/i, "") : cardLines.find((l) => /, [A-Z]{2}\b|remote/i.test(l));
    const typeLine = glanceLines.find((l) => /full-time|part-time|internship|contract|temporary|seasonal/i.test(l));
    const workAuth = glanceLines.filter((l) => /work authori[sz]ation|sponsor|\bopt\b|\bcpt\b|visa/i.test(l)).join("; ") || undefined;

    let description = "";
    if (descStart >= 0) {
      const out = [];
      for (const l of lines.slice(descStart + 1)) {
        if (STOP.test(l) || /^(save|apply|apply externally|more|less)$/i.test(l)) {
          if (STOP.test(l)) break;
          continue;
        }
        out.push(l);
      }
      description = out.join("\n");
    }
    return {
      url: `${location.origin}/jobs/${id}`,
      title,
      company,
      industry,
      location: location || undefined,
      workplace,
      jobType: typeLine?.split("∙")[0]?.trim(),
      salary,
      postedAt,
      deadline,
      workAuth,
      description: [workAuth ? `Work authorization: ${workAuth}` : "", description].filter(Boolean).join("\n\n") || undefined,
    };
  }

  function nextPage() {
    return [...document.querySelectorAll("button, a")].find((b) => {
      const label = (b.getAttribute("aria-label") || b.innerText || "").trim().toLowerCase();
      return (label === "next" || label === "next page" || label.includes("next page")) && !b.disabled && b.getAttribute("aria-disabled") !== "true";
    });
  }

  async function grab(options, progress) {
    const pages = Math.max(1, Math.min(10, Number(options.pages) || 1));
    const totals = { received: 0, added: 0, updated: 0, duplicates: 0, boardsLearned: 0 };
    const seen = new Set();
    for (let page = 1; page <= pages; page++) {
      const list = cards().filter((c) => !seen.has(c.id));
      if (!list.length) break;
      const jobs = [];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        seen.add(c.id);
        progress(`Page ${page}: reading job ${i + 1} of ${list.length}…`);
        const { cardLines, text } = await openCard(c);
        const job = parse(c.id, cardLines, text);
        if (job.title) jobs.push(job);
        await sleep(700 + Math.random() * 500);
      }
      const t = await sendJobs("handshake", jobs, (m) => progress(`Page ${page}: ${m}`), options);
      for (const k of Object.keys(totals)) totals[k] += t[k];
      if (page === pages) break;
      const next = nextPage();
      if (!next) break;
      next.click();
      await sleep(3000);
    }
    return { message: summary(totals, "Handshake jobs"), ...totals };
  }

  async function grabThis(options, progress) {
    const id = /\/(?:job-search|jobs)\/(\d+)/.exec(location.pathname)?.[1];
    if (!id) throw new Error("Open a job first.");
    const card = cards().find((c) => c.id === id);
    const { cardLines, text } = card ? await openCard(card) : { cardLines: [], text: pane()?.innerText || document.body.innerText };
    const job = parse(id, cardLines, text);
    if (!job.title) throw new Error("Couldn't read this job.");
    const t = await sendJobs("handshake", [job], progress, { ...options, save: options.save !== false });
    return { message: options.save !== false ? `Saved “${job.title}” to My jobs.` : summary(t), ...t };
  }

  const pagesSelect = `<label>Pages <select data-pages><option>1</option><option>2</option><option>3</option><option>5</option></select></label>`;
  register({
    name: "handshake",
    hello: "On Handshake. Tip: the “Open to US visa sponsorship” filter narrows the list first.",
    showOn: () => /\/(job-search|jobs|stu\/jobs|stu\/postings)/.test(location.pathname),
    actions: { grab, grabThis },
    panelActions: [
      { html: pagesSelect },
      { id: "grab", label: "Grab jobs on this page", primary: true, options: (root) => ({ pages: root.querySelector("[data-pages]")?.value || 1 }) },
      { id: "grabThis", label: "Save the job I'm viewing" },
    ],
  });
})();
