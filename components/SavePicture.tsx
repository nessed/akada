'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLeaving } from './Leaving';
import { drawPicture, planPicture, type PictureInput } from '@/lib/ocean/picture';
import { renderPicturePng, type DrawFn } from '@/lib/print/engine';
import { FRAME_PAPERS, type PaperName } from '@/lib/print/frame';
import {
  frameLayout,
  pictureShape,
  printChoices,
  printPixels,
  PRINT_DPI,
  PRINT_SIZES,
  screenPixels,
  type SizeId,
} from '@/lib/print/sizes';
import {
  groundBehind,
  hasWallpaperLayers,
  prefersShareSheet,
  renderMoment,
  saveWallpaper,
  screenShape,
} from '@/lib/wallpaper';

export type PictureSubject = 'moment' | 'sitting';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Which picture the sheet opens on, when both are on offer. */
  initial?: PictureSubject;
  /** Where the live scene's layers are, for "this moment". Without it, or
      with nothing registered there, the moment is not offered. */
  momentRoot?: () => HTMLElement | null;
  /** The sitting, for "the whole sitting". The ground comes from the paper. */
  sitting?: Omit<PictureInput, 'ground'> | null;
  /** The paper it opens on. */
  night: boolean;
  /** The file's name, without the size or `.png`. */
  name: string;
}

type Phase =
  | { at: 'choose' }
  | { at: 'developing' }
  | { at: 'ready'; blob: Blob; file: string }
  | { at: 'failed' };

/* The ground under the sitting's picture, where its own paint leaves any. */
const SITTING_GROUND: Record<PaperName, string> = {
  cream: '#F4EFE3',
  night: '#1A1815',
};

/* The preview's longest side, CSS px. */
const PREVIEW = 168;

