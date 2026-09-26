import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import ChatSketch from '@/components/claude/ChatSketch';
import StudyFan from '@/components/StudyFan';
import { PASTEL_PALETTE } from '@/lib/utils';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
  // The one indexable page, so it carries the brand itself rather than
  // relying on the layout's '%s - Akada' template.
  title: 'Akada: every deadline this term, on one page',
  description:
    'A study planner for LUMS. Pick your courses from the Fall 2026 list, hand Claude your '
    + 'course outlines and every deadline goes in, then Akada tells you what to do next.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Akada: every deadline this term, on one page',
    description:
      'Your courses, deadlines and study hours on one quiet page. Claude can fill it in for you.',
    url: '/',
  },
};

const [SAGE] = PASTEL_PALETTE;

// Setup, in the order it happens. Each one is a thing the reader does, so the
// page answers "what would I actually do" before "what can it do".
const steps = [
  {
    title: 'Pick your courses',
    text: 'Search the LUMS Fall 2026 list and choose your section. Instructor and class times come with it.',
  },
  {
    title: 'Get your deadlines in',
    text: 'Hand Claude your course outlines and it writes in every quiz, assignment and exam with its weight. Or add them yourself.',
  },
  {
    title: 'Open Today and start',
    text: 'It shows what to do next with a Start button beside it. The timer runs while you study and the week fills in.',
  },
];

