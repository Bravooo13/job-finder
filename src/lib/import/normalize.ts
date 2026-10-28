// Map the many ways boards describe job type and workplace onto our values.

export function normalizeJobType(raw?: string | string[] | null): string | undefined {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase().replace(/[\s_-]+/g, "");
  if (!value) return undefined;
  if (value.includes("intern")) return "internship";
  if (value.includes("parttime")) return "part_time";
  if (value.includes("fulltime") || value === "permanent") return "full_time";
  if (value.includes("contract") || value.includes("freelance")) return "contract";
  if (value.includes("temp") || value.includes("seasonal")) return "temporary";
  return undefined;
}

export function normalizeWorkplace(raw?: string | null): string | undefined {
  const value = raw?.toLowerCase().replace(/[\s_-]+/g, "");
  if (!value) return undefined;
  if (value.includes("remote") || value.includes("telecommute")) return "remote";
  if (value.includes("hybrid")) return "hybrid";
  if (value.includes("onsite") || value.includes("inoffice")) return "onsite";
  return undefined;
}

/** Guess remote/hybrid from free text such as a location line. */
export function workplaceFromText(text?: string | null): string | undefined {
  if (!text) return undefined;
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\bremote\b/i.test(text)) return "remote";
  return undefined;
}

export function formatSalary(
  min?: number | null,
  max?: number | null,
  currency?: string | null,
  unit?: string | null,
): string | undefined {
  if (min == null && max == null) return undefined;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: currency ? "currency" : "decimal",
      currency: currency || undefined,
      maximumFractionDigits: 0,
    }).format(n);
  const range =
    min != null && max != null && min !== max
      ? `${fmt(min)} – ${fmt(max)}`
      : fmt((min ?? max) as number);
  const per = unit ? ` / ${unit.toLowerCase().replace(/^per\s*/, "")}` : "";
  return `${range}${per}`;
}
