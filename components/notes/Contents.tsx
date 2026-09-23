'use client';

import HandNote from '@/components/notebook/HandNote';
import type { MarkdownHeading } from './MarkdownReader';
import type { CheckResult } from '@/lib/notes/store';

export function TocList({ headings, activeId, onJump }: { headings: MarkdownHeading[]; activeId: string; onJump: (id: string) => void }) {
  const activeIndex = headings.findIndex((h) => h.id === activeId);
  return (
    <ul className="toc-list">
      {headings.map((heading, index) => {
        const on = heading.id === activeId;
        const past = activeIndex >= 0 && index < activeIndex;
        return (
          <li key={heading.id}>
            <button
              type="button"
              className={`toc-link level-${heading.level} ${on ? 'is-on' : ''} ${past ? 'is-past' : ''}`}
              aria-current={on ? 'location' : undefined}
              onClick={() => onJump(heading.id)}
            >
              <span className={`lbl ${on ? 'hl-swipe' : ''}`}>{heading.text}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function CheckStrokes({ total, checks }: { total: number; checks: Record<string, CheckResult> }) {
  if (!total) return null;
  const results = Array.from({ length: total }, (_, i) => checks[String(i)]);
  const got = results.filter((r) => r === 'got').length;
  const miss = results.filter((r) => r === 'miss').length;
  const left = total - got - miss;
  return (
    <div>
      <span className="eyebrow">Checks</span>
      <div className="strokes" aria-hidden>
        {results.map((r, i) => (
          <span key={i} data-r={r ?? ''} />
        ))}
      </div>
      <p className="strokes-label">
        {got > 0 && <><b>{got}</b> got · </>}
        {miss > 0 && <><b>{miss}</b> to revisit · </>}
        {left > 0 ? <><b>{left}</b> untried</> : <>all tried</>}
      </p>
    </div>
  );
}

export function MinutesLeft({ minutes, progress }: { minutes: number; progress: number }) {
  const text = progress >= 0.98 ? 'read through' : minutes < 1 ? 'under a minute left' : `~ ${minutes} min left`;
  return (
    <HandNote className="left-note" rotate={-3} size={19}>
      {text}
    </HandNote>
  );
}
