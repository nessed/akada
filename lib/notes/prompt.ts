import { FORMAT_RULES } from './format';

/**
 * The prompt a reader pastes into their own AI chat, next to a summary or a
 * set of lecture notes, so the answer comes back in the format this reader
 * renders. A chat with the Akada connector does not need it: save_note
 * carries the same rules.
 */
export const FORMAT_PROMPT = `Rewrite the notes below as a study note in Markd format. Keep every fact, number, name and page reference. Don't add facts that aren't there. Output only the markdown, in one code block, nothing before or after it.

${FORMAT_RULES}

NOTES TO REWRITE:
`;
