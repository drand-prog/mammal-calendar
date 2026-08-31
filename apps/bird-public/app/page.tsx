import fs from "node:fs";
import path from "node:path";
import BirdCalendarApp, { type SiteContent } from "@/components/BirdCalendarApp";

function loadContent(): SiteContent {
  const filePath = path.join(process.cwd(), "..", "..", "data", "bird", "content.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SiteContent;
}

export default function Page() {
  const content = loadContent();
  return <BirdCalendarApp content={content} />;
}
