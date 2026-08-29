import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Mammal Ephemeris",
  description:
    "Search any mammal by common or scientific name to find the day, hour, and minute the wheel assigns it — month by clade, date and time by the letters of its own name.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=Libre+Franklin:ital,wght@0,400;0,500;0,600;0,700;1,500&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
