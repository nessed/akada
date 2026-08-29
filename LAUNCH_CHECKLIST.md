# Akada — Launch Checklist

Everything here has to be done by hand, in a dashboard I cannot reach from the
repo. Work top to bottom; later steps depend on earlier ones.

Times are rough. The whole list is about 45 minutes if nothing surprises you.

> **Supabase dashboard menus move between releases.** Where a path below does
> not match what you see, the setting name is still right — search for it.

---

## 0. Why none of this is already done — read first

Your credentials arrived and are correct in shape, but **the sandbox I run in
blocks outbound network access to `jsllofhlkrckdbilgsxf.supabase.co`** — the
egress proxy answers 403 to CONNECT under an organization policy (the same
denial hits `google.com`; only npm, PyPI and Anthropic are allowed). The
Supabase MCP integration is authenticated to a different Supabase account
that does not contain this project either.

So **nothing in this checklist has been executed against your database, and
no auth flow was exercised against live Supabase.** Everything below is
written from the code and Supabase's documented behaviour. You have to run it.

What I *was* able to verify with your real values:

- A production build with your URL and key succeeds, and the CSP correctly
  locks `connect-src` to `https://jsllofhlkrckdbilgsxf.supabase.co` and its
  `wss:` origin.
- **Your `sb_publishable_...` key works with this stack.** I checked against
  a local stand-in server: `@supabase/supabase-js` 2.104 accepts the new key
  format without complaint and sends it as both the `apikey` header and
  `Authorization: Bearer`. No code change was needed — the app passes the
  string straight through, so the new and legacy formats both work.
- A Supabase outage is handled safely rather than dangerously: with the
  project unreachable, `getUser()` fails, the proxy treats the visitor as
  signed out and redirects protected routes to `/auth`. No redirect loop, and
  no protected page renders.

**Never paste the `service_role` or `sb_secret_` key** — to me or anywhere
else outside the Supabase dashboard. The app is RLS-only and does not use
one. If it leaks, every row in the database is readable by anyone.

> If you migrated this project to the new API key system, the legacy `anon`
> and `service_role` JWTs may be disabled. That is fine — the app only ever
> uses the one publishable key.

---

## 1. Database — 10 min

### 1.1 Run the schema

