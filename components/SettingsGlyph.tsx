import { initialsFor } from '@/lib/utils';

const GEAR_PATH = (
  <>
    <path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
    <circle cx="16" cy="7" r="2.2" />
    <circle cx="10" cy="17" r="2.2" />
  </>
);

/** The plain gear, unchanged from before a reader had a name or a photo. */
export const SETTINGS_GEAR = (
  <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    {GEAR_PATH}
  </svg>
);

/**
 * The way into Settings, as the reader's own face once there is one: their
 * photo or initials, standing in for the gear it replaces, with a small gear
 * badge at the corner so the row still reads as Settings at a glance. Falls
 * back to the plain gear when there is neither a name nor a photo to show.
 */
export default function SettingsGlyph({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string;
  displayName: string;
}) {
  const initials = initialsFor(displayName);
  if (!avatarUrl && !initials) return SETTINGS_GEAR;

  return (
    <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
      <span className="flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-full border border-line bg-peach text-[8px] font-semibold leading-none text-ink">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </span>
      <span
        aria-hidden
        className="absolute -bottom-[3px] -right-[3px] flex h-[9px] w-[9px] items-center justify-center rounded-full border border-paper bg-ink-soft text-paper"
      >
        <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          {GEAR_PATH}
        </svg>
      </span>
    </span>
  );
}

/**
 * The reader's own face as a way into Settings, at a hit target's size: the
 * photo, or initials on peach, or a plain outline of a person when there is
 * neither. Today's header on a phone carries it. Nothing on it looks like a
 * control of the page it sits on, which the sliders icon it replaced did.
 */
export function ReaderAvatar({
  avatarUrl,
  displayName,
  size = 32,
}: {
  avatarUrl: string;
  displayName: string;
  size?: number;
}) {
  const initials = initialsFor(displayName);
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-peach font-semibold leading-none text-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : initials ? (
        initials
      ) : (
        <svg aria-hidden width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" />
        </svg>
      )}
    </span>
  );
}
