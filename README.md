# AccountMVP

Minimal account system: register, email verification, login, protected dashboard.

**Stack:** Next.js 14 · Prisma · PostgreSQL · Resend · JWT sessions (httpOnly cookie)

---

## Local setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env
```
Edit `.env` and fill in:
- `DATABASE_URL` — free Postgres at [neon.tech](https://neon.tech) or [supabase.com](https://supabase.com)
- `JWT_SECRET` — run `openssl rand -hex 32`
- `RESEND_API_KEY` — free at [resend.com](https://resend.com) (3k emails/month)
- `EMAIL_FROM` — use `onboarding@resend.dev` for testing without a domain
- `NEXT_PUBLIC_APP_URL` — `http://localhost:3000` for local dev

### 3. Push the database schema
```bash
npm run db:push
```

### 4. Run the dev server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Run the realtime co-edit server (optional)

The workspace editor live-syncs collaborators through a Yjs WebSocket server. Start it in a second terminal:

```bash
npm run dev:ws        # tsx server/yws.ts, listens on ws://localhost:1234
```

Or run both Next.js and the WS server together:

```bash
npm run dev:all
```

Env vars (optional, defaults shown):
- `WS_PORT=1234` — server-side
- `NEXT_PUBLIC_YWS_URL=ws://localhost:1234` — client-side

The WS server reuses `JWT_SECRET` from `.env` to verify short-lived tokens issued by `/api/realtime/token`. If `dev:ws` is not running, the editor still works in single-user mode (saves through the REST API).

---

## Deploy to Vercel

### 1. Create a GitHub repo and push
```bash
git init
git add .
git commit -m "init"
gh repo create accountmvp --public --push --source=.
```

### 2. Import to Vercel
Go to [vercel.com/new](https://vercel.com/new), import the repo.

### 3. Add environment variables in Vercel dashboard
Same keys as `.env.example`, but:
- Set `NEXT_PUBLIC_APP_URL` to your Vercel URL (e.g. `https://accountmvp.vercel.app`)
- Use a production Postgres URL (Neon/Supabase free tier works great)

### 4. Deploy
Vercel runs `prisma generate && next build` automatically.

---

## Deploy the realtime WS server (Fly.io)

Vercel can't host long-lived WebSocket connections, so the Yjs server in `server/yws.ts` needs to run elsewhere. Fly.io's free allowance comfortably covers a single small instance.

### 1. Install + login

```bash
brew install flyctl     # or curl -L https://fly.io/install.sh | sh
fly auth login
```

### 2. Create the app (don't deploy yet)

From the repo root:

```bash
fly launch --no-deploy --copy-config --name accountmvp-ws
```

Accept the existing `fly.toml`. Pick a region close to your Vercel deployment (`fly platform regions`).

### 3. Set secrets

The WS server needs the **same** `DATABASE_URL` and `JWT_SECRET` as Vercel (so JWTs issued by Next verify, and Prisma writes to the same Postgres).

```bash
fly secrets set \
  DATABASE_URL="postgres://…"   \
  JWT_SECRET="…"                \
  --app accountmvp-ws
```

### 4. Deploy

```bash
fly deploy --app accountmvp-ws
```

Verify: `curl https://accountmvp-ws.fly.dev/` returns `yjs ws server`.

### 5. Point Vercel at the WS server

In the Vercel dashboard, add:

```
NEXT_PUBLIC_YWS_URL = wss://accountmvp-ws.fly.dev
```

Redeploy Vercel (env-var changes don't auto-rebuild). Open the same workspace in two browsers — typing in one should appear live in the other.

### Troubleshooting

- `fly logs --app accountmvp-ws` shows auth/connection events.
- If clients fail to connect: confirm `JWT_SECRET` matches Vercel exactly (no trailing newline in `fly secrets`).
- If sync works but versions aren't being written: confirm `DATABASE_URL` is the same Postgres Vercel uses, and that the Prisma client was generated (the Dockerfile does this in the build).

---

## Routes

| Route | Description |
|---|---|
| `/register` | Create account → sends verification email |
| `/login` | Sign in with email + password |
| `/` | Protected dashboard (requires login) |
| `GET /api/auth/verify?token=...` | Verifies email via link |
| `POST /api/auth/logout` | Clears session cookie |

## Security notes
- Passwords hashed with bcrypt (cost 12)
- Sessions stored in httpOnly, sameSite=lax cookies — not accessible to JS
- Verification tokens expire after 24h
- Generic "Invalid email or password" prevents user enumeration
