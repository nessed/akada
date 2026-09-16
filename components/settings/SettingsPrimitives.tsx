'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import HandCheck from '@/components/notebook/HandCheck';

/**
 * The pieces settings is built from.
 *
 * Settings used to be a stack of sheets sliding over one another from the
 * dashboard avatar, which meant the reader was always one level deep in
 * something with no address. It is a page now, and these are its rows: ruled
 * lines rather than boxed panels, square throughout, with a choice said by a
 * tick or a swipe of highlighter.
 */

/** A settings section: a heading, a rule, then rows. */
export function SettingGroup({
  label,
  children,
  first,
}: {
  label: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section className={first ? 'mt-7' : 'mt-[var(--density-section)]'}>
      <p className="eyebrow mb-1 border-t border-line pt-4">{label}</p>
      <div>{children}</div>
    </section>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="m-0 font-serif text-[20px] font-normal tracking-[-0.02em]">{children}</h2>;
}

const ROW = 'row-rule flex w-full items-center gap-4 bg-transparent py-3.5 text-left';

function RowBody({ label, sub }: { label: string; sub?: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-[14.5px] text-ink">{label}</span>
      {sub && <span className="mt-[3px] block text-[12px] text-muted">{sub}</span>}
    </span>
  );
}

const CHEVRON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-none">
    <path
      d="M9 6l6 6-6 6"
      stroke="var(--muted-soft)"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** A row that goes somewhere, or does something. */
export function SettingRow({
  label,
  sub,
  onClick,
  href,
  value,
  tone,
}: {
  label: string;
  sub?: ReactNode;
  onClick?: () => void;
  href?: string;
  /** A value shown on the right instead of a chevron. */
  value?: ReactNode;
  /** `care` marks the destructive rows. Clay, never red. */
  tone?: 'care';
}) {
  const body = (
    <>
      <RowBody label={label} sub={sub} />
      {value ? <span className="flex-none font-mono text-[12px] text-muted">{value}</span> : null}
      {(onClick || href) && !value ? CHEVRON : null}
    </>
  );
  const className = `${ROW} ${tone === 'care' ? '[&_span]:text-priority' : ''}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

/**
 * A switch. Drawn as an outline with a filled knob rather than a coloured
 * track — the app has one solid fill and it is not this.
 */
export function SettingToggleRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={ROW}
    >
      <RowBody label={label} sub={sub} />
      <span
        aria-hidden
        className="box-border flex h-[22px] w-[44px] flex-none items-center rounded-full px-0.5"
        style={{
          border: `1.4px solid ${checked ? 'var(--ink)' : 'var(--line-strong)'}`,
          justifyContent: checked ? 'flex-end' : 'flex-start',
        }}
      >
        <i
          className="block h-4 w-4 rounded-full"
          style={{ background: checked ? 'var(--ink)' : 'var(--line-strong)' }}
        />
      </span>
    </button>
  );
}

/**
 * A choice among a few, as words with a swipe under the chosen one. Used for
 * the review day, the day-end hour, anything with a handful of options.
 */
export function ChoiceLine<T extends string | number>({
  options,
  value,
  onChange,
  format,
  className = '',
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  format?: (option: T) => string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-baseline gap-4 ${className}`}>
      {options.map((option) => {
        const on = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option)}
            className={`bg-transparent font-serif text-[15px] ${
              on ? 'hl-swipe text-ink' : 'text-muted hover:text-ink-soft'
            }`}
          >
            {format ? format(option) : String(option)}
          </button>
        );
      })}
    </div>
  );
}

/** A ticked line, for a list where one item is the current one. */
export function ChosenTick({ shown }: { shown: boolean }) {
  if (!shown) return <span aria-hidden className="w-[15px] flex-none" />;
  return <HandCheck size={15} color="var(--ink)" strokeWidth={1.6} />;
}

/** Every settings view opens on the same gutter. */
export const VIEW_PADDING = 'px-[var(--density-gutter)] pb-[var(--density-section)] pt-5';
