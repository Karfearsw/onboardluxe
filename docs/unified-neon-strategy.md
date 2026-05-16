# Unified Neon Postgres Strategy (CRM + HR + XP)

This repo is designed to run multiple Ocean Luxe products against one Neon Postgres project in production, while keeping Preview and local development isolated.

## Database URL Resolution (Single Contract)

Server runtimes resolve the database URL in this order:
1. `DATABASE_URL`
2. `POSTGRES_URL`
3. `NEON_DATABASE_URL`

Resolution happens at runtime (not at module import), and the server will fail fast in strict environments if no URL is present: [env.ts](file:///workspace/server/env.ts).

### SSL connection string guidance (Neon)
- Prefer `sslmode=verify-full` when you can validate the server certificate properly.
- For forward compatibility with upcoming `pg` / `pg-connection-string` semantics changes, use `uselibpqcompat=true&sslmode=require`.

## Environments

### Production
- One Neon project / one Postgres logical schema.
- All product variants point to the same `DATABASE_URL` for shared data and shared admin auth.
- Access control remains at the application layer (auth, roles, protected routes).

### Preview (Vercel)
- Each Preview deployment should use an isolated Neon branch (preferred) or an isolated database.
- Do not set cookie domain env vars in Preview, or admin/agent cookies will not work correctly on preview domains.

### Local development
- Prefer a dedicated Neon branch or local database with non-production data.
- Use `.env` or `.env.local` for `DATABASE_URL` (never commit).

## Migration Workflow (Recommended)

Target state:
- Schema changes are made via committed migrations (deterministic).
- Migrations are applied once per deploy in CI (recommended) and optionally in Preview builds.

Suggested flow:
1. Update `shared/schema.ts`
2. Generate a migration (Drizzle)
3. Apply migrations:
   - Local: `npm run db:migrate`
   - Preview: auto-apply during Preview deploys against Preview DB/branch
   - Production: gated step in CI before promoting a deploy

Runtime behavior:
- In local dev, migrations auto-apply when the server first touches the database.
- In Preview/Production, set `AUTO_APPLY_MIGRATIONS=1` if you want the server to auto-apply on cold start; otherwise the server will require migrations to be applied ahead of time.

## Env Matrix (Minimum)

### Required (server)
- `DATABASE_URL` (or `POSTGRES_URL` / `NEON_DATABASE_URL`)

### Required for CRM→HR admin SSO (server)
- `AUTH_MODE=express_session`
- `AUTH_COOKIE_NAMES` (often `connect.sid`; hardened variants are supported)
- `SESSION_SECRET`
- `SESSION_TABLE`, `SESSION_*_COLUMN` (only if CRM session table differs from defaults)

### Optional HR fallback admin login (server)
- `HR_ADMIN_ACCESS_CODE`
- `HR_ADMIN_TOKEN_SECRET`
- `HR_ADMIN_COOKIE_DOMAIN` (production only)

### Optional agent login cookie config (server)
- `AGENT_SESSION_COOKIE_DOMAIN` (production only)
- `AGENT_SESSION_TTL_DAYS`

### Signup gating (server)
- `APP_PUBLIC_SIGNUP=1` to enable signup anywhere, OR
- `SIGNUP_ALLOWED_HOSTS=career.oceanluxe.org,...` to allowlist signup hostnames
- `AUTO_APPLY_MIGRATIONS=1` to apply migrations automatically on Preview/Production runtimes

### Frontend build (client)
- `VITE_SOFI_REFERRAL_LINK` (if using the SoFi link UI)
