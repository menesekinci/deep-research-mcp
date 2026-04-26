import type { ProviderSearchOptions, ProviderSearchResult, SearchProvider, SourceCandidate } from "./types.js";
import { ProviderRateLimitError } from "../research/types.js";
import type { ResearchDb } from "../storage/db.js";

interface GitHubRepoItem {
  full_name: string;
  html_url: string;
  description?: string;
  stargazers_count?: number;
  updated_at?: string;
  default_branch?: string;
}

export class GitHubProvider implements SearchProvider {
  readonly sourceType = "github" as const;

  constructor(
    private readonly token: string | undefined,
    private readonly db: ResearchDb
  ) {}

  async search(query: string, options: ProviderSearchOptions): Promise<ProviderSearchResult> {
    const nextAllowed = this.db.providerNextAllowedAt("github");
    if (nextAllowed && nextAllowed > new Date()) {
      throw new ProviderRateLimitError("github", nextAllowed);
    }
    const candidates: SourceCandidate[] = [];
    const max = Math.max(1, Math.min(options.maxResults, 10));
    const repoData = await this.githubJson<{ items?: GitHubRepoItem[] }>(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&per_page=${max}`
    );
    for (const repo of repoData.items ?? []) {
      const readme = await this.tryReadme(repo.full_name);
      candidates.push({
        sourceType: "github",
        provider: "github",
        url: repo.html_url,
        title: repo.full_name,
        snippet: repo.description || "",
        content: readme || undefined,
        score: repo.stargazers_count ? Math.log10(repo.stargazers_count + 1) * 5 : 0,
        metadata: { stars: repo.stargazers_count, updated_at: repo.updated_at, default_branch: repo.default_branch }
      });
    }
    return { candidates };
  }

  private async githubJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "deep-research-mcp",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });
    this.updateRateLimit(response);
    if (response.status === 403 || response.status === 429) {
      const reset = response.headers.get("x-ratelimit-reset");
      const retryAt = reset ? new Date(Number(reset) * 1000) : new Date(Date.now() + 60_000);
      throw new ProviderRateLimitError("github", retryAt, `GitHub rate limited: ${response.status}`);
    }
    if (!response.ok) {
      return {} as T;
    }
    return (await response.json()) as T;
  }

  private async tryReadme(fullName: string): Promise<string | null> {
    try {
      const data = await this.githubJson<{ content?: string; encoding?: string }>(
        `https://api.github.com/repos/${fullName}/readme`
      );
      if (data.encoding === "base64" && data.content) {
        return Buffer.from(data.content, "base64").toString("utf8");
      }
    } catch {
      return null;
    }
    return null;
  }

  private updateRateLimit(response: Response): void {
    const remaining = response.headers.get("x-ratelimit-remaining") ?? undefined;
    const limit = response.headers.get("x-ratelimit-limit") ?? undefined;
    const reset = response.headers.get("x-ratelimit-reset") ?? undefined;
    const nextAllowedAt = remaining === "0" && reset ? new Date(Number(reset) * 1000) : undefined;
    this.db.markRateLimit("github", { limit, remaining, reset, nextAllowedAt });
  }
}
