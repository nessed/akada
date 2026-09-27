'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CLAUDE_PAGE } from '@/lib/claude-page';
import { useLeaving } from '@/components/Leaving';

/**
 * What a Claude button hands over: one line on what Claude will do with it,
 * and the exact words it will be given.
 */
export interface ClaudeAsk {
  /** "Claude reads your outline and puts every deadline into ECON 100." */
  does: string;
  /** The prompt, exactly as it will be copied. */
  prompt: string;
}

interface ClaudeSheetApi {
  ask: (request: ClaudeAsk) => void;
}

const ClaudeSheetContext = createContext<ClaudeSheetApi | null>(null);

/**
 * Every "ask Claude" in the app, as one sheet.
 *
 * Claude used to turn up as six different behaviours: a link to a docs page,
 * a toast saying something had been copied, a prompt hidden behind "read the
 * prompt first", a button that silently copied. None of them said what would
 * happen, or that any of it needs the connector. This sheet says what this
 * one will do in a line, shows the exact prompt it is about to copy, and
 * carries one fixed footer about connecting, so after the first time a
 * reader knows what every Claude button in the app does.
 *
 * The app cannot see whether an account is connected, so the footer is always
 * there rather than guessing.
 */
export default function ClaudeSheetProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ClaudeAsk | null>(null);
  const ask = useCallback((request: ClaudeAsk) => setCurrent(request), []);
  return (
    <ClaudeSheetContext.Provider value={{ ask }}>
      {children}
      <ClaudeSheet request={current} onClose={() => setCurrent(null)} />
    </ClaudeSheetContext.Provider>
  );
}

export function useClaudeSheet(): ClaudeSheetApi {
  const api = useContext(ClaudeSheetContext);
  if (!api) throw new Error('useClaudeSheet must be used inside ClaudeSheetProvider');
  return api;
}

function ClaudeSheet({ request, onClose }: { request: ClaudeAsk | null; onClose: () => void }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const promptRef = useRef<HTMLPreElement | null>(null);
  const [shown, leaving] = useLeaving(request);
  const view = request ?? shown;

  useEffect(() => {
    if (request) setCopied(null);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [request, onClose]);

  if (!view) return null;

  /* The clipboard write has to happen in the click's own task or Safari
     treats it as untrusted, so nothing is awaited before it. */
  async function copy() {
    if (!view) return;
    try {
      await navigator.clipboard.writeText(view.prompt);
      setCopied('yes');
    } catch {
      // The words are on the sheet; select them by hand.
      setCopied('failed');
      const node = promptRef.current;
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  return (
    <div className={`sheet-lift fixed inset-0 z-[90] flex items-end ${leaving ? 'sheet-leaving' : 'animate-fade-in'}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 scrim backdrop-blur-sm" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="claude-sheet-does"
        className="relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-bg px-6 pt-3.5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-slide-up md:mx-auto md:max-w-xl"
      >
        <div className="mx-auto mb-[18px] h-1 w-9 shrink-0 rounded-full bg-line-strong" />
        <p className="eyebrow m-0">Ask Claude</p>
        <h3
          id="claude-sheet-does"
          className="m-0 mt-2 font-serif text-[20px] font-medium leading-[1.3] tracking-[-0.01em] text-ink"
        >
          {view.does}
        </h3>

        <p className="eyebrow m-0 mt-5">What gets copied</p>
        <pre
          ref={promptRef}
          tabIndex={0}
          className="app-scroll m-0 mt-2 max-h-[34vh] min-h-[96px] overflow-y-auto overscroll-contain whitespace-pre-wrap rounded-[10px] border border-line bg-paper px-4 py-3 font-serif text-[13.5px] leading-[1.6] text-ink-soft"
        >
          {view.prompt}
        </pre>

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[10px] border border-line-strong bg-transparent py-3.5 text-sm font-medium text-ink-soft"
          >
            Close
          </button>
          <button
            type="button"
            onClick={copy}
            className="flex-1 rounded-[10px] bg-primary py-3.5 text-sm font-medium text-primary-contrast"
          >
            {copied === 'yes' ? 'Copied' : 'Copy'}
          </button>
        </div>
        {copied === 'failed' && (
          <p className="m-0 mt-2 font-serif text-[12.5px] italic text-muted">
            Akada could not reach the clipboard, so the words are selected above to copy by hand.
          </p>
        )}

        {/* One footer, the same under every prompt in the app. */}
        <p className="m-0 mt-5 border-t border-line pt-4 font-serif text-[13px] italic leading-[1.55] text-muted">
          Akada is a connector in Claude. Connect it once (Claude › Customize › Connectors ›
          Akada), then paste this into a chat with Akada switched on.{' '}
          <Link href={CLAUDE_PAGE} onClick={onClose} className="hand-underline not-italic text-ink">
            How to connect
          </Link>
        </p>
      </section>
    </div>
  );
}
