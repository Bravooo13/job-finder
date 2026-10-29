// Puts every found job into filterable buckets: industry, role type, visa
// signals, level and US state. Pure functions; the database side is in ./store.ts.

import { parseLocation } from "@/lib/geo";
import { titleLevel } from "@/lib/search/match";
import { companyKey } from "./company";
import { classifyIndustry, type IndustryId } from "./industry";
import { classifyRole, type RoleTypeId } from "./role";
import { classifyVisa, type VisaStatus } from "./visa";

/** Bump when the rules change so stored jobs are classified again. */
export const CLASS_VERSION = 3;

export interface ClassifyInput {
  title: string;
  company: string;
  description?: string | null;
  location?: string | null;
  place?: string | null; // "Chicago, IL" from the geocoder
  remote?: boolean;
  sourceIndustry?: string | null;
  visaHint?: string | null;
  category?: string | null;
  naics?: string | null;
}

export interface Classification {
  industry: IndustryId;
  roleType: RoleTypeId;
  visa: VisaStatus;
  visaNote: string | null;
  level: ReturnType<typeof titleLevel>;
  state: string | null;
  companyKey: string;
}

export function stateOf(place: string | null | undefined, location: string | null | undefined, remote?: boolean): string | null {
  const m = /,\s*([A-Z]{2})$/.exec(place ?? "");
  if (m) return m[1];
  const parsed = parseLocation(location ?? "");
  const us = parsed.places.find((p) => p.country === "US");
  if (us?.admin) return us.admin;
  if (remote || parsed.remote) return "Remote";
  const other = parsed.places[0]?.country ?? parsed.countries[0];
  return other && other !== "US" ? other : null;
}

export function classifyJob(input: ClassifyInput): Classification {
  const visa = classifyVisa(input.title, input.description, input.visaHint);
  return {
    industry: classifyIndustry({
      company: input.company,
      description: input.description,
      sourceIndustry: input.sourceIndustry,
      naics: input.naics,
    }),
    roleType: classifyRole(input.title, input.category),
    visa: visa.status,
    visaNote: visa.note,
    level: titleLevel(input.title),
    state: stateOf(input.place, input.location, input.remote),
    companyKey: companyKey(input.company),
  };
}

export { companyKey, companyKeyVariants } from "./company";
export { INDUSTRIES, industryLabel } from "./industry";
export { ROLE_TYPES, roleTypeLabel } from "./role";
export { VISA_STATUSES, visaLabel, type VisaStatus } from "./visa";
