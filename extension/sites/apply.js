// Application forms (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, or any
// page you open the helper on): reads the questions, asks Job Finder for your
// answers, fills them in and highlights what to check. It never submits; you
// review and press Submit yourself.

(() => {
  if (window.JF_APPLY) return;
  window.JF_APPLY = true;
  const { sleep, clean, api, file, register } = window.JF;

  const COLORS = { high: "#16a34a", medium: "#d97706", low: "#dc2626" };
  let lastFill = null; // { fields, answers, elements }

  // ------------------------------------------------------------ reading the form
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };

  const textOf = (el) => clean(el?.innerText || el?.textContent || "");

  function labelFor(el) {
    const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    if (ids.length) {
      const t = ids.map((id) => textOf(document.getElementById(id))).filter(Boolean).join(" ");
      if (t) return t;
    }
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && textOf(l)) return textOf(l);
    }
    const wrap = el.closest("label");
    if (wrap) {
      const copy = wrap.cloneNode(true);
      copy.querySelectorAll("input, select, textarea, option").forEach((n) => n.remove());
      if (textOf(copy)) return textOf(copy);
    }
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    // Walk up to the question's container and use its heading text.
    let p = el.parentElement;
    for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
      const heading = p.querySelector("label, legend, .application-label, [class*='label' i], [class*='question' i], h3, h4");
      if (heading && !heading.contains(el) && textOf(heading)) return textOf(heading).split("\n")[0];
      const legend = p.tagName === "FIELDSET" ? p.querySelector("legend") : null;
      if (legend) return textOf(legend);
    }
    return el.getAttribute("placeholder") || el.getAttribute("name") || "";
  }

  function groupLabel(inputs) {
    const first = inputs[0];
    const fieldset = first.closest("fieldset");
    if (fieldset?.querySelector("legend")) return textOf(fieldset.querySelector("legend"));
    const labelled = first.closest("[role='radiogroup'], [role='group']");
    if (labelled?.getAttribute("aria-labelledby")) {
      const t = textOf(document.getElementById(labelled.getAttribute("aria-labelledby")));
      if (t) return t;
    }
    if (labelled?.getAttribute("aria-label")) return labelled.getAttribute("aria-label");
    // The nearest container that holds all the options, then its first line of text that isn't an option.
    let p = first.parentElement;
    for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
      if (inputs.every((x) => p.contains(x))) {
        const optionTexts = new Set(inputs.map((x) => optionText(x)));
        const lines = textOf(p).split("\n").map((s) => s.trim()).filter((s) => s && !optionTexts.has(s));
        if (lines[0]) return lines[0];
      }
    }
    return first.getAttribute("name") || "";
  }

  function optionText(input) {
    if (input.id) {
      const l = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (l) return textOf(l);
    }
    const wrap = input.closest("label");
    if (wrap) return textOf(wrap);
    return input.value || input.getAttribute("aria-label") || "";
  }

  function fieldType(el) {
    const tag = el.tagName;
    if (tag === "SELECT") return "select";
    if (tag === "TEXTAREA") return "textarea";
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list") return "combobox";
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (["hidden", "submit", "button", "reset", "image", "search", "password"].includes(t)) return null;
    if (["text", "email", "tel", "url", "number", "date", "month", "radio", "checkbox", "file"].includes(t)) return t;
    return "text";
  }

  /** Yes/No questions built from buttons (Ashby and others). */
  function buttonGroups(root) {
    const out = [];
    for (const container of root.querySelectorAll("div, fieldset")) {
      const buttons = [...container.children].filter((c) => c.tagName === "BUTTON" && visible(c));
      if (buttons.length < 2 || buttons.length > 6) continue;
      const texts = buttons.map((b) => textOf(b));
      if (!texts.some((t) => /^(yes|no)$/i.test(t))) continue;
      out.push({ container, buttons, texts });
    }
    return out;
  }

  function scan() {
    const fields = [];
    const elements = new Map();
    let n = 0;
    const groups = new Map();
    const root = document.querySelector("form") || document.body;
    const scope = document.querySelectorAll("form").length > 1 ? document.body : root;
    for (const el of scope.querySelectorAll("input, select, textarea, [role='combobox']")) {
      if (el.closest("#job-finder-helper")) continue;
      const type = fieldType(el);
      if (!type) continue;
      if (type !== "file" && !visible(el) && !(type === "radio" || type === "checkbox")) continue;
      if ((type === "radio" || type === "checkbox") && el.name) {
        const key = `${type}:${el.name}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(el);
        continue;
      }
      if (el.disabled || el.readOnly) continue;
      const key = `jf-${n++}`;
      const options = type === "select" ? [...el.options].map((o) => clean(o.textContent)).filter(Boolean) : undefined;
      fields.push({
        key,
        label: labelFor(el),
        type,
        options,
        required: el.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(labelFor(el)),
        placeholder: el.getAttribute("placeholder") || undefined,
        maxLength: el.maxLength > 0 ? el.maxLength : undefined,
      });
      elements.set(key, { kind: "single", el });
    }
    for (const [gkey, inputs] of groups) {
      const type = gkey.split(":")[0];
      const key = `jf-${n++}`;
      if (type === "checkbox" && inputs.length === 1) {
        fields.push({ key, label: labelFor(inputs[0]) || optionText(inputs[0]), type: "checkbox", required: inputs[0].required });
        elements.set(key, { kind: "single", el: inputs[0] });
        continue;
      }
      fields.push({
        key,
        label: groupLabel(inputs),
        type: type === "radio" ? "radio" : "checkbox",
        options: inputs.map(optionText),
        required: inputs.some((i) => i.required),
      });
      elements.set(key, { kind: "group", inputs });
    }
    for (const g of buttonGroups(scope)) {
      const key = `jf-${n++}`;
      let label = "";
      let p = g.container;
      for (let i = 0; i < 4 && p && !label; i++, p = p.parentElement) {
        const lines = textOf(p).split("\n").filter((l) => !g.texts.includes(l.trim()));
        label = lines[0] || "";
      }
      fields.push({ key, label, type: "radio", options: g.texts });
      elements.set(key, { kind: "buttons", buttons: g.buttons, texts: g.texts });
    }
    return { fields: fields.filter((f) => f.label || f.type === "file"), elements };
  }

  // ------------------------------------------------------------ filling it in
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    el.focus();
    setter ? setter.call(el, value) : (el.value = value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  const norm = (s) => clean(s).toLowerCase();
  function bestMatch(texts, wanted) {
    const w = norm(String(wanted));
    let i = texts.findIndex((t) => norm(t) === w);
    if (i < 0) i = texts.findIndex((t) => norm(t).startsWith(w) || w.startsWith(norm(t)));
    if (i < 0) i = texts.findIndex((t) => norm(t).includes(w));
    if (i < 0 && /^decline$/i.test(w)) i = texts.findIndex((t) => /decline|prefer not|don.?t wish|not to (say|answer|disclose)|do not want/i.test(t));
    return i;
  }

  async function fillCombobox(el, value) {
    el.focus();
    el.click();
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    setValue(el, String(value));
    await sleep(500);
    const listId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    const list = (listId && document.getElementById(listId)) || document.querySelector("[role='listbox']");
    const options = list ? [...list.querySelectorAll("[role='option'], .select__option, li")].filter(visible) : [];
    const i = bestMatch(options.map(textOf), value);
    if (i >= 0) {
      options[i].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      options[i].click();
      await sleep(200);
      return true;
    }
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    return false;
  }

  async function uploadFile(input, kind) {
    const path = kind === "cover_letter" ? `/api/apply/cover-letter?url=${encodeURIComponent(location.href)}` : `/api/apply/resume?url=${encodeURIComponent(location.href)}`;
    const res = await file(path);
    if (!res.ok) return { ok: false, note: res.error || "No file" };
    const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
    const f = new File([bytes], res.name, { type: res.mime });
    const dt = new DataTransfer();
    dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, note: `Attached ${res.name}` };
  }

  function mark(target, confidence, note) {
    if (!target) return;
    const el = target instanceof Element ? target : null;
    if (!el) return;
    el.style.outline = `2px solid ${COLORS[confidence] || COLORS.low}`;
    el.style.outlineOffset = "2px";
    if (note) el.title = `Job Finder: ${note}`;
  }

  async function applyAnswer(entry, answer) {
    if (!entry) return false;
    const { value, confidence, note, file: fileKind } = answer;
    if (entry.kind === "single") {
      const el = entry.el;
      const type = fieldType(el);
      if (type === "file") {
        if (!fileKind) {
          mark(el.closest("div") || el, "low", note);
          return false;
        }
        const r = await uploadFile(el, fileKind);
        mark(el.closest("div") || el, r.ok ? "high" : "low", r.note);
        return r.ok;
      }
      if (value === null || value === undefined) {
        mark(el, "low", note || "Not answered");
        return false;
      }
      if (type === "checkbox") {
        if (Boolean(value) !== el.checked) el.click();
      } else if (type === "select") {
        const texts = [...el.options].map((o) => clean(o.textContent));
        const i = bestMatch(texts, value);
        if (i < 0) {
          mark(el, "low", `No option “${value}”`);
          return false;
        }
        setValue(el, el.options[i].value);
      } else if (type === "combobox") {
        const ok = await fillCombobox(el, value);
        mark(el.closest("div") || el, ok ? confidence : "low", ok ? note : `Pick “${value}”`);
        return ok;
      } else {
        setValue(el, String(value));
      }
      mark(el, confidence, note);
      return true;
    }
    if (entry.kind === "group") {
      if (value === null || value === undefined) {
        mark(entry.inputs[0].closest("fieldset, div"), "low", note || "Not answered");
        return false;
      }
      const texts = entry.inputs.map(optionText);
      const i = bestMatch(texts, value);
      if (i < 0) {
        mark(entry.inputs[0].closest("fieldset, div"), "low", `No option “${value}”`);
        return false;
      }
      if (!entry.inputs[i].checked) entry.inputs[i].click();
      mark(entry.inputs[i].closest("fieldset, div") || entry.inputs[i], confidence, note);
      return true;
    }
    if (entry.kind === "buttons") {
      if (value === null || value === undefined) return false;
      const i = bestMatch(entry.texts, value);
      if (i < 0) return false;
      entry.buttons[i].click();
      mark(entry.buttons[i].parentElement, confidence, note);
      return true;
    }
    return false;
  }

  async function fill(_options, progress) {
    progress("Reading the form…");
    const { fields, elements } = scan();
    if (!fields.length) throw new Error("No form fields found on this page. Open the application form first.");
    const res = await api("POST", "/api/apply/fill", { url: location.href, pageTitle: document.title, fields });
    if (!res.ok) throw new Error(res.data?.error || "Job Finder couldn't answer");
    const { answers, job } = res.data;
    let filled = 0;
    for (const a of answers) {
      progress(`Filling ${filled + 1} of ${answers.length}…`);
      if (await applyAnswer(elements.get(a.key), a)) filled++;
      await sleep(60);
    }
    lastFill = { fields, answers, elements };
    const check = answers.filter((a) => a.value !== null && a.confidence !== "high").length;
    const todo = answers.filter((a) => a.value === null && !a.file && (fields.find((f) => f.key === a.key)?.required || a.needsWriting)).length;
    const writing = answers.filter((a) => a.needsWriting).length;
    return {
      message:
        `Filled ${filled} of ${fields.length} fields${job ? ` for ${job.title} at ${job.company}` : ""}.\n` +
        `Green = from your answers. Yellow = check it (${check}). Red = needs you (${todo}).` +
        (writing ? `\n${writing} written answer${writing > 1 ? "s" : ""} left: press “Write answers with AI” or type them.` : "") +
        "\nReview everything, then press Submit yourself.",
      filled,
      total: fields.length,
      check,
      todo,
      writing,
      job,
    };
  }

  async function write(_options, progress) {
    if (!lastFill) await fill({}, progress);
    const pending = lastFill.answers.filter((a) => a.needsWriting);
    if (!pending.length) return { message: "No open questions to write." };
    let done = 0;
    for (const a of pending) {
      const field = lastFill.fields.find((f) => f.key === a.key);
      const entry = lastFill.elements.get(a.key);
      if (!field || entry?.kind !== "single") continue;
      progress(`Writing answer ${done + 1} of ${pending.length}: “${field.label.slice(0, 60)}”…`);
      const res = await api("POST", "/api/apply/answer", { question: field.label, maxLength: field.maxLength, url: location.href });
      if (!res.ok) throw new Error(res.data?.error || "The AI couldn't write this one");
      setValue(entry.el, res.data.answer);
      mark(entry.el, "medium", "Written by AI: read and edit before submitting");
      done++;
    }
    return { message: `Wrote ${done} answer${done === 1 ? "" : "s"}. Read and edit them before you submit.` };
  }

  async function applied() {
    const res = await api("POST", "/api/apply/applied", { url: location.href });
    if (!res.ok) throw new Error(res.data?.error || "Couldn't mark it");
    return { message: "Marked as applied in Job Finder. Good luck!", jobId: res.data.jobId };
  }

  async function savePosting(options, progress) {
    progress("Reading this posting…");
    const html = document.documentElement.outerHTML.slice(0, 2_500_000);
    const res = await api("POST", "/api/grab/page", {
      url: location.href,
      title: document.title,
      html,
      text: document.body.innerText.slice(0, 100_000),
      save: options.save !== false,
      by: options.by || "extension",
    });
    if (!res.ok) throw new Error(res.data?.error || "Couldn't save it");
    const d = res.data;
    return {
      message: d.added || d.updated ? `Saved to Job Finder${options.save !== false ? " (My jobs)" : ""}.` : d.boardsAdded ? `Added this company's job board (${d.boards.map((b) => b.name).join(", ")}).` : "No job data found on this page.",
      ...d,
    };
  }

  register({
    name: "apply",
    hello: "On an application page. Fill it from your saved answers, then review and submit yourself.",
    actions: { fill, write, applied, savePosting, scan: async () => ({ message: "Scanned.", ...scan(), elements: undefined }) },
    panelActions: [
      { id: "fill", label: "Fill this application", primary: true },
      { id: "write", label: "Write answers with AI" },
      { id: "savePosting", label: "Save this job" },
      { id: "applied", label: "I submitted it: mark applied" },
    ],
  });
})();
