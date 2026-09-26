'use client';

import { useState } from 'react';

/**
 * Things to say to Claude once Akada is connected, each one copyable, since
 * the hardest part of a new tool is knowing what to ask it first.
 */
export default function AskList({ asks }: { asks: { say: string; note?: string }[] }) {
  const [copied, setCopied] = useState<number | null>(null);

  async function copy(i: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      window.setTimeout(() => setCopied((c) => (c === i ? null : c)), 1600);
    } catch {
      // Nothing to do: the text is on the page to be selected by hand.
    }
  }

  return (
    <ul className="m-0 list-none !pl-0 [&>li]:before:hidden">
      {asks.map((ask, i) => (
        <li
          key={ask.say}
          className="!m-0 flex items-start gap-4 border-t border-line py-4 first:border-t-0 first:pt-1"
        >
          <div className="min-w-0 flex-1">
            <p className="!m-0 font-serif !text-[18px] !leading-[1.55] !text-ink">&ldquo;{ask.say}&rdquo;</p>
            {ask.note && (
              <p className="!m-0 !mt-1 font-serif !text-[14px] italic !text-muted">{ask.note}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => copy(i, ask.say)}
            className="eyebrow mt-0.5 h-9 font-sans min-w-[64px] shrink-0 rounded-[9px] border border-line-strong px-3 transition-colors hover:bg-bg-tint hover:text-ink"
          >
            {copied === i ? 'copied' : 'copy'}
          </button>
        </li>
      ))}
    </ul>
  );
}
