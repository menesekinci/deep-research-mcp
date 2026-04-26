export type ResearchDepth = "standard" | "deep" | "exhaustive";
export type SourceType = "web" | "github" | "context7";
export type JobStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
export type SourceStatus = "discovered" | "fetching" | "fetched" | "failed" | "skipped";
export type QueryStatus = "pending" | "running" | "completed" | "failed" | "rate_limited";

export interface ResearchStartInput {
  query: string;
  depth?: ResearchDepth;
  source_types?: SourceType[];
  max_sources?: number;
  duration_minutes?: number;
  domains?: string[];
  recency?: string;
  language?: string;
}

export interface ResearchJob {
  id: string;
  query: string;
  depth: ResearchDepth;
  status: JobStatus;
  sourceTypes: SourceType[];
  maxSources: number;
  durationMinutes: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  nextRunAt?: string | null;
  nextCheckAfterSeconds: number;
  reportMarkdown?: string | null;
  error?: string | null;
}

export interface ResearchQuery {
  id: string;
  jobId: string;
  provider: SourceType;
  query: string;
  status: QueryStatus;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
}

export interface SourceCandidate {
  sourceType: SourceType;
  provider: string;
  url: string;
  title: string;
  snippet?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  content?: string;
}

export interface ResearchSource {
  id: string;
  jobId: string;
  sourceType: SourceType;
  provider: string;
  url: string;
  normalizedUrl: string;
  title: string;
  snippet: string;
  status: SourceStatus;
  score: number;
  metadata: Record<string, unknown>;
  fetchedAt?: string | null;
  error?: string | null;
}

export interface ResearchChunk {
  id: string;
  jobId: string;
  sourceId: string;
  chunkIndex: number;
  text: string;
  tokenEstimate: number;
  metadata: Record<string, unknown>;
  contentHash: string;
  createdAt: string;
}

export interface SearchProvider {
  readonly sourceType: SourceType;
  search(query: string, options: ProviderSearchOptions): Promise<ProviderSearchResult>;
}

export interface ProviderSearchOptions {
  maxResults: number;
  language?: string;
  domains?: string[];
  recency?: string;
}

export interface ProviderSearchResult {
  candidates: SourceCandidate[];
  rateLimitedUntil?: Date;
}

export class ProviderRateLimitError extends Error {
  readonly retryAt: Date;
  readonly provider: string;

  constructor(provider: string, retryAt: Date, message = "provider rate limited") {
    super(message);
    this.name = "ProviderRateLimitError";
    this.provider = provider;
    this.retryAt = retryAt;
  }
}
