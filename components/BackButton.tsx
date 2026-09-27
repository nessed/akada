'use client';

interface Props {
  onClick: () => void;
  label?: string;
}

/**
 * The way back out of a nested view inside a sheet, such as SemesterManager's.
 * One copy, so the ways back cannot drift apart.
 */
export default function BackButton({ onClick, label = 'Back' }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 cursor-pointer border-0 bg-transparent p-0 text-[13px] text-muted"
    >
      ← {label}
    </button>
  );
}
