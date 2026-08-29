# Production Readiness Prompt — Akada

Copy everything below the line into a fresh Claude Code session at the repo root.

---

You are taking **Akada** (this repo) from "works on my machine" to a **publicly launched production app**. I am shipping tomorrow. Work through this end to end, fix what you find, and verify each fix — do not just report problems back to me.

## Stack (verified, don't re-derive)

- Next.js **16.2.4** App Router + React 18 + TypeScript + Tailwind 3
- Supabase (`@supabase/ssr` 0.10) for auth + Postgres, RLS-only (no service-role key anywhere, keep it that way)
- Auth gate lives in **`proxy.ts` at the repo root** — this is Next 16's rename of `middleware.ts`. The export must stay named `proxy`. It IS wired up (build output shows `ƒ Proxy (Middleware)`). Do not "fix" it into `middleware.ts`.
- Data access goes through `lib/data/index.ts`, which picks `SupabaseAdapter` or `LocalAdapter` at import time
- No tests, no CI, no error tracking today
- Baseline as of now: `npx tsc --noEmit` clean, `npm run build` clean, `npm run lint` has **3 errors + 1 warning**

## Ground rules

1. Fix root causes. No `eslint-disable`, no `@ts-ignore`, no `as any` to make a check pass.
2. No rewrites, no new dependencies, no redesigns. Minimal, surgical diffs against the shipping deadline.
3. After every phase run all three gates: `npx tsc --noEmit`, `npm run lint`, `npm run build`. All must be clean before you move on.
4. Commit in small, labelled commits as you go. Push to the branch I'm on.
5. Anything you cannot fix from inside the repo (Supabase dashboard settings, Vercel env vars, DNS) goes into a single `LAUNCH_CHECKLIST.md` with exact click-by-click steps and exact values — I will do those by hand.
6. If a fix is risky or ambiguous, ship the safe version and flag it in the checklist. Don't block waiting on me.

---

## Phase 0 — Blockers (do first)

- **`app/stats/page.tsx` fails lint with 3 `react-hooks/rules-of-hooks` errors** (conditional `useMemo` at lines ~159, ~167, ~183). These are real crash risks — a hook order change between renders will blow up the Stats page at runtime. Restructure so all hooks run unconditionally before any early return. Then load /stats in every state: no data, partial data, full data, and mid-load.
- **`lib/data/index.ts` silently falls back to `LocalAdapter` when `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` are missing.** In production this means a misconfigured deploy looks fully functional while writing every user's data to their own browser's localStorage, and it's silently lost. Make a production build **fail loudly** (throw at startup / render a clear config error) when Supabase env vars are absent. Keep the local fallback for dev only, gated explicitly.
- **Fix the auth callback cookie bug.** In `app/auth/callback/route.ts`, the final redirect copies cookies with `finalResponse.cookies.set(cookie.name, cookie.value)` — this **drops every cookie option** (`maxAge`, `httpOnly`, `sameSite`, `secure`, `path`), so refresh tokens can land as session-only cookies and users get logged out unexpectedly. Rewrite the handler so the Supabase `setAll` cookies are written onto the *actual* response that gets returned, with options intact. Simplify the double-response dance while you're in there.

## Phase 1 — Auth, hardened

Walk the whole auth surface and make each path work. Test each one for real against a live Supabase project.

