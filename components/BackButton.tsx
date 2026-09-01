'use client';

interface Props {
  onClick: () => void;
  label?: string;
}

/**
 * The way back out of a nested view inside a sheet. Was written out twice,
 * byte for byte, in SettingsSheet and SemesterManager, which render inside
 * each other, so the two copies could only ever drift apart.
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
