import type { Metadata } from 'next';
import Link from 'next/link';
import ChatSketch from '@/components/claude/ChatSketch';
import TodaySketch from '@/components/public/TodaySketch';
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

const [SAGE, ROSE] = PASTEL_PALETTE;

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
// the plainest words that are still true, each beside a small drawing of the
// thing itself. Each links to its section of the guide. Claude has its own
// section above, so it is not repeated here.
const features: { title: string; text: string; href: string; glyph: React.ReactNode }[] = [
  {
    title: 'Reading, in hours',
    text: 'Put in the page count and Akada learns how fast you read, so four readings becomes about six hours before Thursday.',
    href: '/guide#tasks',
    glyph: (
      <span className="flex flex-col">
        <span className="font-mono text-[13px] tabular-nums text-muted">48 pages</span>
        <span className="font-mono text-[26px] font-medium tabular-nums text-ink">2h 24m</span>
      </span>
    ),
  },
  {
    title: 'Your real grade',
    text: 'Marks are counted out of what has come back, not out of 100. An 80 on the first quiz means you are on 80.',
    href: '/guide#marks',
    glyph: (
      <span className="flex items-baseline gap-1.5">
        <span className="font-mono text-[42px] font-medium leading-none tabular-nums text-ink">80</span>
        <span className="font-hand text-[20px] text-muted">so far</span>
      </span>
    ),
  },
  {
    title: 'Recall',
    text: 'What you finished comes back a day later as a question. Answer it from memory, and the gaps widen as it sticks.',
    href: '/guide#recall',
    glyph: (
      <span className="flex flex-col gap-0.5 font-serif text-[16px] italic text-ink-soft">
        <span>✓ clear</span>
        <span>∼ hazy</span>
        <span>○ gone</span>
      </span>
    ),
  },
  {
    title: 'A run in weeks',
    text: 'Your run is counted by the week, so one day off costs nothing. Every hour you log shows up somewhere.',
    href: '/guide#stats',
    glyph: (
      <span className="flex flex-col gap-2">
        <span className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-3.5 w-3.5 rounded-[3px]" style={{ background: SAGE.value }} />
          ))}
          <span className="h-3.5 w-3.5 rounded-[3px] border border-line-strong" />
        </span>
        <span className="font-mono text-[13px] tabular-nums text-muted">4 weeks running</span>
      </span>
    ),
  },
  {
    title: 'Tallies on the Record',
    text: 'Every 40 minutes on a course inks a tally on its page, and fifteen tallies bind the page. It all comes from your sessions.',
    href: '/guide#stats',
    glyph: (
      <svg width="104" height="40" viewBox="0 0 104 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink">
        <path d="M6 5 L5 35" />
        <path d="M16 4 L16 36" />
        <path d="M26 5 L27 35" />
        <path d="M36 4 L35 36" />
        <path d="M1 28 L42 11" style={{ stroke: ROSE.value }} />
        <path d="M58 5 L57 35" />
        <path d="M68 4 L69 36" />
      </svg>
    ),
  },
  {
    title: 'A timer worth watching',
    text: 'Start it from any task or course. A drawing grows in the course colour while you study, instead of a clock ticking down.',
    href: '/guide#timer',
    glyph: (
      <svg width="72" height="62" viewBox="0 0 80 70" fill="none" strokeWidth="1.8" strokeLinecap="round" style={{ stroke: SAGE.value }}>
        <path d="M40 68 L40 38" />
        <path d="M40 40 L24 22" />
        <path d="M40 40 L58 20" />
        <path d="M24 22 L14 10" />
        <path d="M24 22 L28 6" />
        <path d="M58 20 L52 6" />
        <path d="M58 20 L70 10" />
        <path d="M40 50 L30 42" />
      </svg>
    ),
  },
];

// Every section shares one measure, so the margin rule and the content keep
// the same distance all the way down.
const WRAP = 'relative mx-auto max-w-[1260px] pl-8 pr-5 sm:px-10 lg:px-14';

