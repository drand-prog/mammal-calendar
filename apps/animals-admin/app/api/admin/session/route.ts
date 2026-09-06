import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, sessionCookieIsValid } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const loggedIn = sessionCookieIsValid(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  return NextResponse.json({ loggedIn });
}
