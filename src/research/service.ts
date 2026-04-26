import type { AppConfig } from "../config.js";
import { BraveProvider } from "../providers/brave.js";
import { Context7Provider } from "../providers/context7.js";
import { fetchCleanText } from "../providers/fetcher.js";
import { GitHubProvider } from "../providers/github.js";
import type { SearchProvider } from "../providers/types.js";
import { ResearchDb } from "../storage/db.js";
import { addSeconds, nowIso, secondsUntil } from "../utils/time.js";
import { budgetForDepth } from "./budget.js";
import { expandQueries } from "./queryExpansion.js";
import { scoreCandidate } from "./ranking.js";
import { buildReport } from "./report.js";
import type {
  ProviderRateLimitError,
  ResearchDepth,
  ResearchJob,
  ResearchStartInput,
  SourceCandidate,
  SourceType
} from "./types.js";

export class ResearchService {
  readonly scheduler: ResearchScheduler;

  private constructor(
    readonly db: ResearchDb,
    readonly config: AppConfig,
    private readonly autoRun = true
  ) {
    const providers = new Map<SourceType, SearchProvider>([
      ["web", new BraveProvider(config.braveApiKey, db)],
      ["github", new GitHubProvider(config.githubToken, db)],
      ["context7", new Context7Provider(config.context7ApiKey)]
    ]);
    this.scheduler = new ResearchScheduler(db, providers);
  }

  static async create(config: AppConfig, options: { autoRun?: boolean } = {}): Promise<ResearchService> {
    const db = await ResearchDb.open(config.dbPath);
    const service = new ResearchService(db, config, options.autoRun ?? true);
    if (service.autoRun) {
      service.scheduler.start();
    }
    return service;
  }

  start(input: ResearchStartInput): ResearchJob & { job_id: string; estimated_budget: ReturnType<typeof budgetForDepth> } {
    const depth = input.depth ?? this.config.defaultDepth;
    const budget = budgetForDepth(depth);
    const sourceTypes = normalizeSourceTypes(input.source_types ?? this.config.defaultSourceTypes);
    const job = this.db.createJob({
      query: input.query,
      depth,
      sourceTypes,
      maxSources: input.max_sources,
      durationMinutes: input.duration_minutes
    });
    const queries = expandQueries(input.query, depth).slice(0, budget.queryLimit);
    for (const query of queries) {
      for (const provider of sourceTypes) {
        this.db.addQuery(job.id, provider, query);
      }
    }
    this.db.saveAfterBatch();
    this.db.addEvent(job.id, "info", "research job started", { sourceTypes, depth });
    if (this.autoRun) {
      this.scheduler.kick();
    }
    return { ...job, job_id: job.id, estimated_budget: { ...budget, maxSources: job.maxSources, durationMinutes: job.durationMinutes } };
  }

  status(jobId: string): Record<string, unknown> {
    const job = this.db.getJob(jobId);
    if (!job) {
      return { error: "not_found", job_id: jobId };
    }
    return {
      job_id: job.id,
      status: job.status,
      job,
      progress: this.db.counts(jobId),
      next_check_after_seconds: job.nextRunAt ? secondsUntil(new Date(job.nextRunAt)) : job.nextCheckAfterSeconds
    };
  }

  report(jobId: string, format: "markdown" | "json" | "toon" = "markdown"): string | Record<string, unknown> {
    const job = this.db.getJob(jobId);
    if (!job) {
      return { error: "not_found", job_id: jobId };
    }
    const report = job.reportMarkdown || buildReport(this.db, job);
    return format === "markdown" ? report : { job, report, progress: this.db.counts(jobId) };
  }

  close(): void {
    this.scheduler.stop();
    this.db.close();
  }
}

