# dialogue_app

## Recommended Database For This Project

For the current codebase, the best remote database choice is Turso.

Why:

- The app already uses `@libsql/client`, so Turso works with minimal code changes.
- Your current schema and migration style are SQLite/libSQL-friendly.
- It fits a ToC product well for the current stage: auth, conversations, and memory persistence.
- It works cleanly with Vercel as a remote serverless database.

If this product later becomes heavier on analytics, joins, or internal tooling, Neon or Supabase are reasonable PostgreSQL upgrades. For now, Turso is the lowest-friction production option.

## Required Environment Variables

Set these in Vercel:

- `JWT_SECRET`
- `DEEPSEEK_API_KEY`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

Optional:

- `DEEPSEEK_BASE_URL`
- `TAVILY_API_KEY`

You can copy from [`.env.example`](/D:/1millionplan/dialogue_app/.env.example).

## Turso Setup

1. Create a Turso database.
2. Create an auth token for that database.
3. Put `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` into Vercel.
4. Redeploy the app.

The app will create the required tables automatically on first request.

## Vercel Note

This app cannot use local `.data/dialogue.db` on Vercel. In serverless deployment, a remote database is required.
