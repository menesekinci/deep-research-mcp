import type { SearchProvider, ProviderSearchOptions, ProviderSearchResult } from "./types.js";
import { ProviderRateLimitError } from "../research/types.js";
import { parseRateLimitHeaders } from "../utils/rateLimit.js";
import type { ResearchDb } from "../storage/db.js";

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  profile?: { name?: string };
}

export class BraveProvider implements SearchProvider {
  readonly sourceType = "web" as const;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly db: ResearchDb
  ) {}

  async search(query: string, options: ProviderSearchOptions): Promise<ProviderSearchResult> {
    if (!this.apiKey) {
      return { candidates: [] };
    }
    const nextAllowed = this.db.providerNextAllowedAt("brave");
    if (nextAllowed && nextAllowed > new Date()) {
      throw new ProviderRateLimitError("brave", nextAllowed);
    }

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.max(1, Math.min(options.maxResults, 20))));
    if (options.language) {
      url.searchParams.set("search_lang", options.language);
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.apiKey
      }
    });
    const rate = parseRateLimitHeaders(response.headers);
    this.db.markRateLimit("brave", {
      limit: rate.limit,
      remaining: rate.remaining,
      reset: rate.reset,
      nextAllowedAt: rate.nextAllowedAt
    });
    if (response.status === 429) {
      throw new ProviderRateLimitError("brave", rate.nextAllowedAt ?? new Date(Date.now() + 1000));
    }
    if (!response.ok) {
      throw new Error(`Brave API failed: ${response.status}`);
    }
    const data = (await response.json()) as { web?: { results?: BraveWebResult[] } };
    const results = data.web?.results ?? [];
    return {
      candidates: results
        .filter((item) => item.url)
        .map((item) => ({
          sourceType: "web" as const,
          provider: "brave",
          url: item.url!,
          title: item.title || item.profile?.name || item.url!,
          snippet: item.description || "",
          score: 0,
          metadata: { age: item.age, query }
        }))
    };
  }
}
