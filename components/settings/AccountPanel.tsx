'use client';

import { SettingRow } from './SettingsPrimitives';

/**
 * The section nobody wants to meet in a hurry. Both of these ask again on a
 * confirm sheet, and the destructive one asks the reader to type a word.
 */
export default function AccountPanel({
  onSignOut,
  onDelete,
}: {
  onSignOut: () => void;
  onDelete: () => void;
}) {
  return (
    <div>
      <h1 className="m-0 font-serif text-[30px] font-normal leading-none tracking-[-0.03em] md:text-[38px]">
        Account
      </h1>
      <p className="mt-3 max-w-[52ch] font-serif text-[15.5px] leading-[1.6] text-ink-soft">
        Akada authenticates as you. There is no key in the app that can read another student&apos;s
        row, which is also why nobody here can recover your work for you.
      </p>

      <div className="rule-ink mt-7 pt-1">
        <SettingRow label="Privacy" sub="How your data is handled" href="/privacy" />
        <SettingRow label="Terms" sub="What you agree to" href="/terms" />
        <SettingRow label="Sign out" sub="This device forgets you" onClick={onSignOut} />
        <SettingRow
          label="Delete the account"
          sub="The account and everything in it. This cannot be undone."
          onClick={onDelete}
          tone="care"
        />
      </div>
    </div>
  );
}
