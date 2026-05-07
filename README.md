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
