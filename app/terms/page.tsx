import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, CONTROLLER_NAME } from '@/lib/contact';
import LegalPage, { Section } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The terms you agree to by using Akada.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="1 September 2026">
      <Section title="What this is">
        <p>
          Akada is a study planner run by {CONTROLLER_NAME}. It is free, and using it
          means agreeing to what is written here. If you do not agree with it, do not
          make an account.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You need a real email address you can reach, because it is how you get back in
          if you forget your password. Keep your password to yourself; anything done
          from your account is treated as done by you. One person, one account.
        </p>
        <p>
          You must be 16 or older.
        </p>
      </Section>

      <Section title="What you put in it">
        <p>
          Your courses, tasks and notes stay yours. Akada stores them so it can show them
          back to you, and does nothing else with them. Do not use the app to store
          anything unlawful, and do not use it to attack, overload or break into the
          service.
        </p>
      </Section>

      <Section title="The course catalog">
        <p>
          Course codes, sections, meeting times and rooms come from the university&rsquo;s
          published memo and from a schedule dataset maintained by another student. They
          go out of date, sections move, and rooms change after add/drop. Check anything
          that matters against the registrar. Akada is a planner, not a source of truth
          for your timetable.
        </p>
      </Section>

      <Section title="No promises about uptime or data">
        <p>
          This is a small free service. It can be slow, it can be down, and it can lose
          data. Keep your own copy of anything you cannot afford to lose; Settings will
          export your sessions. To be plain about it: Akada is provided as it is, with no
          warranty of any kind, and {CONTROLLER_NAME} is not liable for anything lost
          through using it, including missed deadlines or lost work.
        </p>
      </Section>

      <Section title="Ending it">
        <p>
          You can delete your account at any time from Settings, which removes everything
          attached to it. Accounts that are used to attack the service or to harm other
          people can be closed without notice.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          These terms can change. The date at the top says when they last did. Continuing
          to use Akada after that is how you accept the new version.
        </p>
      </Section>

      <Section title="Getting in touch">
        <p>
          Questions, complaints and anything else:{' '}
          <a className="hand-underline text-ink" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <p className="mt-10 mb-0 font-serif text-[13px] italic text-muted">
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
