import fs from "node:fs";
import path from "node:path";
import ReptileCalendarApp, { type SiteContent } from "@/components/ReptileCalendarApp";

function loadContent(): SiteContent {
  const filePath = path.join(process.cwd(), "..", "..", "data", "reptile", "content.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as SiteContent;
}

export default function Page() {
  const content = loadContent();
  return <ReptileCalendarApp content={content} />;
}
