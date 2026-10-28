import type { SearchFormValues } from "./schema";
import { DEFAULT_EXCLUDES } from "./schema";
import type { Search } from "@/lib/db/schema";

export function newSearchDefaults(resumeId: string): SearchFormValues {
  return {
    name: "",
    titles: "",
    keywords: "",
    excludeWords: DEFAULT_EXCLUDES.join(", "),
    locations: "United States",
    includeRemote: true,
    levels: ["internship", "entry"],
    sources: ["greenhouse", "lever", "ashby", "workday"],
    companyScope: "all",
    resumeId,
    minScore: 45,
    scheduleHour: 7,
  };
}

export function searchToForm(s: Search): SearchFormValues {
  return {
    name: s.name,
    titles: s.titles.join("\n"),
    keywords: s.keywords.join(", "),
    excludeWords: s.excludeWords.join(", "),
    locations: s.locations.join("\n"),
    includeRemote: s.includeRemote,
    levels: s.levels as SearchFormValues["levels"],
    sources: s.sources as SearchFormValues["sources"],
    companyScope: s.companyScope as SearchFormValues["companyScope"],
    resumeId: s.resumeId ?? "",
    minScore: s.minScore,
    scheduleHour: s.scheduleHour ?? -1,
  };
}
