import assert from "node:assert/strict";
import { test } from "node:test";
import { answerFields, chooseOption, type FieldType } from "@/lib/apply/answers";
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
  custom: [{ question: "Why are you interested in data science?", answer: "Because data explains markets." }],
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
