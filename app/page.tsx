import type { Metadata } from 'next';
import Link from 'next/link';
import StudyFan from '@/components/StudyFan';
import { PASTEL_PALETTE } from '@/lib/utils';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
  // The one indexable page, so it carries the brand itself rather than
  // relying on the layout's '%s - Akada' template.
  title: 'Akada: a calm study planner for university',
  description:
    'Akada keeps your courses, deadlines and study hours on one quiet page. '
    + 'Pick your sections from the course catalog, set a weekly goal, and log the time you actually study.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Akada: a calm study planner for university',
    description:
      'Your courses, deadlines and study hours on one quiet page.',
    url: '/',
  },
};

// The three sample courses on the landing page, coloured from the real
// palette and drawn with the app's own hour strokes, so the shot and the
// screen it is selling cannot drift apart.
const [SAGE, ROSE, LAVENDER] = PASTEL_PALETTE;

const sampleCourses = [
  {
    code: 'POL 227',
    name: 'Comparative Politics',
    color: SAGE.value,
    tint: SAGE.token,
    hours: '3.5',
    goal: '6h',
  },
  {
    code: 'ENG 305',
    name: 'Modernist Literature',
    color: ROSE.value,
    tint: ROSE.token,
    hours: '2.0',
    goal: '5h',
  },
  {
    code: 'PSY 110',
    name: 'Cognition & Memory',
    color: LAVENDER.value,
    tint: LAVENDER.token,
    hours: '4.0',
    goal: '4h',
  },
];

