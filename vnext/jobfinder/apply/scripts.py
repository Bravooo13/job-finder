"""JavaScript run inside the application page, shared by the Playwright and Selenium drivers.

SCAN: reads every field with its label, type, options and id, and tags each element with
data-jf-key so the driver can find it again. PROBE: what the page shows after Submit.
STATE: whether each field is filled now (used to re-fill fields a React page cleared).
Ported from Job Finder v1's extension (extension/sites/apply.js).
"""

COMMON = r"""
const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
const textOf = (el) => clean(el?.innerText || el?.textContent || "");
const visible = (el) => { const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden") return false; const r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0; };
const shadow = (el) => el.getAttribute("aria-hidden") === "true" || (el.tabIndex === -1 && getComputedStyle(el).opacity === "0") || /requiredInput/i.test(el.className || "");
function labelFor(el) {
  const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
  if (ids.length) { const t = ids.map((id) => textOf(document.getElementById(id))).filter(Boolean).join(" "); if (t) return t; }
  if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && textOf(l)) return textOf(l); }
  const wrap = el.closest("label");
  if (wrap) { const c = wrap.cloneNode(true); c.querySelectorAll("input, select, textarea, option").forEach((n) => n.remove()); if (textOf(c)) return textOf(c); }
  // Workday: a form field's legend or label (an aria-label like "Select One Required" says nothing)
  const ff = el.closest('[data-automation-id^="formField-"]');
  if (ff) { const l = ff.querySelector("legend, label"); if (l && textOf(l)) return textOf(l); }
  if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
  // Workday parts outside a labelled form field (an SMS opt-in box): name them by their own id, never by a distant label
  const auto = el.getAttribute("data-automation-id");
  if (auto && !el.closest('[data-automation-id^="formField-"]')) return auto.replace(/[-_]+/g, " ");
  let p = el.parentElement;
  for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
    const h = p.querySelector("label, legend, .application-label, [class*='label' i], [class*='question' i], h3, h4");
    if (h && !h.contains(el) && textOf(h)) return textOf(h).split("\n")[0];
  }
  return el.getAttribute("placeholder") || el.getAttribute("name") || "";
}
const GENERIC_FILE = /^(attach|upload|browse|choose( a)? file|select( a)? file|add( a)? file|drop|or drag)/i;
function fileLabel(el, label) {
  // New Greenhouse and others: the input's own label is the "Attach" button; the box's heading says Resume/CV.
  if (label && !GENERIC_FILE.test(label)) return label;
  for (const g of [el.closest("[aria-labelledby]"), el.closest('[role="group"][aria-labelledby]')]) {  // Workday: the section's heading ("Resume/CV")
    if (g) { const t = textOf(document.getElementById(g.getAttribute("aria-labelledby"))); if (t && !GENERIC_FILE.test(t)) return t; }
  }
  let p = el.parentElement;
  for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
    const h = [...p.querySelectorAll("label, legend, [class*='label' i], h3, h4")].find((x) => !x.contains(el) && textOf(x) && !GENERIC_FILE.test(textOf(x)));
    if (h) return textOf(h).split("\n")[0];
  }
  return label || el.id || el.name || "";
}
function optionText(input) {
  if (input.id) { const l = document.querySelector(`label[for="${CSS.escape(input.id)}"]`); if (l) return textOf(l); }
  const w = input.closest("label"); if (w) return textOf(w);
  return input.value || input.getAttribute("aria-label") || "";
}
function groupLabel(inputs) {
  const f = inputs[0].closest("fieldset"); if (f && f.querySelector("legend")) return textOf(f.querySelector("legend"));
  const g = inputs[0].closest("[role='radiogroup'], [role='group']");
  if (g && g.getAttribute("aria-labelledby")) { const t = textOf(document.getElementById(g.getAttribute("aria-labelledby"))); if (t) return t; }
  if (g && g.getAttribute("aria-label")) return g.getAttribute("aria-label");
  let p = inputs[0].parentElement;
  for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
    if (inputs.every((x) => p.contains(x))) {
      const opts = new Set(inputs.map(optionText));
      const lines = (p.innerText || "").split("\n").map((s) => s.trim()).filter((s) => s && !opts.has(s));
      if (lines[0]) return lines[0];
    }
  }
  return inputs[0].getAttribute("name") || "";
}
function fieldType(el) {
  if (el.tagName === "SELECT") return "select";
  if (el.tagName === "TEXTAREA") return "textarea";
  if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list") return "combobox";
  const t = (el.getAttribute("type") || "text").toLowerCase();
  if (["hidden", "submit", "button", "reset", "image", "search", "password"].includes(t)) return null;
  return ["text", "email", "tel", "url", "number", "date", "month", "radio", "checkbox", "file"].includes(t) ? t : "text";
}
const comboBox = (el) => { const c = el.closest('[class*="select__control"], [class*="-control"]'); if (c && c !== el && c.parentElement) return c.parentElement; return el.closest('[class*="select__container"], [class*="select-container"], [class*="combobox" i], .select') || el.parentElement; };
function selectedText(el) {
  const box = comboBox(el);
  const chips = box ? [...box.querySelectorAll('[class*="single-value"], [class*="singleValue"], [class*="multi-value__label"]')].map(textOf).filter(Boolean) : [];
  if (chips.length) return chips.join(" + ");
  return el.getAttribute("aria-valuetext") || "";
}
"""

