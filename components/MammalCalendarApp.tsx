"use client";

import { useEffect, useRef } from "react";
import speciesData from "@/data/species.json";
import initialFaqs from "@/data/faqs.json";
import { BODY_HTML } from "@/lib/bodyMarkup";
import { initMammalCalendarApp } from "@/lib/appScript";

export default function MammalCalendarApp() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    initMammalCalendarApp(speciesData, initialFaqs);
  }, []);

  // The markup below is the same static structure the original artifact
  // rendered; initMammalCalendarApp wires it up imperatively after mount,
  // exactly as it did as a page-load <script> in the single-file version.
  return <div dangerouslySetInnerHTML={{ __html: BODY_HTML }} />;
}
