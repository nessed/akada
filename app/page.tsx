import type { Metadata } from 'next';
import Link from 'next/link';
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
// palette so the marketing shot and the app cannot drift apart.
const [SAGE, ROSE, LAVENDER] = PASTEL_PALETTE;

const sampleCourses = [
  {
    code: 'POL 227',
    name: 'Comparative Politics',
    color: SAGE.value,
    tint: SAGE.tint,
    hours: '3.5',
    pct: 58,
  },
  {
    code: 'ENG 305',
    name: 'Modernist Literature',
    color: ROSE.value,
    tint: ROSE.tint,
    hours: '2.0',
    pct: 40,
  },
  {
    code: 'PSY 110',
    name: 'Cognition & Memory',
    color: LAVENDER.value,
    tint: LAVENDER.tint,
    hours: '4.0',
    pct: 100,
  },
];

/**
 * What the app actually does, written as the contents page of a notebook
 * rather than a grid of feature cards.
 *
 * The four-up card grid this replaced was the most generic thing on the site
 * and said the least: four bordered boxes, four nouns, four sentences of
 * roughly equal weight. A numbered list can be read down in one pass, costs
 * no chrome at all, and each line here names something specific the app does
 * instead of the category it belongs to.
 */
const contents = [
  {
    title: 'Courses',
    text: 'A weekly hour goal for each class, and a plain view of the ones you have been quietly avoiding.',
  },
  {
    title: 'Tasks',
    text: 'Every assignment with its due date, ordered so the next thing that actually matters sits at the top.',
  },
  {
    title: 'Timer',
    text: 'Start a session against a course or a single task. Close the tab and it picks up where it left off.',
  },
  {
    title: 'Stats',
    text: 'Streaks, weekly totals and a heatmap of where the term really went.',
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
          {/* Two capsule buttons used to sit here, which is the one shape
              readmedesign.md rules out outright. The page now says the same
              two things the way the app says everything else: a written
              underline for the quiet action, a bordered rectangle for the
              other, and the single filled button saved for the hero. */}
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <Mark size={34} />
              <div>
                <p className="m-0 font-serif text-[22px] font-medium leading-none tracking-[-0.02em]">
                  Akada
                </p>
                <p className="eyebrow mt-1 mb-0 text-muted">Study Planner</p>
              </div>
            </Link>
            <div className="flex items-center gap-5">
              <Link
                href="/auth"
                className="hand-underline font-serif text-[15px] text-ink-soft"
              >
                Log in
              </Link>
              <Link
                href="/auth?mode=signup"
                className="rounded-[10px] border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:border-ink-soft"
              >
                Create account
              </Link>
            </div>
          </header>

          {/* The headline was the word "Akada", directly under a header that
              already says "Akada". It now spends itself on the only thing a
              stranger needs from it. */}
          <div className="mx-auto mt-16 max-w-[38rem] text-center sm:mt-20">
            <h1 className="m-0 font-serif text-[42px] font-medium leading-[1.04] tracking-[-0.03em] sm:text-[58px]">
              One page for the whole <span className="italic">semester</span>.
            </h1>
            <p className="mx-auto mt-6 mb-0 max-w-[30rem] text-[16px] leading-[1.7] text-ink-soft">
              Your courses, your deadlines, and the hours you actually studied,
              kept somewhere quiet enough to look at on a bad week.
            </p>
            <div className="mt-9 flex items-center justify-center gap-6">
              <Link
                href="/auth?mode=signup"
                className="rounded-2xl bg-primary px-7 py-4 text-[15px] font-medium text-primary-contrast"
              >
                Create account
              </Link>
              <Link
                href="/auth"
                className="hand-underline font-serif text-[15px] text-ink-soft"
              >
                Log in
              </Link>
            </div>
          </div>

          <ProductPreview />
        </div>
      </section>

      {/* The contents page. */}
      <section className="mx-auto max-w-5xl px-6 pb-20 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-2xl">
          <p className="eyebrow m-0 text-muted">What is inside</p>
          <ol className="mb-0 mt-5 list-none p-0">
            {contents.map((entry, i) => (
              <li
                key={entry.title}
                className="flex items-baseline gap-5 border-b border-dashed border-line py-5 last:border-b-0 sm:gap-7"
              >
                <span className="eyebrow shrink-0 font-mono text-muted-soft">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <h2 className="m-0 font-serif text-[20px] font-medium tracking-[-0.01em]">
                    {entry.title}
                  </h2>
                  <p className="mt-1.5 mb-0 text-[14px] leading-[1.65] text-ink-soft">
                    {entry.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* A closing section used to restate the headline as a moral and ask
          for the account a third time. One written line does the same job
          without the second sales pitch. */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-6 py-9 sm:px-8 lg:px-10">
          <p className="m-0 font-serif text-[15px] italic text-ink-soft">
            Free, and about a minute to set up.{' '}
            <Link className="hand-underline not-italic" href="/auth?mode=signup">
              Start a term
            </Link>
            .
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
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
        </div>
      </footer>
    </main>
  );
}

/**
 * The app itself, set on the page as a specimen.
 *
 * It used to float above the paper on a 70px drop shadow, which is how a SaaS
 * site presents a phone and the exact opposite of what readmedesign.md asks
 * for. Here it sits *on* the ruled page, tilted a degree and taped down, the
 * same way StickyNote pins a note to a list.
 */
function ProductPreview() {
  return (
    <div className="relative mx-auto mt-16 w-full max-w-[430px] pb-4">
      <span
        aria-hidden
        className="tape"
        style={{ position: 'absolute', top: -10, left: '42%', zIndex: 2 }}
      />
      <div className="tilt-r2 rounded-[26px] border border-line-strong bg-paper p-2.5">
        <div className="overflow-hidden rounded-[20px] border border-line bg-bg">
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div>
              <p className="eyebrow m-0 font-mono text-muted">Wk 17</p>
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
                      <p className="eyebrow m-0" style={{ color: course.color }}>
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
                      {course.pct}%
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1.5">
                      <span className="font-mono text-[13px] font-semibold">
                        {course.hours}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-bg-tint">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${course.pct}%`, background: course.color }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <span
        aria-hidden
        className="font-hand absolute -right-2 bottom-8 hidden text-[17px] leading-[1.05] text-muted lg:block"
        style={{ transform: 'rotate(-6deg)' }}
      >
        this is the whole app
      </span>
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
