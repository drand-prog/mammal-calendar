import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

function loadTitleLetter(): string {
  const filePath = path.join(process.cwd(), "..", "..", "data", "content.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const content = JSON.parse(raw) as { title?: string };
  const title = (content.title || "").trim();
  return title ? title.charAt(0).toUpperCase() : "M";
}

// The favicon is just the page title's first letter, so it stays in sync
// with whatever the admin panel sets data/content.json's "title" field to.
export default function Icon() {
  const letter = loadTitleLetter();
  return new ImageResponse(
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
          color: "#f8f8f2",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
        }}
      >
        {letter}
      </div>
    ),
    { ...size }
  );
}
