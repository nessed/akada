import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { Section } from '@/components/LegalPage';
import AskList from '@/components/claude/AskList';
import ChatSketch from '@/components/claude/ChatSketch';

export const metadata: Metadata = {
  title: 'Akada in Claude',
  description:
    'Connect Akada to Claude once, hand it your course outlines, and every deadline goes into '
    + 'your planner. What it can do, how to set it up, and what happens to your data.',
  alternates: { canonical: '/claude' },
};

// The student-facing half of the connector. /docs is the reference (every
// tool, what each one reads or deletes, Claude Code setup); this page is the
// one to send a friend. It never says "MCP", says "connector" once because
// Claude's own screens use the word, and makes no claim about which Claude
// plans can connect until that has been checked.

const ASKS = [
  {
    say: "Here's my outline for ECON 100. Put every assignment, reading and exam into Akada with the right dates and weights.",
    note: 'Attach the PDF. Do one course at a time.',
  },
  { say: 'What do I have due this week, and what should I start first?' },
  { say: 'Quiz me on what is due for recall today in Akada.' },
  { say: 'I got 17 out of 20 on the second quiz in PSY 101, write it in.' },
  { say: 'What do I need on the final in ECON 100 to get an A-?' },
  { say: 'Make ten questions from my notes on chapter 4 and send them to Akada as a quiz.' },
  { say: 'Log two hours on CS 200 from this afternoon.' },
];

export default function ClaudePage() {
  return (
    <LegalPage
      title="Akada in Claude"
      standfirst={
        <>
          Connect Akada to Claude once and you can talk to Claude about your semester.
          It can see what is due, and it can write into your planner for you, so you
          never have to type a deadline in.
        </>
      }
    >
      <ChatSketch />

      <Section id="setup" title="Set it up, once">
        <ul>
          <li>
            In Claude, open <strong>Customize</strong>, then <strong>Connectors</strong>.
            Search for <strong>Akada</strong> and press <strong>Connect</strong>.
          </li>
          <li>
            Akada opens. Sign in with your Akada account and allow the connection. You
            land back in Claude.
          </li>
          <li>
            In a chat, open the connectors menu and check Akada is switched on.
          </li>
        </ul>
        <p>
          That&apos;s it. Stuck, or using Claude Code? The{' '}
          <Link className="hand-underline text-ink" href="/docs#connect">
            connector page
          </Link>{' '}
          has the long version.
        </p>
      </Section>

      <Section id="ask" title="Things to say">
        <p>
          Talk to it the way you would to a friend who can see your planner. A few to
          start with:
        </p>
        <AskList asks={ASKS} />
        <p>
          Inside Akada, anything marked <strong>ask Claude</strong> or{' '}
          <strong>Say how it is marked</strong> copies a message made for exactly that.
          Paste it into a chat with Akada switched on.
        </p>
      </Section>

      <Section id="data" title="What happens to your data">
        <ul>
          <li>
            <strong>Akada only gets Claude&apos;s requests.</strong>{' '}When you ask
            something, Claude asks Akada for what it needs (&ldquo;list the tasks due
            this week&rdquo;) or sends a change (&ldquo;add these deadlines&rdquo;).
            Akada never sees your chats, your other conversations or your Claude account.
            If you attach an outline, Claude reads it; only the deadlines it finds reach
            Akada.
          </li>
          <li>
            <strong>Claude sees your planner when it needs to.</strong>{' '}Ask what is
            due and it reads your tasks. What it reads becomes part of that chat, which
            is looked after by Anthropic under your Claude account&apos;s settings, the
            same as anything else you tell Claude.
          </li>
          <li>
            <strong>It is signed in as you.</strong>{' '}The database only lets it
            touch your own planner. It never sees your password, and nothing in Akada
            can reach anyone else&apos;s.
          </li>
          <li>
            <strong>You stay in charge.</strong>{' '}In Claude&apos;s Connectors
            settings you can make it ask before every change, or remove Akada and it
            stops at once. What it already wrote stays in your planner.
          </li>
        </ul>
        <p>
          The full detail is in the{' '}
          <Link className="hand-underline text-ink" href="/privacy#assistants">
            privacy policy
          </Link>
          , and every single thing the connector can do is listed on the{' '}
          <Link className="hand-underline text-ink" href="/docs">
            connector page
          </Link>
          .
        </p>
      </Section>

      <Section title="Without Claude">
        <p>
          Everything still works. Add deadlines on <strong>Tasks</strong>, start a timer
          from any of them, and{' '}
          <Link className="hand-underline text-ink" href="/guide">
            the guide
          </Link>{' '}
          walks through the rest.
        </p>
      </Section>
    </LegalPage>
  );
}
