"use client";

import { useEffect, useRef } from "react";
import speciesData from "../../../data/species.json";
import initialFaqs from "../../../data/faqs.json";
import { BODY_HTML } from "@/lib/bodyMarkup";
import { initMammalCalendarApp } from "@/lib/appScript";

export type SiteContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  wheelCaptionDefault: string;
  searchPlaceholder: string;
  emptyHintPrefix: string;
  emptyHintSuffix: string;
  faqEyebrow: string;
  faqHeading: string;
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
  return BODY_HTML.replace(/__EYEBROW__/g, escapeHtml(content.eyebrow))
    .replace(/__TITLE__/g, escapeHtml(content.title))
    .replace(/__SUBTITLE__/g, escapeHtml(content.subtitle))
    .replace(/__WHEEL_CAPTION_DEFAULT__/g, escapeHtml(content.wheelCaptionDefault))
    .replace(/__SEARCH_PLACEHOLDER__/g, escapeHtml(content.searchPlaceholder))
    .replace(/__EMPTY_HINT_PREFIX__/g, escapeHtml(content.emptyHintPrefix))
    .replace(/__EMPTY_HINT_SUFFIX__/g, escapeHtml(content.emptyHintSuffix))
    .replace(/__FAQ_EYEBROW__/g, escapeHtml(content.faqEyebrow))
    .replace(/__FAQ_HEADING__/g, escapeHtml(content.faqHeading));
}

export default function MammalCalendarApp({ content }: { content: SiteContent }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    initMammalCalendarApp(speciesData, initialFaqs);
  }, []);

  // The markup below is the same static structure the original artifact
  // rendered, with site-text tokens filled in from data/content.json;
  // initMammalCalendarApp wires it up imperatively after mount, exactly as
  // it did as a page-load <script> in the single-file version.
  return <div dangerouslySetInnerHTML={{ __html: renderBody(content) }} />;
}
