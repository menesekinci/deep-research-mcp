import type { ResearchJob, ResearchSource } from "./types.js";
import type { ResearchDb } from "../storage/db.js";

export function buildReport(db: ResearchDb, job: ResearchJob): string {
  const counts = db.counts(job.id);
  const sources = db.sourcesForJob(job.id, { limit: 12, offset: 0 });
  const chunks = db.chunksForJob(job.id, 12);
  const lines: string[] = [];
  lines.push(`# Deep Research Report`);
  lines.push("");
  lines.push(`Query: ${job.query}`);
  lines.push(`Status: ${job.status}`);
  lines.push(`Sources discovered: ${counts.sources_total ?? 0}`);
  lines.push(`Sources fetched: ${counts.sources_fetched ?? 0}`);
  lines.push(`Chunks stored: ${counts.chunks_total ?? 0}`);
  lines.push("");
  lines.push("## Key Findings");
  if (chunks.length === 0) {
    lines.push("- No fetched chunks are available yet.");
  } else {
    for (const chunk of chunks.slice(0, 8)) {
      const source = sources.find((item) => item.id === chunk.sourceId);
      lines.push(`- ${truncate(chunk.text, 280)}${source ? ` [${source.title}](${source.url})` : ""}`);
    }
  }
  lines.push("");
  lines.push("## Top Sources");
  for (const source of sources) {
    lines.push(`- ${sourceBadge(source)} [${source.title}](${source.url})`);
  }
  return lines.join("\n");
}

function sourceBadge(source: ResearchSource): string {
  return `[${source.sourceType}/${source.status}]`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
}
