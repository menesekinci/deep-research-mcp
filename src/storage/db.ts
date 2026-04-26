import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import initSqlJs, { type Database, type SqlValue } from "sql.js";

import type {
  JobStatus,
  QueryStatus,
  ResearchChunk,
  ResearchDepth,
  ResearchJob,
  ResearchQuery,
  ResearchSource,
  SourceCandidate,
  SourceStatus,
  SourceType
} from "../research/types.js";
import { budgetForDepth, type ResearchBudget } from "../research/budget.js";
import { newId, sha256 } from "../utils/hash.js";
import { nowIso } from "../utils/time.js";
import { normalizeUrl } from "../research/url.js";
import { SCHEMA_SQL } from "./schema.js";

const require = createRequire(import.meta.url);

export class ResearchDb {
  private constructor(
    private readonly db: Database,
    private readonly dbPath: string
  ) {}

  static async open(dbPath: string): Promise<ResearchDb> {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const SQL = await initSqlJs({
      locateFile: (file) => require.resolve(`sql.js/dist/${file}`)
    });
    const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
    const instance = new ResearchDb(db, dbPath);
    instance.exec(SCHEMA_SQL, false);
    instance.persist();
    return instance;
  }

  close(): void {
    this.persist();
    this.db.close();
  }

  exec(sql: string, persist = true): void {
    this.db.exec(sql);
    if (persist) {
      this.persist();
    }
  }

  run(sql: string, params: unknown[] = [], persist = true): void {
    const stmt = this.db.prepare(sql);
    try {
      stmt.run(params as SqlValue[]);
    } finally {
      stmt.free();
    }
    if (persist) {
      this.persist();
    }
  }