function pencilRect(x: number, y: number, w: number, h: number, seed: number): string {
  // Four strokes, each a little bowed and running a touch past the corner,
  // the way a rectangle is ruled by hand.
  const j = (n: number) => (((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1 - 0.5;
  const o = 1.6;
  const b = 0.9;
  const line = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    const mx = (x0 + x1) / 2 + j(n) * b * 2;
    const my = (y0 + y1) / 2 + j(n + 1) * b * 2;
    return `M${(x0 + j(n + 2) * o).toFixed(1)} ${(y0 + j(n + 3) * o).toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${(x1 + j(n + 4) * o).toFixed(1)} ${(y1 + j(n + 5) * o).toFixed(1)}`;
  };
  return [
    line(x - o, y, x + w + o, y, 1),
    line(x + w, y - o, x + w, y + h + o, 7),
    line(x + w + o, y + h, x - o, y + h, 13),
    line(x, y + h + o, x, y - o, 19),
  ].join(' ');
}

/**
 * Keeping a picture: the moment on the screen now, or the whole sitting as
 * one painting, at the screen's own size for a wallpaper or at a print size
 * on a paper margin. While it is drawn the sheet shows it coming up strip by
 * strip inside a pencil outline of its shape; it can be put down at any
 * point. On a phone it then goes to the share sheet, from a fresh tap, since
 * a share needs one; elsewhere it downloads.
 */
export default function SavePicture({ open, onClose, initial = 'moment', momentRoot, sitting, night, name }: Props) {
  const [shown, leaving] = useLeaving(open);
  const [subject, setSubject] = useState<PictureSubject>(initial);
  const [paper, setPaper] = useState<PaperName>(night ? 'night' : 'cream');
  const [size, setSize] = useState<SizeId>('screen');
  const [phase, setPhase] = useState<Phase>({ at: 'choose' });
  const [hasMoment, setHasMoment] = useState(false);
  const [prints, setPrints] = useState<SizeId[]>(['a4', 'a3', 'a2']);
  const [screenPx, setScreenPx] = useState<{ width: number; height: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Every opening starts fresh, on the picture it was opened for.
  useEffect(() => {
    if (!open) return;
    const moment = hasWallpaperLayers(momentRoot?.());
    setHasMoment(moment);
    setSubject(initial === 'sitting' && sitting ? 'sitting' : moment ? 'moment' : 'sitting');
    setPaper(night ? 'night' : 'cream');
    setPhase({ at: 'choose' });
    setPrints(printChoices(navigator.language));
    setScreenPx(screenPixels(screenShape()));
    // Only on opening: the props move under a running clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Closing (or leaving the page) puts down a picture still being drawn.
  useEffect(() => {
    if (!open) controller.current?.abort();
  }, [open]);
  useEffect(() => () => controller.current?.abort(), []);

  const framed = size !== 'screen';
  const out = useMemo(
    () => (size === 'screen' ? screenPx ?? { width: 1, height: 1 } : printPixels(size)),
    [size, screenPx],
  );
  const layout = useMemo(() => (framed ? frameLayout(out.width, out.height) : null), [framed, out]);
  const k = PREVIEW / Math.max(out.width, out.height);
  const pw = Math.max(1, Math.round(out.width * k));
  const ph = Math.max(1, Math.round(out.height * k));

  const clearPreview = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(pw * dpr);
    c.height = Math.round(ph * dpr);
  }, [pw, ph]);

  // A new shape is a fresh outline with nothing in it.
  useEffect(() => {
    if (phase.at === 'choose' || phase.at === 'failed') clearPreview();
  }, [clearPreview, phase.at, size, shown]);

  const stop = useCallback(() => {
    controller.current?.abort();
  }, []);

  const develop = useCallback(async () => {
    const ac = new AbortController();
    controller.current = ac;
    clearPreview();
    setPhase({ at: 'developing' });
    // Let the sheet show it is developing before the first heavy strip.
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const W = out.width;
    const H = out.height;
    const rect = layout?.picture ?? { x: 0, y: 0, w: W, h: H };
    let release = () => {};
    try {
      let draw: DrawFn;
      let supersample = 2;
      let background: string;
      if (subject === 'sitting') {
        if (!sitting) throw new Error('No sitting');
        const shape = pictureShape({ width: rect.w, height: rect.h }, framed ? null : screenShape());
        const pic = planPicture(
          { ...sitting, ground: paper === 'night' ? 'night' : 'paper' },
          { width: shape.width, height: shape.height },
        );
        if (!pic) throw new Error('No picture');
        draw = (ctx, w, _h, rows) => drawPicture(ctx, pic, w / pic.width, rows);
        background = SITTING_GROUND[paper];
        // The painting is costly per pixel and anti-aliases itself; at 300 dpi
        // drawing it twice over buys nothing a print shows, and costs 4x.
        supersample = framed ? 1 : 2;
      } else {
        const root = momentRoot?.();
        if (!root) throw new Error('No scene');
        // The scene laid out at the screen's own scale, in the picture's
        // shape, and drawn as large as a canvas allows.
        const screen = screenShape();
        const long = Math.max(screen.width, screen.height);
        const scale = long / Math.max(rect.w, rect.h);
        const moment = renderMoment(
          root,
          { width: rect.w * scale, height: rect.h * scale },
          framed ? 1 / scale : Math.max(screen.dpr, 1 / scale),
        );
        if (!moment) throw new Error('No layers');
        release = () => {
          moment.canvas.width = 0;
          moment.canvas.height = 0;
        };
        background = groundBehind(root);
        supersample = 1;
        draw = (ctx, w, h) => {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(moment.canvas, 0, 0, w, h);
        };
      }

      const blob = await renderPicturePng({
        width: W,
        height: H,
        supersample,
        frame: framed ? { paper, seed: name, layout: layout ?? undefined } : undefined,
        background,
        dpi: framed ? PRINT_DPI : undefined,
        draw,
        signal: ac.signal,
        onStrip: (strip, sourceY, y, rows) => {
          const c = canvasRef.current;
          const ctx = c?.getContext('2d');
          if (!c || !ctx) return;
          const s = c.width / W;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(strip, 0, sourceY, W, rows, 0, y * s, c.width, rows * s);
        },
      });
      release();
      const file = `${name}${framed ? `-${PRINT_SIZES[size as keyof typeof PRINT_SIZES].label.replace(/\s/g, '')}` : ''}.png`;
      if (prefersShareSheet()) {
        // The share sheet only opens from a tap, and the one that started
        // this is long spent. The picture waits for another.
        setPhase({ at: 'ready', blob, file });
        return;
      }
      await saveWallpaper({ blob }, file);
      onClose();
    } catch (e) {
      release();
      if (e instanceof DOMException && e.name === 'AbortError') {
        setPhase({ at: 'choose' });
        return;
      }
      console.error('The picture did not draw:', e);
      setPhase({ at: 'failed' });
    } finally {
      if (controller.current === ac) controller.current = null;
    }
  }, [clearPreview, framed, layout, momentRoot, name, onClose, out, paper, size, sitting, subject]);

  const developing = phase.at === 'developing';

  // While open, the keys are the sheet's: Escape puts the picture down or
  // closes, and nothing reaches the timer's own keys underneath.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (developing) stop();
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [developing, onClose, open, stop]);

  if (!shown) return null;

  const subjects: { id: PictureSubject; label: string }[] = [
    ...(hasMoment ? [{ id: 'moment' as const, label: 'This moment' }] : []),
    ...(sitting ? [{ id: 'sitting' as const, label: 'The whole sitting' }] : []),
  ];
  const sizes: { id: SizeId; label: string }[] = [
    { id: 'screen', label: 'This screen' },
    ...prints.map((id) => ({ id, label: PRINT_SIZES[id as keyof typeof PRINT_SIZES].label })),
  ];
  // The moment carries the paper it was drawn on; the choice only matters
  // for the margin of a print.
  const showPaper = subject === 'sitting' || framed;
  const sheet = FRAME_PAPERS[paper].ground;
  const plate = layout
    ? { x: layout.plate.x * k, y: layout.plate.y * k, w: layout.plate.w * k, h: layout.plate.h * k }
    : null;
  const pic = layout
    ? { x: layout.picture.x * k, y: layout.picture.y * k, w: layout.picture.w * k, h: layout.picture.h * k }
    : { x: 0, y: 0, w: pw, h: ph };

  const choice = (on: boolean, disabled: boolean) =>
    `shrink-0 bg-transparent px-0.5 py-1 font-serif text-[14px] transition-colors disabled:cursor-default ${
      on ? 'hl-swipe text-ink' : `text-muted ${disabled ? '' : 'hover:text-ink-soft'}`
    }`;

  return (
    <div className={`sheet-lift fixed inset-0 z-[90] flex items-end ${leaving ? 'sheet-leaving' : 'animate-fade-in'}`}>
      <button
        type="button"
        aria-label={developing ? 'Stop' : 'Close'}
        onClick={developing ? stop : onClose}
        className="absolute inset-0 scrim backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keep the picture"
        className="relative w-full md:mx-auto md:max-w-xl rounded-t-3xl bg-bg px-6 pt-3.5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] animate-slide-up"
      >
        <div className="mx-auto mb-[18px] h-1 w-9 rounded-full bg-line-strong" />
        <h3 className="mb-1.5 mt-0 font-serif text-[22px] font-medium tracking-[-0.01em]">Keep the picture</h3>
        <p className="mb-0 mt-0 font-serif text-[13px] italic leading-[1.5] text-muted">
          {subject === 'sitting'
            ? 'the sitting from its first minute, painted as one piece of sea.'
            : 'the water as it is now, without the clock on it.'}
        </p>

        <div className="mt-5 flex items-start gap-5">
          <div className="min-w-0 flex-1 space-y-4">
            {subjects.length > 1 && (
              <fieldset className="m-0 border-0 p-0">
                <legend className="eyebrow mb-1.5 p-0">What</legend>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {subjects.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={subject === s.id}
                      disabled={developing}
                      onClick={() => setSubject(s.id)}
                      className={choice(subject === s.id, developing)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {showPaper && (
              <fieldset className="m-0 border-0 p-0">
                <legend className="eyebrow mb-1.5 p-0">Paper</legend>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {(['cream', 'night'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={paper === p}
                      disabled={developing}
                      onClick={() => setPaper(p)}
                      className={choice(paper === p, developing)}
                    >
                      {p === 'cream' ? 'Cream' : 'Night'}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset className="m-0 border-0 p-0">
              <legend className="eyebrow mb-1.5 p-0">Size</legend>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {sizes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={size === s.id}
                    disabled={developing}
                    onClick={() => setSize(s.id)}
                    className={choice(size === s.id, developing)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="m-0 mt-1.5 text-[12px] text-muted">
                <span className="font-mono tabular-nums text-[11px]">
                  {out.width} × {out.height}
                </span>
                <span className="font-serif italic">
                  {framed ? ` at ${PRINT_DPI} dpi, on a margin` : ', edge to edge'}
                </span>
              </p>
            </fieldset>
          </div>

          {/* The picture's shape in pencil. As it develops, it fills in from
              the top, strip by strip. */}
          <div className="shrink-0 pt-1" aria-hidden>
            <div className="relative" style={{ width: pw, height: ph }}>
              {framed && (developing || phase.at === 'ready') && (
                <div className="absolute inset-0 animate-fade-in" style={{ background: sheet }} />
              )}
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
              <svg
                className="absolute inset-0 overflow-visible text-muted-soft"
                width={pw}
                height={ph}
                viewBox={`0 0 ${pw} ${ph}`}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
              >
                <path d={pencilRect(0.5, 0.5, pw - 1, ph - 1, 3)} strokeWidth="0.9" opacity={developing || phase.at === 'ready' ? 0.35 : 0.9} />
                {plate && (
                  <rect x={plate.x} y={plate.y} width={plate.w} height={plate.h} strokeWidth="0.6" strokeDasharray="2 2.5" opacity={0.6} />
                )}
                {framed && (
                  <path d={pencilRect(pic.x, pic.y, pic.w, pic.h, 5)} strokeWidth="0.6" opacity={developing || phase.at === 'ready' ? 0 : 0.7} />
                )}
              </svg>
            </div>
          </div>
        </div>

        <div className="mt-5 min-h-[26px]" aria-live="polite">
          {developing && (
            <p className="m-0 font-hand text-[19px] leading-none text-muted animate-settle">letting it develop…</p>
          )}
          {phase.at === 'ready' && (
            <p className="m-0 font-hand text-[19px] leading-none text-muted animate-settle">it’s dry.</p>
          )}
          {phase.at === 'failed' && (
            <p className="m-0 font-serif text-[13px] italic text-muted animate-settle">It didn’t draw just now. Try once more, or a smaller size.</p>
          )}
        </div>

        <div className="mt-3 flex gap-2.5">
          {developing ? (
            <button
              type="button"
              onClick={stop}
              className="flex-1 rounded-[10px] border border-line-strong bg-transparent py-3.5 text-sm font-medium text-ink-soft"
            >
              Stop
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-[10px] border border-line-strong bg-transparent py-3.5 text-sm font-medium text-ink-soft"
              >
                {phase.at === 'ready' ? 'Close' : 'Cancel'}
              </button>
              {phase.at === 'ready' ? (
                <button
                  type="button"
                  onClick={async () => {
                    await saveWallpaper({ blob: phase.blob }, phase.file);
                    onClose();
                  }}
                  className="flex-1 rounded-[10px] bg-primary py-3.5 text-sm font-medium text-primary-contrast"
                >
                  Save picture
                </button>
              ) : (
                <button
                  type="button"
                  disabled={subjects.length === 0}
                  onClick={() => void develop()}
                  className="flex-1 rounded-[10px] bg-primary py-3.5 text-sm font-medium text-primary-contrast disabled:opacity-30"
                >
                  Save
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