// The parts a first-time reader would never find by poking around, said in
// the plainest words that are still true. Each links to its section of the
// guide. Claude has its own section above, so it is not repeated here.
const features = [
  {
    title: 'Reading, in hours',
    text: 'Put in the page count and Akada learns how fast you read, so four readings becomes about six hours before Thursday.',
    href: '/guide#tasks',
  },
  {
    title: 'Your real grade',
    text: 'Marks are counted out of what has come back, not out of 100. An 80 on the first quiz means you are on 80.',
    href: '/guide#marks',
  },
  {
    title: 'Recall',
    text: 'What you finished comes back a day later as a question. Answer it from memory, and the gaps widen as it sticks.',
    href: '/guide#recall',
  },
  {
    title: 'A run in weeks',
    text: 'Your streak is counted by the week, so one day off costs nothing. Every hour you log shows up somewhere.',
    href: '/guide#stats',
  },
  {
    title: 'A timer worth watching',
    text: 'Start it from any task or course. A drawing grows in the course colour while you study, instead of a clock ticking down.',
    href: '/guide#timer',
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

        <div className="relative mx-auto flex max-w-5xl flex-col px-5 pb-10 pt-6 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <Mark size={30} />
              <p className="m-0 font-serif text-[21px] font-medium leading-none tracking-[-0.02em]">
                Akada
              </p>
            </Link>
            <div className="flex items-center gap-1.5">
              <Link
                href="/auth"
                className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/auth?mode=signup"
                className="whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-contrast"
              >
                Create account
              </Link>
            </div>
          </header>

          <div className="mt-12 grid items-center gap-12 sm:mt-16 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <p className="eyebrow m-0">A study planner for LUMS</p>
              <h1 className="m-0 mt-4 font-serif text-[38px] font-medium leading-[1.05] tracking-[-0.03em] sm:text-[48px]">
                Every deadline this term,
                <br />
                <span className="italic font-normal">on one page.</span>
              </h1>
              <p className="mt-5 mb-0 max-w-xl font-serif text-[17px] leading-[1.6] text-ink-soft">
                Pick your courses off the Fall 2026 list, hand Claude your course outlines,
                and every quiz, reading and midterm goes in with its date and weight. Then
                Akada tells you what to do next and times you while you do it.
              </p>

              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
                <Link
                  href="/auth?mode=signup"
                  className="rounded-[10px] bg-primary px-6 py-3.5 text-center text-[15px] font-medium text-primary-contrast no-underline"
                >
                  Create account
                </Link>
                <Link
                  href="/claude"
                  className="rounded-[10px] border border-line-strong bg-paper px-6 py-3.5 text-center text-[15px] font-medium text-ink-soft no-underline"
                >
                  See how Claude fills it in
                </Link>
              </div>

              <p className="mt-5 mb-0 font-serif text-[13.5px] italic text-muted">
                Akada is free. Delete your account and everything in it goes with it.
              </p>
            </div>

            <Shot
              src="/landing/today-phone.png"
              alt="Akada's Today screen on a phone: the reading due today with a Start button, and today's hours."
              width={390}
              height={780}
              className="mx-auto w-full max-w-[300px] rounded-[34px] lg:max-w-[340px]"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8 lg:px-10">
        <p className="eyebrow m-0">How it goes</p>
        <ol className="m-0 mt-4 grid list-none gap-6 p-0 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="border-t border-line-strong pt-4">
              <p className="m-0 font-mono text-[12px] text-muted">{i + 1}</p>
              <h2 className="m-0 mt-1.5 font-serif text-[20px] font-medium tracking-[-0.01em]">
                {step.title}
              </h2>
              <p className="mt-2 mb-0 text-[14px] leading-[1.6] text-ink-soft">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Claude, shown rather than described. Most people have never heard of a
          connector, and "hand it your outline, the deadlines appear" needs no
          word for one. */}
      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8 lg:px-10">
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-12">
          <div className="min-w-0 md:pt-8">
            <p className="eyebrow m-0">Works inside Claude</p>
            <h2 className="m-0 mt-3 font-serif text-[30px] font-medium leading-[1.12] tracking-[-0.02em]">
              Hand it your outline. <span className="italic font-normal">Never type a deadline.</span>
            </h2>
            <p className="mt-4 mb-0 font-serif text-[16px] leading-[1.65] text-ink-soft">
              Connect Akada to Claude once. Then attach a course outline and say
              &ldquo;put everything into Akada&rdquo;, or ask what to start first, what you
              need on the final, or to be quizzed on last week&apos;s readings. It reads
              your planner and writes into it for you.
            </p>
            <p className="mt-4 mb-0 font-serif text-[14.5px] leading-[1.6] text-muted">
              Akada never sees your chats. It only gets what Claude asks it for, and
              Claude can only touch your own planner.
            </p>
            <Link href="/claude" className="hand-underline mt-5 inline-block font-serif text-[15px] text-ink">
              How to connect it, and what happens to your data
            </Link>
          </div>
          <div className="min-w-0">
            <ChatSketch />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8 lg:px-10">
        <p className="eyebrow m-0">What it does that a to-do list doesn&apos;t</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="rounded-[14px] border border-line bg-paper px-5 py-5 text-ink no-underline transition-colors hover:border-line-strong"
            >
              <h2 className="m-0 font-serif text-[20px] font-medium tracking-[-0.01em]">
                {feature.title}
              </h2>
              <p className="mt-2 mb-0 text-[13px] leading-[1.55] text-ink-soft">
                {feature.text}
              </p>
            </Link>
          ))}
        </div>
        <p className="mt-6 mb-0 text-center font-serif text-[15px] text-ink-soft">
          New to it?{' '}
          <Link className="hand-underline text-ink" href="/guide">
            Read how it all works
          </Link>
          , it takes five minutes.
        </p>
      </section>

      {/* The real screen at laptop width, taken by scripts/landing-shots.mjs
          off the app itself so it cannot drift from what signing up gets. */}
      <section className="mx-auto hidden max-w-5xl px-5 pb-16 sm:block sm:px-8 lg:px-10">
        <p className="eyebrow m-0">On a laptop</p>
        <Shot
          src="/landing/today-desktop.png"
          alt="Akada's Today screen on a laptop: up next, recall, what is coming and the reading ahead in hours."
          width={1280}
          height={800}
          className="mt-4 w-full rounded-[14px]"
        />
      </section>

      {/* The timer, shown rather than described. The fan is the one part of
          the app that has to be watched to be understood. */}
      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8 lg:px-10">
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
      <section className="mx-auto max-w-5xl px-5 pb-16 text-center sm:px-8 lg:px-10">
        <h2 className="m-0 font-serif text-[26px] font-medium tracking-[-0.02em]">
          Start the term <span className="italic">on one page</span>.
        </h2>
        <p className="mx-auto mt-2.5 mb-0 max-w-[360px] text-[14px] leading-[1.6] text-ink-soft">
          Two minutes to set up. Your courses are already on the list.
        </p>
        <Link
          href="/auth?mode=signup"
          className="mt-6 inline-block rounded-2xl bg-primary px-6 py-3.5 text-[15px] font-medium text-primary-contrast"
        >
          Create account
        </Link>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-7 sm:px-8 lg:px-10">
          <p className="m-0 font-serif text-[13px] italic text-muted">
            Akada, made at LUMS with quiet hands.
          </p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 font-serif text-[13px] text-muted">
            <Link className="hand-underline" href="/guide">
              How it works
            </Link>
            <Link className="hand-underline" href="/claude">
              Akada in Claude
            </Link>
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

/** A photograph of the real app, laid on the page like a print. */
function Shot({
  src,
  alt,
  width,
  height,
  className,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes="(min-width: 1024px) 960px, 100vw"
      className={`block h-auto border border-line-strong shadow-[0_24px_70px_rgba(26,25,21,0.12)] ${className ?? ''}`}
    />
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
