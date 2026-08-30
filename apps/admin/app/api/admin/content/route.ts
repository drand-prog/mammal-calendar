import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, sessionCookieIsValid } from "@/lib/auth";
import { commitJsonFile } from "@/lib/github";

// Field -> max length. Keeps this in one place so the editor form and the
// server-side check agree on limits.
const FIELDS: Record<string, number> = {
  title: 100,
  searchLabel: 100,
  searchPlaceholder: 100,
  faqHeading: 100,
  browsePrompt: 200,
};

function validateContent(input: unknown): { ok: true; content: Record<string, string> } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Expected a content object." };
  }
  const content: Record<string, string> = {};
  for (const key of Object.keys(FIELDS)) {
    const value = (input as any)[key];
    if (typeof value !== "string" || !value.trim()) {
      return { ok: false, error: `"${key}" can't be empty.` };
    }
    const trimmed = value.trim();
    if (trimmed.length > FIELDS[key]) {
      return { ok: false, error: `"${key}" is too long (max ${FIELDS[key]} characters).` };
    }
    content[key] = trimmed;
  }
  return { ok: true, content };
}

export async function POST(req: NextRequest) {
  const loggedIn = sessionCookieIsValid(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!loggedIn) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const validated = validateContent(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const result = await commitJsonFile(
    "data/content.json",
    validated.content,
    "Update site text via admin panel"
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
