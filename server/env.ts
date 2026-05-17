import { z } from "zod";

const sqlIdentifier = z.string().regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/);

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const candidates = [
    env.DATABASE_URL,
    env.POSTGRES_URL,
    env.NEON_DATABASE_URL,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  return candidates[0] ?? "";
}

export function runtimeIsStrict(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "production") return true;
  if (env.VERCEL) return true;
  const vercelEnv = (env.VERCEL_ENV || "").toLowerCase();
  if (vercelEnv === "production" || vercelEnv === "preview") return true;
  return false;
}

function isPreview(env: NodeJS.ProcessEnv) {
  return (env.VERCEL_ENV || "").toLowerCase() === "preview";
}

function normalizeYes(value: string | undefined) {
  const v = (value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function validateEnvOrThrow(env: NodeJS.ProcessEnv = process.env) {
  const strict = runtimeIsStrict(env);
  if (!strict) return;

  const schema = z.object({
    DATABASE_URL: z.string().optional(),
    POSTGRES_URL: z.string().optional(),
    NEON_DATABASE_URL: z.string().optional(),

    AUTH_MODE: z.string().optional(),
    AUTH_COOKIE_NAMES: z.string().optional(),
    AUTH_ALLOWED_ROLES: z.string().optional(),

    SESSION_SECRET: z.string().optional(),
    SESSION_TABLE: sqlIdentifier.optional(),
    SESSION_SID_COLUMN: sqlIdentifier.optional(),
    SESSION_JSON_COLUMN: sqlIdentifier.optional(),
    SESSION_EXPIRES_COLUMN: sqlIdentifier.optional(),

    HR_ADMIN_ACCESS_CODE: z.string().optional(),
    HR_ADMIN_TOKEN_SECRET: z.string().optional(),
    HR_ADMIN_COOKIE_DOMAIN: z.string().optional(),

    AGENT_SESSION_COOKIE_DOMAIN: z.string().optional(),

    APP_PUBLIC_SIGNUP: z.string().optional(),
    SIGNUP_ALLOWED_HOSTS: z.string().optional(),

    AUTO_APPLY_MIGRATIONS: z.string().optional(),

    EMAIL_PROVISIONING_SECRET: z.string().optional(),
  });

  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }

  const dbUrl = resolveDatabaseUrl(env);
  if (!dbUrl) {
    throw new Error("Missing database connection string. Set DATABASE_URL (or POSTGRES_URL / NEON_DATABASE_URL).");
  }

  if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
    throw new Error("Invalid database connection string. Expected a Postgres connection URL.");
  }

  const authMode = (env.AUTH_MODE || "neon_auth").trim().toLowerCase();
  if (authMode === "express_session" && !(env.SESSION_SECRET || "").trim()) {
    throw new Error("AUTH_MODE=express_session requires SESSION_SECRET.");
  }

  const hrCode = (env.HR_ADMIN_ACCESS_CODE || "").trim();
  const hrSecret = (env.HR_ADMIN_TOKEN_SECRET || "").trim();
  if ((hrCode && !hrSecret) || (!hrCode && hrSecret)) {
    throw new Error("HR admin fallback requires both HR_ADMIN_ACCESS_CODE and HR_ADMIN_TOKEN_SECRET.");
  }

  if (isPreview(env)) {
    const cookieDomainVars = ["HR_ADMIN_COOKIE_DOMAIN", "AGENT_SESSION_COOKIE_DOMAIN"] as const;
    const configured = cookieDomainVars.filter((key) => Boolean((env[key] || "").trim()));
    if (configured.length) {
      throw new Error(`Preview deploy must not set cookie domains (${configured.join(", ")}). Leave them unset for preview.`);
    }
  }

  normalizeYes(env.APP_PUBLIC_SIGNUP);
}