- **Email confirmation on/off.** `app/auth/page.tsx` always shows the "Check your email" screen after `signUp`. If Supabase confirmations are disabled, `signUp` returns a live session and the user gets stranded on that screen. Branch on whether `data.session` came back and route straight to `/onboarding` when it did. Decide and document which mode we launch with.
- **Callback link formats.** `app/auth/callback/route.ts` only handles `?code=`. Supabase also sends `token_hash` + `type` links (email confirm, magic link, recovery) which need `verifyOtp`, and it can redirect back with `error` / `error_code` / `error_description` (e.g. expired link) which are currently ignored and fall into a confusing "missing_code" message. Handle all three shapes, plus a safe `next=` redirect param (validate it's a same-origin relative path — no open redirect).
- **Password reset is a stub.** The "Forgot password?" button just prints "coming soon". Either implement it properly (`resetPasswordForEmail` → recovery link → `/auth/reset` page → `updateUser({ password })` → sign in) **or** remove the button entirely for launch. Don't ship a dead control. Recommend which and do it.
- **Sign-out.** `signOut` is only called from `app/dashboard/page.tsx`. Make sure signing out also clears client-side state that outlives the session — `lib/timer-context.tsx`, `lib/preferences.ts`, and any `LocalAdapter` keys in `localStorage` — so the next person on a shared laptop doesn't inherit the previous user's timer, preferences, or cached data. Then verify protected routes are actually inaccessible after sign-out (hard reload, and back-button).
- **Route protection.** `proxy.ts` guards a hardcoded list: `/dashboard`, `/timer`, `/tasks`, `/stats`, `/onboarding`. Invert it to default-deny — everything protected except an explicit public allowlist (`/`, `/auth`, `/auth/callback`, static assets) — so a new page added next week isn't accidentally public. Then confirm there's no redirect loop between `/`, `/auth`, `/dashboard`, and `/onboarding`, including for a signed-in user who hasn't finished onboarding.
- **Onboarding gate.** A signed-in user with `onboarding_complete = false` should not be able to reach `/dashboard` by typing the URL, and a completed user shouldn't be re-onboarded. Verify both directions.
- **Session lifetime.** Confirm the proxy refreshes tokens correctly (it correctly uses `getUser()`, not `getSession()` — keep that). Test: sign in, wait past access-token expiry, reload, and confirm you stay signed in.
- **Error messages.** Raw `error.message` from Supabase is rendered to the user. Check the sign-up path doesn't leak whether an email is already registered, and map the raw strings to friendly copy.
- **Auth matrix — run every cell manually and report results in a table:** signed-out visits each route; signed-in-not-onboarded visits each route; signed-in-onboarded visits each route; expired/invalid confirmation link; reused confirmation link; wrong password; unregistered email; sign-up with an existing email; sign-out then back-button.

## Phase 2 — Database & RLS

- Reconcile `supabase/schema.sql` with the **live** database. The file has commented-out migrations at the bottom, which suggests the live schema may have drifted. Enumerate the actual live tables/columns/policies and make the SQL file the true source of truth.
- Confirm RLS is **enabled and enforcing** on all five tables (`courses`, `tasks`, `sessions`, `semesters`, `user_settings`) in the live project, not just in the SQL file. Prove it: as user A, attempt to read/write user B's rows and show the failure.
- Run Supabase's **security and performance advisors** and fix everything actionable.
- Add missing indexes — at minimum `tasks(user_id, due_date)`, `sessions(user_id, date)`, `sessions(course_id)`, `tasks(course_id)`, `courses(user_id)`. `app/stats/page.tsx` and the heatmap will scan without them.
- `hasDuplicateCourseCodes` in `lib/planner-safety.ts` is client-side only. Add a DB-level unique constraint on `(user_id, upper(code))` and handle the conflict error in the UI.
- **`cleanAvatarUrl` accepts any string up to 250,000 characters** and stores it directly in Postgres. That's an unvalidated data-URL blob per user with no scheme check — `javascript:` passes today. Validate the scheme (`https:` and `data:image/*` only), cap the size hard, and consider moving avatars to Supabase Storage. Also confirm the avatar renders through a safe path.
- `resetAll()` is documented as "Dev / debugging" in `lib/data/data-provider.ts` but is wired to a live button in `app/dashboard/page.tsx` and hard-deletes all of a user's data. Make sure it's behind a real typed confirmation, or pull it from the production UI.
- Write down the backup/restore posture (Supabase plan's PITR or daily backups) in the checklist.

## Phase 3 — Production config & security headers

- `next.config.js` is empty. Add: `poweredByHeader: false`, and security headers — `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), a sensible `Permissions-Policy`. Add a CSP if you can do it without breaking `next/font`, Supabase XHR, and the inline styles this app uses — verify in the browser console, and skip CSP rather than ship a broken one.
- `app/layout.tsx` hardcodes `metadataBase: new URL('http://localhost:3000')`. Drive it from `NEXT_PUBLIC_SITE_URL` so OG/Twitter tags and the manifest resolve to the real domain.
- Add a real OG image, `robots.txt`, and `sitemap.ts`. Check `app/manifest.ts` and the icons are correct for an installed PWA.
- Add `.env.example` with every required variable and a comment for each.
- **Delete the junk committed at repo root**: `update.js`, `update3.js`, `update4.js`, `update5.js`, `update6.js`, `update-dashboard.js` — one-off codemods that no longer belong. Also remove `.claude/settings.local.json` from version control (it leaks local Windows paths) and gitignore it.
- `README.md` claims Next.js 14 and Fraunces-only fonts; it's Next 16 with seven font families. Update it, including real deploy instructions.
- Confirm nothing secret is in the repo or the client bundle. Only `NEXT_PUBLIC_*` values should reach the browser. Grep the built output to be sure.

## Phase 4 — Correctness & mobile QA

- **`app/timer/page.tsx` fetches `/whitenoise.ogg` and decodes it via `decodeAudioData`. Safari and iOS cannot decode Ogg Vorbis — white noise is silently broken for every iPhone user.** Ship an `.m4a`/AAC (or MP3) alongside it and pick by support, or drop the feature for launch. Verify on iOS Safari specifically, not just desktop Chrome.
- `public/default-avatar.png` is **436 KB** for a small avatar. Compress/resize it. Same for `whitenoise.ogg` at 191 KB — consider generating white noise in the Web Audio API instead of shipping a file.
- `lib/timer-context.tsx` is 611 lines of localStorage-backed timer state. Test hard: reload mid-session, backgrounded tab, phone lock/unlock, system clock change, two tabs open at once, and a pending session that's never logged. Confirm no double-logging and no lost sessions.
- Check every `console.error` swallow point (there are ~16 across `app/` and `components/`) actually surfaces something to the user — a silent failure on "add task" or "save session" is the worst kind of launch bug.
- Fix the `<img>` lint warning in `app/dashboard/page.tsx:380`.
- `app/layout.tsx` sets `maximumScale: 1, userScalable: false`. That blocks pinch-zoom and is an accessibility failure. Remove unless there's a concrete reason.
- Verify `app/error.tsx` and `app/global-error.tsx` render something useful in a production build (not the dev overlay), and that a thrown error inside a data hook is caught.
- Mobile pass on real viewport sizes (375px and 390px wide, plus a notched device): safe-area insets, the bottom nav, the FAB, modals/sheets, and the date picker.
- Empty states and first-run: brand new account with zero courses, zero tasks, zero sessions — every page should look intentional, not broken.

## Phase 5 — Observability & deploy

- Wire up error tracking (Sentry, or Vercel's built-in) so I find out about production errors without a user telling me.
- Confirm the deploy target (assume Vercel unless the repo says otherwise). List the exact env vars to set, for Production **and** Preview.
- **In Supabase Auth settings** (checklist items for me): set Site URL to the production domain; add the production and preview callback URLs to the redirect allowlist — `app/auth/page.tsx` uses `window.location.origin + '/auth/callback'`, so any origin not on that list breaks sign-up silently; turn on leaked-password protection; set a sane minimum password length (the UI currently only requires 6 characters — raise it in the client too); review OTP/link expiry; confirm email-rate-limit and CAPTCHA settings; customize the confirmation email template with the Akada name.
- Do a full smoke test **against the deployed production URL**, not localhost: sign up → confirm email → onboard → add course → add task → run timer → log session → view stats → sign out → sign back in. Report each step pass/fail.

---

## What I want back

1. Every fix committed and pushed, in reviewable commits.
2. `LAUNCH_CHECKLIST.md` — the dashboard/DNS/env steps only I can do, with exact values, ordered.
3. A short final report: what you fixed, the auth matrix results table, the production smoke test results, and an explicit list of **known issues shipping unfixed** with severity. Be honest — I'd rather know than be surprised.

Start with Phase 0 and work in order. Tell me if you hit something that genuinely blocks the deadline.