SCAN = COMMON + r"""
return (() => {
  const fields = []; let n = 0; const groups = new Map();
  const scope = document.querySelectorAll("form").length === 1 ? document.querySelector("form") : document.body;
  for (const el of scope.querySelectorAll("input, select, textarea, [role='combobox'], button[aria-haspopup='listbox']")) {
    if (el.getAttribute("data-automation-id") === "beecatcher" || /beecatcher|honeypot/i.test(el.name || "")) continue;  // bot traps stay empty
    if (el.closest('header, [data-automation-id="header"], [data-automation-id="utilityButtonBar"]')) continue;  // the site's own menus (language…)
    // Workday's search-and-pick widget holds hidden checkboxes and lists of its own: only its search box is the field
    if (el.getAttribute("data-uxi-widget-type") !== "selectinput" && el.closest('[data-automation-id="multiSelectContainer"], [data-automation-id="activeListContainer"], [role="listbox"], [data-automation-id="promptOption"], [data-automation-id="menuItem"], [data-uxi-widget-type]:not([data-uxi-widget-type="selectinput"])')) continue;
    if (el.tagName === "BUTTON") {  // Workday-style dropdown: a button that opens a listbox
      if (!visible(el) || el.disabled) continue;
      const key = `jf-${n++}`; el.setAttribute("data-jf-key", key);
      const label = labelFor(el);
      fields.push({ key, label, type: "select", options: [], required: el.getAttribute("aria-required") === "true" || /\*\s*$/.test(label) || /\brequired\b/i.test(el.getAttribute("aria-label") || ""),
        placeholder: "", hint: el.id || el.name || "", multiple: false, kind: "listbutton", id: el.id || "" });
      continue;
    }
    const type = fieldType(el); if (!type) continue;
    if (type !== "file" && (!visible(el) || shadow(el)) && !(type === "radio" || type === "checkbox")) continue;
    if ((type === "radio" || type === "checkbox") && el.name) { const k = `${type}:${el.name}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(el); continue; }
    if (el.disabled || el.readOnly) continue;
    const key = `jf-${n++}`; el.setAttribute("data-jf-key", key);
    const label = type === "file" ? fileLabel(el, labelFor(el)) : labelFor(el);
    if (el.getAttribute("data-uxi-widget-type") === "selectinput") {  // Workday search-and-pick ("prompt") field
      fields.push({ key, label, type: "combobox", options: [], required: el.getAttribute("aria-required") === "true" || /\*\s*$/.test(label),
        placeholder: "", hint: el.id || "", multiple: false, kind: "wdprompt", id: el.id || "" });
      continue;
    }
    fields.push({ key, label, type, options: type === "select" ? [...el.options].map((o) => clean(o.textContent)).filter(Boolean) : [],
      required: el.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(label), placeholder: el.getAttribute("placeholder") || "",
      hint: el.id || el.name || "", multiple: type === "combobox" ? Boolean(comboBox(el)?.querySelector('[class*="is-multi"], [class*="--multi"]')) : el.multiple, kind: "single", id: el.id || "" });
  }
  for (const [gk, inputs] of groups) {
    const type = gk.split(":")[0]; const key = `jf-${n++}`;
    inputs.forEach((i, idx) => i.setAttribute("data-jf-key", `${key}#${idx}`));
    if (type === "checkbox" && inputs.length === 1) {
      const label = labelFor(inputs[0]) || optionText(inputs[0]);
      fields.push({ key, label, type: "checkbox", options: [], required: inputs[0].required || /\*\s*$/.test(label), hint: inputs[0].id || inputs[0].name || "", kind: "group", id: inputs[0].id || "" });
      continue;
    }
    const label = groupLabel(inputs);
    fields.push({ key, label, type: type === "radio" ? "radio" : "checkbox", options: inputs.map(optionText), required: inputs.some((i) => i.required) || /\*\s*$/.test(label), hint: inputs[0].name || "", multiple: type === "checkbox", kind: "group" });
  }
  // Yes/No answered with buttons (Ashby and others).
  for (const c of scope.querySelectorAll("div, fieldset")) {
    const buttons = [...c.children].filter((b) => b.tagName === "BUTTON" && visible(b));
    if (buttons.length < 2 || buttons.length > 6) continue;
    const texts = buttons.map(textOf); if (!texts.some((t) => /^(yes|no)$/i.test(t))) continue;
    const key = `jf-${n++}`; buttons.forEach((b, i) => b.setAttribute("data-jf-key", `${key}#${i}`));
    let label = ""; let p = c; for (let i = 0; i < 4 && p && !label; i++, p = p.parentElement) label = (p.innerText || "").split("\n").map((s) => s.trim()).filter((l) => l && !texts.includes(l))[0] || "";
    fields.push({ key, label, type: "radio", options: texts, required: /\*\s*$/.test(label), hint: "", kind: "buttons" });
  }
  return fields.filter((f) => f.label || f.type === "file");
})();
"""

