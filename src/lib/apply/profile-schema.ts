import { z } from "zod";

// Your standard answers for job applications. Shared by the server (answer
// engine, API) and the browser (the "My answers" form).

const yesNo = z.enum(["yes", "no", ""]).default("");
const text = (max = 300) => z.string().trim().max(max).default("");

export const applyProfileSchema = z.object({
  // Contact
  firstName: text(100),
  lastName: text(100),
  preferredName: text(100),
  pronouns: text(50),
  email: text(200),
  phone: text(50),
  street: text(200),
  city: text(100),
  state: text(100),
  zip: text(20),
  country: text(100),
  linkedin: text(300),
  github: text(300),
  website: text(300),

  // Education (the school you're at now, or finished most recently)
  school: text(200),
  degree: text(200), // "Master of Science"
  major: text(200),
  gpa: text(20),
  graduation: text(20), // YYYY-MM
  previousSchool: text(200),
  previousDegree: text(200),
  previousGraduation: text(20),

  // Work authorization
  authorizedToWork: yesNo, // "Are you legally authorized to work in the US?"
  needsSponsorshipNow: yesNo, // sponsorship needed to start this job
  needsSponsorshipLater: yesNo, // sponsorship needed in the future (e.g. H-1B after OPT)
  visaStatus: text(100), // "F-1 student (CPT/OPT)"
  citizenship: text(100), // country of citizenship
  usCitizen: yesNo,
  permanentResident: yesNo,
  hasClearance: yesNo,
  usPerson: yesNo, // export-control "U.S. person" (citizen, green card, refugee/asylee)
  over18: yesNo,

  // Where and how you want to work
  preferredLocations: text(300), // "Chicago, IL; New York, NY; Remote", in order of preference
  workArrangement: z.enum(["any", "onsite", "hybrid", "remote", ""]).default(""),
  willingToRelocate: yesNo,
  willingToTravel: yesNo,

  // Availability and pay
  startDate: text(20), // YYYY-MM-DD or YYYY-MM
  availability: text(200), // "Summer 2027 (June to August)"
  salaryExpectation: text(100),
  hearAbout: text(100), // default answer to "How did you hear about us?"

  // Voluntary self-identification. Empty = "I don't wish to answer".
  gender: text(100),
  hispanicLatino: text(100),
  race: text(200),
  veteran: text(200),
  disability: text(200),

  languages: text(300),
  workedHereBefore: yesNo,

  // Your own questions and answers, matched by wording.
  custom: z
    .array(z.object({ question: z.string().trim().min(1).max(500), answer: z.string().trim().max(4000) }))
    .max(100)
    .default([]),
});

export type ApplyProfile = z.infer<typeof applyProfileSchema>;

export const EMPTY_PROFILE: ApplyProfile = applyProfileSchema.parse({});

/** Plain-language labels for the form and for agents. */
export const PROFILE_LABELS: Partial<Record<keyof ApplyProfile, string>> = {
  authorizedToWork: "Legally authorized to work in the US",
  needsSponsorshipNow: "Needs visa sponsorship to start this job",
  needsSponsorshipLater: "Will need visa sponsorship in the future (e.g. H-1B)",
  usPerson: "U.S. person for export-control rules (citizen or green card)",
};
