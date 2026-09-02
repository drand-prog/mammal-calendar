import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_SESSION_COOKIE, sessionCookieIsValid } from "@/lib/auth";
import { commitOrders, type OrderEntry } from "@/lib/github";

// Loaded fresh from disk on every request rather than trusted from the
// client: the request body only ever supplies the new `month` per order
// (by index), never name/formal/count -- so there's nothing for a tampered
// request to corrupt beyond the one field this endpoint exists to change.
function loadOrders(): OrderEntry[] {
  const filePath = path.join(process.cwd(), "..", "..", "data", "reptile", "orders.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as OrderEntry[];
}

function validateMonths(
  input: unknown,
  expectedLength: number
): { ok: true; months: (number | null)[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Expected a list of months." };
  if (input.length !== expectedLength) {
    return { ok: false, error: `Expected ${expectedLength} entries, got ${input.length}.` };
  }
  const months: (number | null)[] = [];
  for (const v of input) {
    if (v === null) {
      months.push(null);
      continue;
    }
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 11) {
      return { ok: false, error: "Each month must be 0-11 (Jan-Dec) or null." };
    }
    months.push(v);
  }
  return { ok: true, months };
}

export async function POST(req: NextRequest) {
  const loggedIn = sessionCookieIsValid(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!loggedIn) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { months?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const current = loadOrders();
  const validated = validateMonths(body.months, current.length);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const next: OrderEntry[] = current.map((o, i) => ({ ...o, month: validated.months[i] }));

  const result = await commitOrders(next);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