export class ResearchScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly db: ResearchDb,
    private readonly providers: Map<SourceType, SearchProvider>
  ) {}

  start(): void {
    this.resumeJobs();
    this.timer = setInterval(() => this.kick(), 5000);
    this.timer.unref?.();
    this.kick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  kick(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    void this.processDueJobs().finally(() => {
      this.running = false;
    });
  }

  private resumeJobs(): void {
    for (const job of this.db.activeJobs()) {
      if (job.status === "running") {
        this.db.updateJob(job.id, { status: "waiting", nextRunAt: nowIso() });
      }
    }
  }

  private async processDueJobs(): Promise<void> {
    for (const job of this.db.dueJobs()) {
      await this.processJob(job);
    }
  }

  private async processJob(job: ResearchJob): Promise<void> {
    const fresh = this.db.getJob(job.id);
    if (!fresh || fresh.status === "cancelled") {
      return;
    }
    const startedAt = fresh.startedAt ?? nowIso();
    this.db.updateJob(fresh.id, { status: "running", startedAt, nextRunAt: null });
    try {
      await this.runSearchCycle(fresh);
      await this.runFetchCycle(fresh);
      const latest = this.db.getJob(fresh.id)!;
      const counts = this.db.counts(fresh.id);
      const pendingQueries = this.db.pendingQueries(fresh.id, 1).length;
      const pendingSources = this.db.pendingSources(fresh.id, 1).length;
      const enoughFetchedSources = Number(counts.sources_fetched ?? 0) >= latest.maxSources;
      const noMoreWork = pendingQueries === 0 && pendingSources === 0;
      const done = enoughFetchedSources || noMoreWork;
      if (done) {
        const completedAt = nowIso();
        const completedJob: ResearchJob = { ...latest, status: "completed", completedAt, nextRunAt: null };
        const reportMarkdown = buildReport(this.db, completedJob);
        this.db.updateJob(latest.id, {
          status: "completed",
          completedAt,
          reportMarkdown,
          nextRunAt: null
        });
      } else {
        this.db.updateJob(latest.id, {
          status: "waiting",
          nextRunAt: addSeconds(new Date(), latest.nextCheckAfterSeconds).toISOString()
        });
      }
    } catch (error) {
      this.db.addEvent(fresh.id, "error", "job cycle failed", { error: errorMessage(error) });
      this.db.updateJob(fresh.id, {
        status: "waiting",
        nextRunAt: addSeconds(new Date(), fresh.nextCheckAfterSeconds).toISOString(),
        error: errorMessage(error)
      });
    }
  }

  private async runSearchCycle(job: ResearchJob): Promise<void> {
    const budget = budgetForDepth(job.depth);
    const queries = this.db.pendingQueries(job.id, Math.max(5, Math.min(budget.queryLimit, 12)));
    for (const query of queries) {
      const provider = this.providers.get(query.provider);
      if (!provider) {
        this.db.updateQuery(query.id, "failed", `missing provider: ${query.provider}`);
        continue;
      }
      try {
        this.db.updateQuery(query.id, "running");
        const result = await provider.search(query.query, {
          maxResults: budget.searchResultsPerQuery,
          language: undefined
        });
        const ranked = result.candidates
          .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, job.query) }))
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        const counts = this.db.counts(job.id);
        const remainingSources = Math.max(0, job.maxSources - Number(counts.sources_total ?? 0));
        for (const candidate of ranked.slice(0, Math.min(budget.searchResultsPerQuery, remainingSources))) {
          this.db.insertCandidate(job.id, limitCandidate(candidate));
        }
        this.db.updateQuery(query.id, "completed");
        this.db.saveAfterBatch();
        if (remainingSources <= 0) {
          return;
        }
      } catch (error) {
        if (isRateLimit(error)) {
          this.db.updateQuery(query.id, "rate_limited", error.message);
          this.db.updateJob(job.id, { status: "waiting", nextRunAt: error.retryAt.toISOString() });
          continue;
        }
        this.db.updateQuery(query.id, "failed", errorMessage(error));
      }
    }
  }

  private async runFetchCycle(job: ResearchJob): Promise<void> {
    const budget = budgetForDepth(job.depth);
    const sources = this.db.pendingSources(job.id, budget.fetchesPerCycle);
    for (const source of sources) {
      this.db.updateSource(source.id, "fetching");
      const result = await fetchCleanText(source.url);
      if (result.status === "fetched") {
        const chunkCount = this.db.insertChunks(job.id, source.id, result.text, {
          url: source.url,
          title: source.title,
          source_type: source.sourceType
        });
        this.db.insertFetch(source.id, "fetched", {
          httpStatus: result.httpStatus,
          content: result.text,
          metadata: { ...result.metadata, chunks: chunkCount }
        });
        this.db.updateSource(source.id, "fetched", { fetchedAt: nowIso() });
      } else {
        this.db.insertFetch(source.id, result.status, {
          httpStatus: result.httpStatus,
          error: result.error,
          metadata: result.metadata
        });
        this.db.updateSource(source.id, result.status, { error: result.error });
      }
    }
  }
}

function normalizeSourceTypes(value: SourceType[]): SourceType[] {
  const allowed = new Set<SourceType>(["web", "github", "context7"]);
  const normalized = value.filter((item): item is SourceType => allowed.has(item));
  return normalized.length ? [...new Set(normalized)] : ["web", "github", "context7"];
}

function limitCandidate(candidate: SourceCandidate): SourceCandidate {
  return {
    ...candidate,
    content: candidate.content ? candidate.content.slice(0, 200_000) : undefined,
    snippet: candidate.snippet?.slice(0, 1000)
  };
}

function isRateLimit(error: unknown): error is ProviderRateLimitError {
  return typeof error === "object" && error !== null && "retryAt" in error && "provider" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
