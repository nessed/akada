/**
 * The ceilings the notes table's check constraints enforce, so the app, the
 * connector and the database agree on what a note can be.
 */
export const NOTE_TITLE_MAX = 300;
export const NOTE_MARKDOWN_MAX = 200_000;

export function cleanNoteTitle(value: string, markdown = ''): string {
  const fromHeading = markdown.match(/^#\s+(.+)$/m)?.[1];
  const title = (value || fromHeading || '').replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
  return (title || 'Untitled note').slice(0, NOTE_TITLE_MAX);
}

export function cleanNoteMarkdown(value: string): string {
  return value.replace(/\r\n?/g, '\n').slice(0, NOTE_MARKDOWN_MAX);
}
