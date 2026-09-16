'use client';

import HandCheck from './HandCheck';

/**
 * The small marks every screen is built out of.
 *
 * readmedesign.md's rule still holds and this file is where it is enforced:
 * the app does not use pills, and a selection is never a filled capsule. It is
 * a swipe of highlighter, a drawn box with a tick in it, a word ruled under in
 * ink, or a rule bitten across the page. The one solid fill in the app is the
 * single primary action on a screen, which is `PageButton` below.
 *
 * Corners are square. The only curves are circles and the deliberately uneven
 * radius of `CheckBox`, which is a box someone drew.
 */

/**
 * Uppercase caption. Section headers, field labels, course codes, "WK 06".
 *
 * The spec lives in `.eyebrow` in globals.css and it grew up: 11px rather
 * than 10, `ink-soft` rather than `muted`, and 0.12em of tracking rather than
 * 0.16. A signpost that needs looking at twice is not a signpost, and this is
 * the thing naming every section on every screen.
 */
export function Eyebrow({
  children,
  className = '',
  style,
  as: Tag = 'p',
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: 'p' | 'span' | 'h2' | 'h3';
}) {
  return (
    <Tag className={`eyebrow ${className}`} style={style}>
      {children}
    </Tag>
  );
}

/**
 * A heading with the ink rule under it. This is how a screen opens: the rule
 * is 1.5px of full ink, heavier than any divider inside the section, so the
 * page has one obvious top edge and everything below it is subordinate.
 */
export function SectionRule({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-5 pb-3 ${className}`}>{children}</div>
  );
}

/**
 * The drawn checkbox. Unchecked it is an empty box with an uneven radius;
 * checked it fills with the course colour and takes a tick in the paper
 * colour, the way a highlighter goes over a finished line.
 */
export function CheckBox({
  checked,
  color,
  size = 18,
  tone = 'ink',
}: {
  checked?: boolean;
  /** The course's colour. Fills the box once the row is done. */
  color?: string;
  size?: number;
  /** `soft` draws the empty box in the muted line colour: not yours to do yet. */
  tone?: 'ink' | 'soft';
}) {
  if (checked) {
    return (
      <span
        aria-hidden
        className="flex flex-none items-center justify-center"
        style={{ width: size, height: size, borderRadius: 4, background: color || 'var(--mint)' }}
      >
        <HandCheck size={Math.round(size * 0.61)} color="var(--paper)" strokeWidth={1.8} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="scribble-box flex-none"
      style={{
        width: size,
        height: size,
        borderColor: tone === 'soft' ? 'var(--muted-soft)' : 'var(--ink)',
      }}
    />
  );
}

/** A box already ticked in ink, for an option that is on rather than done. */
export function CheckedOption({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="scribble-box flex flex-none items-center justify-center"
      style={{ width: size, height: size }}
    >
      <HandCheck size={Math.round(size * 0.61)} color="var(--ink)" strokeWidth={1.6} />
    </span>
  );
}

/** The course's colour as a short vertical bar down the left of a row. */
export function CourseSpine({ color, height = 22 }: { color: string; height?: number }) {
  return (
    <span aria-hidden className="block flex-none" style={{ width: 3, height, background: color }} />
  );
}

/** The course's colour as a dot, where a bar would be too loud. */
export function CourseDot({ color, size = 7 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="block flex-none rounded-full"
      style={{ width: size, height: size, background: color }}
    />
  );
}

/**
 * A swipe of highlighter. This is how the app says "this one is chosen" —
 * a filter, a duration, a paper stock, the day the week is read back on.
 */
export function Swipe({
  children,
  color,
  className = '',
}: {
  children: React.ReactNode;
  /** Any tint. Defaults to the butter yellow. */
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`hl-swipe ${className}`}
      style={color ? ({ '--hl': color } as React.CSSProperties) : undefined}
    >
      {children}
    </span>
  );
}

/**
 * The one filled action on a screen. Square, ink-filled, 56px on a page and
 * 52px in a sheet. Anything that is not the single most likely next thing a
 * reader wants should be a `TextButton` instead.
 */
export function PageButton({
  children,
  onClick,
  type = 'button',
  disabled,
  className = '',
  size = 'page',
  icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
  size?: 'page' | 'sheet';
  icon?: React.ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-center gap-2.5 bg-primary font-sans font-medium text-primary-contrast transition-opacity disabled:opacity-40 ${
        size === 'page' ? 'min-h-[56px] text-[15px]' : 'min-h-[52px] text-[15px]'
      } ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

/** The play triangle on the button that starts a session. */
export function PlayGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 5l12 7-12 7V5z" />
    </svg>
  );
}

/**
 * A secondary action: a serif word with a straight ink rule under it. Quiet
 * enough to sit next to prose without becoming a button, legible enough that
 * it is obviously something you can press.
 */
export function TextButton({
  children,
  onClick,
  className = '',
  tone = 'ink',
  type = 'button',
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  /** `quiet` drops the rule and the ink: for "+ add a task" affordances. */
  tone?: 'ink' | 'quiet';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`font-serif disabled:opacity-40 ${
        tone === 'ink'
          ? 'ink-underline text-[15px] text-ink'
          : 'text-[13px] italic text-muted hover:text-ink-soft'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** The thin vertical hairline that separates two facts on one line. */
export function Tick() {
  return <span aria-hidden className="block h-[11px] w-px flex-none bg-line" />;
}
