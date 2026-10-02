import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { Section } from '@/components/LegalPage';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'A plain walk through Akada: what each screen is for, the few habits that make it work, '
    + 'and how to hand your course outlines to Claude so you never type a deadline in.',
  alternates: { canonical: '/guide' },
};

// Written for someone who has never opened a planner more complicated than a
// notes app. It opens on what to do in the first week, because that is the
// question a new reader actually has, then says what each screen is for.
// Labels in bold are the words on the screen, so a reader can go and find
// them. Everything here has to stay true of the app: if a screen changes,
// change the sentence.
const CONTENTS = [
  { id: 'first', title: 'Your first week' },
  { id: 'today', title: 'Today' },
  { id: 'tasks', title: 'Tasks, and why the kind matters' },
  { id: 'timer', title: 'The timer' },
  { id: 'marks', title: 'Your marks' },
  { id: 'recall', title: 'Recall' },
  { id: 'notes', title: 'Study' },
  { id: 'stats', title: 'Stats and the Record' },
  { id: 'claude', title: 'Letting Claude fill it in' },
  { id: 'small', title: 'Small things worth knowing' },
];

export default function GuidePage() {
  return (
    <LegalPage
      title="How Akada works"
      standfirst={
        <>
          Akada holds what is due in each of your courses and the hours you put in, and
          tells you what to do next. It needs three habits from you. Everything else fills
          in on its own.
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

      <Section id="first" title="Your first week" aside="three habits, that is all it asks">
        <p>
          Setup asks for your courses and your term. Search for each course, pick your
          section, and the instructor and class time come with it. Then do these three
          things and leave the rest alone for now.
        </p>
        <ul>
          <li>
            <strong>Get your deadlines in.</strong>{' '}The quickest way is to hand Claude
            your course outlines (<a className="hand-underline text-ink" href="#claude">how</a>).
            Otherwise add them on <strong>Tasks</strong>. Put the page count on readings
            and the weight on exams, because that is what the app works from.
          </li>
          <li>
            <strong>Start the timer when you study.</strong>{' '}Press <strong>Start</strong>{' '}
            on Today. If the timer never runs, the app knows nothing about your hours.
          </li>
          <li>
            <strong>Answer recall when it shows up.</strong>{' '}A day after you finish a
            reading it comes back on Today as a question. A few a day, a couple of
            minutes.
          </li>
        </ul>
        <p>
          Everything else, the countdowns, your reading in hours, Stats and the Record,
          works itself out from those three.
        </p>
      </Section>

      <Section id="today" title="Today">
        <p>
          The home screen. <strong>Up next</strong>{' '}is the next session: one thing to do
          now, a line saying why it is the one, how long to give it tonight and what to start
          with. What is due by tomorrow comes first. In the two weeks before anything worth a
          fifth of the grade or more, like a midterm, a session on that course comes up every
          few days, closer together as the day nears, starting with that course&apos;s recall
          when it has some. The night before, it comes first until it has had its session.{' '}
          <strong>Start</strong>{' '}begins it at
          the length shown, or tap <strong>Another length</strong>. <strong>Not now</strong>{' '}
          sets it aside until tomorrow, and the two under <strong>Or</strong>{' '}are one tap to
          put up next or to start. Under them are recall, anything overdue or due today, and
          your courses with their weekly goal drawn as small strokes, one per hour, so you can
          see which course you have been ignoring.
        </p>
        <p>
          <strong>Coming</strong>{' '}counts down to anything that carries marks, and turns
          your unread pages into hours at your own reading speed. &ldquo;Four
          readings&rdquo; becomes &ldquo;about six hours of reading before Thursday&rdquo;,
          which is the thing you actually need to know.
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
            Today, and it pulls your recall forward so you are asked again before it. One
            worth a fifth of the grade or more also brings its course up on Up next every
            few days in the two weeks before it.
          </li>
          <li>Everything else is a plain task.</li>
        </ul>
        <p>
          Finished tasks fade rather than disappearing, so the list still shows what the
          week looked like.
        </p>
      </Section>

      <Section id="timer" title="The timer">
        <p>
          Press <strong>Start</strong>{' '}on Up next to begin at the length it shows, or{' '}
          <strong>Another length</strong>{' '}for a <strong>block</strong>{' '}of 25, 45 or 60
          minutes, or <strong>Untimed</strong>{' '}if you just want it to run. The play mark
          beside any task or course asks for a length the same way. While it runs a small
          branching drawing grows in the course&apos;s colour, so there is something to
          look at that isn&apos;t a clock ticking down. In Settings it can be a jellyfish
          instead, or <strong>the deep</strong>: an ocean you sink through as you study,
          filling with animals nobody else will see, or <strong>a wood</strong> that grows up
          round the tree the longer you sit. Take a break from the timer screen;
          when you end it, the next block waits at zero until you press Start.
        </p>
        <p>
          When you stop, it asks for a line about what you did. Write one. Those lines are
          your Stats journal, and you can keep one for recall.
        </p>
      </Section>

      <Section id="marks" title="Your marks">
        <p>
          Open a course and tell it how the course is marked: the quizzes, the midterm, the
          final and what each is worth. <strong>Say how it is marked</strong>{' '}copies a
          message for Claude to read the weights off the outline, and nothing counts until
          you accept what it found. Or type them in yourself.
        </p>
        <p>
          As marks come back, write them in. The number at the top is your grade out of what
          has been marked so far, not out of 100. If you got 80% on a quiz worth 10, you are
          on 80%, not 8%. It also knows the rules where not everything counts, like best six
          of seven quizzes.
        </p>
      </Section>

      <Section id="recall" title="Recall" aside="a few a day, a couple of minutes">
        <p>
          The hours say how long you sat there. Recall asks whether any of it stuck.
        </p>
        <p>
          When you tick off a reading, it comes back the next day on Today as a question.
          Answer it from memory with the book shut, then say how it went:{' '}
          <strong>clear</strong>, <strong>hazy</strong>{' '}or <strong>gone</strong>. Clear
          pushes it further away (a day, then 3, 7, 16, 35). Hazy or gone brings it back
          soon. You can keep anything else too, like a formula or a line from the end of a
          session.
        </p>
        <p>
          <strong>ask Claude</strong>{' '}on a card copies a message so Claude can quiz you
          on it properly instead of you marking your own homework.
        </p>
      </Section>

      <Section id="notes" title="Study">
        <p>
          A shelf for study notes. Write one, paste one in, drop a text file on the page, or
          have Claude write one straight onto the shelf. The reader remembers where you
          stopped, and a note linked to a task can be studied with the timer running.
          Claude can also send you a quiz on your notes, which you take on the same shelf.
        </p>
      </Section>

      <Section id="stats" title="Stats and the Record">
        <p>
          <strong>Stats</strong>{' '}is the honest one: a heatmap of every day you studied,
          you against last week, the records to beat, and a journal of every session.
        </p>
        <p>
          <strong>Record</strong>{' '}is the fun one, and it shows up after your first
          session. Every 40 minutes on a course inks a <strong>tally</strong>{' '}on that
          course&apos;s page, and 15 tallies bind the page. Your run is counted in weeks,
          not days, so missing a Saturday costs nothing. Stamps are struck as the term adds
          up. It is all worked out from your sessions, so there is nothing to keep up.
        </p>
      </Section>

      <Section id="claude" title="Letting Claude fill it in">
        <p>
          If you use Claude, connect Akada to it once and from then on just talk to it. It
          can read your planner and write into it. In Claude, open{' '}
          <strong>Customize</strong>, then <strong>Connectors</strong>, search for{' '}
          <strong>Akada</strong>, press <strong>Connect</strong>{' '}and sign in.
        </p>
        <p>
          Then attach a course outline and ask it to put everything into Akada. Every quiz,
          assignment, reading and exam goes in with its date and weight.{' '}
          <Link className="hand-underline text-ink" href="/claude">
            Akada in Claude
          </Link>{' '}
          has more things to ask and says exactly what happens to your data.
        </p>
      </Section>

      <Section id="small" title="Small things worth knowing">
        <ul>
          <li>
            <strong>Put it on your phone.</strong>{' '}Open Akada in your phone&apos;s browser
            and use <strong>Add to Home Screen</strong>. It opens like an app.
          </li>
          <li>
            <strong>Late nights count for the right day.</strong>{' '}In Settings you can say
            your day ends as late as 9am, so a 2am session goes on the day you were still
            living in.
          </li>
          <li>
            <strong>Make it look how you like.</strong>{' '}Settings has five paper colours,
            including a dark one for night, and a few fonts.
          </li>
          <li>
            <strong>Your data is yours.</strong>{' '}Settings exports every session as a
            spreadsheet, and deleting your account deletes everything. The{' '}
            <Link className="hand-underline text-ink" href="/privacy">
              privacy page
            </Link>{' '}
            has the detail.
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
