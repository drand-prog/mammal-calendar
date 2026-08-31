"use client";

import { useEffect, useRef } from "react";
import speciesData from "../../../data/bird/species.json";
import orderData from "../../../data/bird/orders.json";
import initialFaqs from "../../../data/bird/faqs.json";
import { BODY_HTML } from "@/lib/bodyMarkup";
import { initBirdCalendarApp } from "@/lib/appScript";

export type SiteContent = {
  title: string;
  searchLabel: string;
  searchPlaceholder: string;
  faqHeading: string;
  browsePrompt: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Every token is substituted as HTML-escaped text, not raw markup -- an
// admin's "R&D" or a stray "<" should render literally, not corrupt the
// page or (worse) inject markup, even though this is a trusted, password-
// gated field rather than public user input.
function renderBody(content: SiteContent): string {
  return BODY_HTML.replace(/__TITLE__/g, escapeHtml(content.title))
    .replace(/__SEARCH_LABEL__/g, escapeHtml(content.searchLabel))
    .replace(/__SEARCH_PLACEHOLDER__/g, escapeHtml(content.searchPlaceholder))
    .replace(/__FAQ_HEADING__/g, escapeHtml(content.faqHeading))
    .replace(/__BROWSE_PROMPT__/g, escapeHtml(content.browsePrompt));
}

export default function BirdCalendarApp({ content }: { content: SiteContent }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    initBirdCalendarApp(speciesData, orderData, initialFaqs, content.browsePrompt);
  }, []);

  // The markup below is the same static structure the mammal app renders,
  // with site-text tokens filled in from data/content.json;
  // initBirdCalendarApp wires it up imperatively after mount.
  return <div dangerouslySetInnerHTML={{ __html: renderBody(content) }} />;
}
