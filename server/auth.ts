import type { NextFunction, Request, Response } from "express";
import { pool } from "./db";

const DEFAULT_COOKIE_NAMES = [
  "__Secure-better-auth.session_token",
  "better-auth.session_token",
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
  "session",
];

const DEFAULT_ALLOWED_ROLES = [
  "admin",
  "owner",
  "super_admin",
  "hr_admin",
  "ops_manager",
  "manager",
];

export interface SharedAuthUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationSlug: string | null;
  organizationRole: string | null;
  sessionToken: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: SharedAuthUser | null;
    }
  }
}

function parseCookies(cookieHeader?: string) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

function getConfiguredCookieNames() {
  const configured = process.env.AUTH_COOKIE_NAMES?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configured?.length ? configured : DEFAULT_COOKIE_NAMES;
}

function getAllowedRoles() {
  const configured = process.env.AUTH_ALLOWED_ROLES?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured?.length ? configured : DEFAULT_ALLOWED_ROLES;
}

async function findAuthUserBySessionToken(token: string) {
  const result = await pool.query<SharedAuthUser>(
    `
      select
        u.id,
        u.email,
        u.name,
        u.role,
        o.id as "organizationId",
        o.name as "organizationName",
        o.slug as "organizationSlug",
        m.role as "organizationRole",
        s.token as "sessionToken"
      from neon_auth.session s
      join neon_auth."user" u
        on u.id = s."userId"
      left join neon_auth.organization o
        on o.id::text = s."activeOrganizationId"
      left join neon_auth.member m
        on m."userId" = u.id
       and (
         s."activeOrganizationId" is null
         or m."organizationId"::text = s."activeOrganizationId"
       )
      where s.token = $1
        and s."expiresAt" > now()
      order by s."updatedAt" desc
      limit 1
    `,
    [token],
  );

  return result.rows[0] ?? null;
}

export async function attachSharedAuthUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const cookieNames = getConfiguredCookieNames();
    const sessionToken = cookieNames.map((name) => cookies.get(name)).find(Boolean);

    if (!sessionToken) {
      req.authUser = null;
      return next();
    }

    req.authUser = await findAuthUserBySessionToken(sessionToken);
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireSharedAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  return next();
}

export function requireSharedAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const allowedRoles = getAllowedRoles();
  const assignedRoles = [req.authUser.role, req.authUser.organizationRole]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  const isAllowed = assignedRoles.some((role) => allowedRoles.includes(role));

  if (!isAllowed) {
    return res.status(403).json({ message: "Forbidden" });
  }

  return next();
}
