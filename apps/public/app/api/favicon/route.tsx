import { NextResponse } from "next/server";
import { MONTH_EMOJI } from "@/lib/monthEmoji";

// A plain API route rather than the app/icon.tsx metadata-image convention:
// Next forces that convention's response to carry a year-long "immutable"
// cache-control alongside whatever headers we set ourselves, which would
// defeat rotating on every load. A regular route handler doesn't get that
// treatment, so our own no-store header actually wins.
//
// Returns raw SVG rather than going through next/og's ImageResponse
// (Satori): Satori has no color-emoji glyphs of its own, so rendering an
// emoji through it means fetching the glyph as an image from an external
// CDN at request time -- and if that fetch is blocked or fails, the emoji
// silently renders as nothing, leaving every favicon visually identical
// no matter which one was picked (which is exactly the "isn't changing"
// bug this replaced). An SVG <text> element is instead rendered by the
// requesting browser's own engine using its system emoji font -- no
// network round trip, no silent-failure mode.
export const dynamic = "force-dynamic";

const ALL_EMOJI = MONTH_EMOJI.flat();

export async function GET() {
  const emoji = ALL_EMOJI[Math.floor(Math.random() * ALL_EMOJI.length)];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#4b6e52"/>
  <text x="16" y="17" text-anchor="middle" dominant-baseline="central" font-size="20">${emoji}</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
