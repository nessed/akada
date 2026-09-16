import Link from 'next/link';
import AkadaMark from '@/components/notebook/AkadaMark';
import { Eyebrow } from '@/components/notebook/Marks';

/**
 * The landing page.
 *
 * The product runs off the right edge of the screen rather than sitting in a
 * phone mock in the middle of a hero: a page of the app, cropped, reads as
 * something real that carries on past the fold, where a device frame reads as
 * a picture of software. There is no feature grid of icon-plus-heading cards
 * either — the four things are a list of sentences, because that is what they
 * are.
 *
 * The week shown on the right is the marketing illustration, and it is
 * labelled as an example rather than dressed up as anybody's data.
 */

export const metadata = {
  title: 'Akada — a quiet place to keep the term',
  description:
    'Courses from your catalog, every deadline on the day it lands, and the hours you actually sat down for. On Sunday it reads the week back to you.',
};

const WEEK = [
  { day: '05', label: '3h · two courses', tone: 'past' as const },
  { day: '06', label: 'Tilly ch. 4 before seminar', color: 'var(--rose)', tone: 'today' as const },
  { day: '07', label: 'Problem set 3', color: 'var(--sage)', note: 'due 23:59', tone: 'ahead' as const },
  { day: '08', label: 'Response paper, 800 words', color: 'var(--butter)', tone: 'ahead' as const },
  { day: '15', label: 'ECON midterm', color: 'var(--sage)', note: '25%', tone: 'ahead' as const },
];

