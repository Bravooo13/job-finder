import { convert } from "html-to-text";

// Entity decoding adapted from JobSync (MIT, see THIRD_PARTY_NOTICES.md).
// Greenhouse returns job content as entity-encoded HTML ("&lt;p&gt;"), so it
// has to be decoded back into real tags before it can be turned into text.
const NAMED_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&amp;": "&", // last, so it does not undo the others
};

export function decodeEntities(input: string): string {
  let out = input
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    out = out.split(entity).join(char);
  }
  return out;
}

/** Converts job-description HTML into readable plain text with bullets. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  // Lever sends list items without the surrounding <ul>, so wrap them.
  const source = /<li[\s>]/i.test(html) && !/<(ul|ol)[\s>]/i.test(html) ? `<ul>${html}</ul>` : html;
  const text = convert(source, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "h1", options: { uppercase: false } },
      { selector: "h2", options: { uppercase: false } },
      { selector: "h3", options: { uppercase: false } },
      { selector: "h4", options: { uppercase: false } },
      { selector: "table", format: "dataTable" },
      { selector: "ul", options: { itemPrefix: "• " } },
    ],
  });
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/** Pulls the content of <meta property|name="key" content="…">. */
export function metaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]).trim();
  }
  return undefined;
}

export function pageTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : undefined;
}
