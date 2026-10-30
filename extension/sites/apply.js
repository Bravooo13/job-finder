// Application forms (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, or any
// page you open the helper on): reads the questions, asks Job Finder for your
// answers, fills them in and highlights what to check.
//
// "Fill this application" never submits; you review and press Submit yourself.
// Auto apply (started by Job Finder, see background.js) fills the form the same
// way, then asks Job Finder whether to submit by your Auto apply settings.

(() => {
  if (window.JF_APPLY) return;
  window.JF_APPLY = true;
  const { sleep, clean, api, file, register, setStatus } = window.JF;

  const COLORS = { high: "#16a34a", medium: "#d97706", low: "#dc2626" };
  let lastFill = null; // { fields, answers, elements, ids }
  const aiKeys = new Set(); // fields the AI wrote or picked
  let autoMode = false;

  // ------------------------------------------------------------ real input
  // Real key presses and clicks go through the background page (Chrome's
  // debugger), for dropdowns that ignore events made by scripts.
  let usedReal = false;
  const real = (op) =>
    new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: "jf:input", op }, (r) => resolve(chrome.runtime.lastError ? { ok: false } : r || { ok: false })),
    );
  async function realType(text) {
    const r = await real({ kind: "text", text });
    if (r.ok) usedReal = true;
    return r.ok;
  }
  async function realKey(key, repeat = 1) {
    const r = await real({ kind: key === "selectAll" ? "selectAll" : "key", key, repeat });
    if (r.ok) usedReal = true;
    return r.ok;
  }
  async function realClick(el) {
    el.scrollIntoView({ block: "center" });
    await sleep(80);
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return false;
    const r = await real({ kind: "click", x: b.left + b.width / 2, y: b.top + b.height / 2 });
    if (r.ok) usedReal = true;
    return r.ok;
  }
  function releaseInput() {
    if (usedReal && !autoMode) chrome.runtime.sendMessage({ type: "jf:input-done" });
    usedReal = false;
  }

  // ------------------------------------------------------------ reading the form
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  // Hidden helper inputs some dropdowns keep for the browser's "required" check.
  const shadowInput = (el) =>
    el.getAttribute("aria-hidden") === "true" || (el.tabIndex === -1 && getComputedStyle(el).opacity === "0") || /requiredInput/i.test(el.className || "");

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

  // ---- dropdowns (React Select and other ARIA comboboxes)
  const NO_OPTIONS = /^(no (options|results|matches)( found)?|loading|searching|type to search|start typing)/i;
  // The dropdown's outer box (React Select: the parent of its "control"; not its inner input-container).
  const comboBox = (el) => {
    const control = el.closest('[class*="select__control"], [class*="-control"]');
    if (control && control !== el && control.parentElement) return control.parentElement;
    return el.closest('[class*="select__container"], [class*="select-container"], [class*="combobox" i], .select') || el.parentElement;
  };
  function listFor(el) {
    const id = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    const byId = id && document.getElementById(id);
    if (byId) return byId;
    return comboBox(el)?.querySelector('[role="listbox"], [class*="menu-list"], [class*="select__menu"]') || null;
  }
  function optionsOf(el) {
    const list = listFor(el);
    if (!list) return [];
    const all = [...list.querySelectorAll('[role="option"], [class*="select__option"]')].filter(visible);
    return all.filter((o) => !all.some((p) => p !== o && p.contains(o)) && !NO_OPTIONS.test(textOf(o)));
  }
  function selectedText(el) {
    const box = comboBox(el);
    const chips = box
      ? [...box.querySelectorAll('[class*="single-value"], [class*="singleValue"], [class*="multi-value__label"], [class*="multiValue"] [class*="label"]')]
          .map(textOf)
          .filter(Boolean)
      : [];
    if (chips.length) return chips.join(" + ");
    return el.getAttribute("aria-valuetext") || (el.value && !listFor(el) ? el.value : "");
  }
  const isMulti = (el) => Boolean(comboBox(el)?.querySelector('[class*="is-multi"], [class*="--multi"]')) || el.getAttribute("aria-multiselectable") === "true";

  async function openCombo(el) {
    el.scrollIntoView({ block: "center" });
    el.focus();
    await sleep(60);
    if (listFor(el)) return true;
    // React Select opens on a mouse press on its control; most others on the down arrow.
    const control = el.closest('[class*="control"]') || el;
    control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await sleep(180);
    if (listFor(el)) return true;
    if (await realKey("ArrowDown")) {
      await sleep(300);
      if (listFor(el)) return true;
    }
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, bubbles: true }));
    await sleep(250);
    return Boolean(listFor(el));
  }
  async function closeCombo(el) {
    if (!listFor(el)) return;
    if (!(await realKey("Escape"))) el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    await sleep(100);
  }
  async function typeInCombo(el, text) {
    el.scrollIntoView({ block: "center" });
    el.focus();
    await sleep(60);
    if (el.value) await realKey("selectAll");
    if (await realType(text)) return true;
    setValue(el, text);
    return false;
  }
  async function clearTyped(el) {
    if (!el.value) return;
    if (await realKey("selectAll")) await realKey("Backspace");
    else setValue(el, "");
    await sleep(100);
  }
  async function pickOption(el, opt) {
    opt.scrollIntoView({ block: "nearest" });
    const before = selectedText(el);
    // React Select picks on click; others on a mouse press or Enter.
    opt.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    opt.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    opt.click();
    await sleep(250);
    if (selectedText(el) && selectedText(el) !== before) return true;
    if (opt.isConnected && visible(opt) && (await realClick(opt))) {
      await sleep(250);
      return Boolean(selectedText(el)) && selectedText(el) !== before;
    }
    return Boolean(selectedText(el)) && selectedText(el) !== before;
  }

  /** Reads the choices of dropdowns that only show them when opened, so the answer can be one of them. */
  async function readComboOptions(fields, elements) {
    for (const f of fields) {
      if (f.type !== "combobox" || f.options?.length) continue;
      // Type-to-search lists (cities, schools) show nothing until you type.
      if (/\b(location|city|school|university|college|institution|employer|company)\b/i.test(f.label)) continue;
      const el = elements.get(f.key)?.el;
      if (!el || !(await openCombo(el))) continue;
      await sleep(150);
      const texts = optionsOf(el).map(textOf).filter(Boolean);
      if (texts.length) f.options = texts.slice(0, 300);
      await closeCombo(el);
    }
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
      if (type !== "file" && (!visible(el) || shadowInput(el)) && !(type === "radio" || type === "checkbox")) continue;
      if ((type === "radio" || type === "checkbox") && el.name) {
        const key = `${type}:${el.name}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(el);
        continue;
      }
      if (el.disabled || el.readOnly) continue;
      const key = `jf-${n++}`;
      const label = labelFor(el);
      const options = type === "select" ? [...el.options].map((o) => clean(o.textContent)).filter(Boolean) : undefined;
      fields.push({
        key,
        label,
        type,
        options,
        required: el.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(label),
        placeholder: el.getAttribute("placeholder") || undefined,
        maxLength: el.maxLength > 0 ? el.maxLength : undefined,
        hint: el.id || el.name || undefined,
        multiple: type === "combobox" ? isMulti(el) || /select all that apply/i.test(label) || undefined : el.multiple || undefined,
      });
      elements.set(key, { kind: "single", el });
    }
    for (const [gkey, inputs] of groups) {
      const type = gkey.split(":")[0];
      const key = `jf-${n++}`;
      if (type === "checkbox" && inputs.length === 1) {
        const label = labelFor(inputs[0]) || optionText(inputs[0]);
        fields.push({ key, label, type: "checkbox", required: inputs[0].required || /\*\s*$/.test(label), hint: inputs[0].id || inputs[0].name || undefined });
        elements.set(key, { kind: "single", el: inputs[0] });
        continue;
      }
      const label = groupLabel(inputs);
      fields.push({
        key,
        label,
        type: type === "radio" ? "radio" : "checkbox",
        options: inputs.map(optionText),
        required: inputs.some((i) => i.required) || /\*\s*$/.test(label),
        hint: inputs[0].name || undefined,
        multiple: type === "checkbox" || undefined,
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
      fields.push({ key, label, type: "radio", options: g.texts, required: /\*\s*$/.test(label) });
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
    if (!w) return -1;
    let i = texts.findIndex((t) => norm(t) === w);
    if (i < 0) i = texts.findIndex((t) => norm(t).startsWith(w) || (norm(t).length > 2 && w.startsWith(norm(t))));
    if (i < 0) i = texts.findIndex((t) => norm(t).includes(w));
    if (i < 0 && /^decline$/i.test(w)) i = texts.findIndex((t) => /decline|prefer not|don.?t wish|not to (say|answer|disclose)|do not want/i.test(t));
    return i;
  }

  async function fillCombobox(el, value, alts = []) {
    const values = (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
    const picked = [];
    for (const v of values) {
      if (norm(selectedText(el)).split(" + ").includes(norm(v))) {
        picked.push(v);
        continue;
      }
      const tries = [v, ...(values.length === 1 ? alts : [])];
      let done = false;
      for (const t of tries) {
        await openCombo(el);
        let options = optionsOf(el);
        let i = bestMatch(options.map(textOf), t);
        if (i < 0) {
          await typeInCombo(el, t);
          for (let w = 0; w < 8; w++) {
            await sleep(400);
            options = optionsOf(el);
            if (options.length && !/loading/i.test(textOf(listFor(el)))) break;
          }
          i = bestMatch(options.map(textOf), t);
          // A search with suggestions for what you typed (a school, a city): the first one that contains it.
          if (i < 0) i = options.findIndex((o) => norm(textOf(o)).includes(norm(t).split(",")[0]));
        }
        if (i >= 0) {
          const text = textOf(options[i]);
          if (await pickOption(el, options[i])) {
            picked.push(text);
            done = true;
            break;
          }
        }
        await clearTyped(el);
      }
      if (!done && values.length === 1) break;
    }
    await closeCombo(el);
    el.blur?.();
    return picked;
  }

  const fileBox = (input) => input.closest('[class*="upload" i], [class*="file" i], .field, fieldset') || input.parentElement;
  const attachedName = (input) => (/[\w\-. ()]+\.(pdf|docx?|txt|rtf)\b/i.exec(textOf(fileBox(input))) || [])[0] || "";

  async function uploadFile(input, kind) {
    const ids = lastFill?.ids || {};
    const q = new URLSearchParams({ url: location.href, ...(ids.jobId ? { jobId: ids.jobId } : {}), ...(ids.foundId ? { foundId: ids.foundId } : {}) });
    const path = kind === "cover_letter" ? `/api/apply/cover-letter?${q}` : `/api/apply/resume?${q}`;
    const res = await file(path);
    if (!res.ok) return { ok: false, note: res.error || "No file", missing: res.status === 404 };
    const why = res.why ? ` (${res.why})` : "";
    // A file is already attached (the site's own autofill): swap it for yours.
    const existing = attachedName(input);
    if (existing && existing !== res.name) {
      const remove = fileBox(input)?.querySelector('button[aria-label*="remove" i], button[title*="remove" i], [class*="remove" i] button, button[class*="remove" i]');
      if (remove) {
        const id = input.id;
        remove.click();
        await sleep(700);
        input = (id && document.getElementById(id)) || fileBox(input)?.querySelector("input[type=file]") || input;
      }
    } else if (existing === res.name) return { ok: true, note: `Attached ${res.name}${why}`, input, why: res.why };
    const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
    const f = new File([bytes], res.name, { type: res.mime });
    const dt = new DataTransfer();
    dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(400);
    return { ok: true, note: `Attached ${res.name}${why}`, input, why: res.why };
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
    const { value, confidence, note, file: fileKind, alts } = answer;
    if (entry.kind === "single") {
      const el = entry.el;
      const type = fieldType(el);
      if (type === "file") {
        if (!fileKind) {
          mark(fileBox(el), "low", note);
          return false;
        }
        const r = await uploadFile(el, fileKind);
        if (r.input && r.input !== el) entry.el = r.input;
        entry.why = r.why;
        entry.missing = r.missing;
        mark(fileBox(entry.el), r.ok ? "high" : "low", r.note);
        return r.ok;
      }
      if (value === null || value === undefined) {
        mark(type === "combobox" ? comboBox(el) : el, "low", note || "Not answered");
        return false;
      }
      if (type === "checkbox") {
        if (Boolean(value) !== el.checked) el.click();
      } else if (type === "select") {
        const texts = [...el.options].map((o) => clean(o.textContent));
        const i = bestMatch(texts, Array.isArray(value) ? value[0] : value);
        if (i < 0) {
          mark(el, "low", `No option “${value}”`);
          return false;
        }
        setValue(el, el.options[i].value);
      } else if (type === "combobox") {
        const picked = await fillCombobox(el, value, alts || []);
        const ok = picked.length > 0;
        mark(comboBox(el), ok ? confidence : "low", ok ? note : `Pick “${Array.isArray(value) ? value.join(", ") : value}”`);
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
      const wanted = Array.isArray(value) ? value : [value];
      let any = false;
      for (const w of wanted) {
        const i = bestMatch(texts, w);
        if (i < 0) continue;
        if (!entry.inputs[i].checked) entry.inputs[i].click();
        any = true;
      }
      mark(entry.inputs[0].closest("fieldset, div") || entry.inputs[0], any ? confidence : "low", any ? note : `No option “${wanted.join(", ")}”`);
      return any;
    }
    if (entry.kind === "buttons") {
      if (value === null || value === undefined) return false;
      const i = bestMatch(entry.texts, Array.isArray(value) ? value[0] : value);
      if (i < 0) return false;
      entry.buttons[i].click();
      mark(entry.buttons[i].parentElement, confidence, note);
      return true;
    }
    return false;
  }

  async function fill(options = {}, progress) {
    progress("Reading the form…");
    aiKeys.clear();
    const { fields, elements } = scan();
    if (!fields.length) throw new Error("No form fields found on this page. Open the application form first.");
    progress("Reading the dropdown choices…");
    await readComboOptions(fields, elements);
    const ids = { jobId: options.jobId || undefined, foundId: options.foundId || undefined };
    const res = await api("POST", "/api/apply/fill", { url: location.href, pageTitle: document.title, fields, auto: Boolean(options.auto), ...ids });
    if (!res.ok) throw new Error(res.data?.error || "Job Finder couldn't answer");
    const { answers, job } = res.data;
    lastFill = { fields, answers, elements, ids: { jobId: ids.jobId || job?.jobId, foundId: ids.foundId || job?.foundId } };
    let filled = 0;
    for (const a of answers) {
      progress(`Filling ${filled + 1} of ${answers.length}…`);
      if (await applyAnswer(elements.get(a.key), a)) filled++;
      await sleep(60);
    }
    releaseInput();
    const check = answers.filter((a) => a.value !== null && a.confidence !== "high").length;
    const todo = answers.filter((a) => a.value === null && !a.file && (fields.find((f) => f.key === a.key)?.required || a.needsWriting)).length;
    const writing = answers.filter((a) => a.needsWriting).length;
    return {
      message:
        `Filled ${filled} of ${fields.length} fields${job ? ` for ${job.title} at ${job.company}` : ""}.\n` +
        `Green = from your answers. Yellow = check it (${check}). Red = needs you (${todo}).` +
        (writing ? `\n${writing} written answer${writing > 1 ? "s" : ""} left: press “Write answers with AI” or type them.` : "") +
        (options.auto ? "" : "\nReview everything, then press Submit yourself."),
      filled,
      total: fields.length,
      check,
      todo,
      writing,
      job,
    };
  }

  /**
   * Cover letters: when the form asks for one and the job has none, the Cover letter writer writes it
   * (saved on Job Finder's Cover letters page), then it's attached or pasted in. mode: "required" or "always".
   */
  async function coverLetterPass(mode, progress) {
    if (!lastFill) return 0;
    const fields = lastFill.answers
      .filter((a) => a.file === "cover_letter" || a.rule === "cover-letter-text")
      .map((a) => ({ a, f: lastFill.fields.find((x) => x.key === a.key), entry: lastFill.elements.get(a.key) }))
      .filter(({ f, entry }) => f && entry?.kind === "single" && !isFilled(entry) && (mode === "always" || f.required));
    if (!fields.length) return 0;
    progress("Writing a cover letter with the Cover letter writer…");
    const res = await api("POST", "/api/apply/cover-letter", { url: location.href, ...idsOf() });
    if (!res.ok) throw new Error(`Cover letter: ${res.data?.error || "couldn't write it"}`);
    lastFill.ids.jobId = res.data.jobId || lastFill.ids.jobId;
    let n = 0;
    for (const { a, entry } of fields) {
      if (fieldType(entry.el) === "file") {
        if (await applyAnswer(entry, { ...a, file: "cover_letter" })) n++;
      } else {
        setValue(entry.el, res.data.content);
        mark(entry.el, "medium", "Cover letter by the Cover letter writer: read it before sending");
        n++;
      }
      if (res.data.written) aiKeys.add(a.key);
    }
    return n;
  }

  async function write(options = {}, progress) {
    if (!lastFill) await fill({}, progress);
    // A cover letter the form has room for, then the open questions.
    if (!options.onlyRequired) await coverLetterPass("always", progress);
    const pending = lastFill.answers.filter((a) => {
      if (!a.needsWriting || a.rule === "cover-letter-text" || aiKeys.has(a.key)) return false;
      const f = lastFill.fields.find((x) => x.key === a.key);
      return !options.onlyRequired || f?.required;
    });
    if (!pending.length) return { message: "No open questions to write." };
    let done = 0;
    for (const a of pending) {
      const field = lastFill.fields.find((f) => f.key === a.key);
      const entry = lastFill.elements.get(a.key);
      if (!field || entry?.kind !== "single") continue;
      progress(`Writing answer ${done + 1} of ${pending.length}: “${field.label.slice(0, 60)}”…`);
      const res = await api("POST", "/api/apply/answer", { question: field.label, maxLength: field.maxLength, url: location.href, ...idsOf() });
      if (!res.ok) throw new Error(res.data?.error || "The AI couldn't write this one");
      setValue(entry.el, res.data.answer);
      mark(entry.el, "medium", "Written by AI: read and edit before submitting");
      aiKeys.add(a.key);
      done++;
    }
    return { message: `Wrote ${done} answer${done === 1 ? "" : "s"}. Read and edit them before you submit.` };
  }

  /** Required choice questions the answer engine didn't know: the AI picks from your resume (always held for your OK). */
  async function aiPick(progress) {
    if (!lastFill) return 0;
    const todo = lastFill.answers
      .filter((a) => a.value === null && !a.file && !a.consent && !a.needsWriting && a.rule === "unknown")
      .map((a) => lastFill.fields.find((f) => f.key === a.key))
      .filter((f) => f && f.required && f.type !== "file" && f.type !== "textarea" && !isFilled(lastFill.elements.get(f.key)));
    if (!todo.length) return 0;
    progress(`Asking the AI about ${todo.length} question${todo.length === 1 ? "" : "s"}…`);
    const res = await api("POST", "/api/apply/pick", {
      url: location.href,
      ...idsOf(),
      fields: todo.map(({ key, label, type, options, multiple, maxLength }) => ({ key, label, type, options, multiple, maxLength })),
    });
    if (!res.ok) return 0;
    let n = 0;
    for (const a of res.data.answers || []) {
      if (await applyAnswer(lastFill.elements.get(a.key), { value: a.value, confidence: "medium", note: "Picked by the AI from your resume: check it" })) {
        aiKeys.add(a.key);
        n++;
      }
    }
    releaseInput();
    return n;
  }

  /** The job ids known for this form, without empty ones. */
  const idsOf = () => Object.fromEntries(Object.entries(lastFill?.ids || {}).filter(([, v]) => v));

  function isFilled(entry) {
    if (!entry) return false;
    if (entry.kind === "single") {
      const el = entry.el;
      const t = fieldType(el);
      if (t === "file") return (el.files?.length ?? 0) > 0 || Boolean(attachedName(el));
      if (t === "checkbox") return el.checked;
      if (t === "combobox") return Boolean(selectedText(el));
      if (t === "select") return Boolean(el.value) && !/^(select|choose|please select|--)/i.test(el.options[el.selectedIndex]?.text || "");
      return Boolean((el.value || "").trim());
    }
    if (entry.kind === "group") return entry.inputs.some((i) => i.checked);
    if (entry.kind === "buttons") return entry.buttons.some((b) => b.getAttribute("aria-pressed") === "true" || /\b(selected|active|checked|is-selected)\b/i.test(b.className));
    return false;
  }

  function shownValue(entry) {
    if (!entry) return "";
    if (entry.kind === "single") {
      const el = entry.el;
      const t = fieldType(el);
      if (t === "file") {
        const name = el.files?.[0]?.name || attachedName(el);
        return name && entry.why ? `${name} · ${entry.why}` : name;
      }
      if (t === "checkbox") return el.checked ? "Ticked" : "";
      if (t === "combobox") return selectedText(el);
      if (t === "select") return clean(el.options[el.selectedIndex]?.text || "");
      return (el.value || "").slice(0, 300);
    }
    if (entry.kind === "group") return entry.inputs.filter((i) => i.checked).map(optionText).join(", ");
    if (entry.kind === "buttons") return entry.buttons.filter((b) => b.getAttribute("aria-pressed") === "true").map(textOf).join(", ");
    return "";
  }

  /** What's on the page now, field by field, for the submit decision and your review. */
  function fieldStates() {
    const out = [];
    for (const f of lastFill.fields) {
      const a = lastFill.answers.find((x) => x.key === f.key) || {};
      const entry = lastFill.elements.get(f.key);
      const filled = isFilled(entry);
      const ai = aiKeys.has(f.key);
      // Filled by the page itself (a default, the site's autofill) on a question Job Finder didn't know: check it.
      const confidence = ai ? "medium" : a.value === null || a.value === undefined ? (filled && /^(unknown|open-question)$/.test(a.rule || "") ? "medium" : "high") : a.confidence;
      out.push({ label: f.label || f.hint || "Field", type: f.type, required: Boolean(f.required), filled, value: shownValue(entry), confidence, rule: a.rule, ai, consent: Boolean(a.consent) });
    }
    return out;
  }

  function findSubmit() {
    const cands = [...document.querySelectorAll("button, input[type=submit], [role=button]")].filter((b) => visible(b) && !b.closest("#job-finder-helper") && !b.disabled);
    const text = (b) => clean(b.value || textOf(b));
    return (
      cands.find((b) => /^(submit( my)?( application)?|apply( now)?|send( my)? application|submit and apply|finish|complete application)$/i.test(text(b))) ||
      cands.find((b) => (b.type === "submit" || b.getAttribute("type") === "submit") && /submit|apply|send/i.test(text(b)))
    );
  }

  // ------------------------------------------------------------ Auto apply
  async function runAuto(o) {
    autoMode = true;
    const send = (result) => chrome.runtime.sendMessage({ type: "jf:auto-result", result: { taskId: o.taskId, ...result } });
    const progress = (message) => setStatus({ state: "busy", action: "auto", message: `Auto apply: ${message}` });
    try {
      progress("waiting for the form…");
      let fields = [];
      for (let i = 0; i < 20; i++) {
        ({ fields } = scan());
        if (fields.filter((f) => f.type !== "file").length >= 2) break;
        await sleep(750);
      }
      if (fields.filter((f) => f.type !== "file").length < 2) {
        const frame = [...document.querySelectorAll("iframe[src]")].find((f) => /greenhouse\.io\/embed\/job_app|jobs\.(eu\.)?lever\.co|jobs\.ashbyhq\.com|smartrecruiters\.com/i.test(f.src));
        if (frame) return send({ redirect: frame.src });
        const link = [...document.querySelectorAll("a[href]")].find((a) => /^(apply( for this (job|position|role))?( now)?|application)$/i.test(textOf(a)) && /^https?:/.test(a.href) && a.href !== location.href);
        if (link) return send({ redirect: link.href });
        return send({ action: "needs_you", summary: "Couldn't find an application form on this page.", needs: ["Find the application form"] });
      }
      if (/myworkday(jobs|site)\.com$/.test(location.hostname)) {
        return send({
          action: "needs_you",
          summary: "Workday needs you to sign in, and its form has several pages. Sign in, then use “Fill this application” on each page.",
          needs: ["Sign in to Workday"],
        });
      }
      if ([...document.querySelectorAll("input[type=password]")].some(visible)) {
        return send({ action: "needs_you", summary: "This site wants you to sign in or create an account first.", needs: ["Sign in on this site"] });
      }

      await fill({ auto: true, jobId: o.jobId, foundId: o.foundId }, progress);
      const notes = [];
      if (o.ai?.ready && o.settings?.coverLetters !== "never") {
        try {
          await coverLetterPass(o.settings?.coverLetters === "always" ? "always" : "required", progress);
        } catch (e) {
          notes.push(e.message);
        }
      }
      if (o.ai?.ready && o.settings?.essays !== "none") {
        try {
          await write({ onlyRequired: o.settings?.essays !== "all" }, progress);
        } catch (e) {
          notes.push(`Written answers: ${e.message}`);
        }
      }
      if (o.ai?.ready && o.settings?.aiPick !== false) await aiPick(progress);
      releaseInput();

      const states = fieldStates();
      const blockers = [];
      if ([...document.querySelectorAll('iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/enterprise/anchor"], iframe[src*="hcaptcha.com"]')].some((f) => visible(f) && f.getBoundingClientRect().height > 40)) {
        blockers.push("Tick the “I'm not a robot” box");
      }
      const answers = states.map((s) => ({ label: s.label.slice(0, 500), value: s.value || "", confidence: s.confidence, rule: s.rule, required: s.required }));
      progress("checking it against your settings…");
      const res = await api("POST", `/api/apply/auto/${o.taskId}/check`, { fields: states, blockers });
      if (!res.ok) throw new Error(res.data?.error || "Job Finder couldn't check the form");
      const d = res.data;
      const summary = notes.length ? `${d.summary} ${notes.join(" ")}` : d.summary;
      if (d.action === "submit") {
        const btn = findSubmit();
        if (!btn) return send({ action: "hold", summary: "Everything is filled, but I couldn't find the Submit button. Press it yourself.", answers, checks: d.checks });
        btn.setAttribute("data-jf-submit", "1");
        btn.scrollIntoView({ block: "center" });
        await sleep(400);
        const r = btn.getBoundingClientRect();
        setStatus({ state: "done", action: "auto", message: "Auto apply: submitting…" });
        return send({ action: "submit", submit: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, summary, answers, checks: d.checks });
      }
      setStatus({ state: "done", action: "auto", message: `Auto apply: ${summary}` });
      return send({ action: d.action, summary, needs: d.needs, checks: d.checks, answers });
    } catch (e) {
      setStatus({ state: "error", action: "auto", message: `Auto apply stopped: ${e.message || e}` });
      return send({ action: "failed", error: e.message || String(e) });
    }
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
    actions: {
      fill,
      write,
      applied,
      savePosting,
      scan: async () => ({ message: "Scanned.", ...scan(), elements: undefined }),
      // Started by Auto apply; it reports back to the background page by itself.
      auto: async (options) => {
        if (window.JF_AUTO_RUNNING === options.taskId) return { message: "Already running.", started: true };
        window.JF_AUTO_RUNNING = options.taskId;
        runAuto(options);
        return { message: "Auto apply started.", started: true };
      },
    },
    panelActions: [
      { id: "fill", label: "Fill this application", primary: true },
      { id: "write", label: "Write answers with AI" },
      { id: "savePosting", label: "Save this job" },
      { id: "applied", label: "I submitted it: mark applied" },
    ],
  });
})();
