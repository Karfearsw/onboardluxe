import type { NextFunction, Request, Response } from "express";
import { pool } from "./db.js";
import crypto from "crypto";

const DEFAULT_COOKIE_NAMES = [
  "connect.sid",
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

type AuthMode = "neon_auth" | "express_session";

function getAuthMode(): AuthMode {
  const value = process.env.AUTH_MODE?.trim().toLowerCase();
  if (value === "express_session") return "express_session";
  return "neon_auth";
}

function debugEnabled() {
  return process.env.DEBUG_ENDPOINTS === "1";
}

function base64NoPadding(buf: Buffer) {
  return buf.toString("base64").replace(/=+$/g, "");
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function unsignExpressSessionCookie(rawValue: string, secret: string) {
  if (!rawValue.startsWith("s:")) return null;

  const unsigned = rawValue.slice(2);
  const dot = unsigned.lastIndexOf(".");
  if (dot <= 0) return null;

  const value = unsigned.slice(0, dot);
  const signature = unsigned.slice(dot + 1);
  const expected = base64NoPadding(crypto.createHmac("sha256", secret).update(value).digest());

  if (!safeEqual(signature, expected)) return null;
  return value;
}

function quoteIdentifierParts(identifier: string) {
  const parts = identifier.split(".");
  return parts.map((part) => `"${part.replace(/"/g, "\"\"")}"`).join(".");
}

function safeSqlIdentifier(identifier: string, fallback: string) {
  const value = (identifier || fallback).trim();
  if (!/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return quoteIdentifierParts(value);
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

async function findAuthUserByUserId(userId: string, activeOrganizationId?: string | null): Promise<SharedAuthUser | null> {
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
        $2::text as "sessionToken"
      from neon_auth."user" u
      left join neon_auth.organization o
        on o.id::text = $1
      left join neon_auth.member m
        on m."userId" = u.id
       and (
         $1 is null
         or m."organizationId"::text = $1
       )
      where u.id = $2
      limit 1
    `,
    [activeOrganizationId ?? null, userId],
  );

  return result.rows[0] ?? null;
}

function extractUserIdFromSession(session: any) {
  if (!session || typeof session !== "object") return null;
  const passportUser = session?.passport?.user;
  if (typeof passportUser === "string") return passportUser;
  if (typeof passportUser === "number") return String(passportUser);

  const nestedUserId = session?.user?.id ?? session?.userId ?? session?.userid ?? session?.user_id;
  if (typeof nestedUserId === "string") return nestedUserId;
  if (typeof nestedUserId === "number") return String(nestedUserId);

  return null;
}

function extractRoleFromSession(session: any) {
  const role = session?.user?.role ?? session?.role;
  return typeof role === "string" ? role : null;
}

function extractEmailFromSession(session: any) {
  const email = session?.user?.email ?? session?.email;
  return typeof email === "string" ? email : null;
}

function extractNameFromSession(session: any) {
  const name = session?.user?.name ?? session?.name;
  return typeof name === "string" ? name : null;
}

function extractActiveOrganizationIdFromSession(session: any) {
  const id = session?.activeOrganizationId ?? session?.organizationId ?? session?.orgId;
  if (typeof id === "string") return id;
  if (typeof id === "number") return String(id);
  return null;
}

async function findAuthUserFromExpressSessionCookie(rawCookieValue: string): Promise<SharedAuthUser | null> {
  const secret = process.env.SESSION_SECRET?.trim();
  const sid = secret ? unsignExpressSessionCookie(rawCookieValue, secret) : null;
  const effectiveSid = sid ?? (!rawCookieValue.startsWith("s:") ? rawCookieValue : null);

  if (!effectiveSid) {
    return null;
  }

  const table = safeSqlIdentifier(process.env.SESSION_TABLE ?? "", "session");
  const sidCol = safeSqlIdentifier(process.env.SESSION_SID_COLUMN ?? "", "sid");
  const sessCol = safeSqlIdentifier(process.env.SESSION_JSON_COLUMN ?? "", "sess");
  const expCol = safeSqlIdentifier(process.env.SESSION_EXPIRES_COLUMN ?? "", "expire");

  const query = `
    select ${sessCol} as sess
    from ${table}
    where ${sidCol} = $1
      and ${expCol} > now()
    limit 1
  `;

  const result = await pool.query<{ sess: any }>(query, [effectiveSid]);
  const row = result.rows[0];
  if (!row) return null;

  let sessionObj: any;
  try {
    sessionObj = typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess;
  } catch {
    return null;
  }
  const role = extractRoleFromSession(sessionObj);
  const email = extractEmailFromSession(sessionObj);
  const name = extractNameFromSession(sessionObj);
  const activeOrgId = extractActiveOrganizationIdFromSession(sessionObj);

  const userId = extractUserIdFromSession(sessionObj);
  if (!userId) return null;

  if (role || email || name) {
    return {
      id: userId,
      email,
      name,
      role,
      organizationId: activeOrgId,
      organizationName: null,
      organizationSlug: null,
      organizationRole: null,
      sessionToken: effectiveSid,
    };
  }

  const user = await findAuthUserByUserId(userId, activeOrgId);
  if (!user) return null;

  return { ...user, sessionToken: effectiveSid };
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

    const mode = getAuthMode();
    req.authUser = mode === "express_session"
      ? await findAuthUserFromExpressSessionCookie(sessionToken)
      : await findAuthUserBySessionToken(sessionToken);
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireSharedAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    if (debugEnabled()) {
      const cookies = parseCookies(req.headers.cookie);
      const cookieNames = getConfiguredCookieNames();
      const matchedCookieName = cookieNames.find((name) => cookies.has(name)) ?? null;

      return res.status(401).json({
        message: "Unauthorized",
        error: "no_auth_user",
        authMode: getAuthMode(),
        expectedCookieNames: cookieNames,
        matchedCookieName,
      });
    }

    return res.status(401).json({ message: "Unauthorized" });
  }

  return next();
}

export function requireSharedAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    if (debugEnabled()) {
      const cookies = parseCookies(req.headers.cookie);
      const cookieNames = getConfiguredCookieNames();
      const matchedCookieName = cookieNames.find((name) => cookies.has(name)) ?? null;

      return res.status(401).json({
        message: "Unauthorized",
        error: "no_auth_user",
        authMode: getAuthMode(),
        expectedCookieNames: cookieNames,
        matchedCookieName,
      });
    }

    return res.status(401).json({ message: "Unauthorized" });
  }

  const allowedRoles = getAllowedRoles();
  const assignedRoles = [req.authUser.role, req.authUser.organizationRole]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  const isAllowed = assignedRoles.some((role) => allowedRoles.includes(role));

  if (!isAllowed) {
    if (debugEnabled()) {
      return res.status(403).json({
        message: "Forbidden",
        error: "role_not_allowed",
        authMode: getAuthMode(),
        allowedRoles,
        assignedRoles,
      });
    }

    return res.status(403).json({ message: "Forbidden" });
  }

  return next();
}

export async function getSharedAuthDiagnostics(req: Request) {
  const cookies = parseCookies(req.headers.cookie);
  const cookieNames = getConfiguredCookieNames();
  const matchedCookieName = cookieNames.find((name) => cookies.has(name)) ?? null;
  const rawCookieValue = matchedCookieName ? cookies.get(matchedCookieName) ?? null : null;
  const mode = getAuthMode();

  const response: Record<string, unknown> = {
    host: req.headers.host ?? null,
    authMode: mode,
    expectedCookieNames: cookieNames,
    matchedCookieName,
    hasSessionCookie: Boolean(rawCookieValue),
    hasAuthUser: Boolean(req.authUser),
    authUser: req.authUser
      ? {
          id: req.authUser.id,
          email: req.authUser.email,
          name: req.authUser.name,
          role: req.authUser.role,
          organizationId: req.authUser.organizationId,
          organizationSlug: req.authUser.organizationSlug,
          organizationRole: req.authUser.organizationRole,
        }
      : null,
  };

  if (mode !== "express_session" || !rawCookieValue) {
    return response;
  }

  const secretSet = Boolean(process.env.SESSION_SECRET?.trim());
  const unsignedSid = secretSet ? unsignExpressSessionCookie(rawCookieValue, process.env.SESSION_SECRET!.trim()) : null;
  const effectiveSid = unsignedSid ?? (!rawCookieValue.startsWith("s:") ? rawCookieValue : null);

  response.expressSession = {
    secretSet,
    signedCookie: rawCookieValue.startsWith("s:"),
    signatureValid: Boolean(unsignedSid),
    effectiveSidPresent: Boolean(effectiveSid),
  };

  if (!effectiveSid) {
    return response;
  }

  try {
    const table = safeSqlIdentifier(process.env.SESSION_TABLE ?? "", "session");
    const sidCol = safeSqlIdentifier(process.env.SESSION_SID_COLUMN ?? "", "sid");
    const sessCol = safeSqlIdentifier(process.env.SESSION_JSON_COLUMN ?? "", "sess");
    const expCol = safeSqlIdentifier(process.env.SESSION_EXPIRES_COLUMN ?? "", "expire");

    const query = `
      select ${sessCol} as sess
      from ${table}
      where ${sidCol} = $1
        and ${expCol} > now()
      limit 1
    `;

    const result = await pool.query<{ sess: any }>(query, [effectiveSid]);
    const row = result.rows[0];
    if (!row) {
      response.expressSession = { ...(response.expressSession as object), sessionRowFound: false };
      return response;
    }

    let sessionObj: any;
    try {
      sessionObj = typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess;
    } catch {
      response.expressSession = { ...(response.expressSession as object), sessionRowFound: true, sessionJsonValid: false };
      return response;
    }

    response.expressSession = {
      ...(response.expressSession as object),
      sessionRowFound: true,
      sessionJsonValid: true,
      userIdFound: extractUserIdFromSession(sessionObj),
      roleFound: extractRoleFromSession(sessionObj),
    };

    return response;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    response.expressSession = { ...(response.expressSession as object), error: error.message };
    return response;
  }
}
