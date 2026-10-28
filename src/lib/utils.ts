import { type ClassValue, clsx } from "clsx";
import { format, formatDistanceToNowStrict, isValid, parse } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Adds https:// to a URL typed without a scheme. */
export function normalizeUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function formatDate(
  date: Date | number | null | undefined,
  pattern = "MMM d, yyyy",
): string {
  if (date == null) return "";
  const d = typeof date === "number" ? new Date(date) : date;
  return isValid(d) ? format(d, pattern) : "";
}

export function timeAgo(date: Date | number | null | undefined): string {
  if (date == null) return "";
  const d = typeof date === "number" ? new Date(date) : date;
  return isValid(d) ? `${formatDistanceToNowStrict(d)} ago` : "";
}

/** "2024-05" → "May 2024". Leaves other text untouched. */
export function formatMonth(value: string | null | undefined): string {
  if (!value) return "";
  const d = parse(value, "yyyy-MM", new Date());
  return isValid(d) ? format(d, "MMM yyyy") : value;
}

export function dateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  current?: boolean,
): string {
  const from = formatMonth(start);
  const to = current ? "Present" : formatMonth(end);
  if (from && to) return `${from} – ${to}`;
  return from || to;
}

/** Turns "acme-corp" or "acme_corp" into "Acme Corp". */
export function prettifySlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** yyyy-MM-dd for <input type="date">. */
export function toDateInput(date: Date | null | undefined): string {
  return date && isValid(date) ? format(date, "yyyy-MM-dd") : "";
}

export function fromDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
}