1. Supabase → **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/schema.sql` and **Run**.

The file is idempotent — safe on a fresh project and safe to re-run on your
existing one. It creates nothing destructive.

Two statements can fail if your live database has drifted. Both print a clear
error and both tell you the fix inline:

| If you see | Run this first, then re-run the file |
|---|---|
| `could not create unique index "courses_user_id_code_unique"` | `select user_id, upper(code), count(*) from courses group by 1,2 having count(*) > 1;` then delete or rename the duplicates |
| `insert or update ... violates foreign key constraint "<table>_user_id_fkey"` | `delete from <table> where user_id not in (select id from auth.users);` — these are rows belonging to already-deleted accounts |

### 1.2 Confirm RLS is actually on

Run this in the SQL Editor. **Every row must say `t`:**

```sql
select relname, relrowsecurity
from pg_class
where relname in ('courses','tasks','sessions','semesters','user_settings');
```

Then confirm each table has exactly one policy:

```sql
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename;
```

### 1.3 Prove isolation between two accounts

RLS being *enabled* and RLS being *correct* are different things. Prove it:

1. Sign up two accounts on the deployed site (step 4), say `a@…` and `b@…`.
2. Add a course as user A.
3. Get both ids: `select id, email from auth.users;`
4. As user B, signed in **in the browser**, open the console on `/dashboard`
   and run:

   ```js
   const { data, error } = await window.__akadaSupabase?.from('courses').select('*')
   ```

   — or more simply, just confirm user B's dashboard shows **only B's
   courses**, and that B's course count is unaffected by anything A does.

5. The rigorous version. Paste this whole block into the SQL Editor after
   both accounts exist and user A has at least one course. It impersonates
   user B and tries to read and write user A's rows across all five tables:

   ```sql
   do $$
   declare
     a uuid; b uuid; leaked int; wrote int;
   begin
     select id into a from auth.users order by created_at limit 1;
     select id into b from auth.users order by created_at desc limit 1;
     if a = b then raise exception 'Need two accounts to test with'; end if;

     -- become user B
     perform set_config('role', 'authenticated', true);
     perform set_config('request.jwt.claims',
       json_build_object('sub', b, 'role', 'authenticated')::text, true);

     select count(*) into leaked from courses where user_id = a;
     if leaked > 0 then raise exception 'FAIL: B can read % of A''s courses', leaked; end if;

     begin
       update courses set name = 'HACKED' where user_id = a;
       get diagnostics wrote = row_count;
       if wrote > 0 then raise exception 'FAIL: B wrote % of A''s rows', wrote; end if;
     exception when insufficient_privilege then null;
     end;

     raise notice 'PASS: user B cannot read or write user A''s rows';
   end $$;
   reset role;
   ```

   It either raises `FAIL: ...` or notices `PASS`. Repeat with `tasks`,
   `sessions`, `semesters` and `user_settings` substituted for `courses`.

**If that last query returns anything other than 0, do not launch.**

### 1.4 Advisors

Supabase → **Advisors** → run both **Security** and **Performance**.

- The `auth_rls_initplan` warning should be gone — `schema.sql` already wraps
  `auth.uid()` in a scalar subquery, which is the documented fix.
- "Unindexed foreign keys" should be gone — the file adds all of them.
- If **Leaked password protection disabled** appears, step 2.3 fixes it.
- Anything else it reports, send it to me rather than guessing.

### 1.5 Backups

Supabase → **Project Settings → Database → Backups**.

- **Free tier: there are no backups.** If you launch on free and something
  goes wrong, the data is gone. At minimum, before launch, run a manual dump:
  `supabase db dump -f akada-backup.sql --db-url "<connection string>"`.
- **Pro ($25/mo): daily backups, 7-day retention**, plus Point-in-Time
  Recovery as a paid add-on.
- **Recommendation: go Pro before you have real users.** Restoring a planner
  someone has spent a semester filling in is not something you can improvise.

Write down where your backups are and how you would restore one. A backup you
have never restored is a guess.

---

## 2. Supabase Auth settings — 12 min

All under **Authentication** in the sidebar.

### 2.1 URL configuration — this one silently breaks sign-up

**Authentication → URL Configuration**

- **Site URL:** `https://your-real-domain.com` (no trailing slash)
- **Redirect URLs** — add every one of these:

  ```
  https://your-real-domain.com/**
  https://<your-vercel-project>.vercel.app/**
  http://localhost:3000/**
  ```

`app/auth/page.tsx` builds its callback from `window.location.origin`, so
**any origin not on this list makes sign-up fail with no visible error.**
Vercel preview deployments each get their own URL — the `.vercel.app/**`
wildcard covers them.

### 2.2 Email confirmations — decide now

**Authentication → Sign In / Providers → Email → "Confirm email"**

**My recommendation: leave confirmations ON.** Off means anyone can create
accounts against addresses they do not own, and Supabase's built-in email
sender is rate-limited hard enough that spam is self-limiting.

The app now handles **both** settings correctly — that was a real bug before:
with confirmations off, `signUp` returns a live session and the old code
stranded the user on a "check your email" screen forever. It now routes them
straight to `/onboarding`.

> ⚠️ **The built-in email sender is capped at ~2–4 messages per hour** and is
> explicitly not for production. If you expect more than a trickle of sign-ups
> on day one, set up custom SMTP (**Authentication → Emails → SMTP Settings**)
> with Resend, Postmark or SendGrid. Otherwise your third user of the hour
> silently gets no confirmation email.

### 2.3 Password policy

**Authentication → Sign In / Providers → Email** (scroll to Password Security),
or **Authentication → Policies** depending on dashboard version:

- **Minimum password length: `8`.** The client now enforces 8 on sign-up
  (it was 6). Set the server to match — the client check is a courtesy, the
  server one is the control.
