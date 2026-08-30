import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { MONTH_EMOJI } from "@/lib/monthEmoji";

// A plain API route rather than the app/icon.tsx metadata-image convention:
// Next forces that convention's response to carry a year-long "immutable"
// cache-control alongside whatever headers we set ourselves, which would
// defeat rotating on every load. A regular route handler doesn't get that
// treatment, so our own no-store header actually wins.
export const dynamic = "force-dynamic";

const ALL_EMOJI = MONTH_EMOJI.flat();

export async function GET() {
  const emoji = ALL_EMOJI[Math.floor(Math.random() * ALL_EMOJI.length)];
  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4b6e52",
          borderRadius: 6,
          fontSize: 22,
        }}
      >
        {emoji}
      </div>
    ),
    { width: 32, height: 32 }
  );
  const buffer = await image.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
