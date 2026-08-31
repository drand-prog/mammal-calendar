import fs from "node:fs";
import path from "node:path";
import AdminEditor, { type ContentFields, type Faq, type OrderEntry } from "@/components/AdminEditor";

function loadJson<T>(relativePath: string): T {
  const filePath = path.join(process.cwd(), "..", "..", relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

export default function Page() {
  const content = loadJson<ContentFields>("data/bird/content.json");
  const faqs = loadJson<Faq[]>("data/bird/faqs.json");
  const orders = loadJson<OrderEntry[]>("data/bird/orders.json");
  return <AdminEditor initialContent={content} initialFaqs={faqs} initialOrders={orders} />;
}
