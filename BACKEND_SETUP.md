# Backend Setup

Stack: Next.js App Router + TypeScript + Prisma + Neon PostgreSQL, deployed on
Vercel. No paid third-party service is required.

---

## First setup

1. **Create a Neon project** at neon.tech and open the connection details.
2. **Copy both connection strings.** Neon shows a *pooled* host (containing
   `-pooler`) and a *direct* host. You need both:
   - `DATABASE_URL` = pooled host, and you **must** append
     `&pgbouncer=true&connection_limit=1`.
   - `DIRECT_URL` = direct host, unchanged.

   > Without `pgbouncer=true`, Prisma's prepared statements collide with
   > PgBouncer's transaction pooling. Logins may work while publishing a
   > chatbot, changing a password or starting a chat fail intermittently with
   > `prepared statement "s0" already exists`. This is the single most common
   > Prisma-on-Vercel failure.

3. **Copy `.env.example` to `.env`** and fill in the values.
4. **Set `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD`.** These are
   used exactly once, to create the first super admin. Seeding fails loudly if
   the password is missing — there is deliberately no default.
5. **Install, generate, migrate, seed:**

```bash
npm install && npx prisma generate && npx prisma migrate deploy && npx prisma db seed
```

6. **Start the app:**

```bash
npm run dev
```

7. **Log in** at `/login` with the bootstrap credentials and change the
   password in the app. From that point the database is the only source of
   truth; the bootstrap variable has no further effect.

---

## Deploying to Vercel

Set these in **Project → Settings → Environment Variables** (Production and
Preview), then redeploy — Vercel only picks up new values on a fresh build.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Pooled Neon host **with** `&pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Direct Neon host. Required, or `prisma migrate deploy` fails during the build |
| `APP_URL` | Your production URL, e.g. `https://your-app.vercel.app` |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | First setup only |
| `EMAIL_PROVIDER` | `smtp` in production |
| `SMTP_*` | See "Email" below |
| `STORAGE_PROVIDER` | `blob` in production. `local` is refused on a serverless deployment |
| `AI_PROVIDER` | `disabled` unless you are running your own model |

Migrations run automatically as part of the build:

```
prisma generate && PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=true prisma migrate deploy && next build
```

`PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` is set because Prisma's migration
advisory lock can be left held by an idle pooled Neon connection, after which
every `migrate deploy` times out with `P1002` and the build fails. If you ever
do hit `P1002` locally, restart the Neon compute endpoint (Branches → compute →
Restart) to drop the stale backend.

`prisma migrate deploy` only applies pending migrations and never performs a
destructive change, so it is safe in the build step.

---

## Email

Development uses `EMAIL_PROVIDER=console`: messages are written to the
`DevEmail` table and the server log, and can be read at `/dev/email-inbox`.

For production with Gmail (free):

1. Enable 2-Step Verification on the Google account.
2. Google Account → Security → **App passwords**, create one for "Mail".
3. Set `EMAIL_PROVIDER=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`,
   `SMTP_USER=<your address>`, `SMTP_PASSWORD=<the 16-character app password>`,
   `SMTP_FROM_EMAIL=<your address>`, `SMTP_FROM_NAME=<display name>`.

A normal Google account password will not work.

---

## File uploads

`STORAGE_PROVIDER=local` writes to `public/uploads` and is for local
development only — Vercel's filesystem is read-only outside `/tmp`, so uploads
would fail and anything written would vanish on the next cold start. The app
now refuses `local` in production rather than returning a 500 per upload.

For production, create a Blob store in the Vercel dashboard
(**Storage → Blob → Create**) and connect it to the project. Vercel injects
`BLOB_READ_WRITE_TOKEN` automatically. Set `STORAGE_PROVIDER=blob`.

---

## Tests

```bash
npm test
```

Unit tests (passwords, flow validation, widget origin rules, validation
schemas) and static route guards run always. The guards assert that no private
route accepts a client-supplied `tenantId`, that every private route has an
authorization check, that admin routes require `SUPER_ADMIN`, and that public
endpoints are rate limited and apply the origin policy.

The tenant-isolation integration tests need a database and are skipped without
one. Point `TEST_DATABASE_URL` at a scratch database — a Neon branch is ideal —
and run:

```bash
npm run test:isolation
```

They create two workspaces, verify that neither can read, update or delete the
other's contacts, leads, campaigns, chatbots or conversations, and remove
everything afterwards.

---

## Security notes

- Passwords are bcrypt hashed (cost 12). Plaintext is never stored or logged.
  Generated temporary passwords are shown to the operator exactly once, in the
  response body, and never persisted.
- Sessions are opaque 32-byte random tokens; only their SHA-256 hash is stored.
  The cookie is `HttpOnly`, `Secure` in production, `SameSite=Lax`.
  `SESSION_SECRET` / `PASSWORD_RESET_SECRET` / `JWT_SECRET` are **not used**.
- Password reset tokens are single-use rows storing only a hash, expiring in 30
  minutes. Issuing a new one, changing a password, or an admin reset all
  consume any outstanding token.
- Every private route derives `tenantId` from the session. No route reads it
  from the request body or query string, and a static test enforces this.
- Rate limits are stored in Postgres so they hold across serverless instances.
