import type { Request, Response } from "express";
import crypto from "crypto";

export const HR_ADMIN_COOKIE_NAME = "ol_hr_admin";

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

function secret() {
  const value = process.env.HR_ADMIN_TOKEN_SECRET?.trim();
  return value ? value : null;
}

function accessCode() {
  const value = process.env.HR_ADMIN_ACCESS_CODE?.trim();
  return value ? value : null;
}

function cookieDomain() {
  const value = process.env.HR_ADMIN_COOKIE_DOMAIN?.trim();
  return value ? value : undefined;
}

function ttlDays() {
  const raw = process.env.HR_ADMIN_TOKEN_TTL_DAYS?.trim();
  const parsed = raw ? Number(raw) : 7;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

function cookieSecure() {
  return process.env.NODE_ENV === "production";
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function sign(payload: string, key: string) {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export function hasHrAdminCookie(req: Request) {
  return parseCookies(req.headers.cookie).has(HR_ADMIN_COOKIE_NAME);
}

export function verifyHrAdminAccessCode(code: string) {
  const expected = accessCode();
  if (!expected) return false;
  return safeEqual(code, expected);
}

export function createHrAdminToken() {
  const key = secret();
  if (!key) return null;

  const now = Date.now();
  const exp = now + ttlDays() * 24 * 60 * 60 * 1000;
  const payloadObj = { v: 1, sub: "hr_admin", role: "hr_admin", exp };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = sign(payload, key);
  return `${payload}.${sig}`;
}

export function verifyHrAdminToken(token: string) {
  const key = secret();
  if (!key) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload, key);
  if (!safeEqual(signature, expected)) return null;

  let obj: any;
  try {
    obj = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!obj || typeof obj !== "object") return null;
  if (obj.sub !== "hr_admin" || obj.role !== "hr_admin") return null;
  if (typeof obj.exp !== "number" || Date.now() > obj.exp) return null;

  return { role: "hr_admin" as const };
}

export function setHrAdminCookie(res: Response, token: string) {
  res.cookie(HR_ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    domain: cookieDomain(),
    path: "/",
    maxAge: ttlDays() * 24 * 60 * 60 * 1000,
  });
}

export function clearHrAdminCookie(res: Response) {
  res.clearCookie(HR_ADMIN_COOKIE_NAME, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    domain: cookieDomain(),
    path: "/",
  });
}

