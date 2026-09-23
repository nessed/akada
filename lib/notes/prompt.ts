/**
 * The prompt a reader pastes into their own AI chat, next to a summary or a
 * set of lecture notes, so the answer comes back in the format this reader
 * renders: callouts, checks, steps, highlights and math.
 */
export const FORMAT_PROMPT = `Rewrite the notes below as a study note in Markd format. Keep every fact, number, name and page reference. Don't add facts that aren't there. Output only the markdown, in one code block, nothing before or after it.

FORMAT RULES

1. Start with "# Title" on the first line, then one short plain line of context (course, chapter, source).
2. Break the note into sections with "## 1. Section name", numbered. Use "### Sub-heading" inside a section only when it genuinely has parts.
3. Short paragraphs. Plain words. Bold the key terms the first time they appear. Wrap the single most important phrase in a section in ==double equals== to highlight it (at most one or two per section).
4. Math goes in LaTeX: $inline$ and $$display$$ on its own lines.
5. Use these callout blocks. Each is a blockquote whose first line starts with the tag:

> [!DEF] **Term:** what it means, in one or two sentences. Add "*Not to be confused with:* ..." when there's a classic mix-up.

> [!EXAMPLE] A worked case with real numbers, step by step.

> [!EXAM] How this topic gets asked in exams and what earns the marks.

> [!TRAP] The common mistake and how to avoid it.

> [!SOURCE] Where to read the original (book, page, lecture slide).

> [!ARGUMENT] **Claim:** ... **Counter-claim:** ... for debates and competing views.

> [!STEPS]
> 1. First step
> 2. Next step
> 3. Last step

> [!CHECK] A question the reader should answer from memory.
>
> **Answer:** the answer, written out.

6. Put a [!DEF] right after a term is introduced. Put an [!EXAM] near the top if the material has an exam angle. Use [!STEPS] for any derivation, process or method.
7. End with a section called "## Quick check" holding two to four [!CHECK] blocks that cover the whole note.
8. Tables are fine for comparisons (GitHub markdown tables). Use "- " for bullet lists.
9. Don't use HTML, emoji, or any callout tag not listed above.

NOTES TO REWRITE:
`;
