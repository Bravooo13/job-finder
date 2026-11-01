import assert from "node:assert/strict";
import { test } from "node:test";
import { answerFields, chooseOption, degreeAliases, gpaOption, type FieldType } from "@/lib/apply/answers";
import { applyProfileSchema } from "@/lib/apply/profile-schema";

// A made-up F-1 student: authorized now (CPT/OPT), needs sponsorship later.
const p = applyProfileSchema.parse({
  firstName: "Alex",
  lastName: "Doe",
  email: "alex@example.com",
  phone: "555-0100",
  city: "Chicago",
  state: "IL",
  country: "United States",
  linkedin: "https://linkedin.com/in/alexdoe",
  github: "https://github.com/alexdoe",
  school: "University of Chicago",
  degree: "Master of Science",
  major: "Applied Data Science",
  gpa: "3.6",
  graduation: "2028-05",
  authorizedToWork: "yes",
  needsSponsorshipNow: "no",
  needsSponsorshipLater: "yes",
  visaStatus: "F-1 student (CPT/OPT)",
  citizenship: "China",
  usCitizen: "no",
  permanentResident: "no",
  usPerson: "no",
  over18: "yes",
  willingToRelocate: "yes",
  startDate: "2027-06",
  hearAbout: "LinkedIn",
  preferredLocations: "Chicago, IL; New York, NY; Remote",
  workArrangement: "hybrid",
  willingToTravel: "yes",
  custom: [
    { question: "Why are you interested in data science?", answer: "Because data explains markets." },
    { question: "How many years of experience do you have with Python?", answer: "3" },
  ],
});

const YN = ["Yes", "No"];
let n = 0;
const ask = (label: string, type: FieldType = "radio", options: string[] | undefined = YN, extra: Record<string, unknown> = {}) =>
  answerFields([{ key: String(n++), label, type, options, ...extra }], p, { coverLetter: "Dear team, ..." })[0];

test("work authorization questions (the ones F-1 students get wrong)", () => {
  assert.equal(ask("Are you legally authorized to work in the United States?").value, "Yes");
  assert.equal(ask("Will you now or in the future require sponsorship for employment visa status (e.g., H-1B visa status)?").value, "Yes");
  assert.equal(ask("Do you now, or will you in the future, require immigration sponsorship to work in the US?*").value, "Yes");
  assert.equal(
    ask("Are you legally authorized to work in the United States without the need for employer sponsorship, now or at any time in the future?").value,
    "No",
  );
  const nowOnly = ask("Are you currently authorized to work in the U.S. without sponsorship?");
  assert.equal(nowOnly.value, "Yes");
  assert.equal(nowOnly.confidence, "medium", "ambiguous wording is flagged for review");
  assert.equal(ask("Do you currently require visa sponsorship to begin employment?").value, "No");
  assert.equal(
    ask("Will you require visa sponsorship?", "select", ["Select...", "Yes, I will require sponsorship", "No, I will not require sponsorship"]).value,
    "Yes, I will require sponsorship",
  );
  assert.equal(ask("Are you a U.S. citizen?").value, "No");
  assert.equal(ask("Are you a lawful permanent resident (green card holder)?").value, "No");
  assert.equal(ask("Are you a U.S. person as defined by ITAR?").value, "No");
  assert.equal(ask("Do you have an active security clearance?").value, "No");
  assert.equal(ask("Are you at least 18 years of age?").value, "Yes");
  assert.equal(ask("Are you currently on OPT or CPT, or eligible for it?").value, "Yes");
  assert.equal(ask("What is your current visa status?", "select", ["U.S. Citizen", "Green Card", "H-1B", "F-1 Student Visa", "Other"]).value, "F-1 Student Visa");
});

test("unset work authorization is flagged, never guessed", () => {
  const blank = answerFields([{ key: "x", label: "Will you require sponsorship?", type: "radio", options: YN }], applyProfileSchema.parse({}))[0];
  assert.equal(blank.value, null);
  assert.equal(blank.confidence, "low");
});

