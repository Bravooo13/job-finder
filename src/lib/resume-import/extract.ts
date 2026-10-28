import "server-only";

// Pulls plain text lines out of a resume file. For PDFs, text pieces are
// regrouped into lines by position, and wide gaps (like right-aligned dates)
// become tabs so the parser can split them off.

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  hasEOL?: boolean;
}

export async function extractPdfLines(data: Uint8Array): Promise<string[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const lines: string[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, 6); n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items = (content.items as PdfTextItem[]).filter((i) => typeof i.str === "string");

    const rows: { y: number; items: PdfTextItem[] }[] = [];
    for (const item of items) {
      if (!item.str && !item.width) continue;
      const y = item.transform[5];
      const row = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (row) row.items.push(item);
      else rows.push({ y, items: [item] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.items.sort((a, b) => a.transform[4] - b.transform[4]);
      let text = "";
      let lastEnd: number | null = null;
      for (const item of row.items) {
        const x = item.transform[4];
        const gap = lastEnd === null ? 0 : x - lastEnd;
        if (!item.str.trim()) {
          if (item.width > 30) text += "\t";
          else if (!text.endsWith(" ") && !text.endsWith("\t")) text += " ";
        } else {
          if (gap > 30) text += "\t";
          else if (gap > 1.5 && !/[\s\t]$/.test(text) && !/^[,.;:)]/.test(item.str)) text += " ";
          text += item.str;
        }
        lastEnd = x + item.width;
      }
      const clean = text.replace(/[ ]{2,}/g, " ").replace(/\s*\t\s*/g, "\t").trim();
      if (clean) lines.push(clean);
    }
  }
  return lines;
}

export async function extractDocxLines(data: Buffer): Promise<string[]> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: data });
  return value
    .split(/\n+/)
    .map((l) => l.replace(/[ ]{2,}/g, " ").trim())
    .filter(Boolean);
}

export async function extractResumeLines(file: { name: string; type: string; data: Buffer }): Promise<string[]> {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    return extractPdfLines(new Uint8Array(file.data));
  }
  if (name.endsWith(".docx") || file.type.includes("wordprocessingml")) {
    return extractDocxLines(file.data);
  }
  if (file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
    return file.data
      .toString("utf8")
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  throw new Error("Upload a PDF, Word (.docx) or text file.");
}