- **Prevent use of leaked passwords: ON.** This checks HaveIBeenPwned. The
  app already maps the resulting error to "That password has appeared in a
  known data breach."

Existing accounts with shorter passwords can still sign in — the app only
enforces the new minimum on sign-up and reset, deliberately.

### 2.4 Link expiry and rate limits

- **Authentication → Sign In / Providers → Email → Email OTP Expiration:**
  `3600` (1 hour) is a good default. The app now shows a proper "that link has
  expired or has already been used" message instead of the old confusing
  "missing code".
- **Authentication → Rate Limits:** the defaults are sane. Confirm
  "Emails sent per hour" matches your SMTP reality from 2.2.

### 2.5 CAPTCHA

**Authentication → Attack Protection → Enable CAPTCHA protection**

Leave **OFF for launch.** Turning it on requires a matching `captchaToken` in
the `signUp` / `signInWithPassword` calls, which the app does not send — so
enabling it will break sign-up entirely. Revisit if you get bot sign-ups; it
is a code change plus this toggle, not a toggle alone.

### 2.6 Email template

**Authentication → Emails → Templates → Confirm signup**

The default says "Supabase". Replace the subject and body with something that
says Akada, e.g.:

- **Subject:** `Confirm your Akada account`
- **Body:** keep `{{ .ConfirmationURL }}` exactly as-is — everything else is
  yours.

Do the same for **Reset password**, which now has a real destination
(`/auth/reset`) rather than the dead "coming soon" button it used to hit.

---

## 3. Vercel — 10 min

### 3.1 Create the project

There is currently **no Vercel project** on the connected account — I checked.

1. Vercel → **Add New → Project** → import `nessed/akada`.
2. Framework preset: **Next.js**. Leave build command and output directory on
   their defaults.
3. **Do not deploy yet** — set the environment variables first, or the build
   will fail (deliberately, see below).

### 3.2 Environment variables

**Project Settings → Environment Variables.** Set each for **both**
Production and Preview.

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | same |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key | same |
| `NEXT_PUBLIC_SITE_URL` | `https://your-real-domain.com` | leave **unset** — the app falls back to the Vercel deployment URL automatically |

Do **not** set `NEXT_PUBLIC_USE_LOCAL_DATA` anywhere. It is ignored in
production builds, but there is no reason for it to exist there.

> **The build now fails loudly if the two Supabase variables are missing.**
> That is intentional and it is the single most important change in this
> release. Before, a misconfigured deploy looked completely healthy while
> writing every user's data into their own browser's localStorage, where it
> was silently lost. If you see
> `Akada is not configured: NEXT_PUBLIC_SUPABASE_URL and
> NEXT_PUBLIC_SUPABASE_ANON_KEY are both required` in the build log, that is
> the guard working — set the variables and redeploy.

### 3.3 Domain

**Project Settings → Domains** → add your domain and follow the DNS records
Vercel gives you (an `A` record to `76.76.21.21`, or a `CNAME` to
`cname.vercel-dns.com` for a subdomain — Vercel shows the exact values).

After DNS resolves, go back and make sure **`NEXT_PUBLIC_SITE_URL` matches the
final domain exactly**, then redeploy. It drives `metadataBase`, so if it is
wrong, every social share preview points at the wrong host.

### 3.4 Observability

**Project Settings → Observability** (or the **Logs** tab).

Client-side crashes now POST to `/api/client-error` and appear in the runtime
log as lines tagged `akada.client-error`. Set up an alert or a Log Drain on
that string and you will hear about production errors before your users tell
you.

If you want proper error tracking with grouping, release tracking and email
alerts, install Sentry after launch:
`npx @sentry/wizard@latest -i nextjs`. I did not do it here because it adds a
dependency, and you asked for none.

---

## 4. Smoke test on the real domain — 10 min

**Not on localhost.** Use the production URL, on a phone if you can.

Tick each one:

- [ ] Visit `/` signed out → landing page renders
- [ ] Visit `/dashboard` signed out → redirected to `/auth`
- [ ] Sign up with a real address → confirmation email arrives
- [ ] Click the confirmation link → lands on `/onboarding`, signed in
- [ ] Click the **same link again** → "that link has expired or has already
      been used", not a crash
