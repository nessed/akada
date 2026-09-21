'use client';

import { useMemo } from 'react';
import HandNote from '@/components/notebook/HandNote';
import { useCourses } from '@/lib/data-hooks';
import { pickMarginNote, readObservations } from '@/lib/progression';
import { useProgression } from '@/lib/progression/use-progression';

/**
 * A note in the margin, in the reader's own hand.
 *
 * One sentence about how this reader studies, drawn from their own rows
 * (lib/progression/observations.ts), set in the handwriting face the app
 * keeps for marginalia. It says nothing until the term has taught it
 * something, changes as the term does, and prefers the present moment when
 * there is something true about it: "this is usually your hour".
 *
 * Given a course, it speaks only about that course. Given none, it speaks
 * about the reader.
 */
export default function Marginalia({
  courseId = null,
  className = '',
  size = 17,
  rotate = -2,
}: {
  courseId?: string | null;
  className?: string;
  size?: number;
  rotate?: number;
}) {
  const { progression, logged } = useProgression();
  const { courses } = useCourses();

  const note = useMemo(() => {
    if (!logged || !progression) return null;
    const observations = readObservations({
      habits: logged.habits,
      courses,
      now: new Date(),
      loggedToday: (progression.ledger.find((d) => d.iso === progression.today)?.rawTotal ?? 0) > 0,
    });
    return pickMarginNote(observations, progression.today, courseId);
  }, [logged, progression, courses, courseId]);

  if (!note) return null;

  return (
    <HandNote color="var(--ink-soft)" size={size} rotate={rotate} className={className}>
      {note.text}
    </HandNote>
  );
}