SHAPE = r"""
return [...document.querySelectorAll("input, select, textarea")].filter((el) => el.type === "file" || (getComputedStyle(el).display !== "none" && el.getClientRects().length)).map((el) => el.id || el.name || el.type).join("|");
"""

# arguments[0] = list of {key, kind, type, id}
STATE = COMMON + r"""
const items = arguments[0];
const find = (k, id) => document.querySelector(`[data-jf-key="${k}"]`) || (id ? document.getElementById(id) : null);
return items.map((f) => {
  if (f.kind === "group") {
    let all = [...document.querySelectorAll(`[data-jf-key^="${f.key}#"]`)];
    if (!all.length && f.name) all = [...document.querySelectorAll(`input[name="${CSS.escape(f.name)}"]`)];  // the page redrew the group
    const on = all.filter((i) => i.checked); return { key: f.key, filled: on.length > 0, value: on.map(optionText).join(", ") };
  }
  if (f.kind === "buttons") { const all = [...document.querySelectorAll(`[data-jf-key^="${f.key}#"]`)]; const on = all.find((b) => b.getAttribute("aria-pressed") === "true" || /\b(selected|active|checked|is-selected)\b/i.test(b.className)); return { key: f.key, filled: Boolean(on), value: on ? textOf(on) : "" }; }
  const el = find(f.key, f.id); if (!el) return { key: f.key, filled: false, value: "", gone: true };
  if (f.type === "file") { const name = el.files && el.files[0] ? el.files[0].name : ((textOf(el.closest('[class*="upload" i], [class*="file" i], .field') || el.parentElement).match(/[\w\-. ()]+\.(pdf|docx?|txt|rtf)\b/i) || [])[0] || ""); return { key: f.key, filled: Boolean(name), value: name }; }
  if (f.kind === "wdprompt") {
    const box = el.closest('[data-automation-id="multiSelectContainer"]') || el.parentElement;
    const chips = [...box.querySelectorAll('[data-automation-id="selectedItem"]')].map(textOf).filter(Boolean);
    const aria = textOf(box.querySelector('[data-automation-id="promptAriaInstruction"]'));
    const m = /^(\d+) items? selected,?\s*(.*)$/i.exec(aria);
    const v = chips.join(" + ") || (m && Number(m[1]) > 0 ? m[2] : "");
    return { key: f.key, filled: Boolean(v), value: v };
  }
  if (f.kind === "listbutton") { const v = textOf(el); return { key: f.key, filled: Boolean(v) && !/^(select one|select|choose|--)$/i.test(v), value: v }; }
  if (f.type === "checkbox") return { key: f.key, filled: el.checked, value: el.checked ? "Ticked" : "" };
  if (f.type === "combobox") { const v = selectedText(el); return { key: f.key, filled: Boolean(v), value: v }; }
  if (f.type === "select") { const t = el.options[el.selectedIndex]?.text || ""; return { key: f.key, filled: Boolean(el.value) && !/^(select|choose|please select|--)/i.test(t), value: t }; }
  return { key: f.key, filled: Boolean((el.value || "").trim()), value: (el.value || "").slice(0, 200) };
});
"""

