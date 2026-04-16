# Ocean Luxe Estate LLC — Agent Onboarding Platform

> HR + Onboarding software for Ocean Luxe Estate LLC's remote acquisitions team.  
> Stack: React · Express · TypeScript · SQLite/Drizzle · Tailwind CSS · shadcn/ui

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — agent recruitment |
| `/#/register` | Agent registration (Step 1) |
| `/#/onboarding/:id` | 6-step onboarding wizard |
| `/#/admin` | Admin hiring dashboard |

## Onboarding Steps

1. **Profile** — Review name, email, phone, start date
2. **Sign ICA** — Independent Contractor Agreement + digital signature canvas
3. **W-9 Upload** — IRS W-9 document upload
4. **ID Verify** — Government-issued ID upload
5. **Payout Setup** — SoFi, PayPal, Bank Transfer, or Zelle
6. **Training** — 5 modules: Welcome, Cold Calling, Objections, Deal Analysis, CRM Walkthrough

## Local Development

```bash
npm install
npx tsx server/migrate.ts   # Initialize SQLite DB
npm run dev                  # Start dev server on port 5000
```

## Production Build

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

## Deploy on Vercel

1. Import this repo at [vercel.com/new](https://vercel.com/new)
2. Framework: **Other**
3. Build command: `npm run build`
4. Output directory: `dist/public`
5. Deploy

## Data & Storage

- DB: stored in Postgres (Neon) configured by `DATABASE_URL` in Vercel project env vars.
- Tables: `hr_agents`, `hr_onboarding_tasks`, `hr_documents`, `hr_ica_signatures`, `hr_training_progress`
- Documents: current UI flow stores document metadata + `fileUrl` in `hr_documents` (it does not upload binary files by itself).

## Discord Notifications (Optional)

- Set `DISCORD_WEBHOOK_URL` to enable event notifications (agent created, docs added, ICA signed, payout/training updates).

## SoFi Referral Link (Optional)

- Set `SOFI_REFERRAL_LINK` to display the team’s recommended SoFi referral link inside the Payout Setup step and to track referral status (`Invited`/`Opened`/`Bonus Confirmed`).
- Also set `VITE_SOFI_REFERRAL_LINK` to expose the same link to the frontend build (Vite only exposes variables prefixed with `VITE_`).

## Debug Endpoints (Optional)

- Set `DEBUG_ENDPOINTS=1` to temporarily enable:
  - `POST /api/debug/discord`
  - `GET /api/health`
  - `GET /api/debug/auth`

## Admin SSO (Deals → HR)

- HR admin auth reuses the CRM session cookie.
- This will not work on `*.vercel.app`. HR must be served on `career.oceanluxe.org` (same root domain).

Required Vercel env vars for HR:

- `AUTH_MODE=express_session`
- `AUTH_COOKIE_NAMES=connect.sid`
- `SESSION_SECRET` (must match the CRM `express-session` secret)
- `SESSION_TABLE=session` (default for connect-pg-simple)

## Brand

- Colors: Black `#0a0a0a` · Gold `hsl(43,85%,52%)` · White
- Fonts: Cormorant Garamond (headings) · Inter (body)
- Logo: Gold shell — Ocean Luxe Estate LLC

## Revenue Goal

- Target: **100 active agents** × $50/month = **$5,000 MRR**
- Current active agent: Giovanna Davis (proof of concept)
