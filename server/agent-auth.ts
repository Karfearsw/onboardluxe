import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { pool } from "./db.js";

export interface AgentAuthUser {
  agentId: number;
  sessionToken: string;
}

declare global {
  namespace Express {
    interface Request {
      agentUser?: AgentAuthUser | null;
    }
  }
}

const AGENT_COOKIE_NAME = "ol_agent_session";

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

function ttlDays() {
  const raw = process.env.AGENT_SESSION_TTL_DAYS?.trim();
  const parsed = raw ? Number(raw) : 30;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function cookieDomain() {
  const value = process.env.AGENT_SESSION_COOKIE_DOMAIN?.trim();
  return value ? value : undefined;
}

function cookieSecure() {
  return process.env.NODE_ENV === "production";
}

export function setAgentSessionCookie(res: Response, token: string) {
  res.cookie(AGENT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    domain: cookieDomain(),
    path: "/",
    maxAge: ttlDays() * 24 * 60 * 60 * 1000,
  });
}

export function clearAgentSessionCookie(res: Response) {
  res.clearCookie(AGENT_COOKIE_NAME, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    domain: cookieDomain(),
    path: "/",
  });
}

export async function createAgentSession(agentId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + ttlDays() * 24 * 60 * 60 * 1000);

  await pool.query(
    `
      insert into hr_agent_sessions (agent_id, token, expires_at, created_at)
      values ($1, $2, $3, $4)
    `,
    [agentId, token, expires.toISOString(), now.toISOString()],
  );

  return { token, expiresAt: expires.toISOString() };
}

export async function deleteAgentSession(token: string) {
  await pool.query(`delete from hr_agent_sessions where token = $1`, [token]);
}

async function findAgentSession(token: string) {
  const nowIso = new Date().toISOString();
  const result = await pool.query<{ agent_id: number; token: string }>(
    `
      select agent_id, token
      from hr_agent_sessions
      where token = $1
        and expires_at > $2
      limit 1
    `,
    [token, nowIso],
  );

  return result.rows[0] ?? null;
}

export async function attachAgentUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.get(AGENT_COOKIE_NAME);

    if (!token) {
      req.agentUser = null;
      return next();
    }

    const row = await findAgentSession(token);
    if (!row) {
      req.agentUser = null;
      return next();
    }

    req.agentUser = { agentId: row.agent_id, sessionToken: row.token };
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAgentAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.agentUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  return next();
}

export function requireAgentOrAdmin(paramName = "id") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.authUser) {
      return next();
    }

    const agentId = Number(req.params[paramName]);
    if (!req.agentUser || !Number.isFinite(agentId)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (req.agentUser.agentId !== agentId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return next();
  };
}