test("contact, education and availability", () => {
  assert.equal(ask("First Name", "text", undefined).value, "Alex");
  assert.equal(ask("Last Name*", "text", undefined).value, "Doe");
  assert.equal(ask("Email", "email", undefined).value, "alex@example.com");
  assert.equal(ask("Phone", "tel", undefined).value, "555-0100");
  assert.equal(ask("LinkedIn Profile", "text", undefined).value, "https://linkedin.com/in/alexdoe");
  assert.equal(ask("School", "combobox", ["University of Chicago", "University of Michigan"]).value, "University of Chicago");
  assert.equal(ask("Degree", "select", ["Bachelor's Degree", "Master's Degree", "Master of Science", "PhD"]).value, "Master of Science");
  assert.equal(ask("Expected graduation date", "month", undefined).value, "2028-05");
  assert.equal(ask("Graduation year", "select", ["2026", "2027", "2028"]).value, "2028");
  assert.equal(ask("Expected Graduation Date", "text", undefined).value, "May 2028");
  assert.equal(ask("Location (City)", "text", undefined).value, "Chicago, IL");
  assert.equal(ask("How did you hear about this job?", "select", ["Company website", "LinkedIn", "Referral", "Other"]).value, "LinkedIn");
  assert.equal(ask("When can you start?", "text", undefined).value, "June 2027");
  assert.equal(ask("Are you willing to relocate?").value, "Yes");
  assert.equal(ask("Have you ever been employed by Acme before?").value, "No");
});

test("voluntary self-identification declines by default", () => {
  assert.equal(ask("Gender", "select", ["Male", "Female", "Decline To Self Identify"]).value, "Decline To Self Identify");
  assert.equal(ask("Veteran Status", "select", ["I am a protected veteran", "I am not a protected veteran", "I don't wish to answer"]).value, "I don't wish to answer");
  assert.equal(ask("Disability Status", "radio", ["Yes, I have a disability", "No, I do not have a disability", "I do not want to answer"]).value, "I do not want to answer");
});

test("files, consent and open questions", () => {
  assert.equal(ask("Resume/CV", "file", undefined).file, "resume");
  assert.equal(ask("Cover Letter", "file", undefined).file, "cover_letter");
  assert.equal(ask("Cover letter", "textarea", undefined).value, "Dear team, ...");
  assert.equal(ask("I certify that the information I have provided is accurate and complete", "checkbox", undefined).value, null, "consent is left for the person");
  assert.equal(ask("Why do you want to work at Acme?", "textarea", undefined).needsWriting, true);
  assert.equal(ask("Why are you interested in data science?", "textarea", undefined).value, "Because data explains markets.");
  assert.equal(ask("Favorite color", "text", undefined, { required: true }).note, "Required: fill this in");
});

test("chooseOption", () => {
  assert.equal(chooseOption(["Select one", "Yes", "No"], "yes"), "Yes");
  assert.equal(chooseOption(["Prefer not to say", "Woman", "Man"], "decline"), "Prefer not to say");
});

test("office, work arrangement and travel preferences", () => {
  assert.equal(ask("Which office location do you prefer?", "select", ["New York, NY", "Chicago, IL", "San Francisco, CA"]).value, "Chicago, IL");
  assert.equal(ask("Preferred location", "checkbox", ["Austin", "New York", "Seattle"]).value, "New York");
  assert.equal(ask("Which locations are you interested in?", "text", undefined).value, "Chicago, IL; New York, NY; Remote");
  assert.equal(ask("What is your preferred work arrangement?", "select", ["Remote", "Hybrid", "On-site"]).value, "Hybrid");
  assert.equal(ask("Are you comfortable working remotely?").value, null, "hybrid person, remote question: left for you");
  const office = ask("Are you able to work in the office 3 days a week?");
  assert.equal(office.value, "Yes");
  assert.equal(office.confidence, "medium");
  assert.equal(ask("Are you willing to travel up to 25%?").value, "Yes");
  assert.equal(ask("Are you willing to relocate?").value, "Yes", "relocation is not a work-arrangement question");
  assert.equal(ask("Location (City)", "text", undefined).value, "Chicago, IL", "your own city is still your address");
});

