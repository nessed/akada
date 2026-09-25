'use client';

import { useMemo } from 'react';
import katex from 'katex';

/**
 * A question or option's words, with $inline$ LaTeX set the way the notes set
 * it. Anything KaTeX cannot read is left as the text it was.
 */
export default function QuizText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: { math: boolean; value: string }[] = [];
    const re = /\$([^$\n]+)\$/g;
    let at = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m.index > at) out.push({ math: false, value: text.slice(at, m.index) });
      let html = '';
      try {
        html = katex.renderToString(m[1], { throwOnError: false });
      } catch {
        html = '';
      }
      out.push(html ? { math: true, value: html } : { math: false, value: m[0] });
      at = m.index + m[0].length;
    }
    if (at < text.length) out.push({ math: false, value: text.slice(at) });
    return out;
  }, [text]);
  return (
    <>
      {parts.map((p, i) => (p.math ? <span key={i} dangerouslySetInnerHTML={{ __html: p.value }} /> : <span key={i}>{p.value}</span>))}
    </>
  );
}
