# Akada

Akada is a private academic planner for courses, deadlines, focused study sessions, and semester progress.

It is built around a simple rule: the app authenticates as the student. There is no Supabase service-role key in the app, and Row Level Security protects every user's data.

## What it does

- Add courses from the term catalog or enter them manually.
- Set a practical weekly study target per course, based on credit hours.
- Track readings, assignments, and other course tasks in one place.
- Record focused study sessions with the built-in timer.
- Keep past semesters while making one semester active.
- Review study history and progress in Stats.
- Connect Claude through the Akada MCP endpoint. Claude can find a course and add extracted tasks to it after you approve the connection.

## Stack

- Next.js 16, React 18, and TypeScript
- Tailwind CSS
- Supabase Auth and Postgres with RLS
- SWR and Framer Motion
- Model Context Protocol TypeScript SDK

## Run locally

Requirements: Node.js 20+ and a Supabase project.

```bash
git clone https://github.com/nessed/akada.git
cd akada
npm install
cp .env.example .env.local
npm run dev
```

Fill in the Supabase values in `.env.local`, then run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor. It is idempotent, so it is safe to run on a fresh project or an existing Akada project.

Checks before shipping:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase publishable key. RLS still applies. |
| `NEXT_PUBLIC_SITE_URL` | Canonical deployed origin, with no trailing slash. |
| `AKADA_MCP_TOKEN_SECRET` | Server-only random secret used to protect Claude connector tokens. Required only when using MCP. |

Never add a Supabase `service_role` key. The app and connector both use the student's own Supabase session, which keeps RLS in force.

## Claude connector

After deployment, set `AKADA_MCP_TOKEN_SECRET` in Vercel to a random value of at least 32 characters, apply it to Production (and Preview if used), and redeploy. Keep this value stable: changing it invalidates existing Claude connector credentials.

In Claude, go to **Customize -> Connectors -> Add custom connector** and use:

```text
https://your-akada-domain/api/mcp
```

Choose **Always required** authentication, **No client ID -- register one automatically** for the OAuth client, and leave Additional request headers blank. Complete Akada's sign-in and approval screen, then enable Akada for the conversation from the chat's Connectors menu.

The connector exposes only two actions: find an active-semester course and create tasks in that course. It cannot delete or edit existing tasks, courses, semesters, or sessions. Consider setting the task-creation tool to **Needs approval** in Claude's connector permissions.

## Deployment

Deploy as a Next.js project on Vercel. Add the environment variables above to Production and Preview, and set the matching production site URL in Supabase Auth URL Configuration. Add each deployed origin and `/auth/callback` to Supabase's redirect allowlist.

`LAUNCH_CHECKLIST.md` has the project setup details.

## Course catalog

The Fall 2026 catalog is generated from the term course memo and the public LUMS Pro Planner dataset. Regenerate it with:

```bash
python scripts/build-catalog.py "Fall Semester 2026 - Course Memo.xlsx"
python scripts/build-catalog.py "Fall Semester 2026 - Course Memo.xlsx" --refresh-planner
```

The workbook is deliberately not committed because it can contain free-text notes from instructors. The generated catalog excludes those notes.

## License

For personal or academic use.