  all<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    const rows: T[] = [];
    try {
      stmt.bind(params as SqlValue[]);
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
    } finally {
      stmt.free();
    }
    return rows;
  }

  get<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  persist(): void {
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  createJob(input: {
    query: string;
    depth: ResearchDepth;
    sourceTypes: SourceType[];
    maxSources?: number;
    durationMinutes?: number;
  }): ResearchJob {
    const budget = budgetForDepth(input.depth);
    const maxSources = input.maxSources ?? budget.maxSources;
    const durationMinutes = input.durationMinutes ?? budget.durationMinutes;
    const id = newId("job");
    const now = nowIso();
    this.run(
      `INSERT INTO research_jobs (
        id, query, depth, status, source_types_json, max_sources, duration_minutes,
        created_at, updated_at, next_run_at, next_check_after_seconds, estimated_budget_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.query,
        input.depth,
        "queued",
        JSON.stringify(input.sourceTypes),
        maxSources,
        durationMinutes,
        now,
        now,
        now,
        budget.nextCheckAfterSeconds,
        JSON.stringify({ ...budget, maxSources, durationMinutes })
      ]
    );
    return this.getJob(id)!;
  }

  addQuery(jobId: string, provider: SourceType, query: string): void {
    const now = nowIso();
    this.run(
      `INSERT INTO research_queries (id, job_id, provider, query, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId("query"), jobId, provider, query, "pending", now, now],
      false
    );
  }

  saveAfterBatch(): void {
    this.persist();
  }

  getJob(jobId: string): ResearchJob | undefined {
    const row = this.get<Record<string, unknown>>("SELECT * FROM research_jobs WHERE id = ?", [jobId]);
    return row ? mapJob(row) : undefined;
  }

  listJobs(statuses?: JobStatus[], dueOnly = false): ResearchJob[] {
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    if (statuses?.length) {
      where += ` AND status IN (${statuses.map(() => "?").join(",")})`;
      params.push(...statuses);
    }
    if (dueOnly) {
      where += " AND (next_run_at IS NULL OR next_run_at <= ?)";
      params.push(nowIso());
    }
    return this.all<Record<string, unknown>>(
      `SELECT * FROM research_jobs ${where} ORDER BY created_at ASC LIMIT 20`,
      params
    ).map(mapJob);
  }

  activeJobs(): ResearchJob[] {
    return this.listJobs(["queued", "running", "waiting"], false);
  }

  dueJobs(): ResearchJob[] {
    return this.listJobs(["queued", "running", "waiting"], true);
  }

  updateJob(jobId: string, fields: Partial<Pick<ResearchJob, "status" | "reportMarkdown" | "error">> & { nextRunAt?: string | null; completedAt?: string | null; startedAt?: string | null }): void {
    const current = this.getJob(jobId);
    if (!current) {
      return;
    }
    this.run(
      `UPDATE research_jobs
       SET status = ?, report_markdown = ?, error = ?, next_run_at = ?, completed_at = ?, started_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        fields.status ?? current.status,
        fields.reportMarkdown ?? current.reportMarkdown ?? null,
        fields.error ?? current.error ?? null,
        fields.nextRunAt === undefined ? current.nextRunAt ?? null : fields.nextRunAt,
        fields.completedAt === undefined ? current.completedAt ?? null : fields.completedAt,
        fields.startedAt === undefined ? current.startedAt ?? null : fields.startedAt,
        nowIso(),
        jobId
      ]
    );
  }

  pendingQueries(jobId: string, limit: number): ResearchQuery[] {
    return this.all<Record<string, unknown>>(
      `SELECT * FROM research_queries
       WHERE job_id = ? AND status IN ('pending', 'rate_limited')
       ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at ASC
       LIMIT ?`,
      [jobId, limit]
    ).map(mapQuery);
  }

  updateQuery(id: string, status: QueryStatus, error?: string): void {
    this.run("UPDATE research_queries SET status = ?, error = ?, updated_at = ? WHERE id = ?", [
      status,
      error ?? null,
      nowIso(),
      id
    ]);
  }

  insertCandidate(jobId: string, candidate: SourceCandidate): string | undefined {
    const normalized = normalizeUrl(candidate.url);
    const id = newId("src");
    const now = nowIso();
    this.run(
      `INSERT OR IGNORE INTO research_sources (
        id, job_id, source_type, provider, url, normalized_url, title, snippet,
        status, score, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        jobId,
        candidate.sourceType,
        candidate.provider,
        candidate.url,
        normalized,
        candidate.title || candidate.url,
        candidate.snippet || "",
        candidate.content ? "fetched" : "discovered",
        candidate.score ?? 0,
        JSON.stringify(candidate.metadata || {}),
        now,
        now
      ],
      false
    );
    const source = this.get<Record<string, unknown>>(
      "SELECT id FROM research_sources WHERE job_id = ? AND normalized_url = ?",
      [jobId, normalized]
    );
    if (candidate.content && source?.id) {
      this.insertChunks(jobId, String(source.id), candidate.content, { provider: candidate.provider });
    }
    return source?.id ? String(source.id) : undefined;
  }

  pendingSources(jobId: string, limit: number): ResearchSource[] {
    return this.all<Record<string, unknown>>(
      `SELECT * FROM research_sources WHERE job_id = ? AND status = 'discovered' ORDER BY score DESC, created_at ASC LIMIT ?`,
      [jobId, limit]
    ).map(mapSource);
  }

  updateSource(id: string, status: SourceStatus, fields: { error?: string; fetchedAt?: string | null } = {}): void {
    this.run(
      "UPDATE research_sources SET status = ?, error = ?, fetched_at = ?, updated_at = ? WHERE id = ?",
      [status, fields.error ?? null, fields.fetchedAt ?? null, nowIso(), id]
    );
  }

  insertFetch(sourceId: string, status: string, fields: { httpStatus?: number; content?: string; error?: string; metadata?: Record<string, unknown> }): void {
    const content = fields.content ?? "";
    this.run(
      `INSERT INTO research_fetches (
        id, source_id, status, fetched_at, http_status, content_hash, content_bytes, error, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId("fetch"),
        sourceId,
        status,
        nowIso(),
        fields.httpStatus ?? null,
        content ? sha256(content) : null,
        Buffer.byteLength(content, "utf8"),
        fields.error ?? null,
        JSON.stringify(fields.metadata || {})
      ]
    );
  }

  insertChunks(jobId: string, sourceId: string, text: string, metadata: Record<string, unknown>): number {
    const { chunkText } = splitIntoChunks(text);
    let inserted = 0;
    chunkText.forEach((chunk, index) => {
      const hash = sha256(chunk);
      this.run(
        `INSERT OR IGNORE INTO research_chunks (
          id, job_id, source_id, chunk_index, text, token_estimate, metadata_json, content_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId("chunk"),
          jobId,
          sourceId,
          index,
          chunk,
          estimateTokens(chunk),
          JSON.stringify(metadata),
          hash,
          nowIso()
        ],
        false
      );
      if (this.db.getRowsModified() > 0) {
        inserted += 1;
      }
    });
    this.persist();
    return inserted;
  }

  chunksForJob(jobId: string, limit: number, query?: string): ResearchChunk[] {
    const params: unknown[] = [jobId];
    let where = "WHERE job_id = ?";
    if (query) {
      where += " AND lower(text) LIKE ?";
      params.push(`%${query.toLowerCase()}%`);
    }
    params.push(limit);
    return this.all<Record<string, unknown>>(
      `SELECT * FROM research_chunks ${where} ORDER BY token_estimate DESC LIMIT ?`,
      params
    ).map(mapChunk);
  }

  chunksForSource(sourceId: string, limit: number, offset: number): ResearchChunk[] {
    return this.all<Record<string, unknown>>(
      `SELECT * FROM research_chunks WHERE source_id = ? ORDER BY chunk_index ASC LIMIT ? OFFSET ?`,
      [sourceId, limit, offset]
    ).map(mapChunk);
  }

  sourcesForJob(jobId: string, filters: { sourceType?: SourceType; status?: SourceStatus; limit: number; offset: number }): ResearchSource[] {
    const params: unknown[] = [jobId];
    let where = "WHERE job_id = ?";
    if (filters.sourceType) {
      where += " AND source_type = ?";
      params.push(filters.sourceType);
    }
    if (filters.status) {
      where += " AND status = ?";
      params.push(filters.status);
    }
    params.push(filters.limit, filters.offset);
    return this.all<Record<string, unknown>>(
      `SELECT * FROM research_sources ${where} ORDER BY score DESC, created_at ASC LIMIT ? OFFSET ?`,
      params
    ).map(mapSource);
  }

  source(sourceId: string): ResearchSource | undefined {
    const row = this.get<Record<string, unknown>>("SELECT * FROM research_sources WHERE id = ?", [sourceId]);
    return row ? mapSource(row) : undefined;
  }

  counts(jobId: string): Record<string, number> {
    const rows = this.all<{ key: string; n: number }>(
      `SELECT 'queries_total' AS key, count(*) AS n FROM research_queries WHERE job_id = ?
       UNION ALL SELECT 'queries_completed', count(*) FROM research_queries WHERE job_id = ? AND status = 'completed'
       UNION ALL SELECT 'sources_total', count(*) FROM research_sources WHERE job_id = ?
       UNION ALL SELECT 'sources_fetched', count(*) FROM research_sources WHERE job_id = ? AND status = 'fetched'
       UNION ALL SELECT 'chunks_total', count(*) FROM research_chunks WHERE job_id = ?`,
      [jobId, jobId, jobId, jobId, jobId]
    );
    return Object.fromEntries(rows.map((row) => [row.key, Number(row.n)]));
  }

  markRateLimit(provider: string, headers: { limit?: string; remaining?: string; reset?: string; nextAllowedAt?: Date }): void {
    this.run(
      `INSERT INTO provider_rate_limits (provider, limit_header, remaining_header, reset_header, next_allowed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
         limit_header = excluded.limit_header,
         remaining_header = excluded.remaining_header,
         reset_header = excluded.reset_header,
         next_allowed_at = excluded.next_allowed_at,
         updated_at = excluded.updated_at`,
      [
        provider,
        headers.limit ?? null,
        headers.remaining ?? null,
        headers.reset ?? null,
        headers.nextAllowedAt?.toISOString() ?? null,
        nowIso()
      ]
    );
  }

  providerNextAllowedAt(provider: string): Date | undefined {
    const row = this.get<{ next_allowed_at?: string }>(
      "SELECT next_allowed_at FROM provider_rate_limits WHERE provider = ?",
      [provider]
    );
    return row?.next_allowed_at ? new Date(row.next_allowed_at) : undefined;
  }

  addEvent(jobId: string | null, level: string, message: string, metadata: Record<string, unknown> = {}): void {
    this.run(
      "INSERT INTO research_events (id, job_id, level, message, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [newId("evt"), jobId, level, message, JSON.stringify(metadata), nowIso()]
    );
  }

  deleteJob(jobId: string): { deleted_job_id: string; deleted_sources: number; deleted_chunks: number } {
    const sourceCount = this.get<{ n: number }>("SELECT count(*) AS n FROM research_sources WHERE job_id = ?", [jobId])?.n ?? 0;
    const chunkCount = this.get<{ n: number }>("SELECT count(*) AS n FROM research_chunks WHERE job_id = ?", [jobId])?.n ?? 0;
    this.run("DELETE FROM research_jobs WHERE id = ?", [jobId]);
    return { deleted_job_id: jobId, deleted_sources: Number(sourceCount), deleted_chunks: Number(chunkCount) };
  }
}

