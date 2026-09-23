'use client';

import { useState } from 'react';
import Sheet from './Sheet';
import Icon from './Icon';
import { FORMAT_PROMPT } from '@/lib/notes/prompt';

/**
 * The prompt a reader hands their own AI. Copy it, paste it into the chat
 * with a summary or a lecture's notes, then paste the answer back here.
 */
export default function PromptSheet({ onClose, onPasteAnswer }: { onClose: () => void; onPasteAnswer: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showing, setShowing] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(FORMAT_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowing(true);
    }
  };

  return (
    <Sheet title="Notes from your AI" onClose={onClose}>
      <ol className="prompt-steps">
        <li>Copy the prompt.</li>
        <li>Paste it into ChatGPT, Claude or whatever you use, with your summary or notes under it.</li>
        <li>Copy the answer and paste it back here. It comes out as a proper note, callouts and checks included.</li>
      </ol>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
        <button type="button" className="btn btn-primary" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? 'Copied' : 'Copy prompt'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onPasteAnswer}>
          <Icon name="write" size={16} />
          Paste the answer
        </button>
      </div>
      <p className="set-note" style={{ marginTop: 16 }}>
        Using Claude with the Akada connector? Skip all this and ask it to save the notes to Akada. It writes them straight onto this shelf.
      </p>
      <button type="button" className="link" style={{ marginTop: 10 }} onClick={() => setShowing((s) => !s)}>
        {showing ? 'hide the prompt' : 'read the prompt first'}
      </button>
      {showing && (
        <pre className="prompt-text" tabIndex={0}>{FORMAT_PROMPT}</pre>
      )}
    </Sheet>
  );
}