test("saved answers match the same question, not a similar one", () => {
  assert.equal(ask("How many years of experience do you have with Python?", "text", undefined).value, "3");
  assert.equal(ask("Years of Python experience", "text", undefined).value, "3");
  assert.notEqual(ask("How many years of experience do you have with SQL?", "text", undefined).value, "3");
});

// ---------------------------------------------------------------- Auto apply round (questions from real Greenhouse forms)

test("GPA ranges, graduation windows and degree spellings", () => {
  const ranges = ["3.5+", "3.0-3.49", "2.8-2.99", "2.5-2.79", "2.49 or Below", "No GPA"];
  assert.equal(ask("What is your overall, total GPA?*", "combobox", ranges).value, "3.5+");
  assert.equal(gpaOption(ranges, "3.43"), "3.0-3.49");
  assert.equal(gpaOption(ranges, "2.3"), "2.49 or Below");
  assert.equal(gpaOption(["Below 3.0", "3.0 - 3.49", "3.50 and above"], "3.5"), "3.50 and above");
  assert.equal(gpaOption(ranges, ""), "No GPA");
  assert.equal(ask("Is your graduation date between December 2027 and August 2028?*", "combobox").value, "Yes");
  assert.equal(ask("Will you graduate before December 2027?").value, "No");
  assert.deepEqual(degreeAliases("M.S.").slice(0, 3), ["M.S.", "Master of Science", "Master's Degree"]);
  assert.equal(ask("Degree", "select", ["Bachelor's Degree", "Master's Degree", "PhD"]).value, "Master's Degree");
});

test("Greenhouse education rows use the row number, not the repeated label", () => {
  const fields = [
    { key: "s0", label: "School*", type: "combobox" as const, hint: "school--0" },
    { key: "d0", label: "Degree*", type: "combobox" as const, hint: "degree--0" },
    { key: "m0", label: "Discipline*", type: "combobox" as const, hint: "discipline--0" },
    { key: "e0", label: "End date month*", type: "combobox" as const, hint: "end-month--0" },
    { key: "y0", label: "End date year*", type: "number" as const, hint: "end-year--0" },
    { key: "s1", label: "School*", type: "combobox" as const, hint: "school--1" },
    { key: "y1", label: "End date year*", type: "number" as const, hint: "end-year--1" },
  ];
  const q = { ...p, previousSchool: "Grinnell College", previousDegree: "B.A. in Economics", previousGraduation: "2026-05" };
  const a = Object.fromEntries(answerFields(fields, q).map((x) => [x.key, x]));
  assert.equal(a.s0.value, "University of Chicago");
  assert.equal(a.d0.value, "Master of Science");
  assert.equal(a.m0.value, "Applied Data Science");
  assert.deepEqual(a.m0.alts, ["Data Science"]);
  assert.equal(a.e0.value, "May");
  assert.equal(a.y0.value, "2028");
  assert.equal(a.s1.value, "Grinnell College");
  assert.equal(a.y1.value, "2026");
});

test("standard declarations: No when set, held for a check when not", () => {
  const set: typeof p = { ...p, relatedToEmployee: "no", restrictiveAgreement: "no", clientRelationship: "no" };
  const one = (label: string, prof: typeof p = set) => answerFields([{ key: "k", label, type: "combobox", options: YN }], prof, { company: "West Monroe", employers: ["Acme Analytics"] })[0];
  assert.equal(one("Are you related to a West Monroe employee?*").value, "No");
  assert.equal(one("Are you related to a West Monroe employee?*").confidence, "high");
  assert.equal(one("Are you related to a West Monroe employee?*", p).confidence, "medium");
  assert.equal(one("Have you ever been employed by or had any form of professional relationship with a client of West Monroe?*").rule, "client-relationship");
  assert.equal(one("Have you previously worked at West Monroe?*").value, "No");
  assert.equal(
    answerFields([{ key: "k", label: "Have you previously worked at Acme?", type: "radio", options: YN }], set, { company: "Acme Analytics, Inc.", employers: ["Acme Analytics"] })[0].value,
    "Yes",
  );
  assert.equal(one("Are you currently subject to a non-compete, non-solicitation, employment agreement or any other obligation with another employer that could affect your ability to perform the job?*").value, "No");
  assert.equal(one("Are you currently in one of these sponsored statuses: O-1, TN, H1B1, H1B, E3? *").value, "No");
  assert.equal(one("Are you currently in student (F-1) or Trainee (J1) status and/or have work authorization under CPT, OPT or STEM OPT?*").value, "Yes");
});

