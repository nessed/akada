import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, CONTROLLER_NAME } from '@/lib/contact';
import LegalPage, { Section } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What Akada stores, why, who processes it, and how to get it back or have it deleted.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="1 September 2026">
      <Section title="Who holds your data">
        <p>
          Akada is run by {CONTROLLER_NAME}. Anything in this policy, and any request
          about your data, reaches a person at{' '}
          <a className="hand-underline text-ink" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="What is stored">
        <p>Only what the planner needs to be a planner:</p>
        <ul>
          <li>
            Your email address and password. The password is hashed by Supabase and is
            never seen by Akada.
          </li>
          <li>Your display name and, if you upload one, an avatar.</li>
          <li>
            Your courses, including the code, title, section, instructor and meeting time
            you picked from the catalog.
          </li>
          <li>Your tasks, their due dates and whether they are done.</li>
          <li>Your study sessions: date, duration and any note you wrote on one.</li>
          <li>Your semester dates and your weekly and daily goals.</li>
        </ul>
        <p>
          Your hosting and database providers also keep ordinary server logs, which
          include your IP address and browser. If the app crashes, it sends the error
          and the page it happened on to its own log so the fault can be found. None of
          that is used to profile you and none of it is sold.
        </p>
      </Section>

      <Section title="Why it is stored">
        <p>
          The planner content and your account exist because you asked for a planner:
          without them there is no service to provide. Crash logs and server logs exist
          so the app can be kept working and abuse can be stopped. There is no
          advertising, no tracking across other sites, and no analytics product of any
          kind.
        </p>
      </Section>

      <Section title="Cookies and local storage">
        <p>
          Akada sets a sign-in cookie so you stay signed in, and it keeps your
          appearance settings and any timer you have running on your own device. That is
          all. Because every one of those is either the sign-in itself or a setting you
          chose, none of it needs a consent banner, and you will not see one.
        </p>
        <p>
          No third-party scripts run on the site. Fonts are served from Akada&rsquo;s own
          domain, not fetched from anyone else.
        </p>
      </Section>

      <Section title="Who else touches it">
        <p>
          Two companies process data on Akada&rsquo;s behalf: <strong>Supabase</strong>,
          which holds the database and runs sign-in, and <strong>Vercel</strong>, which
          hosts the site. Both keep server logs. Neither uses your data for anything of
          their own. Nobody else receives it.
        </p>
      </Section>

      <Section title="How long it is kept">
        <p>
          For as long as your account exists. Delete the account and the courses, tasks,
          sessions, semesters and settings are deleted along with it, immediately and by
          the database itself. Server and crash logs age out on the providers&rsquo; own
          schedules, within weeks.
        </p>
      </Section>

      <Section title="What you can do">
        <ul>
          <li>
            <strong>See it</strong>: everything Akada holds about you is on the screen
            when you are signed in.
          </li>
          <li>
            <strong>Take it</strong>: Settings exports your study sessions as a CSV.
          </li>
          <li>
            <strong>Correct it</strong>: every field is editable in the app.
          </li>
          <li>
            <strong>Delete it</strong>: Settings has both &ldquo;Reset data&rdquo;, which
            empties the planner and keeps the account, and &ldquo;Delete account&rdquo;,
            which removes the account and everything attached to it.
          </li>
        </ul>
        <p>
          If you would rather someone did any of that for you, or you want to object to
          how something is handled, write to {CONTACT_EMAIL} and it will be done.
        </p>
      </Section>

      <Section title="Age">
        <p>
          Akada is for university students. Do not create an account if you are under 16.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes in a way that affects what is collected or who sees it,
          the date at the top changes with it.
        </p>
      </Section>

      <p className="mt-10 mb-0 font-serif text-[13px] italic text-muted">
        <Link className="hand-underline" href="/terms">
          Terms
        </Link>{' '}
        ·{' '}
        <Link className="hand-underline" href="/">
          Back to Akada
        </Link>
      </p>
    </LegalPage>
  );
}
