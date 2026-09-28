/* The pure half of the reader: headings, their ids and the check count, read
   straight off the markdown. Kept apart from MarkdownReader so the shelf and
   the page can use them without loading the renderer, KaTeX and Prism. */

export type MarkdownHeading = { id: string; text: string; level: 2 | 3 };

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/\$|\\|\*/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "section";

/** IDs shared by the renderer and the table of contents. */
export function getMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const used = new Map<string, number>();
  let fence: { marker: string; length: number } | null = null;
  return markdown.split(/\r?\n/).flatMap((line) => {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = { marker, length: fenceMatch[1].length };
      else if (fence.marker === marker && fenceMatch[1].length >= fence.length) fence = null;
      return [];
    }
    if (fence) return [];
    const match = /^ {0,3}(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return [];
    const text = match[2].replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`~]/g, "");
    const base = slug(text);
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return [{ id: count ? `${base}-${count + 1}` : base, text, level: match[1].length as 2 | 3 }];
  });
}

/** Opens a collapsed section before following a TOC anchor. */
export function openHeadingSection(id: string) {
  const heading = document.getElementById(id);
  const section = heading?.closest("[data-reader-section]");
  if (section && section.getAttribute("data-collapsed") === "true") {
    const button = section.querySelector<HTMLButtonElement>(".md-section-toggle");
    button?.click();
  }
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

/** How many "Check yourself" callouts a note holds, skipping fenced code. */
export function countChecks(markdown: string) {
  let fence = false;
  let count = 0;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) fence = !fence;
    else if (!fence && /^ {0,3}>\s*\[!CHECK\]/i.test(line)) count++;
  }
  return count;
}
