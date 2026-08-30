'use client';

type Props = {
  label: string;
  detail?: string;
  compact?: boolean;
  className?: string;
};

/** A quiet, accessible progress cue for waits that have no percentage. */
export default function LoadingIndicator({
  label,
  detail,
  compact = false,
  className = '',
}: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center ${compact ? 'gap-2' : 'flex-col gap-3 text-center'} ${className}`}
    >
      <span className="flex h-5 items-center gap-1" aria-hidden>
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
            style={{ animationDelay: `${dot * 140}ms`, animationDuration: '900ms' }}
          />
        ))}
      </span>
      <div>
        <p className={`m-0 font-serif italic text-muted ${compact ? 'text-[13px]' : 'text-[15px]'}`}>
          {label}
        </p>
        {detail && !compact && (
          <p className="mt-1 mb-0 text-[12px] leading-[1.5] text-muted-soft">{detail}</p>
        )}
      </div>
      <span className="sr-only">Please wait.</span>
    </div>
  );
}

export function ButtonSpinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}