test("texts, opt-ins and consent", () => {
  const sms = ask("We would like to contact you via SMS or WhatsApp. If you select no, we will contact you via the email address you provided.*", "combobox", YN);
  assert.equal(sms.value, "No", "never the email address");
  assert.equal(answerFields([{ key: "m", label: "Sign me up for job alerts about future opportunities", type: "checkbox" }], p)[0].value, false);
  const certify = "I certify that the information I have provided in this application is true, complete, and accurate.*";
  const off = ask(certify, "combobox", ["Yes"]);
  assert.equal(off.value, null);
  assert.equal(off.consent, true);
  const on = answerFields([{ key: "c", label: certify, type: "combobox", options: ["Yes"] }], p, { consent: true })[0];
  assert.equal(on.value, "Yes");
  const policy = answerFields([{ key: "c", label: "Please review our current policy regarding use of generative AI.*", type: "combobox", options: ["Acknowledged"] }], p, { consent: true })[0];
  assert.equal(policy.value, "Acknowledged");
  const box = answerFields([{ key: "c", label: "By checking this box, I consent to Acme collecting my demographic data.*", type: "checkbox" }], p, { consent: true })[0];
  assert.equal(box.value, true);
});

test("location, travel, race wording and lists", () => {
  const near = answerFields(
    [{ key: "n", label: "By your start date you must live within a 50-mile radius of the office. Will you meet this requirement?", type: "combobox", options: YN }],
    { ...p, willingToRelocate: "" },
    { jobLocation: "Chicago, IL" },
  )[0];
  assert.equal(near.value, "Yes");
  assert.equal(ask("This role requires travel up to 50% of the time. Are you willing and able to meet this travel requirement?*", "combobox").value, "Yes");
  assert.equal(ask("Which racial categories best describe you? Select all that apply.*", "combobox", ["Asian", "White", "I don't wish to answer"]).value, "I don't wish to answer");
  assert.equal(ask("What is your legal first name?*", "text", undefined).value, "Alex");
  const tools = answerFields([{ key: "t", label: "Which tools have you used in coursework?", type: "checkbox", options: ["Python", "R", "SQL", "Stata"] }], p, { skills: ["Python", "SQL", "Tableau"] })[0];
  assert.deepEqual(tools.value, ["Python", "SQL"]);
  const langs = answerFields([{ key: "l", label: "Language Fluency*", type: "combobox", multiple: true }], { ...p, languages: "English; Chinese (Mandarin)" })[0];
  assert.deepEqual(langs.value, ["English", "Chinese (Mandarin)"]);
});