export default function LandingPage() {
  return (
    <main className="ruled-paper relative min-h-[100dvh] overflow-hidden bg-bg text-ink">
      <span aria-hidden className="margin-rule left-3 sm:left-4 xl:left-[calc(50%-664px)]" />

      <header className={`${WRAP} flex h-20 items-center justify-between gap-3 sm:h-24`}>
        <Link href="/" className="flex items-center gap-2.5 text-ink">
          <Mark size={26} />
          <span className="font-serif text-[21px] font-medium leading-none tracking-[-0.02em] sm:text-[23px]">
            Akada
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/guide" className="hidden px-3 py-2 text-[14.5px] text-ink-soft hover:text-ink md:inline">
            How it works
          </Link>
          <Link href="/claude" className="hidden px-3 py-2 text-[14.5px] text-ink-soft hover:text-ink md:inline">
            Akada in Claude
          </Link>
          <Link href="/auth" className="whitespace-nowrap px-3 py-2 text-[14.5px] text-ink-soft hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/auth?mode=signup"
            className="whitespace-nowrap rounded-[11px] bg-primary px-4 py-2.5 text-[14.5px] font-medium text-primary-contrast"
          >
            Create account
          </Link>
        </nav>
      </header>

      <section className={`${WRAP} grid items-center gap-14 pt-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:gap-24`}>
        <div className="min-w-0">
          <p className="eyebrow m-0">A study planner for LUMS</p>
          <h1 className="m-0 mt-5 font-serif text-[44px] font-normal leading-[1.02] tracking-[-0.03em] sm:text-[64px] lg:text-[70px] xl:text-[76px]">
            Every deadline this term,{' '}
            <em className="font-light">
              <span className="hl">on one page.</span>
            </em>
          </h1>
          <p className="mt-6 mb-0 max-w-[540px] font-serif text-[18px] leading-[1.6] text-ink-soft sm:text-[20px]">
            Pick your courses off the Fall 2026 list, hand Claude your outlines, and every
            quiz, reading and midterm goes in with its date and weight. Then Akada tells
            you what to do next, and times you while you do it.
          </p>
          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
            <Link
              href="/auth?mode=signup"
              className="rounded-[12px] bg-primary px-7 py-4 text-center text-[15.5px] font-medium text-primary-contrast"
            >
              Create account
            </Link>
            <Link
              href="/claude"
              className="rounded-[12px] border border-line-strong px-7 py-4 text-center text-[15.5px] text-ink hover:border-ink-soft"
            >
              See how Claude fills it in
            </Link>
          </div>
          <p className="mt-5 mb-0 font-serif text-[14px] italic text-muted">
            Akada is free. Delete your account and everything in it goes with it.
          </p>
        </div>

        <div className="relative min-w-0">
          <p className="m-0 mb-4 -rotate-2 font-hand text-[21px] text-ink-soft lg:hidden">
            this is Today, the one screen you open
          </p>
          <TodaySketch />
          {/* Margin notes, only where there is a margin to put them in. */}
          <p aria-hidden className="absolute -left-24 top-[250px] m-0 hidden w-[110px] -rotate-6 font-hand text-[23px] leading-[1.05] text-ink-soft xl:block">
            the one thing to do now
          </p>
          <svg aria-hidden className="absolute -left-10 top-[300px] hidden text-ink-soft xl:block" width="64" height="44" viewBox="0 0 64 44" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 6 C 20 30, 38 36, 58 30" />
            <path d="M49 24 L 59 30 L 50 38" />
          </svg>
          <p aria-hidden className="m-0 mt-5 hidden -rotate-2 text-right font-hand text-[21px] text-muted lg:block">
            worked out from your outline
          </p>
        </div>
      </section>

      <section className={`${WRAP} pt-20 sm:pt-28`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line-strong pb-3">
          <p className="eyebrow m-0">How it goes</p>
          <p className="m-0 font-hand text-[20px] text-muted">about two minutes, then the term runs itself</p>
        </div>
        <ol className="m-0 grid list-none p-0 md:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="grid grid-cols-[52px_minmax(0,1fr)] gap-4 border-b border-line py-6 md:block md:border-b-0 md:border-r md:px-8 md:py-9 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
            >
              <p className="m-0 font-mono text-[30px] tabular-nums text-muted-soft md:text-[44px]">
                {String(i + 1).padStart(2, '0')}
              </p>
              <div>
                <h2 className="m-0 font-serif text-[22px] font-normal tracking-[-0.01em] md:mt-3 md:text-[26px]">
                  {step.title}
                </h2>
                <p className="mt-2 mb-0 text-[15px] leading-[1.65] text-ink-soft">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Claude, shown rather than described. Most people have never heard of a
          connector, and "hand it your outline, the deadlines appear" needs no
          word for one. */}
      <section className={`${WRAP} grid items-start gap-10 pt-24 sm:pt-36 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:gap-20`}>
        <div className="min-w-0 lg:pt-6">
          <p className="eyebrow m-0">Works inside Claude</p>
          <h2 className="m-0 mt-4 font-serif text-[36px] font-normal leading-[1.08] tracking-[-0.02em] sm:text-[50px]">
            Hand it your outline. <em className="font-light">Never type a deadline.</em>
          </h2>
          <p className="mt-5 mb-0 font-serif text-[17px] leading-[1.65] text-ink-soft sm:text-[18.5px]">
            Switch Akada on in Claude once. Then attach an outline and say &ldquo;put
            everything into Akada&rdquo;, or ask what to start first, what you need on the
            final, or to be quizzed on last week&apos;s readings. It reads your planner and
            writes into it for you.
          </p>
          <div className="mt-7 grid grid-cols-2 gap-6 border-t border-line-strong pt-5">
            <div>
              <p className="m-0 flex items-center gap-2">
                <span aria-hidden className="course-rule" style={{ ['--c' as string]: SAGE.value }} />
                <span className="eyebrow text-ink-soft">Akada gets</span>
              </p>
              <p className="mt-2.5 mb-0 text-[14.5px] leading-[1.55] text-ink-soft">
                What Claude asks for, like &ldquo;the tasks due this week&rdquo;, and the
                deadlines it found.
              </p>
            </div>
            <div>
              <p className="m-0 flex items-center gap-2">
                <span aria-hidden className="course-rule" style={{ ['--c' as string]: ROSE.value }} />
                <span className="eyebrow text-ink-soft">Never gets</span>
              </p>
              <p className="mt-2.5 mb-0 text-[14.5px] leading-[1.55] text-ink-soft">
                Your chats, your other conversations, or your Claude account.
              </p>
            </div>
          </div>
          <Link href="/claude" className="hand-underline mt-7 inline-block font-serif text-[16px] text-ink">
            How to switch it on, and what happens to your data
          </Link>
        </div>
        <div className="min-w-0">
          <ChatSketch />
        </div>
      </section>

      <section className={`${WRAP} pt-24 sm:pt-36`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line-strong pb-3">
          <p className="eyebrow m-0">What it does that a to-do list doesn&apos;t</p>
          <Link href="/guide" className="hand-underline font-serif text-[15px] text-ink-soft">
            Read how it all works
          </Link>
        </div>
        <ul className="m-0 grid list-none p-0 md:grid-cols-2 md:gap-x-20">
          {features.map((feature) => (
            <li key={feature.title} className="border-b border-line">
              <Link
                href={feature.href}
                className="group grid gap-4 py-7 text-ink no-underline sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-8 sm:py-9"
              >
                <span aria-hidden className="block">{feature.glyph}</span>
                <span className="block">
                  <span className="block font-serif text-[22px] tracking-[-0.01em] group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4 sm:text-[25px]">
                    {feature.title}
                  </span>
                  <span className="mt-2 block text-[15px] leading-[1.65] text-ink-soft">{feature.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* The timer, shown rather than described. The fan is the one part of
          the app that has to be watched to be understood, so it is the real
          one, standing on a rule of its own rather than boxed in. */}
      <section className={`${WRAP} grid items-end gap-8 pt-24 sm:pt-36 md:grid-cols-[minmax(0,1fr)_minmax(0,520px)] md:gap-16`}>
        <div className="min-w-0 md:pb-14">
          <p className="eyebrow m-0">The timer</p>
          <h2 className="m-0 mt-4 font-serif text-[34px] font-normal leading-[1.08] tracking-[-0.02em] sm:text-[50px]">
            A block with a target, <em className="font-light">or untimed.</em>
          </h2>
          <p className="mt-5 mb-0 max-w-[500px] font-serif text-[17px] leading-[1.65] text-ink-soft sm:text-[18.5px]">
            The drawing grows while you read: one stem splitting two or three ways at every
            step, in the colour of the course you are on. A block fills its frame exactly
            when the time is up. An open session just keeps going.
          </p>
          <p className="mt-6 mb-0 flex items-baseline gap-3">
            <span className="eyebrow">Open</span>
            <span className="font-mono text-[34px] font-medium tabular-nums text-ink sm:text-[40px]">1:12:38</span>
          </p>
        </div>
        <div className="relative h-[300px] min-w-0 border-b border-line-strong sm:h-[440px]">
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
          <p aria-hidden className="absolute right-0 top-4 m-0 w-[140px] rotate-3 text-right font-hand text-[20px] leading-[1.1] text-muted">
            72 minutes of Mankiw, drawn
          </p>
        </div>
      </section>

      {/* The page used to end on the feature grid, so anyone who read to the
          bottom had to scroll back up to act. */}
      <section className={`${WRAP} flex flex-col items-center pt-28 pb-24 text-center sm:pt-40 sm:pb-32`}>
        <h2 className="m-0 font-serif text-[40px] font-normal leading-[1.05] tracking-[-0.02em] sm:text-[60px]">
          Start the term{' '}
          <em className="font-light">
            <span className="hl">on one page.</span>
          </em>
        </h2>
        <p className="mt-4 mb-0 font-serif text-[17px] text-ink-soft sm:text-[18.5px]">
          Two minutes to set up. Your courses are already on the list.
        </p>
        <Link
          href="/auth?mode=signup"
          className="mt-8 w-full rounded-[12px] bg-primary px-8 py-4 text-[15.5px] font-medium text-primary-contrast sm:w-auto"
        >
          Create account
        </Link>
        <p className="m-0 mt-5 -rotate-2 font-hand text-[21px] text-muted">
          add it to your home screen, it opens like an app
        </p>
      </section>

      <footer className={WRAP}>
        <div className="flex flex-col-reverse gap-5 border-t border-line-strong py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 font-serif text-[14px] italic text-muted">
            Akada, made at LUMS with quiet hands.
          </p>
          <nav className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px] text-ink-soft sm:flex sm:flex-wrap sm:gap-x-7">
            <Link className="hover:text-ink" href="/guide">How it works</Link>
            <Link className="hover:text-ink" href="/claude">Akada in Claude</Link>
            <Link className="hover:text-ink" href="/docs">Connector reference</Link>
            <Link className="hover:text-ink" href="/privacy">Privacy</Link>
            <Link className="hover:text-ink" href="/terms">Terms</Link>
            <a className="hover:text-ink" href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
          </nav>
        </div>
      </footer>
    </main>
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
