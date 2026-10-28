export interface ImportedJob {
  title: string;
  company: string;
  location?: string;
  description?: string;
  url: string;
  source: string;
  jobType?: string; // one of JOB_TYPES values
  workplace?: string; // one of WORKPLACES values
  salary?: string;
  postedAt?: string; // ISO date
}

export type ImportResult =
  | { ok: true; job: ImportedJob; warning?: string }
  | { ok: false; error: string };

export class ImportError extends Error {}