// The questions Stripe's internship form asked (Greenhouse, October 2026), with its real options.
test("a real form's wordings: education rows, enrollment, residence, employer, office, events", () => {
  const me = applyProfileSchema.parse({
    ...p,
    degree: "M.S.",
    schoolStart: "2026-09",
    previousSchool: "A Small College",
    previousDegree: "B.A. in Economics",
    previousStart: "2022-09",
    previousGraduation: "2026-05",
    currentEmployer: "Example Analytics",
    currentTitle: "Data Analyst Intern",
    willingToRelocate: "",
    workArrangement: "any",
    preferredLocations: "Chicago, IL",
    city: "Chicago",
    state: "Illinois",
  });
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const degrees = ["High School", "Associate's Degree", "Bachelor's Degree", "Master's Degree", "Master of Business Administration (M.B.A.)", "Juris Doctor (J.D.)", "Doctor of Medicine (M.D.)", "Doctor of Philosophy (Ph.D.)", "Engineer's Degree", "Other"];
  const fields = [
    // The school and discipline lists are long and only partly shown until you type.
    { key: "school", label: "School*", type: "combobox", hint: "school--0", options: ["Aalborg University", "Aalto University", "Aarhus University"] },
    { key: "degree", label: "Degree*", type: "combobox", hint: "degree--0", options: degrees },
    { key: "discipline", label: "Discipline*", type: "combobox", hint: "discipline--0", options: ["Accounting", "Applied Mathematics", "Architecture"] },
    { key: "startMonth", label: "Start date month*", type: "combobox", hint: "start-month--0", options: months },
    { key: "school1", label: "School", type: "combobox", hint: "school--1", options: [] },
    { key: "degree1", label: "Degree", type: "combobox", hint: "degree--1", options: degrees },
    { key: "enrolled", label: "Are you currently enrolled in a Master's degree program?*", type: "combobox", options: ["Yes", "No"] },
    { key: "bachelors", label: "Are you currently pursuing a Bachelor's degree?", type: "radio", options: ["Yes", "No"] },
    { key: "complete", label: "When do you expect to complete your degree?*", type: "text" },
    { key: "employer", label: "Who is your current or previous employer?*", type: "text" },
    { key: "title", label: "What is your current or previous job title?*", type: "text" },
    { key: "country", label: "Please select the country where you currently reside. *", type: "combobox", options: ["Canada", "India", "United Kingdom", "United States"] },
    { key: "city", label: "If located in the US, in what city and state do you reside?*", type: "text" },
    { key: "office", label: "Office location preference:*", type: "combobox", options: ["San Francisco, CA, United States", "Seattle, WA, United States", "New York, NY, United States", "I am open to working in any office"] },
    { key: "neurips", label: "Are you planning on attending NeurIPS in person this year?*", type: "combobox", options: ["Yes", "No"] },
    { key: "deadline", label: "Do you have an active offer deadline or another recruiting-process deadline we should be aware of? If yes, please share the deadline date and any relevant context.", type: "textarea" },
    { key: "program", label: "What graduate program are you in?", type: "text" },
    { key: "phoneCountry", label: "Country*", type: "combobox", hint: "country", options: ["Canada +1", "United States +1"] },
  ] as { key: string; label: string; type: FieldType; hint?: string; options?: string[] }[];
  const a = Object.fromEntries(answerFields(fields, me, { educationRows: [0, 1] }).map((x) => [x.key, x]));
  // Long lists: typed to search, never a wrong look-alike ("Aalborg University", "Applied Mathematics").
  assert.equal(a.school.value, "University of Chicago");
  assert.equal(a.discipline.value, "Applied Data Science");
  assert.deepEqual(a.discipline.alts, ["Data Science"]);
  // M.S. is "Master's Degree", not "Master of Business Administration".
  assert.equal(a.degree.value, "Master's Degree");
  assert.equal(a.degree1.value, "Bachelor's Degree");
  assert.equal(a.school1.value, "A Small College");
  assert.equal(a.startMonth.value, "September");
  assert.equal(a.enrolled.value, "Yes");
  assert.equal(a.bachelors.value, "No");
  assert.equal(a.complete.value, "May 2028");
  assert.equal(a.employer.value, "Example Analytics");
  assert.equal(a.title.value, "Data Analyst Intern");
  assert.equal(a.country.value, "United States");
  assert.equal(a.city.value, "Chicago, IL");
  assert.equal(a.office.value, "I am open to working in any office");
  assert.equal(a.office.confidence, "medium", "Chicago isn't offered and relocation isn't set: held to check");
  assert.equal(a.neurips.value, null, "attending a conference is not a work-arrangement question");
  assert.equal(a.deadline.value, "No");
  assert.equal(a.deadline.confidence, "medium");
  assert.equal(a.program.value, "M.S. in Applied Data Science, University of Chicago");
  assert.equal(a.phoneCountry.value, "United States +1");
});