# arguments[0] = patterns from jobfinder.outcome.PATTERNS
PROBE = r"""
const p = arguments[0] || {};
const re = (s) => new RegExp(s, "i");
const text = document.body ? document.body.innerText : "";
const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none";
const big = (e) => { const r = e.getBoundingClientRect(); return r.width > 40 && r.height > 40 && shown(e); };
const labelOf = (el) => ((el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText) || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name || el.id || "").replace(/\s+/g, " ").trim();
const errors = [...document.querySelectorAll('[aria-invalid="true"]')].map(labelOf)
  .concat([...document.querySelectorAll('.error, .error-message, .field-error, [class*="error-text" i], [class*="helper-text--error" i], [role="alert"]')].filter(shown).map((e) => e.innerText))
  .map((t) => (t || "").replace(/\s+/g, " ").trim()).filter((t) => t && t.length < 200);
let codeBox = false; try { codeBox = [...document.querySelectorAll(p.codeInput)].some(shown); } catch (e) {}
const inputs = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")].filter(shown).map((el) => `${el.id || el.name || ""}|${labelOf(el)}`);
const note = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], [role="alert"], [role="status"], h1, h2, h3')].filter(shown).map((e) => e.innerText.replace(/\s+/g, " ").trim()).filter((t) => t && t.length < 300).slice(0, 6).join(" · ");
return {
  thanks: re(p.thanks).test(text), thanksUrl: re(p.thanksUrl).test(location.pathname + location.search),
  captcha: [...document.querySelectorAll('iframe[src*="recaptcha/api2/bframe"], iframe[src*="recaptcha/enterprise/bframe"], iframe[src*="hcaptcha.com"], iframe[title*="challenge" i]')].some(big),
  robotBox: [...document.querySelectorAll('iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/enterprise/anchor"], iframe[src*="hcaptcha.com"]')].some((f) => big(f) && !/[?&]size=invisible\b/.test(f.src) && !f.closest(".grecaptcha-badge")),
  code: codeBox || re(p.code).test(text), errors: [...new Set(errors)].slice(0, 8),
  fields: document.querySelectorAll("form input:not([type=hidden]), form select, form textarea").length,
  inputs: inputs.slice(0, 200), note: note.slice(0, 600), url: location.href,
  password: [...document.querySelectorAll("input[type=password]")].some(shown),
};
"""

# The Submit button: returns its data-jf-key after tagging it.
FIND_SUBMIT = r"""
const cands = [...document.querySelectorAll('button, input[type=submit]')].filter((b) => b.getClientRects().length && !b.disabled);
const t = (b) => (b.innerText || b.value || b.getAttribute("aria-label") || "").trim();
// The form's own submit button first. A bare "Apply" (Greenhouse puts one above the job description; it only
// scrolls to the form) counts only as a form's submit button, and last.
const SEND = /^(submit( my| your)?( application)?|send( my)? application|finish|complete application)$/i;
const isSubmit = (x) => x.type === "submit" && x.closest("form");
const b = cands.find((x) => isSubmit(x) && SEND.test(t(x))) || cands.find((x) => SEND.test(t(x))) || cands.find(isSubmit)
  || cands.find((x) => isSubmit(x) && /^apply( now)?$/i.test(t(x)));
if (!b) return null; b.setAttribute("data-jf-submit", "1"); return t(b) || "Submit";
"""
