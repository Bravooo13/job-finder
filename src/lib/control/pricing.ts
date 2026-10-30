// What a Claude call costs, in US dollars (prices per million tokens, from
// Anthropic's pricing page, October 2026). Shared and pure, so it's testable.

interface Price {
  input: number;
  output: number;
  /** Cache reads as a share of the input price. */
  cacheRead: number;
}

const PRICES: [RegExp, Price][] = [
  [/fable-5-1|mythos-5-1/, { input: 10, output: 50, cacheRead: 0.025 }],
  [/fable|mythos/, { input: 10, output: 50, cacheRead: 0.1 }],
  [/opus-5-5/, { input: 4, output: 20, cacheRead: 0.05 }],
  [/sonnet-5-5/, { input: 2, output: 10, cacheRead: 0.05 }],
  [/haiku-5-5/, { input: 0.1, output: 0.5, cacheRead: 0.1 }],
  [/opus-5|opus-4-[5-9]/, { input: 5, output: 25, cacheRead: 0.1 }],
  [/opus-4/, { input: 15, output: 75, cacheRead: 0.1 }],
  [/sonnet-5/, { input: 2, output: 10, cacheRead: 0.1 }],
  [/sonnet/, { input: 3, output: 15, cacheRead: 0.1 }],
  [/haiku-4/, { input: 1, output: 5, cacheRead: 0.1 }],
  [/haiku/, { input: 0.8, output: 4, cacheRead: 0.1 }],
];

/** An unknown model is priced like Sonnet 4.x, so the spend cap errs on the safe side. */
const FALLBACK: Price = { input: 3, output: 15, cacheRead: 0.1 };

export interface Usage {
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
  webSearches?: number;
}

export function priceFor(model: string): Price {
  const m = model.toLowerCase();
  return PRICES.find(([re]) => re.test(m))?.[1] ?? FALLBACK;
}

/** Dollars for one call. Haiku 5.5 costs five times more when the prompt is over 100,000 tokens. */
export function costOf(model: string, u: Usage): number {
  let p = priceFor(model);
  const prompt = u.input + (u.cacheWrite ?? 0) + (u.cacheRead ?? 0);
  if (/haiku-5-5/.test(model.toLowerCase()) && prompt > 100_000) p = { ...p, input: 0.5, output: 2.5 };
  const tokens =
    u.input * p.input + u.output * p.output + (u.cacheWrite ?? 0) * p.input * 1.25 + (u.cacheRead ?? 0) * p.input * p.cacheRead;
  return tokens / 1_000_000 + (u.webSearches ?? 0) * 0.01;
}

/** Midnight today, local time: the spend cap resets then. */
export function startOfToday(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}
