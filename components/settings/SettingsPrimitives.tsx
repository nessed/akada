'use client';

import type { ReactNode } from 'react';
import HandCheck from '@/components/notebook/HandCheck';

/**
 * The pieces the settings sheet is built from.
 *
 * One rhythm for every section (an eyebrow, then a sheet of paper with ruled
 * rows), one radius for the panels and one for the fields and actions inside
 * them, and selection said with a tick or a swipe of highlighter rather than
 * a filled capsule.
 */

/** Panels, cards. */
export const PANEL_RADIUS = 'rounded-[14px]';
/** Fields, choices, and the sheet action pair, which matches them. */
export const FIELD_RADIUS = 'rounded-[10px]';

/** The sheet action pair, per the button spec. */
export const SHEET_ACTION = `flex-1 ${FIELD_RADIUS} py-3.5 text-sm font-medium`;
export const SHEET_ACTION_PRIMARY = `${SHEET_ACTION} bg-primary text-primary-contrast disabled:opacity-40`;
export const SHEET_ACTION_QUIET = `${SHEET_ACTION} border border-line-strong bg-transparent text-ink-soft disabled:opacity-50`;

/** Every nested view opens on the same gutter and the same breathing room. */
export const VIEW_PADDING =
  'px-[var(--density-gutter)] pt-5 pb-[var(--density-section)]';

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="m-0 font-serif text-[20px] font-medium tracking-[-0.02em]">{children}</h3>
  );
}

export function SettingGroup({
  label,
  children,
  first,
}: {
  label: string;
  children: ReactNode;
  /** The first group after the profile card sets its own distance. */
  first?: boolean;
}) {
  return (
    <section className={first ? '' : 'mt-[var(--density-section)]'}>
      <p className="eyebrow mb-2.5 ml-1">{label}</p>
      <div className={`overflow-hidden border border-line bg-paper ${PANEL_RADIUS}`}>
        {children}
      </div>
    </section>
  );
}

const ROW_BASE =
  'flex w-full items-center gap-3 bg-transparent px-[18px] py-3.5 text-left [&+*]:border-t [&+*]:border-line-soft';

function RowBody({
  label,
  sub,
  tone,
  trailing,
}: {
  label: string;
  sub?: string;
  tone?: 'warn';
  trailing?: ReactNode;
}) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm font-medium ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}
        >
          {label}
        </span>
        {sub && <span className="mt-0.5 block text-[11px] text-muted">{sub}</span>}
      </span>
      {trailing}
    </>
  );
}

function Chevron() {
  return (
    <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 text-muted-soft">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SettingRow({
  label,
  sub,
  onClick,
  href,
  tone,
}: {
  label: string;
  sub?: string;
  onClick?: () => void;
  /** For the rows that lead somewhere real: a policy page, a mailto. */
  href?: string;
  tone?: 'warn';
}) {
  const body = <RowBody label={label} sub={sub} tone={tone} trailing={<Chevron />} />;

  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith('mailto:') ? undefined : '_blank'}
        rel="noreferrer"
        className={ROW_BASE}
      >
        {body}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={ROW_BASE}>
      {body}
    </button>
  );
}

/**
 * A setting that is either kept or not, written in the hand the rest of the
 * app uses for a choice: a drawn box with a tick in it. A switch is operating
 * system chrome, and it was the only capsule left on the sheet.
 */
export function SettingToggleRow({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={ROW_BASE}
    >
      <RowBody
        label={label}
        sub={sub}
        trailing={
          <span
            aria-hidden
            className="scribble-box flex h-[21px] w-[21px] shrink-0 items-center justify-center"
            style={{ borderColor: value ? 'var(--ink)' : 'var(--line-strong)' }}
          >
            {value && <HandCheck size={14} color="var(--ink)" strokeWidth={1.7} />}
          </span>
        }
      />
    </button>
  );
}

/** A number kept from the record, under its eyebrow. */
export function StatMark({ label, value }: { label: string; value: string }) {
  return (
    <div className={`min-w-0 border border-line bg-paper px-3 py-2.5 ${FIELD_RADIUS}`}>
      <p className="m-0 font-mono text-[15px] font-semibold tracking-[-0.01em] tabular-nums text-ink">
        {value}
      </p>
      <p className="eyebrow mt-1 mb-0">{label}</p>
    </div>
  );
}

/**
 * One option in a row of them. Unchosen, it is a hairline box on the page;
 * chosen, it carries a swipe of highlighter under its name, the way a reader
 * marks the one they mean.
 */
export function ChoiceCell({
  selected,
  onClick,
  ariaLabel,
  className = '',
  children,
}: {
  selected: boolean;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`border border-line bg-transparent text-center transition-colors ${FIELD_RADIUS} ${className}`}
    >
      {children}
    </button>
  );
}
