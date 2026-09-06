import fs from "node:fs";
import path from "node:path";
import AnimalCalendarApp, { type SiteContent } from "@/components/AnimalCalendarApp";

function loadContent(): SiteContent {
  const filePath = path.join(process.cwd(), "..", "..", "data", "animals", "content.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SiteContent;
}

export default function Page() {
  const content = loadContent();
  return <AnimalCalendarApp content={content} />;
}
