# Akada. Study Planner

*A quiet place to study.*

Akada is a modern, beautifully designed academic planner and study companion built to help students track their coursework, manage tasks, and optimize their study sessions. It provides an intuitive interface for planning semesters, setting daily and weekly goals, and measuring study productivity over time.

## 🚀 Features

- **Course Management:** Organize your classes by color, track weekly goal hours, and manage your academic load efficiently.
- **Task Tracking:** Keep tabs on assignments and deadlines, with priority levels and course association.
- **Study Timer:** Built-in timer to log focused study sessions directly to specific courses and tasks.
- **Progress & Stats:** Visualize your study habits and monitor your performance across different subjects over the semester.
- **User Onboarding:** Seamless profile setup, custom avatar support, and personalized daily goal configurations.
- **Secure Authentication:** Full user authentication and data protection powered by Supabase Row Level Security (RLS).

## 🛠️ Tech Stack

- **Frontend Framework:** [Next.js 16](https://nextjs.org/) (App Router, React 18)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS 3](https://tailwindcss.com/)
- **Database & Auth:** [Supabase](https://supabase.com/) (PostgreSQL, RLS-only, no service-role key)
- **Data fetching:** [SWR](https://swr.vercel.app/)
- **Animation:** [Framer Motion](https://www.framer.com/motion/)
- **Fonts (via `next/font`):** Inter (sans), JetBrains Mono (mono), Cormorant
  Garamond (default serif), plus Fraunces, Lora and Merriweather as
  user-selectable heading faces, and Caveat for handwritten marginalia.

The auth gate lives in **`proxy.ts` at the repo root**. Next 16's rename of
`middleware.ts`. The export must stay named `proxy`. It is default-deny: every
route requires a session except `/`, `/auth`, `/auth/callback`, `/auth/reset`
and static assets.

## ⚙️ Getting Started

### Prerequisites
- Node.js (v18+)
- A Supabase project

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd academic-planner
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `NEXT_PUBLIC_SITE_URL`. See `.env.example` for what each one does.

   The build **fails** if the Supabase variables are missing. That is
   deliberate: it used to fall back to `localStorage` silently, which meant a
   misconfigured deploy looked healthy while losing every user's data. To run
   with no backend at all, set `NEXT_PUBLIC_USE_LOCAL_DATA=true` (development
   only, it is ignored in production builds).

4. **Database Setup:**
   Run the SQL statements found in `supabase/schema.sql` in your Supabase project's SQL Editor to create the necessary tables and Row Level Security (RLS) policies.

5. **Run the Development Server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

### Checks

All three must pass before shipping:

```bash
npx tsc --noEmit   # types
npm run lint       # eslint
npm run build      # production build
```

## 🚢 Deploying (Vercel)

1. Import the repository in Vercel. Framework preset: **Next.js**. Build
   command and output directory are detected automatically.
2. Add the environment variables from `.env.example` to **both** the
   Production and Preview environments (Project Settings → Environment
   Variables). Preview needs its own `NEXT_PUBLIC_SITE_URL`.
3. In the Supabase dashboard, set **Authentication → URL Configuration →
   Site URL** to the production domain, and add every deploy origin plus
   `/auth/callback` to the redirect allowlist. Sign-up silently fails from
   any origin that is not on that list.
4. Run `supabase/schema.sql` in the SQL Editor. It is idempotent.

`LAUNCH_CHECKLIST.md` has the full click-by-click list of dashboard settings,
including the ones that cannot be configured from this repo.

## 🗄️ Database Schema Overview

The Supabase database consists of the following core tables:
- `courses`: Stores user's active classes, colors, and weekly study goals.
- `tasks`: Associated with courses, tracks deadlines and priority levels.
- `sessions`: Logs individual study sessions, duration, and optional notes.
- `semesters`: Tracks the academic term boundaries for a user.
- `user_settings`: User profile data including display name, avatar URL, and daily goals.

All tables are protected by Row Level Security (RLS) policies ensuring users
can only access their own data. The app authenticates as the end user via the
anon key and never uses a service-role key, so RLS is the only thing standing
between accounts, keep it that way.

`supabase/schema.sql` is the source of truth and is idempotent: run the whole
file against a fresh or an existing project. It also creates the indexes the
stats page and heatmap need, a case-insensitive unique index on
`(user_id, upper(code))` for course codes, and cascade-on-delete to
`auth.users`.

## 📚 Course catalog

The add-course search runs against `lib/catalog/fall-2026.ts`, 524 courses
and 887 sections for Fall 2026, generated, not hand-written. Regenerate it
with the term's registrar course memo in the repo root:

```bash
python scripts/build-catalog.py "Fall Semester 2026 - Course Memo.xlsx"
python scripts/build-catalog.py "…" --refresh-planner   # re-pull the schedule
```

Two sources, because neither is complete alone. The **course memo** is
authoritative for what exists, codes, titles, credits, components, section
labels, instructors, but publishes an actual day and time for only about a
sixth of sections. The rest come from **[LUMS Pro Planner][planner]**, a
public dataset maintained by Muhammad Sohaib Shahzad, a LUMS student, which
carries a day and time for every section it lists and a room for most.
`scripts/planner-courses.json` is a committed snapshot of it, so a build
never depends on the site being up.

The memo workbook is deliberately **not** committed: it carries free-text
notes from named instructors that do not need publishing. The generated
catalog contains none of it.

[planner]: https://lumsproplanner.com

## 📄 License
This project is for personal or academic use.
