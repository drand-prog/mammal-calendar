import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "admin_session";

/**
 * The session cookie is an HMAC of a fixed label, keyed by ADMIN_PASSWORD.
 * This lets us verify a session without storing anything server-side (no
 * database, no in-memory session map) — anyone who can reproduce this value
 * has proven they knew ADMIN_PASSWORD at some point. The cookie itself is
 * httpOnly, so client-side JS (and thus an XSS payload) can't read it.
 */
export function computeSessionToken(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return createHmac("sha256", password).update("mammal-calendar-admin-session").digest("hex");
}

export function passwordMatches(candidate: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(password);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function sessionCookieIsValid(cookieValue: string | undefined): boolean {
  const expected = computeSessionToken();
  if (!expected || !cookieValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
