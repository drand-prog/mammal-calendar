import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, sessionCookieIsValid } from "@/lib/auth";
import { commitFaqs, type Faq } from "@/lib/github";

const MAX_FAQS = 200;
const MAX_Q_LEN = 200;
const MAX_A_LEN = 1000;

function validateFaqs(input: unknown): { ok: true; faqs: Faq[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Expected a list of FAQs." };
  if (input.length > MAX_FAQS) return { ok: false, error: `Too many FAQs (max ${MAX_FAQS}).` };

  const faqs: Faq[] = [];
  for (const item of input) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as any).q !== "string" ||
      typeof (item as any).a !== "string"
    ) {
      return { ok: false, error: "Each FAQ needs a question and an answer." };
    }
    const q = (item as any).q.trim();
    const a = (item as any).a.trim();
    if (!q || !a) continue; // skip blanks rather than reject the whole save
    if (q.length > MAX_Q_LEN) return { ok: false, error: `A question is too long (max ${MAX_Q_LEN} characters).` };
    if (a.length > MAX_A_LEN) return { ok: false, error: `An answer is too long (max ${MAX_A_LEN} characters).` };
    faqs.push({ q, a });
  }
  return { ok: true, faqs };
}

export async function POST(req: NextRequest) {
  const loggedIn = sessionCookieIsValid(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!loggedIn) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { faqs?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const validated = validateFaqs(body.faqs);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const result = await commitFaqs(validated.faqs);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, count: validated.faqs.length });
}
