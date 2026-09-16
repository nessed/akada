import { clampWeeklyGoalHours } from '@/lib/planner-safety';

type GoalReading = {
  label: string;
  detail: string;
  color: string;
};

function expectedStudyHours(credits?: number | null): number {
  return typeof credits === 'number' && credits > 0 ? credits * 2 : 8;
}

/**
 * The baseline follows the commonly used credit-hour convention of roughly
 * two hours of independent work per credit, per week. Course formats and
 * assessment weeks can reasonably call for more or less time.
 */
export function weeklyGoalReading(hours: number, credits?: number | null): GoalReading {
  const baseline = expectedStudyHours(credits);
  const course = typeof credits === 'number' && credits > 0 ? `${credits}-credit course` : 'standard 4-credit course';
  const guide = `${baseline}h guide`;

  if (hours < baseline * 0.65) {
    return { label: 'Light', detail: `below the ${guide} for this ${course}`, color: 'var(--slate)' };
  }
  if (hours < baseline) {
    return { label: 'Building', detail: `working toward the ${guide}`, color: 'var(--warn-soft)' };
  }
  if (hours <= baseline + 2) {
    return { label: 'Typical', detail: `around the ${guide} for this ${course}`, color: 'var(--sage)' };
  }
  if (hours <= baseline + 8) {
    return { label: 'Ambitious', detail: `extra practice above the ${guide}`, color: 'var(--clay)' };
  }
  // `priority` is the ramp for errors and destructive actions. An ambitious
  // study goal is not an error, so this reads in the quiet clay instead.
  return { label: 'Intensive', detail: `well above the ${guide}`, color: 'var(--warn)' };
}

export default function WeeklyGoalSlider({
  value,
  onChange,
  credits,
  label = 'Weekly study goal',
}: {
  value: number;
  onChange: (hours: number) => void;
  credits?: number | null;
  label?: string;
}) {
  const hours = clampWeeklyGoalHours(value);
  const reading = weeklyGoalReading(hours, credits);

  return (
    <div>
      <div className="flex items-center gap-4">
        <input
          aria-label={label}
          // The reading is a word on screen and a sentence to a screen
          // reader. Announcing a bare "12" says nothing about what 12 is.
          aria-valuetext={`${hours} hours a week, ${reading.label.toLowerCase()}, ${reading.detail}`}
          type="range"
          min="0.5"
          max="40"
          step="0.5"
          value={hours}
          onChange={(event) => onChange(clampWeeklyGoalHours(event.target.value))}
          className="pl-range flex-1"
          style={{ color: reading.color }}
        />
        <output
          aria-hidden
          className="w-14 text-right font-mono text-sm font-semibold tabular-nums"
          style={{ color: reading.color }}
        >
          {hours}<span className="ml-1 font-normal text-muted">h</span>
        </output>
      </div>
      {/* One word, in the colour of the reading. It used to spell out
          "below the 8h guide for this 4-credit course", which is the
          interface reading the slider back to the person holding it. */}
      <p className="eyebrow mt-2 mb-0" style={{ color: reading.color }}>
        {reading.label}
      </p>
    </div>
  );
}
