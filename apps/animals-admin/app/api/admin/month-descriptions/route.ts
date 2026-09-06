import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, sessionCookieIsValid } from "@/lib/auth";
import { commitMonthDescriptions } from "@/lib/github";

const MAX_LEN = 300;

function validateDescriptions(input: unknown): { ok: true; descriptions: string[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length !== 12) {
    return { ok: false, error: "Expected 12 entries, one per month." };
  }
  const descriptions: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") return { ok: false, error: "Each description must be text." };
    const trimmed = v.trim();
    if (trimmed.length > MAX_LEN) return { ok: false, error: `A description is too long (max ${MAX_LEN} characters).` };
    descriptions.push(trimmed);
  }
  return { ok: true, descriptions };
}

export async function POST(req: NextRequest) {
  const loggedIn = sessionCookieIsValid(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!loggedIn) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { descriptions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const validated = validateDescriptions(body.descriptions);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const result = await commitMonthDescriptions(validated.descriptions);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
