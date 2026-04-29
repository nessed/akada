import Link from 'next/link';

const sampleCourses = [
  {
    code: 'POL 227',
    name: 'Comparative Politics',
    color: '#A8B89B',
    tint: '#E9EEE3',
    hours: '3.5',
    goal: '6h',
    pct: 58,
  },
  {
    code: 'ENG 305',
    name: 'Modernist Literature',
    color: '#D4A5A5',
    tint: '#F1E2E2',
    hours: '2.0',
    goal: '5h',
    pct: 40,
  },
  {
    code: 'PSY 110',
    name: 'Cognition & Memory',
    color: '#B5A8C9',
    tint: '#E8E2F0',
    hours: '4.0',
    goal: '4h',
    pct: 100,
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
                <p className="mt-1 mb-0 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
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
                href="/dashboard"
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-contrast"
              >
                Open app
              </Link>
            </div>
          </header>

          <div className="mx-auto mt-14 max-w-3xl text-center sm:mt-16">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
              Courses, tasks, timer, progress
            </p>
            <h1 className="mt-4 mb-0 font-serif text-[48px] font-medium leading-[0.98] tracking-[-0.03em] sm:text-[66px]">
              Akada
            </h1>
            <p className="mx-auto mt-5 mb-0 max-w-xl text-[16px] leading-[1.65] text-ink-soft">
              A calm academic planner for organizing courses, tracking assignments,
              logging study sessions, and seeing where your semester time goes.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-2.5 sm:flex-row">
              <Link
                href="/auth"
                className="rounded-xl bg-primary px-6 py-3.5 text-[15px] font-medium text-primary-contrast"
              >
                Start planning
              </Link>
              <Link
                href="/dashboard"
                className="rounded-xl border border-line-strong bg-paper px-6 py-3.5 text-[15px] font-medium text-ink-soft"
              >
                Go to dashboard
              </Link>
            </div>
          </div>

          <ProductPreview />
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
    </main>
  );
}

function ProductPreview() {
  return (
    <div className="mx-auto mt-12 w-full max-w-[430px] rounded-[28px] border border-line-strong bg-paper p-3 shadow-[0_24px_70px_rgba(26,25,21,0.12)]">
      <div className="overflow-hidden rounded-[22px] border border-line bg-bg">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <p className="m-0 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Wk 17
            </p>
            <h2 className="mt-1 mb-0 font-serif text-[30px] font-normal leading-none tracking-[-0.02em]">
              April <span className="italic">27</span>
            </h2>
            <p className="mt-2 mb-0 max-w-[230px] text-[12px] leading-[1.5] text-ink-soft">
              2 tasks due today. 3h 25m logged this week.
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-[#E2B594] font-serif text-[17px] font-medium">
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
              <span className="w-[54%] bg-[#A8B89B]" />
              <span className="w-[28%] bg-[#D4A5A5]" />
              <span className="w-[18%] bg-[#B5A8C9]" />
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
                      className="m-0 text-[10px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: course.color }}
                    >
                      {course.code}
                    </p>
                    <h3 className="mt-1 mb-0 truncate font-serif text-[17px] font-medium tracking-[-0.01em]">
                      {course.name}
                    </h3>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-1 text-[10px] font-medium text-ink-soft"
                    style={{ background: course.tint }}
                  >
                    {course.pct}%
                  </span>
                </div>
                <div className="mt-3">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="font-mono text-[13px] font-semibold">
                      {course.hours}
                      <span className="ml-1 font-sans font-normal text-muted">
                        / {course.goal}
                      </span>
                    </span>
                    <span className="text-[11px] text-muted">this week</span>
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
