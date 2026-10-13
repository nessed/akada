/**
 * The soak page: the real ocean scene, stepped through a long sitting on a
 * fast clock, timing every frame and reading the heap as it goes. Built and
 * driven by `run.mjs`; nothing in the app imports it.
 */

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import OceanScene from '@/components/OceanScene';

const q = new URLSearchParams(location.search);
const HOURS = Number(q.get('hours') ?? 9);
/** Focus seconds stepped each frame. */
const STEP = Number(q.get('step') ?? 20);
const KEY = q.get('key') ?? 'soak:1';

interface Hour {
  hour: number;
  /** The fast sweep's frames through the hour, and the heap at its end. */
  frames: number[];
  heap: number | null;
  /** Frames at about real speed, a second of focus each, from the hour's middle. */
  steady: number[];
}

declare global {
  interface Window {
    soak?: { done: boolean; hours: Hour[] };
  }
}

function heapMb(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? m.usedJSHeapSize / 1048576 : null;
}

/** Frames of the steady pass, and how many of them warm up first. */
const STEADY = 90;
const WARM = 15;

function Soak() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const hours: Hour[] = [];
    window.soak = { done: false, hours };
    // First the sweep: the whole sitting on a fast clock, the heap read each
    // hour, so a leak shows. Then each hour again at about real speed, so
    // the frame times are the ones a reader would see.
    let at = 0;
    let phase: 'sweep' | 'steady' = 'sweep';
    let sample = 0;
    let n = 0;
    let last = performance.now();
    let raf = 0;
    const hourOf = (h: number) => (hours[h] ??= { hour: h, frames: [], heap: null, steady: [] });
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (phase === 'sweep') {
        const hour = Math.floor(at / 3600);
        hourOf(hour).frames.push(dt);
        at += STEP;
        if (Math.floor(at / 3600) > hour) hourOf(hour).heap = heapMb();
        if (at >= HOURS * 3600) {
          phase = 'steady';
          sample = 0;
          n = 0;
          at = 1800;
        }
      } else {
        if (n > WARM) hourOf(sample).steady.push(dt);
        n++;
        at += 1;
        if (n >= STEADY) {
          sample++;
          n = 0;
          at = sample * 3600 + 1800;
          if (sample >= HOURS) {
            window.soak = { done: true, hours };
            return;
          }
        }
      }
      setT(at);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <OceanScene sittingKey={KEY} courseKey="soak:course" color="#A8BCC9" clock={{ frozen: t }} blocks={Math.floor(t / 1500)} resting={false} paused={false} still ground="night" className="absolute inset-0" />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Soak />);
