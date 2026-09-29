'use client';

import { useEffect, useRef } from 'react';
import type { AnimalGenome } from '@/lib/wood/fauna';
import { drawFigure, figureFor, inksFor } from '@/lib/wood/draw';
import { makePalette } from '@/lib/wood/palette';

/**
 * One animal from the wood, small, in ink: the sketch beside its name on the
 * log sheet. Drawn once, the way a naturalist puts a thumbnail in the margin
 * next to what they saw.
 */
export default function WoodSketch({ id, genome, className = '' }: { id: string; genome: AnimalGenome; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * px));
    canvas.height = Math.max(1, Math.round(rect.height * px));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const paper = getComputedStyle(canvas).getPropertyValue('--paper').trim() || '#FBF8EF';
    const pal = makePalette(paper, '#A8B89B', 'summer');
    const plan = genome.plan;
    const walker = plan === 'deer' || plan === 'fox' || plan === 'hare' || plan === 'hedgehog';
    const pose = walker ? { kind: 'stand' as const, t: 0 } : plan === 'songbird' || plan === 'owl' ? { kind: 'perch' as const, t: 0 } : { kind: 'fly' as const, t: 0.1 };
    const entry = figureFor(id, genome, pose);
    const [minX, minY, maxX, maxY] = entry.fig.bounds;
    const k = Math.min((canvas.width * 0.86) / Math.max(1, maxX - minX), (canvas.height * 0.86) / Math.max(1, maxY - minY));
    const size = k * entry.fig.ref;
    const x = canvas.width / 2 - ((minX + maxX) / 2) * k;
    const y = canvas.height / 2 - ((minY + maxY) / 2) * k;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawFigure(ctx, entry, { x, y, size, facing: 1, heading: entry.fig.planform ? 0 : undefined, alpha: 1, inks: inksFor(pal, genome, 0), px, lit: plan === 'firefly' ? 1 : 0 });
  }, [id, genome]);
  return <canvas ref={ref} aria-hidden data-no-doodle className={className} />;
}
