'use client';

import { useDeferredValue, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { CALLOUTS, MarkdownReader } from './MarkdownReader';
import { minutesFor, wordCount } from '@/lib/notes/store';

type View = 'write' | 'preview' | 'split';

const INSERTS: { kind: string; body: string }[] = [
  { kind: 'DEF', body: '**Term:** what it means.' },
  { kind: 'EXAMPLE', body: 'A worked case.' },
  { kind: 'EXAM', body: 'How this gets asked.' },
  { kind: 'TRAP', body: 'The mistake people make.' },
  { kind: 'CHECK', body: 'Question?\n>\n> Answer.' },
  { kind: 'STEPS', body: '\n> 1. First\n> 2. Then\n> 3. Finally' },
  { kind: 'SOURCE', body: 'Book, page.' },
];

interface Props {
  draft: string;
  onChange: (value: string) => void;
  isNew: boolean;
  title: string;
  onSave: () => void;
  onCancel: () => void;
  onOpenFile: () => void;
}

export default function Editor({ draft, onChange, isNew, title, onSave, onCancel, onOpenFile }: Props) {
  const [view, setView] = useState<View>('write');
  const [wide, setWide] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const preview = useDeferredValue(draft);
  const words = wordCount(draft);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const sync = () => {
      setWide(media.matches);
      if (!media.matches) setView((v) => (v === 'split' ? 'write' : v));
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  /** Replace the selection, keeping the textarea's own undo history. */
  const insert = (before: string, after = '', fallback = '') => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const { selectionStart: start, selectionEnd: end, value } = el;
    const picked = value.slice(start, end) || fallback;
    const text = before + picked + after;
    if (!document.execCommand?.('insertText', false, text)) {
      onChange(value.slice(0, start) + text + value.slice(end));
    }
    requestAnimationFrame(() => {
      el.selectionStart = start + before.length;
      el.selectionEnd = start + before.length + picked.length;
    });
  };

  const insertCallout = (kind: string, body: string) => {
    const el = ref.current;
    if (!el) return;
    const atLineStart = el.selectionStart === 0 || el.value[el.selectionStart - 1] === '\n';
    const selected = el.value.slice(el.selectionStart, el.selectionEnd);
    const content = selected ? selected.split('\n').join('\n> ') : body;
    insert(`${atLineStart ? '' : '\n\n'}> [!${kind}] `, '\n\n', content);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === 'Tab' && !mod) {
      event.preventDefault();
      insert('  ');
    } else if (mod && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      insert('**', '**', 'bold');
    } else if (mod && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      insert('*', '*', 'italic');
    } else if (mod && event.shiftKey && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      insert('==', '==', 'highlight');
    }
  };

  const showWrite = view !== 'preview';
  const showPreview = view !== 'write';

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <p className="standfirst">
            {isNew ? 'Writing' : 'Editing'} · {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
            {words > 0 && <> · {minutesFor(words)} min read</>}
          </p>
          <h1 className="screen-title">{isNew && !draft.trim() ? 'A new note' : title}</h1>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={onOpenFile}>
            <Icon name="upload" size={16} />
            Open .md
          </button>
        </div>
      </div>

      <div className="editor-bar">
        <div className="tabs" role="group" aria-label="Editor view">
          <button type="button" className="tab" aria-pressed={view === 'write'} onClick={() => setView('write')}><span>Write</span></button>
          <button type="button" className="tab" aria-pressed={view === 'preview'} onClick={() => setView('preview')}><span>Preview</span></button>
          {wide && (
            <button type="button" className="tab" aria-pressed={view === 'split'} onClick={() => setView('split')}><span>Side by side</span></button>
          )}
        </div>
      </div>

      {showWrite && (
        <div className="inserts" aria-label="Insert a block">
          {INSERTS.map((item) => {
            const info = CALLOUTS[item.kind];
            return (
              <button key={item.kind} type="button" className="insert" onClick={() => insertCallout(item.kind, item.body)}>
                <span className="course-rule" style={{ ['--c' as string]: `var(--${info.tone})` }} aria-hidden />
                {info.label}
              </button>
            );
          })}
          <button type="button" className="insert" onClick={() => insert('==', '==', 'highlight')} title="Ctrl/⌘ Shift H">
            <span className="hl-swipe" style={{ padding: 0 }}>Highlight</span>
          </button>
          <button type="button" className="insert" onClick={() => insert('$', '$', 'x^2')}>Math</button>
        </div>
      )}

      <div className="editor-grid" data-view={view}>
        {showWrite && (
          <textarea
            ref={ref}
            className="paste-area deckle"
            value={draft}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={'# Your note title\n\nPaste your study notes here.\n\n> [!DEF] **Term:** what it means.'}
            spellCheck
            aria-label="Markdown"
          />
        )}
        {showPreview && (
          <div className={`preview-pane ${view === 'split' ? 'reading-size-small' : ''}`}>
            {preview.trim() ? (
              <MarkdownReader markdown={preview} collapsedSections={new Set()} onToggleSection={() => {}} />
            ) : (
              <p className="standfirst">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      <div className="editor-foot">
        <span className="hint">
          <span className="kbd">Ctrl S</span> save · <span className="kbd">Esc</span> leave
        </span>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={!draft.trim()}>
            <Icon name="read" size={16} />
            Save and read
          </button>
        </div>
      </div>
    </div>
  );
}
