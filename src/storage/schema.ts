export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS research_jobs (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  depth TEXT NOT NULL,
  status TEXT NOT NULL,
  source_types_json TEXT NOT NULL,
  max_sources INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  next_run_at TEXT,
  next_check_after_seconds INTEGER NOT NULL,
  report_markdown TEXT,
  error TEXT,
  estimated_budget_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_queries (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  query TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  error TEXT,
  FOREIGN KEY(job_id) REFERENCES research_jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  fetched_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  error TEXT,
  FOREIGN KEY(job_id) REFERENCES research_jobs(id) ON DELETE CASCADE,
  UNIQUE(job_id, normalized_url)
);

CREATE TABLE IF NOT EXISTS research_fetches (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  http_status INTEGER,
  content_hash TEXT,
  content_bytes INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(source_id) REFERENCES research_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_chunks (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES research_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY(source_id) REFERENCES research_sources(id) ON DELETE CASCADE,
  UNIQUE(source_id, chunk_index, content_hash)
);

CREATE TABLE IF NOT EXISTS research_findings (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  text TEXT NOT NULL,
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES research_jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_rate_limits (
  provider TEXT PRIMARY KEY,
  limit_header TEXT,
  remaining_header TEXT,
  reset_header TEXT,
  next_allowed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_events (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES research_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_next ON research_jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_queries_job_status ON research_queries(job_id, status);
CREATE INDEX IF NOT EXISTS idx_sources_job_status ON research_sources(job_id, status);
CREATE INDEX IF NOT EXISTS idx_chunks_job ON research_chunks(job_id);
`;
