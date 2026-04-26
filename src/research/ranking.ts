import { domainOf } from "./url.js";
import type { SourceCandidate } from "./types.js";

const REPUTABLE_SUFFIXES = [".gov", ".edu"];
const OFFICIAL_HINTS = ["docs.", "developer.", "github.com", "npmjs.com", "context7.com"];

export function scoreCandidate(candidate: SourceCandidate, originalQuery: string): number {
  const domain = domainOf(candidate.url);
  let score = candidate.score ?? 0;
  if (candidate.sourceType === "context7") score += 25;
  if (candidate.sourceType === "github") score += 15;
  if (OFFICIAL_HINTS.some((hint) => domain.includes(hint))) score += 15;
  if (REPUTABLE_SUFFIXES.some((suffix) => domain.endsWith(suffix))) score += 10;
  const haystack = `${candidate.title} ${candidate.snippet}`.toLowerCase();
  for (const token of originalQuery.toLowerCase().split(/\s+/).filter((token) => token.length > 3)) {
    if (haystack.includes(token)) score += 2;
  }
  return score;
}