function mapJob(row: Record<string, unknown>): ResearchJob {
  return {
    id: String(row.id),
    query: String(row.query),
    depth: row.depth as ResearchDepth,
    status: row.status as JobStatus,
    sourceTypes: JSON.parse(String(row.source_types_json)) as SourceType[],
    maxSources: Number(row.max_sources),
    durationMinutes: Number(row.duration_minutes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    nextCheckAfterSeconds: Number(row.next_check_after_seconds),
    reportMarkdown: row.report_markdown ? String(row.report_markdown) : null,
    error: row.error ? String(row.error) : null
  };
}

function mapQuery(row: Record<string, unknown>): ResearchQuery {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    provider: row.provider as SourceType,
    query: String(row.query),
    status: row.status as QueryStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    error: row.error ? String(row.error) : null
  };
}

function mapSource(row: Record<string, unknown>): ResearchSource {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    sourceType: row.source_type as SourceType,
    provider: String(row.provider),
    url: String(row.url),
    normalizedUrl: String(row.normalized_url),
    title: String(row.title),
    snippet: String(row.snippet ?? ""),
    status: row.status as SourceStatus,
    score: Number(row.score ?? 0),
    metadata: JSON.parse(String(row.metadata_json || "{}")) as Record<string, unknown>,
    fetchedAt: row.fetched_at ? String(row.fetched_at) : null,
    error: row.error ? String(row.error) : null
  };
}

function mapChunk(row: Record<string, unknown>): ResearchChunk {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    sourceId: String(row.source_id),
    chunkIndex: Number(row.chunk_index),
    text: String(row.text),
    tokenEstimate: Number(row.token_estimate),
    metadata: JSON.parse(String(row.metadata_json || "{}")) as Record<string, unknown>,
    contentHash: String(row.content_hash),
    createdAt: String(row.created_at)
  };
}

function splitIntoChunks(text: string, maxChars = 3500, overlap = 300): { chunkText: string[] } {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return { chunkText: [] };
  }
  const chunks: string[] = [];
  for (let start = 0; start < cleaned.length; start += maxChars - overlap) {
    chunks.push(cleaned.slice(start, start + maxChars).trim());
    if (start + maxChars >= cleaned.length) {
      break;
    }
  }
  return { chunkText: chunks.filter(Boolean) };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function budgetFromJob(job: ResearchJob): ResearchBudget {
  const budget = budgetForDepth(job.depth);
  budget.maxSources = job.maxSources;
  budget.durationMinutes = job.durationMinutes;
  return budget;
}
