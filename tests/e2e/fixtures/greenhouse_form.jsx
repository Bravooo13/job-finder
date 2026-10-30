// Build with tests/e2e/fixtures/build.sh. A mock Greenhouse application form: React Select dropdowns (static, type-to-search and multi),
// Greenhouse's education rows, a file upload, consent questions and a Submit that validates.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Select from "react-select";
import AsyncSelect from "react-select/async";

const YN = ["Yes", "No"].map((v) => ({ value: v, label: v }));
const opts = (xs) => xs.map((v) => ({ value: v, label: v }));
const CITIES = ["Chicago, Illinois, United States", "Chicago Heights, Illinois, United States", "Peoria, Illinois, United States", "New York, New York, United States"];
const SCHOOLS = ["University of Chicago", "University of Illinois Chicago", "Grinnell College", "Chicago State University"];
const later = (list) => (q) => new Promise((r) => setTimeout(() => r(opts(list.filter((x) => x.toLowerCase().includes(q.toLowerCase())))), 350));

const params = new URLSearchParams(location.search);
const WITH_EXTRA = params.get("token") === "779";

function Field({ id, label, required, children }) {
  return (
    <div className="field" data-field={id}>
      <label id={`${id}-label`} htmlFor={id}>
        {label}
        {required ? "*" : ""}
      </label>
      {children}
    </div>
  );
}

function Combo({ id, label, required, options, async: isAsync, multi, values, set }) {
  const common = {
    inputId: id,
    classNamePrefix: "select",
    "aria-labelledby": `${id}-label`,
    "aria-required": required ? "true" : undefined,
    isMulti: multi,
    value: values[id] ?? null,
    onChange: (v) => set((s) => ({ ...s, [id]: v })),
  };
  return (
    <Field id={id} label={label} required={required}>
      {isAsync ? <AsyncSelect {...common} loadOptions={later(options)} /> : <Select {...common} options={opts(options)} />}
    </Field>
  );
}

function App() {
  const [values, set] = useState({});
  const [errors, setErrors] = useState([]);
  const [done, setDone] = useState(false);
  const [fileName, setFileName] = useState("");
  const combos = [
    { id: "country", label: "Country", required: true, options: ["Canada +1", "China +86", "United States +1"] },
    { id: "candidate-location", label: "Location (City)", required: true, options: CITIES, async: true },
    { id: "school--0", label: "School", required: true, options: SCHOOLS, async: true },
    { id: "degree--0", label: "Degree", required: true, options: ["High School", "Associate's Degree", "Bachelor's Degree", "Master's Degree", "Doctor of Philosophy (Ph.D.)", "Other"] },
    { id: "discipline--0", label: "Discipline", required: true, options: ["Computer Science", "Data Science", "Economics", "Statistics", "Other"] },
    { id: "end-month--0", label: "End date month", required: true, options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
    { id: "question_1", label: "Are you legally authorized to work in the US now and in the future for any employer without visa sponsorship?", required: true, options: ["Yes", "No"] },
    { id: "question_2", label: "Will you now or in the future require sponsorship for employment visa status (e.g., H-1B)?", required: true, options: ["Yes", "No"] },
    { id: "question_3", label: "What is your overall, total GPA?", required: true, options: ["3.5+", "3.0-3.49", "2.5-2.99", "No GPA"] },
    { id: "question_4", label: "We would like to contact you via SMS or WhatsApp to provide updates. If you select no, we will contact you via the email address you provided.", required: true, options: ["Yes", "No"] },
    { id: "question_5", label: "I certify that the information I have provided in this application is true, complete, and accurate.", required: true, options: ["Yes"] },
    { id: "4000274004", label: "With which gender identity do you identify?", required: true, options: ["Man", "Woman", "Non-binary", "I don't wish to answer"] },
    { id: "4000276004", label: "Which racial categories best describe you? Select all that apply.", required: true, options: ["Asian", "White", "I don't wish to answer"], multi: true },
    ...(WITH_EXTRA ? [{ id: "question_7", label: "Are you authorized to work in the U.S. without sponsorship?", required: true, options: ["Yes", "No"] }] : []),
  ];
  function submit(e) {
    e.preventDefault();
    const missing = combos.filter((c) => c.required && !(values[c.id] && (!Array.isArray(values[c.id]) || values[c.id].length))).map((c) => c.label);
    const form = e.target;
    for (const el of form.querySelectorAll("input[required]")) if ((el.type === "checkbox" && !el.checked) || (el.type !== "checkbox" && !el.value && el.type !== "file")) missing.push(el.name || el.id);
    if (!fileName) missing.push("Resume/CV");
    if (missing.length) return setErrors(missing);
    window.submittedValues = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => x.label) : v?.label]));
    window.submittedText = Object.fromEntries([...form.querySelectorAll("input:not([type=file]):not([type=checkbox]):not([role=combobox])")].filter((x) => x.id).map((x) => [x.id, x.value]));
    fetch("/__submit", { method: "POST", body: JSON.stringify({ token: params.get("token"), values: window.submittedValues, text: window.submittedText, file: fileName, gdpr: form.querySelector("#gdpr_demographic_data_consent_given_1").checked }) });
    history.pushState({}, "", location.pathname + "/confirmation" + location.search);
    setDone(true);
  }
  if (done) return <main><h1>Thank you for applying!</h1><p>Your application has been submitted.</p></main>;
  return (
    <form id="application-form" onSubmit={submit} noValidate>
      <h1>Apply for Data Analyst Intern</h1>
      <p>Thank you for your interest in E2E Co. Please fill out the form below.</p>
      {["first_name:First Name", "last_name:Last Name", "email:Email"].map((s) => {
        const [id, label] = s.split(":");
        return (
          <Field key={id} id={id} label={label} required>
            <input id={id} name={id} type="text" aria-required="true" />
          </Field>
        );
      })}
      <Field id="phone" label="Phone" required>
        <input id="phone" name="phone" type="tel" aria-required="true" />
      </Field>
      <div className="field file-upload">
        <label htmlFor="resume">Resume/CV*</label>
        {fileName ? (
          <span>
            {fileName} <button type="button" aria-label="Remove file" onClick={() => setFileName("")}>×</button>
          </span>
        ) : (
          <input id="resume" type="file" onChange={(e) => setFileName(e.target.files?.[0]?.name || "")} />
        )}
      </div>
      {combos.slice(0, 6).map((c) => <Combo key={c.id} {...c} values={values} set={set} />)}
      <Field id="end-year--0" label="End date year" required>
        <input id="end-year--0" name="end-year--0" type="number" aria-required="true" />
      </Field>
      {combos.slice(6).map((c) => <Combo key={c.id} {...c} values={values} set={set} />)}
      <Field id="question_6" label="Anything else you'd like us to know? (optional)">
        <textarea id="question_6" name="question_6" />
      </Field>
      <div className="field">
        <input type="checkbox" id="gdpr_demographic_data_consent_given_1" name="gdpr" required />
        <label htmlFor="gdpr_demographic_data_consent_given_1">By checking this box, I consent to E2E Co collecting, storing, and processing my responses to the demographic data surveys above.*</label>
      </div>
      {errors.length ? <div role="alert" className="error">Please fill in: {errors.join(", ")}</div> : null}
      <button type="submit">Submit application</button>
    </form>
  );
}
createRoot(document.getElementById("root")).render(<App />);