test("the same question in other words gets the same answer", () => {
  const me = applyProfileSchema.parse({ ...p, dateOfBirth: "2003-04-05", currentEmployer: "Example Analytics", currentTitle: "Analyst" });
  const ask = (label: string, type: FieldType = "text", options?: string[]) => answerFields([{ key: "k", label, type, options }], me)[0];
  for (const l of ["Expected graduation date", "When will you graduate?", "Anticipated graduation", "When do you expect to finish your degree?"]) assert.equal(ask(l).value, "May 2028", l);
  for (const l of ["Current employer", "Most recent employer", "Who is your current or previous employer?"]) assert.equal(ask(l).value, "Example Analytics", l);
  for (const l of ["What country do you currently live in?", "Country of residence"]) assert.equal(ask(l, "select", ["Canada", "United States of America"]).value, "United States of America", l);
  for (const l of ["What city and state do you live in?", "Where do you currently reside?", "City/State"]) assert.equal(ask(l).value, "Chicago, IL", l);
  assert.equal(ask("Date of birth", "date").value, "2003-04-05");
  assert.equal(ask("Date of Birth (MM/DD/YYYY)").value, "04/05/2003");
  assert.equal(ask("Are you open to working in person in our Chicago office?", "radio", ["Yes", "No"]).value, "Yes");
});

test("questions from live forms: state of residence, work authorization by country, employment rows, dates, referral, EEO wording", () => {
  const p = applyProfileSchema.parse({
    state: "Illinois", country: "United States", degree: "M.S.", graduation: "2028-05", authorizedToWork: "yes",
    hispanicLatino: "Not", currentEmployer: "Acme Analytics", currentTitle: "Data Analyst", hearAbout: "LinkedIn",
  });
  const yn = ["Yes", "No"];
  const got = answerFields(
    [
      { key: "state", label: "What U.S State do you currently reside in?*", type: "combobox", options: ["California", "IL", "New York"] },
      { key: "auth", label: "Are you legally authorized to work in the country where this position is located?*", type: "combobox", options: yn },
      { key: "hisp", label: "Are you Hispanic or Latinx?*", type: "combobox", options: ["Yes", "No", "I don't wish to answer"] },
      { key: "trans", label: "Do you identify as transgender?*", type: "combobox", options: ["Yes", "No", "I don't wish to answer"] },
      { key: "co", label: "Company name*", type: "text", hint: "company-name-0" },
      { key: "title", label: "Title*", type: "text", hint: "title-0" },
      { key: "ms", label: "By June 2030, will you have your Masters Degree in Data Science or a related field?*", type: "combobox", options: yn },
      { key: "ft", label: "I am available to begin a potential full-time role before September 2028.*", type: "combobox", options: yn },
      { key: "ft2", label: "I am available to begin a potential full-time role before March 2028.*", type: "combobox", options: yn },
      { key: "ref", label: "Are you being referred to this role as part of the Campus Referral Program?*", type: "combobox", options: yn },
    ],
    p,
  );
  const v = Object.fromEntries(got.map((a) => [a.key, a.value]));
  assert.deepEqual(v, {
    state: "IL", auth: "Yes", hisp: "No", trans: "I don't wish to answer", co: "Acme Analytics", title: "Data Analyst",
    ms: "Yes", ft: "Yes", ft2: "No", ref: "No",
  });
});

test("short acknowledgments count as consent: a lone “I Accept” box, “I understand that … may use AI tools”", () => {
  const p = applyProfileSchema.parse({});
  const [box, ack] = answerFields(
    [
      { key: "box", label: "I Accept", type: "checkbox" },
      { key: "ack", label: "I understand that Example may use AI tools to assist in the application and interview process.*", type: "combobox", options: ["Yes"] },
    ],
    p,
    { consent: true },
  );
  assert.equal(box.value, true);
  assert.equal(ack.value, "Yes");
  const [off] = answerFields([{ key: "box", label: "I Accept", type: "checkbox" }], p, {});
  assert.equal(off.value, null, "without the consent setting it waits for the owner");
});
