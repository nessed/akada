'use client';

import { useEffect } from 'react';
import type { SessionSegment } from '@/lib/data/types';
import { drawPicture, planPicture, type PictureInput } from '@/lib/ocean/picture';
import { drawGodRays, sunFor } from '@/lib/ocean/light';

function segs(start: string, parts: [string, number][]): SessionSegment[] {
  let t = Date.parse(start);
  return parts.map(([k, min], i) => {
    const s = { kind: k as 'focus' | 'break', ordinal: i, startedAt: new Date(t).toISOString(), seconds: min * 60, targetSeconds: null } as SessionSegment;
    t += min * 60000;
    return s;
  });
}

const CASES: { name: string; course: string; color: string; segs: SessionSegment[] }[] = [
  { name: '15min-morning-kelp', course: 'c-lang', color: '#A8B89B', segs: segs('2026-09-06T08:00:00Z', [['focus', 15]]) },
  { name: '50min-afternoon-break', course: 'c-hist', color: '#E2B594', segs: segs('2026-09-02T14:10:00Z', [['focus', 25], ['break', 5], ['focus', 25]]) },
  { name: '2h-evening-2breaks', course: 'c-bio', color: '#B5A8C9', segs: segs('2026-09-07T19:30:00Z', [['focus', 40], ['break', 10], ['focus', 40], ['break', 20], ['focus', 40]]) },
  { name: '3.5h-night-rare', course: 'c-bio', color: '#B5A8C9', segs: segs('2026-09-04T00:36:00Z', [['focus', 60], ['break', 10], ['focus', 60], ['break', 15], ['focus', 60], ['break', 5], ['focus', 30]]) },
  { name: '90min-dawn-turtle', course: 'c-hist', color: '#E2B594', segs: segs('2026-09-04T05:46:00Z', [['focus', 45], ['break', 10], ['focus', 45]]) },
  { name: '4.5h-trench', course: 'c-math', color: '#A8BCC9', segs: segs('2026-09-06T01:07:00Z', [['focus', 50], ['break', 10], ['focus', 50], ['break', 10], ['focus', 50], ['break', 30], ['focus', 60], ['break', 10], ['focus', 60]]) },
  { name: '2.5h-many-short', course: 'c-math', color: '#A8BCC9', segs: segs('2026-09-08T10:00:00Z', [['focus', 20], ['break', 5], ['focus', 20], ['break', 5], ['focus', 20], ['break', 5], ['focus', 20], ['break', 5], ['focus', 20], ['break', 5], ['focus', 20], ['break', 5], ['focus', 30]]) },
  { name: '25min-noon', course: 'c-art', color: '#D4A5A5', segs: segs('2026-09-09T12:00:00Z', [['focus', 25]]) },
];

declare global {
  interface Window {
    __pic?: (i: number, w: number, h: number, ground: 'paper' | 'night', px: number, noUrl?: boolean) => { url: string; plan: number; draw: number; flush?: number; times?: string } | null;
    __cases?: string[];
    __strips?: (i: number, w: number, h: number, ground: 'paper' | 'night', px: number, stripH: number, compare: boolean) => { strips: number[]; total: number; plan: number; diff: number; maxd: number; where: string; url: string } | null;
  }
}

export default function PictureProof() {
  useEffect(() => {
    window.__cases = CASES.map((c) => c.name);
    (window as unknown as { __planOf: (i: number) => unknown }).__planOf = (i) => planPicture({ courseId: CASES[i].course, color: CASES[i].color, segments: CASES[i].segs, ground: 'paper', tzOffset: 0 }, { width: 1920, height: 1200 })?.plan;
    window.__pic = (i, w, h, ground, px, noUrl) => {
      const c = CASES[i];
      const input: PictureInput = { courseId: c.course, color: c.color, segments: c.segs, ground, tzOffset: 0 };
      const T = ((globalThis as unknown as { __picT?: Record<string, number> }).__picT ??= {});
      for (const k of Object.keys(T)) delete T[k];
      const t0 = performance.now();
      const pic = planPicture(input, { width: w, height: h });
      const t1 = performance.now();
      if (!pic) return null;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * px);
      canvas.height = Math.round(h * px);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      drawPicture(ctx, pic, px);
      const t2 = performance.now();
      if (noUrl) { ctx.getImageData(0, 0, 1, 1); }
      const t3 = performance.now();
      return { url: noUrl ? '' : canvas.toDataURL('image/png'), flush: t3 - t2, plan: t1 - t0, draw: t2 - t1, times: JSON.stringify(Object.fromEntries(Object.entries(T).map(([k, v]) => [k.slice(0, 14), Math.round(v)]))) };
    };
  }, []);
  useEffect(() => {
    (window as unknown as { __rays: (h: number, sx: number, sy: number, seed: number, st: number) => string }).__rays = (hour, sx, sy, seed, st) => {
      const c = document.createElement('canvas');
      c.width = 1920;
      c.height = 1200;
      const x = c.getContext('2d')!;
      x.fillStyle = '#333';
      x.fillRect(0, 0, 1920, 1200);
      drawGodRays(x, 1920, 1200, { source: { x: sx, y: sy }, occluder: null, strength: st, sun: sunFor(hour), px: 1.2, seed, dark: false });
      return c.toDataURL('image/png');
    };
    window.__strips = (i, w, h, ground, px, stripH, compare) => {
      const c = CASES[i];
      const input: PictureInput = { courseId: c.course, color: c.color, segments: c.segs, ground, tzOffset: 0 };
      const t0 = performance.now();
      const pic = planPicture(input, { width: w, height: h });
      const t1 = performance.now();
      if (!pic) return null;
      const W = Math.round(w * px);
      const H = Math.round(h * px);
      const full = document.createElement('canvas');
      full.width = W;
      full.height = H;
      const fctx = full.getContext('2d');
      if (!fctx) return null;
      const strips: number[] = [];
      const strip = document.createElement('canvas');
      strip.width = W;
      strip.height = stripH;
      const sctx = strip.getContext('2d');
      if (!sctx) return null;
      for (let y = 0; y < H; y += stripH) {
        const s0 = performance.now();
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, W, stripH);
        sctx.save();
        sctx.beginPath();
        sctx.rect(0, 0, W, stripH);
        sctx.clip();
        sctx.translate(0, -y);
        drawPicture(sctx, pic, px);
        sctx.restore();
        fctx.drawImage(strip, 0, y);
        strips.push(Math.round(performance.now() - s0));
      }
      const total = performance.now() - t1;
      let diff = 0;
      let maxd = 0;
      const where: string[] = [];
      if (compare) {
        const whole = document.createElement('canvas');
        whole.width = W;
        whole.height = H;
        const wctx = whole.getContext('2d');
        if (!wctx) return null;
        drawPicture(wctx, pic, px);
        const a = fctx.getImageData(0, 0, W, H).data;
        const b = wctx.getImageData(0, 0, W, H).data;
        for (let k = 0; k < a.length; k += 4) {
          const d = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
          if (d > 12) {
            diff++;
            if (where.length < 30) where.push(`${(k / 4) % W},${Math.floor(k / 4 / W)}:${d}`);
          }
          maxd = Math.max(maxd, d);
        }
      }
      return { strips, total, plan: t1 - t0, diff, maxd, where: where.join(' '), url: compare ? full.toDataURL('image/png') : '' };
    };
  }, []);
  return <div id="ready">picture proof</div>;
}
