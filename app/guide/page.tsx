import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { Section } from '@/components/LegalPage';
import { SITE_URL } from '@/lib/site-url';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'A plain walk through Akada: what each screen is for, the few habits that make it work, '
    + 'and how to hand your course outlines to Claude so you never type a deadline in.',
  alternates: { canonical: '/guide' },
};

// Written for someone who has never opened a planner more complicated than a
// notes app. Every section says what the thing is, then the one move that
// makes it worth having. Labels in bold are the words on the screen, so a
// reader can go and find them.
const CONTENTS = [
  { id: 'first', title: 'The first ten minutes' },
  { id: 'today', title: 'Today' },
  { id: 'tasks', title: 'Tasks, and why the kind matters' },
  { id: 'timer', title: 'The timer' },
  { id: 'marks', title: 'Your marks' },
  { id: 'recall', title: 'Recall' },
  { id: 'notes', title: 'Notes' },
  { id: 'stats', title: 'Stats and the Record' },
  { id: 'claude', title: 'Letting Claude fill it in' },
  { id: 'small', title: 'Small things worth knowing' },
];

export default function GuidePage() {
  const connectorUrl = `${SITE_URL}/api/mcp`;

  return (
    <LegalPage
      title="How Akada works"
      standfirst={
        <>
          Akada holds your courses, what is due in them, and the hours you actually
          put in. Most of it works on its own once three things are in: your courses,
          your deadlines, and a timer running while you study. This page walks through
          the rest.
        </>
      }
    >
      <nav aria-label="On this page" className="py-6">
        <p className="eyebrow m-0">On this page</p>
        <ol className="mt-3 mb-0 grid list-none gap-x-6 gap-y-1.5 p-0 font-serif text-[15px] sm:grid-cols-2">
          {CONTENTS.map((c) => (
            <li key={c.id}>
              <a className="hand-underline text-ink-soft" href={`#${c.id}`}>
                {c.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="first" title="The first ten minutes">
        <p>
          Sign up and it asks for your name, your courses and your term dates. Search
          the catalog for each course and pick your section, and the instructor and
          class time come with it. If a course isn&apos;t there, type its name and carry on.
        </p>
        <p>
          Each course gets a <strong>weekly goal</strong> in hours. It is suggested off
          the credit hours, so a 4 credit course asks for more than a 2. Leave it or
          change it, it only decides how full the week looks.
        </p>
        <p>
          Then put in what is due. You can add tasks one at a time on{' '}
          <strong>Tasks</strong>, but the quicker way is to give Claude your course
          outlines and let it write every deadline in for you. That is{' '}
          <a className="hand-underline text-ink" href="#claude">further down</a>, and
          it is the single biggest time saver in the app.
        </p>
      </Section>

      <Section id="today" title="Today">
        <p>
          The home screen. Open it and it tells you what is due, what is next, and how
          many hours you have in today and this week. Your courses sit underneath with
          their weekly goal drawn as little strokes, one per hour, so you can see which
          course you have been ignoring without reading a number.
        </p>
        <p>
          <strong>Coming</strong>{' '}counts down to anything that carries marks, and shows
          your unread pages as hours of reading, worked out at your own speed. It turns
          &ldquo;I have four readings&rdquo; into &ldquo;I have about six hours of
          reading before Thursday&rdquo;, which is the thing you actually need to know.
        </p>
      </Section>

      <Section id="tasks" title="Tasks, and why the kind matters">
        <p>
          A task has a due date, a course and a priority. It can also have a{' '}
          <strong>kind</strong>, and this is the part people skip and shouldn&apos;t:
        </p>
        <ul>
          <li>
            <strong>Reading</strong>{' '}takes a page count. That is what lets Akada tell
            you your reading in hours rather than in a pile.
          </li>
          <li>
            <strong>Exam</strong>{' '}takes a weight, like 30%. It gets counted down to on
            Today, and it pulls your recall forward so you are tested before it.
          </li>
          <li>Everything else is a plain task.</li>
        </ul>
        <p>
          Finished tasks fade out rather than disappearing, so the list still shows what
          the week looked like.
        </p>
      </Section>

      <Section id="timer" title="The timer">
        <p>
          Press <strong>Start timer</strong> on Today, or start one straight from a task
          or a course. Pick a <strong>block</strong> of 25, 45 or 60 minutes, or{' '}
          <strong>open</strong>{' '}if you just want it to run. While it runs a small branching
          drawing grows in the course&apos;s colour, so there is something to look at that
          isn&apos;t a clock ticking down.
        </p>
        <p>
          When you stop, it asks for a line about what you did. Write one. Those lines
          are what your Stats journal is made of, and they can be kept for recall later.
        </p>
        <p>
          This is the habit that makes everything else work. Every screen that tells you
          how you are doing is worked out from the sessions you log, so if the timer
          doesn&apos;t run, the app knows nothing.
        </p>
      </Section>

      <Section id="marks" title="Your marks">
        <p>
          Open a course and tell it how the course is marked: the quizzes, the midterm,
          the final and what each is worth. Tap <strong>Say how it is marked</strong>{' '}
          and it copies a message you paste into Claude along with the course outline,
          and Claude reads the weights off it. Nothing counts until you accept what it
          found.
        </p>
        <p>
          As marks come back, write them in. The number at the top is your grade out of
          what has been marked so far, not out of 100. If you got 80% on a quiz worth
          10, you are on 80%, not 8%. It also knows about the rules where not everything
          counts, like best six out of seven quizzes.
        </p>
      </Section>

      <Section id="recall" title="Recall">
        <p>
          The hours say how long you sat there. Recall asks whether any of it stuck.
        </p>
        <p>
          When you tick off a reading, it comes back the next day on Today as a question:
          what was that about? Answer it from memory, book shut, then say how it went:{' '}
          <strong>clear</strong>, <strong>hazy</strong> or <strong>gone</strong>. Clear
          pushes it further away (a day, then 3, 7, 16, 35). Hazy or gone brings it back
          soon.
        </p>
        <p>
          You can keep anything else too: a concept, a formula, the line you wrote after
          a session. Each card has <strong>ask Claude</strong>, which copies a message
          so Claude can quiz you on it properly instead of you marking your own homework.
        </p>
        <p>
          A few a day is enough. It is the part of the app that actually changes your
          grade, and it takes five minutes.
        </p>
      </Section>

      <Section id="notes" title="Notes">
        <p>
          A shelf for study notes. Drop a text or Markdown file on it, or paste one in,
          or have Claude write a note straight onto it. Notes can end with self-check
          questions, and the reader remembers where you stopped and how fast you read.
          Link a note to a task and you can study it with the timer running.
        </p>
      </Section>

      <Section id="stats" title="Stats and the Record">
        <p>
          <strong>Stats</strong>{' '}is the honest one: a heatmap of every day you studied,
          the week against your goal, and a journal of every session in order.
        </p>
        <p>
          <strong>Record</strong>{' '}is the fun one. Your run is counted in weeks, not
          days, so missing a Saturday doesn&apos;t wipe it. Each course has a page that
          fills in as you log hours and gets bound when it is full, and there are
          stamps to earn as you go. It is all worked out from the same sessions, so
          there is nothing to keep up and nothing to game.
        </p>
      </Section>

      <Section id="claude" title="Letting Claude fill it in">
        <p>
          If you use Claude, you can connect it to Akada once and from then on just talk
          to it. It can read your planner and write into it. You need a Claude account;
          the rest takes about two minutes.
        </p>
        <ul>
          <li>
            In Claude, open <strong>Customize</strong>, then{' '}
            <strong>Connectors</strong>, then <strong>Add custom connector</strong>.
          </li>
          <li>
            Call it Akada, and paste this as the server URL. Leave the rest as it is.{' '}
            <code className="rounded bg-bg-tint px-1.5 py-0.5 font-sans text-[13px] text-ink break-all">
              {connectorUrl}
            </code>
          </li>
          <li>
            Press <strong>Connect</strong>, sign in with your Akada email and password,
            and allow it.
          </li>
          <li>
            In a new chat, open the connectors menu and make sure Akada is switched on.
          </li>
        </ul>
        <p>Then try things like:</p>
        <ul>
          <li>
            &ldquo;Here&apos;s my outline for ECON 100. Put every assignment, reading and
            exam into Akada with the right dates.&rdquo; (attach the PDF)
          </li>
          <li>&ldquo;What do I have due this week, and what should I start first?&rdquo;</li>
          <li>&ldquo;Quiz me on what&apos;s due for recall today.&rdquo;</li>
          <li>&ldquo;I got 17 out of 20 on the second quiz in PSY 101, write it in.&rdquo;</li>
          <li>&ldquo;What do I need on the final to get an A-?&rdquo;</li>
          <li>&ldquo;Log two hours on CS 200 from this afternoon.&rdquo;</li>
        </ul>
        <p>
          If you&apos;d rather check each change before it happens, set Akada&apos;s tools
          to <strong>Needs approval</strong> in the same Connectors screen.
        </p>
      </Section>

      <Section id="small" title="Small things worth knowing">
        <ul>
          <li>
            <strong>Put it on your phone.</strong>{' '}Open Akada in your phone&apos;s
            browser and use <strong>Add to Home Screen</strong>. It opens like an app.
          </li>
          <li>
            <strong>Late nights count for the right day.</strong>{' '}In Settings you can
            say your day ends as late as 8am, so a 2am session goes on the day you were
            still living in.
          </li>
          <li>
            <strong>Make it look how you like.</strong>{' '}Settings has five paper colours,
            including a dark one for night, and a few fonts.
          </li>
          <li>
            <strong>Your data is yours.</strong>{' '}Settings exports every session as a
            spreadsheet, and deleting your account deletes everything.
          </li>
        </ul>
        <p>
          Stuck on anything? Write to{' '}
          <a className="hand-underline text-ink" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          and a person will answer. Or go back to the{' '}
          <Link className="hand-underline text-ink" href="/">
            front page
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
