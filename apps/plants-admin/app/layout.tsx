import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import "./globals.css";

function loadTitle(): string {
  const filePath = path.join(process.cwd(), "..", "..", "data", "plants", "content.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const content = JSON.parse(raw) as { title?: string };
  return content.title || "The Flowering Plant Ephemeris";
}

// Matches the public site's tab title exactly (same data/content.json
// field the public app's layout.tsx reads), so the two are never out of
// sync with each other.
export const metadata: Metadata = {
  title: loadTitle(),
  description: "Edit the Flowering Plant Ephemeris site text, group→month assignments, and FAQs.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Space+Mono:wght@400;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
