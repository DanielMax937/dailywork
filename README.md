This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Local automation worker (cron + Telegram)

This repo includes a **separate process** that runs scheduled shell commands and a Telegram bot (private chat only). It uses **SQLite** at `data/automation.db` (not the Todo DB).

### 1. Create DB schema

```bash
npm run automation:db:push
```

### 2. Configure Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. Get your numeric chat id (e.g. message [@userinfobot](https://t.me/userinfobot) in the same account you will use to talk to your bot).

Copy `.env.example` to `.env` and set:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_CHAT_ID`

Only this chat can use `/list`, `/run`, etc.

### 3. Insert tasks

Each task row has: `name`, `cron_expr` (standard **5-field** crontab; internally stored with a leading `0` seconds field), `command` (shell string), `enabled` (0/1).

Example (SQLite `sqlite3 data/automation.db`):

```sql
INSERT INTO tasks (name, cron_expr, command, enabled, created_at)
VALUES (
  'demo',
  '*/2 * * * *',
  'echo hello',
  1,
  (strftime('%s','now') * 1000)
);
```

Restart the worker after changing tasks (cron is loaded at startup).

### 4. Run (two terminals)

```bash
npm run dev
```

```bash
npm run worker
```

Bot commands: `/help`, `/list`, `/run <id>`.

### Env (optional)

| Variable | Default | Meaning |
|----------|---------|---------|
| `AUTOMATION_DEFAULT_TIMEOUT_SEC` | `3600` | Kill command after N seconds |
| `AUTOMATION_LOG_MAX_CHARS` | `8192` | Truncate stdout/stderr stored in DB and Telegram |

Design doc: `docs/superpowers/specs/2026-04-02-dailywork-automation-design.md`.
