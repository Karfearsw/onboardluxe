/**
 * CRM single sign-on for the career admin.
 *
 * Lets a CRM admin/manager/owner open the career admin without the HR access
 * code: the career site reads the CRM's session cookie (shared via
 * COOKIE_DOMAIN=.oceanluxe.org on the CRM), unsigns it with the CRM's
 * SESSION_SECRET, and validates the session + the user's role against the
 * CRM database over a dedicated read pool.
 *
 * Required env vars (Vercel → onboardluxe → Production):
 *   CRM_DATABASE_URL    – connection string to the CRM's Neon database
 *                         (read access to the "session" and "users" tables)
 *   CRM_SESSION_SECRET  – the CRM's SESSION_SECRET (used to unsign connect.sid)
 * Optional:
 *   CRM_SESSION_COOKIE_NAME – defaults to "connect.sid"
 *
 * On the CRM side (Vercel → stackk10m → Production):
 *   COOKIE_DOMAIN=.oceanluxe.org – so the browser sends connect.sid to
 *                                  career.oceanluxe.org
 *
 * Fail-closed: any misconfiguration or lookup failure returns null and the
 * existing HR access-code login keeps working untouched.
 */
import { Pool } from "pg";
import crypto from "crypto";
import type { Request } from "express";

export interface CrmAdminUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  crmUserId: number;
}

// CRM roles allowed into the career admin. Mirrors AUTH_ALLOWED_ROLES.
const CRM_ADMIN_ROLES = new Set(["admin", "owner", "manager", "super_admin"]);

let crmPool: Pool | null = null;
let crmPoolFailed = false;

function getCrmPool(): Pool | null {
  if (crmPool) return crmPool;
  if (crmPoolFailed) return null;
  const url = (process.env.CRM_DATABASE_URL || "").trim();
  if (!url) return null;
  try {
    crmPool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    crmPool.on("error", () => {
      // Swallowed: validation fails closed per-call.
    });
    return crmPool;
  } catch {
    crmPoolFailed = true;
    return null;
  }
}

function getCrmSessionSecrets(): string[] {
  return (process.env.CRM_SESSION_SECRET || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function base64NoPadding(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/** Unsign an express-session `s:<sid>.<sig>` cookie value. */
function unsignSessionCookie(rawValue: string, secret: string): string | null {
  if (!rawValue.startsWith("s:")) return null;
  const unsigned = rawValue.slice(2);
  const dot = unsigned.lastIndexOf(".");
  if (dot <= 0) return null;
  const sid = unsigned.slice(0, dot);
  const signature = unsigned.slice(dot + 1);
  const expected = base64NoPadding(crypto.createHmac("sha256", secret).update(sid).digest());
  if (!safeEqual(signature, expected)) return null;
  return sid;
}

function parseCookies(header?: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) out.set(name, decodeURIComponent(value));
  }
  return out;
}

/**
 * Validate the request's CRM session cookie against the CRM database.
 * Returns the CRM admin user when the session is live and the user holds an
 * admin-level role; otherwise null.
 */
export async function validateCrmAdminSession(req: Request): Promise<CrmAdminUser | null> {
  try {
    const pool = getCrmPool();
    const secrets = getCrmSessionSecrets();
    if (!pool || secrets.length === 0) return null;

    const cookieName = (process.env.CRM_SESSION_COOKIE_NAME || "connect.sid").trim() || "connect.sid";
    const rawCookie = parseCookies(req.headers.cookie).get(cookieName);
    if (!rawCookie) return null;

    let sid: string | null = null;
    for (const secret of secrets) {
      sid = unsignSessionCookie(rawCookie, secret);
      if (sid) break;
    }
    if (!sid) return null;

    // connect-pg-simple layout: session(sid, sess, expire)
    const sessRes = await pool.query<{ sess: any }>(
      `SELECT sess FROM session WHERE sid = $1 AND expire > now() LIMIT 1`,
      [sid]
    );
    const row = sessRes.rows[0];
    if (!row) return null;

    let sess: any;
    try {
      sess = typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess;
    } catch {
      return null;
    }
    const userId = Number(sess?.userId ?? sess?.user?.id);
    if (!Number.isInteger(userId) || userId <= 0) return null;

    const userRes = await pool.query<{
      id: number;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      role: string | null;
      is_super_admin: boolean | null;
      is_active: boolean | null;
    }>(
      `SELECT id, email, first_name, last_name, role, is_super_admin, is_active
       FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user || user.is_active === false) return null;

    const role = user.is_super_admin ? "super_admin" : String(user.role || "").toLowerCase();
    if (!CRM_ADMIN_ROLES.has(role)) return null;

    const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || null;
    return {
      id: `crm-${user.id}`,
      email: user.email,
      name,
      role,
      crmUserId: user.id,
    };
  } catch {
    return null;
  }
}

/** Whether CRM SSO is configured (both DB access and signing secret present). */
export function isCrmSsoConfigured(): boolean {
  return Boolean((process.env.CRM_DATABASE_URL || "").trim()) && getCrmSessionSecrets().length > 0;
}
