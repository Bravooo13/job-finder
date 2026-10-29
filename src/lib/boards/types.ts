/** Job sources a search can read. */
export const PROVIDERS = ["greenhouse", "lever", "ashby", "workday", "smartrecruiters", "simplify"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Where a found job came from, including jobs grabbed from sites you browse. */
export type Source = Provider | "linkedin" | "handshake" | "web";

export const PROVIDER_LABELS: Record<Source, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
  smartrecruiters: "SmartRecruiters",
  simplify: "Simplify lists (GitHub)",
  linkedin: "LinkedIn",
  handshake: "Handshake",
  web: "Other websites",
};

/** One company's job board. */
export interface BoardRef {
  provider: Provider;
  token: string; // Greenhouse/Lever/Ashby slug, or Workday tenant
  name: string;
  host?: string; // Lever: "eu" for the EU host. Workday: e.g. "acme.wd5.myworkdayjobs.com"
  site?: string; // Workday career site, e.g. "External"
}

/** A job listing as read from a board. Description may need a second fetch. */
export interface Posting {
  provider: Provider;
  boardToken: string;
  company: string;
  externalId: string;
  title: string;
  location?: string;
  url: string;
  postedAt?: string;
  description?: string;
  jobType?: string;
  workplace?: string;
  salary?: string;
  /** Extra signals some sources give: their industry, visa note and category. */
  sourceIndustry?: string;
  visaHint?: string;
  category?: string;
  applyUrl?: string;
}

export interface ListOptions {
  signal?: AbortSignal;
  /** Search words for boards with server-side search (Workday). */
  queries?: string[];
}

export interface BoardAdapter {
  list(board: BoardRef, opts: ListOptions): Promise<Posting[]>;
  /** Fills in description and other details for one posting, if the list lacks them. */
  detail?(board: BoardRef, posting: Posting, signal?: AbortSignal): Promise<Partial<Posting>>;
}

export function boardKey(b: Pick<BoardRef, "provider" | "token" | "site">): string {
  return `${b.provider}:${b.token}${b.site ? `/${b.site}` : ""}`;
}
