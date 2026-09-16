/**
 * The four places the app goes. One definition, drawn twice: as a 74px rail
 * down the left of a desktop, and as a bar across the foot of a phone.
 *
 * "Stats" is gone. The screen it pointed at is now Review — a week you close
 * rather than a dashboard you browse — and Term is new: the month, with the
 * weighted pieces marked on it.
 */

export interface Tab {
  href: string;
  label: string;
  icon: (stroke: number) => React.ReactNode;
}

const svg = (children: React.ReactNode, stroke: number, size: number) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const TABS: Tab[] = [
  {
    href: '/dashboard',
    label: 'Today',
    icon: (s) =>
      svg(
        <>
          <path d="M3 11l9-7 9 7" />
          <path d="M5 10v9h14v-9" />
        </>,
        s,
        18,
      ),
  },
  {
    href: '/tasks',
    label: 'List',
    icon: (s) =>
      svg(
        <>
          <path d="M8 6h12M8 12h12M8 18h12" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="4" cy="18" r="1" />
        </>,
        s,
        18,
      ),
  },
  {
    href: '/term',
    label: 'Term',
    icon: (s) =>
      svg(
        <path d="M4 8h16M4 8v12h16V8M4 8l0-3h16v3M9 12h2M13 12h2M9 16h2M13 16h2" />,
        s,
        18,
      ),
  },
  {
    href: '/stats',
    label: 'Review',
    icon: (s) =>
      svg(
        <>
          <path d="M5 4h11l3 3v13H5z" />
          <path d="M9 11h6M9 15h4" />
        </>,
        s,
        18,
      ),
  },
];

/**
 * A course page is reached from the course rows on Today and its back link
 * returns there, so it keeps that tab lit rather than leaving the nav with
 * nothing marked. Settings is its own page now and owns no tab, so it lights
 * none: the avatar at the foot of the rail is what marks it instead.
 */
const OWNED_BY: Record<string, string> = { '/courses': '/dashboard' };

export function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (pathname === href || pathname.startsWith(href + '/')) return true;
  return Object.entries(OWNED_BY).some(
    ([prefix, owner]) =>
      owner === href && (pathname === prefix || pathname.startsWith(prefix + '/')),
  );
}
