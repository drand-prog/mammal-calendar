import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import "./globals.css";

function loadTitle(): string {
  const filePath = path.join(process.cwd(), "..", "..", "data", "bird", "content.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const content = JSON.parse(raw) as { title?: string };
  return content.title || "The Bird Ephemeris";
}

export const metadata: Metadata = {
  title: loadTitle(),
  description:
    "Search any bird by common or scientific name to find the day, hour, and minute it's assigned — month by taxonomic order, date and time by the letters of its own name.",
  // Points at the /api/favicon route rather than the app/icon.tsx metadata-
  // image convention -- see that route's comment for why.
  icons: { icon: { url: "/api/favicon", type: "image/svg+xml" } },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Space+Mono:wght@400;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
