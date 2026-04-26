import * as cheerio from "cheerio";

import { isHttpUrl } from "../research/url.js";

export interface FetchResult {
  status: "fetched" | "failed" | "skipped";
  text: string;
  httpStatus?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export async function fetchCleanText(url: string): Promise<FetchResult> {
  if (!isHttpUrl(url)) {
    return { status: "skipped", text: "", error: "non-http source" };
  }
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "codex-deep-research-mcp/0.1",
        Accept: "text/html, text/plain, application/xhtml+xml"
      },
      redirect: "follow"
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      return { status: "failed", text: "", httpStatus: response.status, error: `HTTP ${response.status}` };
    }
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
      return { status: "skipped", text: "", httpStatus: response.status, error: `unsupported content-type: ${contentType}` };
    }
    const body = await response.text();
    const text = contentType.includes("html") || contentType.includes("xhtml") ? htmlToText(body) : normalizeText(body);
    if (text.length < 200) {
      return { status: "skipped", text, httpStatus: response.status, error: "content too short" };
    }
    return { status: "fetched", text, httpStatus: response.status, metadata: { content_type: contentType } };
  } catch (error) {
    return { status: "failed", text: "", error: error instanceof Error ? error.message : String(error) };
  }
}

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, header, footer, nav, aside, form").remove();
  const main = $("main").text() || $("article").text() || $("body").text();
  return normalizeText(main);
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\u0000/g, "").trim();
}
