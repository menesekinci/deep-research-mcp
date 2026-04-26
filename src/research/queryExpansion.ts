import type { ResearchDepth } from "./types.js";

export function expandQueries(query: string, depth: ResearchDepth): string[] {
  const base = query.trim();
  const compact = compactQueries(base);
  const core = compact[0] ?? base;
  const variants = [
    ...compact,
    `${core} official documentation`,
    `${core} GitHub repository`,
    `${core} examples`,
    `${core} best practices`,
    `${core} performance`,
    `${core} implementation guide`,
    `${core} API reference`,
    base,
    `${base} troubleshooting`,
    `${base} changelog release notes`,
    `${base} security limitations`,
    `${base} rate limits pricing`
  ];
  if (depth !== "standard") {
    variants.push(
      `${base} architecture`,
      `${base} implementation guide`,
      `${base} production setup`,
      `${base} comparison alternatives`,
      `${base} issues discussions`
    );
  }
  if (depth === "exhaustive") {
    variants.push(
      `${base} migration guide`,
      `${base} benchmark`,
      `${base} FAQ`,
      `${base} known bugs`,
      `${base} roadmap`
    );
  }
  return [...new Set(variants.map((item) => item.trim()).filter(Boolean))];
}

function compactQueries(query: string): string[] {
  const important = query
    .replace(/[^\p{L}\p{N}.+#-]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token.toLowerCase()));
  if (important.length === 0) {
    return [query];
  }
  const head = important[0];
  const variants = [
    important.slice(0, 2).join(" "),
    important.slice(0, 3).join(" "),
    ...important.slice(1, 7).map((token) => `${head} ${token}`),
    important.slice(0, 6).join(" ")
  ];
  return [...new Set(variants.map((item) => item.trim()).filter((item) => item.length > 0))];
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "api",
  "architecture",
  "asset",
  "best",
  "controls",
  "development",
  "engine",
  "examples",
  "for",
  "guide",
  "how",
  "implementation",
  "in",
  "of",
  "pipeline",
  "practices",
  "the",
  "to",
  "web",
  "with"
]);
