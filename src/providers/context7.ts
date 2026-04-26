import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { ProviderSearchOptions, ProviderSearchResult, SearchProvider, SourceCandidate } from "./types.js";

const execFileAsync = promisify(execFile);

interface Context7Library {
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  sourceReputation?: string;
  totalSnippets?: number;
}

export class Context7Provider implements SearchProvider {
  readonly sourceType = "context7" as const;

  constructor(private readonly apiKey: string | undefined) {}

  async search(query: string, options: ProviderSearchOptions): Promise<ProviderSearchResult> {
    const libraries = await this.findLibraries(query);
    const candidates: SourceCandidate[] = [];
    for (const library of libraries.slice(0, Math.min(3, options.maxResults))) {
      const id = library.id;
      if (!id) {
        continue;
      }
      const docs = await this.getDocs(id, query);
      candidates.push({
        sourceType: "context7",
        provider: "context7",
        url: `context7://${id}`,
        title: library.title || library.name || id,
        snippet: library.description || "",
        content: docs || library.description || "",
        score: Number(library.totalSnippets || 0) / 100 + 20,
        metadata: {
          context7_id: id,
          source_reputation: library.sourceReputation,
          snippets: library.totalSnippets
        }
      });
    }
    return { candidates };
  }

  private async findLibraries(query: string): Promise<Context7Library[]> {
    try {
      const args = ["-y", "ctx7", "library", query, "--json"];
      const env = this.apiKey ? { ...process.env, CONTEXT7_API_KEY: this.apiKey } : process.env;
      const { stdout } = await execFileAsync("npx", args, { timeout: 30000, env });
      const parsed = JSON.parse(stdout) as unknown;
      return Array.isArray(parsed) ? (parsed as Context7Library[]) : [];
    } catch {
      return [];
    }
  }

  private async getDocs(libraryId: string, query: string): Promise<string | null> {
    try {
      const args = ["-y", "ctx7", "docs", libraryId, query];
      const env = this.apiKey ? { ...process.env, CONTEXT7_API_KEY: this.apiKey } : process.env;
      const { stdout } = await execFileAsync("npx", args, { timeout: 30000, env });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
}
