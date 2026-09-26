import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { Section } from '@/components/LegalPage';
import { SITE_URL } from '@/lib/site-url';
import { CONTACT_EMAIL } from '@/lib/contact';
import { GROUPS, PROMPTS } from './tools';

export const metadata: Metadata = {
  title: 'Akada for Claude',
  description:
    'Connect Akada to Claude: how to set it up, what signing in allows, and what every tool '
    + 'the connector offers reads, changes or deletes.',
  alternates: { canonical: '/docs' },
};

const CONTENTS = [
  { id: 'connect', title: 'Connect it' },
  { id: 'try', title: 'Things to ask' },
  { id: 'prompts', title: 'Starting points' },
  { id: 'access', title: 'What connecting allows' },
  ...GROUPS.map(({ id, title }) => ({ id, title })),
  { id: 'trouble', title: 'If it stops working' },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-bg-tint px-1.5 py-0.5 font-sans text-[13px] text-ink break-all">
      {children}
    </code>
  );
}

export default function DocsPage() {
  const connectorUrl = `${SITE_URL}/api/mcp`;

  return (
    <LegalPage
      title="Akada for Claude"
      standfirst={
        <>
          Connect Akada to Claude and you can hand it a course outline and have every
          deadline written in, ask what is due this week, log an afternoon of study, or
          be quizzed on what you are keeping for recall. Claude signs in to your own
          Akada account and only ever sees your own planner.
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

      <Section id="connect" title="Connect it">
        <p>
          You need an Akada account and a Claude account. Connecting takes about two
          minutes and you only do it once.
        </p>
        <ul>
          <li>
            In Claude, open <strong>Customize</strong>, then <strong>Connectors</strong>.
            Find Akada in the directory and press <strong>Connect</strong>. If it is not
            listed for you yet, choose <strong>Add custom connector</strong> instead, call
            it Akada and paste <Code>{connectorUrl}</Code> as the server URL.
          </li>
          <li>
            Claude opens Akada. Sign in if you are not already, confirm your password, and
            press <strong>Allow connection</strong>. You land back in Claude.
          </li>
          <li>
            In a chat, open the connectors menu and make sure Akada is switched on.
          </li>
        </ul>
        <p>
          In Claude Code, run <Code>claude mcp add --transport http akada {connectorUrl}</Code>,
          then <Code>/mcp</Code> to sign in.
        </p>
        <p>
          Confirming your password gives Claude a sign-in of its own, separate from your
          browser&apos;s, so signing out of Akada in the browser does not disconnect it.
        </p>
      </Section>

      <Section id="try" title="Things to ask">
        <ul>
          <li>
            &ldquo;Here&apos;s my outline for ECON 100. Put every assignment, reading and
            exam into Akada with the right dates.&rdquo; (attach the PDF)
          </li>
          <li>&ldquo;What do I have due this week, and what should I start first?&rdquo;</li>
          <li>&ldquo;Log two hours on CS 200 from this afternoon.&rdquo;</li>
          <li>&ldquo;I got 17 out of 20 on the second quiz in PSY 101, write it in.&rdquo;</li>
          <li>&ldquo;What do I need on the final to get an A-?&rdquo;</li>
          <li>&ldquo;Quiz me on what&apos;s due for recall today.&rdquo;</li>
          <li>&ldquo;Make a ten-question quiz from my notes on chapter 4 and send it to Akada.&rdquo;</li>
        </ul>
        <p>
          A good first thing to say in any chat is &ldquo;brief me&rdquo;. Claude reads where
          you stand in one go, the same reading Today makes, and starts from there rather
          than asking you.
        </p>
      </Section>

      <Section id="prompts" title="Starting points">
        <p>
          Akada also puts a few ready-made starts in Claude&apos;s prompt menu, under Akada
          in the <strong>+</strong> menu (in Claude Code, type <Code>/</Code>). The ones
          that ask for a course fill in from your own courses.
        </p>
        <dl className="m-0">
          {PROMPTS.map((prompt) => (
            <div key={prompt.name} className="border-b border-line-soft py-3 first:pt-0 last:border-b-0 last:pb-0">
              <dt className="font-serif text-[16px] text-ink">{prompt.title}</dt>
              <dd className="m-0 mt-1.5 font-serif text-[15px] leading-[1.6] text-ink-soft">
                {prompt.does}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="access" title="What connecting allows">
        <p>
          Claude can read everything in your planner: courses, tasks, study sessions,
          grades, recall, notes and quizzes. It can add to them, change them, and
          permanently delete them. It cannot see anyone else&apos;s planner, your password,
          or your account settings, and it cannot delete your account.
        </p>
        <p>
          Every tool below is marked the way Claude sees it: <strong>Reads</strong> only
          looks, <strong>Changes</strong> writes something that can be put back, and{' '}
          <strong>Deletes</strong> removes or overwrites something for good. In
          Claude&apos;s Connectors settings you can set any tool to{' '}
          <strong>Needs approval</strong> so Claude asks before each use, or switch a tool
          off.
        </p>
        <p>
          To disconnect, remove Akada in Claude&apos;s Connectors settings. Claude throws
          away its sign-in, and nothing it wrote is undone. What Akada does with the data
          is on the <Link className="hand-underline text-ink" href="/privacy">privacy page</Link>.
        </p>
      </Section>

      {GROUPS.map((group) => (
        <Section key={group.id} id={group.id} title={group.title}>
          <dl className="m-0">
            {group.tools.map((tool) => (
              <div key={tool.name} className="border-b border-line-soft py-3 first:pt-0 last:border-b-0 last:pb-0">
                <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Code>{tool.name}</Code>
                  <span className={`eyebrow ${tool.access === 'Deletes' ? 'text-prioritySoft' : ''}`}>
                    {tool.access}
                  </span>
                </dt>
                <dd className="m-0 mt-1.5 font-serif text-[15px] leading-[1.6] text-ink-soft">
                  {tool.does}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ))}

      <Section id="trouble" title="If it stops working">
        <ul>
          <li>
            <strong>Claude says to reconnect.</strong>{' '}Its sign-in ended, usually after
            thirty days unused or after your Akada sessions were ended. Press{' '}
            <strong>Connect</strong> on Akada in Claude&apos;s Connectors settings and
            allow it again.
          </li>
          <li>
            <strong>It says there is no active term.</strong>{' '}Claude works in the term
            marked current in Akada. Set one in Settings.
          </li>
          <li>
            <strong>Anything else.</strong>{' '}Write to{' '}
            <a className="hand-underline text-ink" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{' '}
            with what you asked Claude and what it said back.
          </li>
        </ul>
      </Section>

      <p className="mt-10 mb-0 font-serif text-[13px] italic text-muted">
        <Link className="hand-underline" href="/guide">
          How Akada works
        </Link>{' '}
        ·{' '}
        <Link className="hand-underline" href="/privacy">
          Privacy
        </Link>{' '}
        ·{' '}
        <Link className="hand-underline" href="/">
          Back to Akada
        </Link>
      </p>
    </LegalPage>
  );
}