const features = [
  {
    title: 'Courses',
    text: 'Set weekly study goals and see which classes need attention.',
  },
  {
    title: 'Tasks',
    text: 'Track assignments with priorities and clear due dates.',
  },
  {
    title: 'Timer',
    text: 'Start focused sessions from a course or a specific task.',
  },
  {
    title: 'Stats',
    text: 'Review study streaks, weekly totals, heatmaps, and course averages.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-[100dvh] bg-bg text-ink">
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0, transparent 34px, var(--line) 34px, var(--line) 35px)',
            maskImage:
              'linear-gradient(to bottom, transparent, black 10%, black 84%, transparent)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent, black 10%, black 84%, transparent)',
          }}
        />

        <div className="relative mx-auto flex max-w-5xl flex-col px-6 pb-10 pt-6 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <Mark size={34} />
              <div>
                <p className="m-0 font-serif text-[22px] font-medium leading-none tracking-[-0.02em]">
                  Akada
                </p>
                <p className="eyebrow mt-1 mb-0 text-muted">
                  Study Planner
                </p>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/auth"
                className="rounded-full border border-line bg-paper px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-line-strong"
              >
                Sign in
              </Link>
              <Link
                href="/auth?mode=signup"
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-contrast"
              >
                Create account
              </Link>
            </div>
          </header>

          {/* The page's own two columns. The claim on the left, the thing
              itself on the right: a screenshot argues better than a
              paragraph about what the screenshot would contain. */}
          <div className="mt-12 grid items-center gap-12 sm:mt-16 lg:grid-cols-[minmax(0,1fr)_430px]">
            <div className="min-w-0">
              <p className="eyebrow m-0">Study planner</p>
              <h1 className="m-0 mt-4 font-serif text-[36px] font-medium leading-[1.05] tracking-[-0.03em] sm:text-[44px]">
                Courses, tasks, hours.
                <br />
                One term at a time.
              </h1>
              <p className="mt-5 mb-0 max-w-xl text-[16px] leading-[1.65] text-ink-soft">
                Keep readings in order, start a timer on any of them in one click, and
                watch the week fill in against a goal you set.
              </p>

              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
                <Link
                  href="/auth?mode=signup"
                  className="rounded-[10px] bg-primary px-6 py-3.5 text-center text-[15px] font-medium text-primary-contrast no-underline"
                >
                  Create account
                </Link>
                <Link
                  href="/auth"
                  className="rounded-[10px] border border-line-strong bg-paper px-6 py-3.5 text-center text-[15px] font-medium text-ink-soft no-underline"
                >
                  Sign in
                </Link>
              </div>

              <p className="mt-5 mb-0 font-mono text-[12px] text-muted">
                Free. Works offline. Your data stays yours.
              </p>
            </div>

            <ProductPreview />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16 sm:px-8 lg:px-10">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-[14px] border border-line bg-paper px-5 py-5"
            >
              <h2 className="m-0 font-serif text-[20px] font-medium tracking-[-0.01em]">
                {feature.title}
              </h2>
              <p className="mt-2 mb-0 text-[13px] leading-[1.55] text-ink-soft">
                {feature.text}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* The timer, shown rather than described. The fan is the one part of
          the app that has to be watched to be understood. */}
      <section className="mx-auto max-w-5xl px-6 pb-16 sm:px-8 lg:px-10">
        <div className="grid items-center gap-8 overflow-hidden rounded-[14px] border border-line bg-paper md:grid-cols-2">
          <div className="px-7 py-8 md:px-10">
            <p className="eyebrow m-0">The timer</p>
            <h2 className="m-0 mt-3 font-serif text-[26px] font-medium leading-[1.15] tracking-[-0.02em]">
              A block with a target, or untimed.
            </h2>
            <p className="mt-3 mb-0 max-w-[420px] text-[14px] leading-[1.6] text-ink-soft">
              The fan grows while you read: one stem splitting two or three ways at
              every step, in the colour of the course you are on. A block fills its
              frame exactly when the time is up. An open session just keeps going.
            </p>
            <p className="mt-5 mb-0 font-mono text-[13px] tabular-nums text-muted">
              Open · <span className="text-ink">1:12:38</span>
            </p>
          </div>
          <div className="relative h-[260px] w-full overflow-hidden bg-bg-tint md:h-[320px]">
            <StudyFan
              progress={0.82}
              seed="landing"
              color={SAGE.value}
              depth={9}
              tripleP={0.3}
              trunkWidth={13}
              padTop={24}
              widthFill={0.92}
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      </section>

      {/* The page used to end on the feature grid, so anyone who read to the
          bottom had to scroll back up to act. */}
      <section className="mx-auto max-w-5xl px-6 pb-16 text-center sm:px-8 lg:px-10">
        <h2 className="m-0 font-serif text-[26px] font-medium tracking-[-0.02em]">
          Start the term <span className="italic">on one page</span>.
        </h2>
        <p className="mx-auto mt-2.5 mb-0 max-w-[360px] text-[14px] leading-[1.6] text-ink-soft">
          Free, and it takes a minute to set up.
        </p>
        <Link
          href="/auth?mode=signup"
          className="mt-6 inline-block rounded-2xl bg-primary px-6 py-3.5 text-[15px] font-medium text-primary-contrast"
        >
          Create account
        </Link>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-7 sm:px-8 lg:px-10">
          <p className="m-0 font-serif text-[13px] italic text-muted">
            Akada, made with quiet hands.
          </p>
          <nav className="flex items-center gap-5 font-serif text-[13px] text-muted">
            <Link className="hand-underline" href="/privacy">
              Privacy
            </Link>
            <Link className="hand-underline" href="/terms">
              Terms
            </Link>
            <a className="hand-underline" href={`mailto:${CONTACT_EMAIL}`}>
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function ProductPreview() {
  return (
    <div className="mx-auto mt-12 w-full max-w-[430px] rounded-[28px] border border-line-strong bg-paper p-3 shadow-[0_24px_70px_rgba(26,25,21,0.12)]">
      <div className="overflow-hidden rounded-[22px] border border-line bg-bg">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <p className="eyebrow m-0 text-muted">
              Wk 17
            </p>
            <h2 className="mt-1 mb-0 font-serif text-[30px] font-normal leading-none tracking-[-0.02em]">
              April <span className="italic">27</span>
            </h2>
            <p className="mt-2 mb-0 max-w-[230px] text-[12px] leading-[1.5] text-ink-soft">
              2 tasks due today. 3h 25m logged this week.
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-peach font-serif text-[17px] font-medium">
            A
          </div>
        </div>

        <div className="px-5 pt-5">
          <div className="relative overflow-hidden rounded-[14px] border border-line bg-paper px-5 py-4">
            <div
              aria-hidden
              className="absolute right-0 top-0 h-[22px] w-[22px]"
              style={{
                background:
                  'linear-gradient(225deg, var(--bg-tint) 50%, transparent 50%)',
              }}
            />
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-[32px] font-semibold leading-none tracking-[-0.02em]">
                1h 35m
              </span>
              <span className="text-[12px] text-muted">today</span>
            </div>
            <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-bg-tint">
              <span className="w-[54%] bg-sage" />
              <span className="w-[28%] bg-rose" />
              <span className="w-[18%] bg-lav" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-5 py-5">
          {sampleCourses.map((course) => (
            <div
              key={course.code}
              className="relative overflow-hidden rounded-[14px] border border-line bg-paper"
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ background: course.color }}
              />
              <div className="py-4 pl-5 pr-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="eyebrow m-0"
                      style={{ color: course.color }}
                    >
                      {course.code}
                    </p>
                    <h3 className="mt-1 mb-0 truncate font-serif text-[17px] font-medium tracking-[-0.01em]">
                      {course.name}
                    </h3>
                  </div>
                  <span
                    className="hl-swipe shrink-0 font-mono text-[11px] font-semibold text-ink"
                    style={{ '--hl': course.tint } as React.CSSProperties}
                  >
                    {course.goal}
                  </span>
                </div>
                {/* Strokes, the same as the app draws. A percentage bar in
                    the shot would be advertising a screen that no longer
                    exists. */}
                <div className="mt-3">
                  <span className="font-mono text-[13px] font-semibold">{course.hours}</span>
                  <span className="ml-1 font-mono text-[11px] text-muted">/ {course.goal}</span>
                  <div className="mt-1.5 flex h-3 items-end gap-1">
                    {Array.from({ length: Number(course.goal.replace('h', '')) }, (_, i) => {
                      const filled = Math.min(1, Math.max(0, Number(course.hours) - i));
                      return (
                        <span
                          key={i}
                          className="block h-3 w-[7px] rounded-[2px]"
                          style={{
                            border: filled < 1 ? '1px solid var(--line)' : undefined,
                            background:
                              filled >= 1
                                ? course.color
                                : filled > 0
                                  ? `linear-gradient(180deg, transparent ${(1 - filled) * 100}%, ${course.color} ${(1 - filled) * 100}%)`
                                  : undefined,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Mark({ size = 34 }: { size?: number }) {
  const w = size;
  const h = Math.round(size * (68 / 56));
  return (
    <svg width={w} height={h} viewBox="0 0 56 68" fill="none" aria-hidden>
      <path
        d="M6 4 H50 V60 L28 48 L6 60 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="var(--paper)"
      />
      <text
        x="28"
        y="33"
        textAnchor="middle"
        fontFamily="var(--font-serif), Georgia, serif"
        fontSize="22"
        fontStyle="italic"
        fontWeight="500"
        fill="currentColor"
      >
        A
      </text>
    </svg>
  );
}
