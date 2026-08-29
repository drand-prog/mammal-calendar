import fs from "node:fs";
import path from "node:path";
import MammalCalendarApp, { type SiteContent } from "@/components/MammalCalendarApp";

function loadContent(): SiteContent {
  const filePath = path.join(process.cwd(), "..", "..", "data", "content.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SiteContent;
}

export default function Page() {
  const content = loadContent();
  return <MammalCalendarApp content={content} />;
}