- [ ] Complete onboarding → lands on `/dashboard`
- [ ] Type `/onboarding` in the URL bar → bounced back to `/dashboard`
- [ ] Add a course
- [ ] Add a second course **with the same code** → "You already have a course
      with the code X"
- [ ] Add a task with a due date
- [ ] Start the timer, let it run a minute, **reload the page** → timer still
      running, elapsed time preserved
- [ ] Toggle white noise **on an iPhone** → audio plays (this was completely
      broken on iOS before)
- [ ] Stop the timer → log the session
- [ ] `/stats` → hours, heatmap and session history all render
- [ ] Sign out → land on `/auth`
- [ ] Press the **browser back button** → you must not see the dashboard
- [ ] Sign back in → your data is all still there
- [ ] Paste the production URL into WhatsApp or Slack → the OG card shows the
      Akada image, not a broken preview

Check headers once, from a terminal:

```bash
curl -sI https://your-real-domain.com | grep -iE 'strict-transport|content-security|x-frame|x-content-type|referrer|permissions|x-powered-by'
```

You should see six security headers and **no** `x-powered-by`.

---

## 5. Known issues shipping unfixed

Ordered by how likely they are to bite you.

| # | Severity | Issue |
|---|---|---|
| 1 | **High** | **Nothing in this checklist has been run, and no auth or database behaviour was verified against a live Supabase project.** Credentials arrived but my sandbox's egress policy blocks all network access to your Supabase host (see §0). The auth matrix and production smoke test in my report are marked NOT RUN, not passed. Sections 1.3 and 4 are the substitute and you have to actually do them. |
| 2 | **High** | **Supabase free tier has no backups.** See 1.5. |
| 3 | Medium | **The built-in email sender caps at ~2–4/hour.** A launch-day rush means most sign-ups get no confirmation email, with no error shown. Custom SMTP (2.2) is the fix. |
| 4 | Medium | **The onboarding gate is client-side.** A signed-in but un-onboarded user typing `/dashboard` sees a skeleton for a fraction of a second before being redirected. No data leaks — RLS covers that, and they have no data yet — but it is a visible flash. Enforcing it in `proxy.ts` would mean a database round-trip on every single navigation, which is a bad trade on hobby-tier. |
| 5 | Medium | **CSP keeps `'unsafe-inline'` for scripts.** Next inlines its hydration payload; the strict nonce alternative forces every currently-static page to render dynamically. The CSP still blocks attacker-hosted scripts, framing, plugins, base-tag hijacking and off-origin form posts. Tighten post-launch if you want it. |
| 6 | Low | **Back-button after sign-out may show a cached screen.** Authenticated responses are now `no-store` and sign-out does a hard navigation, but browser bfcache can still restore a rendered page from memory. Any actual interaction re-fetches and bounces to `/auth`. Verify it yourself in step 4. |
| 7 | Low | **Avatars are base64 blobs in Postgres**, capped at 64 KB (down from 250 KB, and now scheme-validated). Fine for hundreds of users; move to Supabase Storage before thousands. |
| 8 | Low | **Notched-device safe areas are unverified.** I added `viewport-fit=cover`, without which the `env(safe-area-inset-*)` padding the app already used was resolving to zero — so this is strictly an improvement — but I have no physical notched device. Check the bottom nav and FAB on a real iPhone. |
| 9 | Low | **`resetAll()` still exists in the production UI**, now behind typing the word `RESET`. Consider removing the control entirely once you have real users. |
| 10 | Low | **No tests and no CI.** Out of scope for tonight, but the next change to `lib/timer-context.tsx` has nothing catching it. |

---

## 6. After launch

- Custom SMTP (2.2) — do this first if sign-ups are working at all.
- Supabase Pro for backups (1.5).
- Sentry (3.4).
- A GitHub Action running the three gates (`tsc --noEmit`, `lint`, `build`)
  on every PR.
- Move avatars to Supabase Storage.
- Nonce-based CSP.
