# Google auth for Akada — implementation plan

ClickUp: [Add Google auth](https://app.clickup.com/t/86eyv3kyb).
Related: [Add Google Calendar integration](https://app.clickup.com/t/86eyv3ky3) — see
[§6](#6-where-this-overlaps-with-google-calendar) before choosing scopes, because the
scope decision is easier to make once than to unpick later.

**Status.** The code side is written and on disk (§3). Nothing works until the
Google Cloud + Supabase console work in §1 is done, because the app never holds
a Google credential itself — Supabase does. §1 is the whole blocker.

---

## 0. How auth works today, and why Google slots in cleanly

Worth reading once, because it explains why §3 is as small as it is.

| Piece | File | What it does |
|---|---|---|
| Browser client | `lib/supabase.ts` → `createClient()` | `createBrowserClient` from `@supabase/ssr`. Keeps the session **in cookies**, not `localStorage`. |
| Server client | `lib/supabase.ts` → `createServerSupabaseClient()` | `createServerClient`, reads/writes the same cookies. |
| Route guard | `proxy.ts` | Default-deny. Everything is private unless listed in `PUBLIC_PATHS`. Calls `supabase.auth.getUser()` (validates the JWT server-side, refreshes an expired access token) and redirects signed-out users to `/auth`. |
| Sign-in UI | `app/auth/page.tsx` | `signUp` / `signInWithPassword`, both with `?next=` handling. |
| Callback | `app/auth/callback/route.ts` | Already exchanges a PKCE `code` **and** verifies email OTP `token_hash`. |
| Ownership | `supabase/schema.sql` §7 | Every table is `using ((select auth.uid()) = user_id)`. |

Three consequences:

1. **`/auth/callback` already does the PKCE code exchange.** The magic-link and
   password-recovery flows use the same `?code=` round trip Google does. There is
   no new route to build.
2. **The cookie-based browser client is what makes that work.** The PKCE code
   verifier is written to a cookie (`sb-<ref>-auth-token-code-verifier`), which is
   why the *server* route handler can complete the exchange. If anyone ever swaps
   `createBrowserClient` for plain `createClient` from `@supabase/supabase-js`,
   the verifier moves to `localStorage`, the server cannot see it, and every OAuth
   sign-in dies with `invalid request: both auth code and code verifier should be non-empty`.
3. **RLS does not care how you signed in.** `auth.uid()` is the `auth.users.id`,
   identical for a password identity and a Google identity. No policy changes,
   no migration.

`proxy.ts` needs **no change**: `/auth/callback` is already in `PUBLIC_PATHS`.

`next.config.js` needs **no change** either. The CSP has
`form-action 'self' <siteOrigin>`, but `signInWithOAuth` performs a top-level
*navigation* (`window.location.assign`), not a form submission, and `connect-src`
does not govern navigations. Only switch to `skipBrowserRedirect: true` with a
hand-rolled form if you are prepared to revisit this.

---

## 1. What Ali has to do by hand — the blocking checklist

Nothing below can be done from the repo; all of it needs a console login.
Budget 20 minutes.

### 1a. Values to have in front of you

| Placeholder | Where to find it |
|---|---|
| `<project-ref>` | Supabase dashboard → Project Settings → Data API → Project URL. It is the subdomain of `https://<project-ref>.supabase.co`. Same value as in `NEXT_PUBLIC_SUPABASE_URL`. |
| `<vercel-domain>` | Vercel → the Akada project → Domains. `LAUNCH_CHECKLIST.md` records this as `akada.vercel.app`; confirm it, the exact string matters. |

> The production domain is `akada.app` per `LAUNCH_CHECKLIST.md` §7, **still being
> registered**. Register both it and the `.vercel.app` domain now — Google will
> reject a sign-in from any origin not on the list, and adding one later means
> another round trip through this checklist.

### 1b. Google Cloud Console

1. <https://console.cloud.google.com/> → create or select a project (name it `Akada`).
2. **APIs & Services → OAuth consent screen** (newer consoles: **Google Auth
   Platform**) → **Get started**.
   - User type: **External**.
   - App name `Akada`, support email, developer contact: your own address.
   - Scopes: add nothing here yet. The defaults (`openid`, `email`, `profile`)
     are all sign-in needs, and they are non-sensitive, so **no Google
     verification review is required**. See §6 before adding anything.
   - Leave publishing status at **Testing** for now and add yourself under
     **Test users**. In Testing, only listed test users can sign in, and refresh
     tokens expire after 7 days — fine for development, fatal in production.
     **Click "Publish app" before launch.**
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**. Name: `Akada web`.
   - **Authorized JavaScript origins** — paste these three, one per line, no
     trailing slashes:

     ```
     http://localhost:3000
     https://akada.vercel.app
     https://akada.app
     ```

   - **Authorized redirect URIs** — paste **only this one**:

     ```
     https://<project-ref>.supabase.co/auth/v1/callback
     ```

     > This is the step people get wrong. Do **not** put
     > `http://localhost:3000/auth/callback` or `https://akada.app/auth/callback`
     > here. Google only ever talks to Supabase; Supabase is what talks to Akada.
     > The app's own `/auth/callback` belongs on the Supabase allowlist in §1c,
     > not on Google's. A wrong value here gives `Error 400: redirect_uri_mismatch`.

4. **Create**, then copy the **Client ID** (`...apps.googleusercontent.com`) and
   the **Client secret**. The secret is shown once; if you lose it, generate a new one.

### 1c. Supabase dashboard

5. **Authentication → Sign In / Providers → Google** → toggle **Enable Sign in with Google**.
   - **Client IDs**: paste the Client ID.
   - **Client Secret (for OAuth)**: paste the secret.
   - Leave **Skip nonce check** off.
   - The page shows a **Callback URL (for OAuth)** — confirm it matches character
     for character what you pasted into Google in step 3.
   - **Save.**
6. **Authentication → URL Configuration → Redirect URLs** — this is where the
   app's own callback goes. `LAUNCH_CHECKLIST.md` §2.1 already asks for these
   wildcards; confirm all three are present:

   ```
   http://localhost:3000/**
   https://akada.vercel.app/**
   https://akada.app/**
   ```

   An origin missing here fails **silently** — Supabase bounces the user to the
   Site URL instead of `/auth/callback`, so they land signed-out with no error.

### 1d. Where the credentials live

**Nowhere in this repo, and in no `.env` file.** The client secret is held by
Supabase and used server-side by Supabase's auth service. Akada's browser code
only ever names the string `'google'`. There is **no new environment variable**,
so `.env.example` is unchanged and no Vercel setting needs touching.

### 1e. Verify

7. `npm run dev`, go to `/auth`, click **Continue with Google**. Expect: Google's
   chooser → back to `/onboarding` (first time) or `/dashboard`.
8. Supabase → **Authentication → Users** → open the new user → confirm an
   identity with provider `google`, and check `user_settings` has a row with the
   name filled in.

| Symptom | Cause |
|---|---|
| `Error 400: redirect_uri_mismatch` | Step 3's redirect URI is wrong. It must be the `supabase.co` one. |
| Lands signed-out on `/` with no error | Origin missing from step 6's Redirect URLs. |
| `Unsupported provider: provider is not enabled` | Step 5 not saved. |
| `403: access_denied` while in Testing | Your address is not on the Test users list (step 2). |
| "Database error saving new user" | A trigger on `auth.users` is raising. See §5. |

---

## 2. Design note on the button

`readmedesign.md` reserves a solid `bg-primary` fill for *the one* primary action
on a screen — that stays "Sign in". So the Google button is the quiet pair to it:
the same page-CTA geometry (`w-full min-h-[56px] rounded-2xl text-[15px]`) with
the `border border-line-strong bg-transparent text-ink-soft` treatment already
used by `ConfirmSheet`, `SemesterManager` and the tasks/dashboard sheets. The
divider is a hairline in `bg-line` with a serif-italic `or`, matching the
marginalia voice used elsewhere.

The one deliberate exception is the **G mark itself**, which keeps Google's four
brand colours. Recolouring it to the paper palette would be pleasanter and is
not ours to do — it is a trademark used under Google's identity guidelines.
It is set at 18px so it reads as a mark beside the label, not a logo.

---

## 3. Code changes

All three are **already written and on disk**, uncommitted. `npx tsc --noEmit`
and `npx eslint` both pass.

### `app/auth/page.tsx`

- `handleGoogleSignIn()`:

  ```ts
  await createClient().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`,
    },
  });
  ```

  No `scopes`, and no `queryParams` — deliberately. `access_type: 'offline'` and
  `prompt: 'consent'` belong to the Calendar work (§6); adding them now would put
  a consent screen in front of every single sign-in for a permission nothing
  reads yet.

  On success the function does **not** clear its loading state. The browser is
  already navigating to Google; resetting would flash an idle button under a
  page that is leaving.

- The divider and button, between `</form>` and the error line, so a failure from
  either path renders in the same place.
- `loadingAction` gains `'google'`, and the submit button's spinner condition
  becomes `state === 'loading' && loadingAction !== 'google'` so the page never
  shows two spinners at once.
- **`readSafeNext()`**, lifted to module scope. The `?next=` open-redirect guard
  was written out inline twice already; the Google handler would have made three.
  Same rule as `safeNextPath` in the callback route, which guards the other end.

### `app/auth/callback/route.ts`

- `providerDisplayName()` reads `display_name`, then `full_name`, then `name`.
  **Google never sets `display_name`** — our own sign-up form does. Reading only
  the first key, as the route did, leaves every Google account nameless. See §5.
- `providerAvatarUrl()` reads `avatar_url`, then `picture`, through the existing
  `cleanAvatarUrl`, which only admits `https:` (and CSP already allows
  `img-src https:`). A Google user gets their photo for free.
- Both are seeded into one `user_settings` upsert and **only when the column is
  empty**, so a name or avatar the user has since changed in Settings is never
  clobbered.
- `normalizeCallbackError` now tells a dismissed consent screen from a stale
  email link. A provider sends a bare `error=access_denied` with **no**
  `error_code`; only Supabase's own email links carry one. Previously both got
  "That link has expired", which sends someone who simply hit Cancel hunting for
  an email that never existed.

### `lib/auth-messages.ts`

- New `oauth_cancelled` case: *"That Google sign-in was cancelled. Try again, or
  use your email and password."*

### Deliberately unchanged

`proxy.ts`, `next.config.js`, `supabase/schema.sql`, `.env.example`,
`app/onboarding/page.tsx`. Onboarding reads
`settings?.displayName || metadataName` — and because the callback seeds
`user_settings.display_name` *before* redirecting there, the first branch is
populated by the time onboarding renders.

---

## 4. Account linking

**Someone signs up with email + password, later clicks "Continue with Google"
with the same address.**

Supabase's default is **automatic linking**, and it does the right thing: on OAuth
sign-in it looks for an existing user with that email, and on a match links the
new identity to that same `auth.users` row. One user, one `id`, two identities.
Because RLS keys off `auth.uid()`, **all their courses, tasks and sessions are
simply there.** Nothing to migrate and nothing to write.

The guard rails, and what controls them:

- Supabase will not auto-link onto an **unverified** email — that is the
  pre-account-takeover attack. The relevant setting is therefore
  **Authentication → Sign In / Providers → Email → Confirm email**, which
  `LAUNCH_CHECKLIST.md` §2.2 already recommends leaving **on**. Leave it on. With
  it off, anyone can register `someone@lums.edu.pk` with a password they choose,
  and the real owner's later Google sign-in lands in the attacker's account.
- When a new identity is linked, Supabase removes any other *unconfirmed*
  identities on that user.
- SAML SSO users are never auto-link targets.

The other direction is quieter and worth knowing: **Google first, then trying to
create an email account with the same address.** Supabase returns an obfuscated
success with no email sent — deliberate, to block user enumeration. The user sees
our "Check your email to continue setting up your account." and waits for a mail
that will not come. There is no way to disambiguate this without leaking whether
an account exists, so it is a known-and-accepted rough edge, not a bug. The
documented fix for that user is `updateUser({ password })` while signed in with
Google — i.e. a future "set a password" affordance in Settings.

**Manual linking** (`linkIdentity()`, for connecting a *different* Google address
to a signed-in account) is a separate beta feature, off by default, toggled by
**Allow manual linking** in the same providers screen / `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED`
when self-hosting. Not needed now. It becomes relevant for Calendar (§6), if
someone wants to attach a calendar from an account other than the one they log in with.

---

## 5. The profile-creation trigger

**There is none.** `grep` across the repo for `handle_new_user`, `on auth.users`
and `raw_user_meta_data` finds nothing. `user_settings` rows are created
**lazily**, by `upsert(..., { onConflict: 'user_id' })` from
`lib/data/supabase-adapter.ts` and from `/auth/callback`, and the table leans on
`user_id uuid primary key default auth.uid()` plus generous column defaults
(`display_name text not null default ''`).

That is a real piece of luck here, and it should be a deliberate choice from now on.

**What the task asks about — a trigger that assumes a field Google does not
provide — is exactly the trap to avoid if anyone reaches for the standard
Supabase recipe.** The canonical one is:

```sql
-- DO NOT ADD THIS
create function public.handle_new_user() returns trigger as $$
begin
  insert into public.user_settings (user_id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');   -- ← null for Google
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Google's `raw_user_meta_data` contains `email`, `email_verified`, `full_name`,
`name`, `avatar_url`, `picture`, `provider_id`, `sub` — and **no `display_name`**.
So `->>'display_name'` is `NULL`, `display_name` is `not null`, the insert raises,
and because a trigger runs inside the `auth.users` insert transaction, **the
entire signup is rolled back.** The user sees Supabase's generic
`500: Database error saving new user`; the real cause is only visible in the
Postgres logs. Password sign-up keeps working perfectly, so it reads as "Google
is broken" rather than "the trigger is wrong" — which is what makes it expensive
to debug.

Two rules, then:

1. **Keep creating `user_settings` lazily from the app.** The upsert in
   `/auth/callback` now handles both providers' metadata shapes and skips the
   write entirely when there is nothing worth seeding.
2. If a trigger is ever genuinely needed, it must be
   `coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')`,
   must `on conflict (user_id) do nothing`, and must never raise — a profile row
   is not worth failing a signup over.

---

## 6. Where this overlaps with Google Calendar

The overlap is **real and it is a trap**, which is why it is worth settling now
even though [Add Google Calendar integration](https://app.clickup.com/t/86eyv3ky3)
is a separate task.

### Extra scopes

Sign-in needs `openid email profile`. Calendar adds one of:

| Scope | Grants | Google's classification |
|---|---|---|
| `https://www.googleapis.com/auth/calendar.readonly` | read all calendars | **Sensitive** |
| `https://www.googleapis.com/auth/calendar.events` | read + write events | **Sensitive** |
| `https://www.googleapis.com/auth/calendar.app.created` | only events Akada itself created | **Non-sensitive** |

Sensitive scopes drag in **Google's OAuth verification review** — a recorded demo
video, a published privacy policy, a verified domain, and weeks of turnaround.
Until it passes, the app is capped at 100 users and shows an "unverified app"
interstitial. `akada.app` not yet resolving (`LAUNCH_CHECKLIST.md` §7) blocks
starting that clock, because domain verification needs it.

**Recommendation:** if writing study blocks into the user's calendar is the goal,
`calendar.app.created` does that with no review at all. Only reach for
`calendar.events` if Akada must read events it did not create.

### Why the Supabase-managed token is not enough

This is the important part.

When `/auth/callback` calls `exchangeCodeForSession(code)`, the returned session
carries `provider_token` and `provider_refresh_token` — Google's tokens, distinct
from Supabase's own. Two facts about them:

1. **Supabase does not persist them.** They appear on that one response and are
   not stored in the session or carried through a refresh. Once the Supabase
   session refreshes — an hour later, or on the next `getUser()` in `proxy.ts` —
   they are gone. Nothing server-side can go and fetch them again.
2. **Google's `provider_token` expires in about an hour anyway.** It is fine for
   "read the calendar on the page they are looking at right now" and useless for
   anything background.

So a nightly "sync tomorrow's classes into Google Calendar" job cannot be built on
what Supabase holds. `provider_refresh_token` is the only long-lived credential,
and it exists for exactly one HTTP response.

Worse, **Google only issues a refresh token when asked, and usually only once**:
you need `access_type: 'offline'`, and Google returns a refresh token on the
*first* authorization only. A user who has already granted consent gets
`provider_refresh_token: null` on every later sign-in unless you also force
`prompt: 'consent'`.

### Shape of a proper solution

1. A migration for a `google_credentials` table — `user_id` PK referencing
   `auth.users(id) on delete cascade`, `refresh_token`, `scopes text[]`,
   `connected_at`. RLS on, and deliberately **no select policy for
   `authenticated`**: the row is written and read only by a server route, never
   by the browser. Encrypt `refresh_token` at rest (pgsodium / Vault, or
   application-level with a key in a server-only env var) — it is a
   long-lived key to someone's calendar, not a session token.
2. A **separate "Connect Google Calendar" action in Settings**, not the sign-in
   button. Settings is a sheet inside `/dashboard` (`components/SettingsSheet.tsx`),
   not a route of its own, so the return trip lands on the dashboard and the sheet
   reopens itself — the same pattern as the existing "settings sends someone here"
   handling for the add-course sheet. It calls `signInWithOAuth` (or
   `linkIdentity`) with:

   ```ts
   options: {
     scopes: 'https://www.googleapis.com/auth/calendar.app.created',
     queryParams: { access_type: 'offline', prompt: 'consent' },
     redirectTo: `${origin}/auth/callback?next=/dashboard`,
   }
   ```

   Keeping it separate is the whole point: signing in should not demand calendar
   access, and a user who declines calendar should still be able to log in. It
   also means `prompt: 'consent'` — necessary to guarantee a refresh token —
   only interrupts people who actually asked for the feature.
3. `/auth/callback` grows one branch: when `exchangeCodeForSession` returns a
   `provider_refresh_token`, write it to `google_credentials` **immediately**.
   This is the only moment it exists. Note the callback currently discards the
   `data` from that call — it would need to keep it.
4. All Calendar API calls happen **server-side**: read the stored refresh token,
   POST it to `https://oauth2.googleapis.com/token` for a fresh access token,
   call Google, discard. This needs a Google **client secret in Akada's own
   environment** — the first server-only Google credential the app has ever had,
   and a new `.env` entry. Sign-in needs no such thing, which is precisely the
   difference between the two tasks.
5. Handle revocation: a user removing access in their Google account makes the
   refresh token return `invalid_grant` forever. Treat that as "disconnected",
   delete the row, and surface a reconnect prompt rather than retrying.

### What that means for the work in this document

Nothing here needs changing later. The sign-in button stays scope-free, the
consent screen stays non-sensitive, and no Google verification review is needed
to ship Google auth. The Calendar task adds a second, opt-in consent flow beside
it. Doing it the other way round — bolting Calendar scopes onto the sign-in
button — would put a sensitive-scope consent screen and a Google review in front
of *every* Akada signup, for a feature most users will never turn on.
