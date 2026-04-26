import type { ResearchDepth } from "./types.js";

export function expandQueries(query: string, depth: ResearchDepth): string[] {
  const base = query.trim();
  const variants = [
    base,
    `${base} official documentation`,
    `${base} GitHub repository`,
    `${base} examples`,
    `${base} troubleshooting`,
    `${base} best practices`,
    `${base} changelog release notes`,
    `${base} API reference`,
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
