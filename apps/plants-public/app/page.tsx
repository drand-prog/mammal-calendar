import fs from "node:fs";
import path from "node:path";
import PlantCalendarApp, { type SiteContent } from "@/components/PlantCalendarApp";

function loadContent(): SiteContent {
  const filePath = path.join(process.cwd(), "..", "..", "data", "plants", "content.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SiteContent;
}

export default function Page() {
  const content = loadContent();
  return <PlantCalendarApp content={content} />;
}