const QUIETLY = [
  [
    'Your real timetable',
    'Pick your sections out of the course catalog and the meeting times come with them, so the day is laid out around the classes you actually have.',
  ],
  [
    'What each piece is worth',
    'Enter the weighting once. Every deadline then carries its own percentage, and you can see how much of your grade is still unmarked.',
  ],
  [
    'A clock you can hide behind',
    'Set a block, bring the list for that course, and lock the screen down to the time passing. When you stop, you write one line about what you actually did.',
  ],
  [
    'Reading you are behind on',
    'Page counts, not vague guilt. It knows roughly how fast you read and tells you how many hours the backlog is.',
  ],
];

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="flex items-center justify-between gap-5 border-b border-line px-6 py-6 md:px-14">
        <Link href="/" className="flex items-center gap-3">
          <AkadaMark size={22} />
          <span className="font-serif text-[19px] tracking-[-0.02em]">Akada</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/auth" className="font-serif text-[14.5px] text-ink-soft">
            Sign in
          </Link>
          <Link
            href="/auth?mode=signup"
            className="bg-primary px-5 py-3 text-sm font-medium text-primary-contrast"
          >
            Start the term
          </Link>
        </div>
      </header>

      {/* The page, cropped at the right edge. */}
      <section className="flex flex-col items-stretch border-b border-line lg:flex-row">
        <div className="w-full flex-none px-6 py-14 md:px-14 md:py-[74px] lg:w-[620px]">
          <Eyebrow style={{ letterSpacing: '0.18em' }}>For university students</Eyebrow>
          <h1 className="mt-5 font-serif text-[40px] font-normal leading-[1.02] tracking-[-0.035em] md:text-[60px]">
            Fifteen weeks fit
            <br />
            on <em className="italic">one page.</em>
          </h1>
          <p className="mt-6 max-w-[44ch] font-serif text-[17px] leading-[1.6] text-ink-soft md:text-[18px]">
            Your courses from the catalog, every deadline on the day it lands, and the hours you
            actually sat down for. On Sunday it reads the week back to you and asks one question.
          </p>

          <div className="mt-9 max-w-[440px]">
            <Link
              href="/auth?mode=signup"
              className="flex min-h-[56px] w-full items-center justify-center bg-primary px-6 text-[15px] font-medium text-primary-contrast sm:w-auto sm:min-w-[240px]"
            >
              Start the term
            </Link>
            <p className="mt-4 font-serif text-sm italic text-muted">
              Free. Takes a minute. Your notes are readable by you and no one else.
            </p>
          </div>
        </div>

        {/* No device frame: this is the page itself, running past the edge. */}
        <div className="min-w-0 flex-1 border-t border-line bg-paper-2 py-11 pl-6 md:pl-11 lg:border-l lg:border-t-0">
          <Eyebrow>Tuesday, week six — an example</Eyebrow>
          <div className="rule-ink mt-3.5 flex items-start gap-7 pr-6 pt-4 md:pr-11">
            <div className="min-w-0 flex-1">
              <Eyebrow>Next</Eyebrow>
              <p className="mt-2 font-serif text-[22px] leading-[1.18] md:text-[24px]">
                Problem set 3, questions 3 to 5
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-2.5 text-[12.5px] text-ink-soft">
                <span
                  aria-hidden
                  className="block h-[7px] w-[7px] rounded-full"
                  style={{ background: 'var(--sage)' }}
                />
                ECON 100
                <span aria-hidden className="block h-[10px] w-px bg-line" />
                <span className="font-mono text-warn">due tomorrow</span>
              </p>
            </div>
            <span className="hidden flex-none whitespace-nowrap bg-primary px-5 py-4 text-[13.5px] font-medium text-primary-contrast sm:block">
              Start a session
            </span>
          </div>

          <div className="mt-9 pr-6 md:pr-11">
            <Eyebrow className="mb-2.5">This week</Eyebrow>
            {WEEK.map((row) => (
              <div
                key={row.day}
                className={`relative flex gap-3.5 border-b border-line-soft py-2.5 ${
                  row.tone === 'past' ? 'opacity-60' : ''
                }`}
                style={row.tone === 'today' ? { background: 'var(--paper)' } : undefined}
              >
                {row.tone === 'today' && (
                  <span aria-hidden className="absolute -left-3.5 bottom-2 top-2 w-0.5 bg-ink" />
                )}
                <span
                  className={`w-[34px] flex-none text-right font-mono ${
                    row.tone === 'today' ? 'text-[15px] font-bold text-ink' : 'text-[13px] text-ink-soft'
                  }`}
                >
                  {row.day}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {row.color ? (
                    <span
                      aria-hidden
                      className="block h-[6px] w-[6px] flex-none rounded-full"
                      style={{ background: row.color }}
                    />
                  ) : (
                    <span aria-hidden className="flex flex-none gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <i
                          key={i}
                          className="tally-stroke"
                          style={{ height: 13, background: 'var(--muted)' }}
                        />
                      ))}
                    </span>
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      row.color ? 'text-[13px] text-ink' : 'font-serif text-[13px] italic text-muted'
                    }`}
                  >
                    {row.label}
                  </span>
                  {row.note && (
                    <span className="flex-none font-mono text-[11px] text-warn">{row.note}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The part nobody else does. */}
      <section className="flex flex-col gap-10 border-b border-line px-6 py-16 md:px-14 lg:flex-row lg:gap-16">
        <div className="w-full flex-none lg:w-[520px]">
          <Eyebrow style={{ letterSpacing: '0.18em' }}>The part nobody else does</Eyebrow>
          <h2 className="mt-4 font-serif text-[30px] font-normal leading-[1.1] tracking-[-0.03em] md:text-[38px]">
            On Sunday it tells you where the week went.
          </h2>
          <p className="mt-5 max-w-[44ch] font-serif text-[16.5px] leading-[1.62] text-ink-soft">
            Not a chart to interpret. A page in plain words: which course took the hours, which one
            you dropped, what you moved for the third time. Then one question, and whatever you
            answer becomes next week&apos;s list.
          </p>
        </div>

        <div className="min-w-0 flex-1 border border-line bg-paper px-7 py-8 md:px-8">
          <div className="flex items-baseline justify-between border-b-[1.5px] border-ink pb-2.5">
            <Eyebrow as="span" style={{ letterSpacing: '0.18em' }}>
              Week five · 28 Sep – 4 Oct
            </Eyebrow>
            <span className="font-mono text-[11px] text-muted">11h 30m</span>
          </div>
          <p className="mt-5 font-serif text-[26px] font-normal leading-[1.08] tracking-[-0.03em] md:text-[32px]">
            You spent the week <em className="italic">on ECON</em>.
          </p>
          <p className="mt-3.5 font-serif text-[15.5px] leading-[1.6] text-ink-soft">
            Two thirds of the hours went to one course. POL 227 got nothing after Tuesday, and its
            reading is now nine days old.
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            {[
              { code: 'ECON', color: 'var(--sage)', marks: 8, total: '7h 30m' },
              { code: 'CS 200', color: 'var(--sky)', marks: 3, total: '2h 15m' },
            ].map((row) => (
              <span key={row.code} className="flex items-center gap-3">
                <span
                  className="w-[62px] text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: row.color }}
                >
                  {row.code}
                </span>
                <span aria-hidden className="flex flex-1 gap-[3px]">
                  {Array.from({ length: row.marks }).map((_, i) => (
                    <i
                      key={i}
                      className="tally-stroke"
                      style={{ width: 2.5, height: 18, background: row.color }}
                    />
                  ))}
                </span>
                <span className="font-mono text-[12.5px] font-bold">{row.total}</span>
              </span>
            ))}
            <span className="flex items-center gap-3">
              <span
                className="w-[62px] text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: 'var(--rose)' }}
              >
                POL 227
              </span>
              <span aria-hidden className="h-px flex-1 border-b border-dashed border-line-strong" />
              <span className="font-serif text-[13px] italic text-warn">nothing since Tue</span>
            </span>
          </div>
        </div>
      </section>

      {/* Sentences, not a grid of cards. */}
      <section className="border-b border-line px-6 py-14 md:px-14">
        <div className="flex items-baseline gap-4">
          <Eyebrow as="span" style={{ letterSpacing: '0.18em' }}>
            Also, quietly
          </Eyebrow>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>
        <div className="mt-2">
          {QUIETLY.map(([title, detail]) => (
            <div
              key={title}
              className="row-rule flex flex-col gap-2 py-5 md:flex-row md:items-baseline md:gap-7"
            >
              <span className="w-full flex-none font-serif text-[19px] md:w-[230px] md:text-[21px]">
                {title}
              </span>
              <span className="max-w-[62ch] flex-1 text-[14.5px] leading-[1.55] text-ink-soft">
                {detail}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-16 md:px-14">
        <h2 className="m-0 font-serif text-[30px] font-normal leading-[1.08] tracking-[-0.03em] md:text-[40px]">
          Start where the term is.
          <br />
          <em className="italic">Whatever week you are on.</em>
        </h2>
        <Link
          href="/auth?mode=signup"
          className="mt-8 flex min-h-[56px] w-full items-center justify-center bg-primary px-6 text-[15px] font-medium text-primary-contrast sm:w-auto sm:min-w-[240px]"
        >
          Start the term
        </Link>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-5 border-t border-line px-6 py-7 md:px-14">
        <p className="m-0 font-serif text-[13.5px] italic text-muted">Akada</p>
        <nav className="flex items-center gap-6 font-serif text-[13.5px] text-ink-soft">
          <Link href="/privacy" className="border-b border-line-strong pb-px">
            Privacy
          </Link>
          <Link href="/terms" className="border-b border-line-strong pb-px">
            Terms
          </Link>
          <Link href="/auth" className="border-b border-line-strong pb-px">
            Sign in
          </Link>
        </nav>
      </footer>
    </div>
  );
}
