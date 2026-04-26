import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { ResearchService } from "./research/service.js";
import type { SourceStatus, SourceType } from "./research/types.js";
import { formatPayload, type OutputFormat } from "./utils/format.js";

const sourceTypeSchema = z.enum(["web", "github", "context7"]);
const depthSchema = z.enum(["standard", "deep", "exhaustive"]);
const formatSchema = z.enum(["json", "markdown", "toon"]);

export async function createServer(): Promise<{ server: McpServer; service: ResearchService }> {
  const service = await ResearchService.create(loadConfig());
  const server = new McpServer({
    name: "codex-deep-research",
    version: "0.1.0"
  });

  server.tool(
    "research_start",
    "Start an asynchronous deep research job.",
    {
      query: z.string().min(1),
      depth: depthSchema.default("standard"),
      source_types: z.array(sourceTypeSchema).default(["web", "github", "context7"]),
      max_sources: z.number().int().positive().optional(),
      duration_minutes: z.number().int().positive().optional(),
      domains: z.array(z.string()).optional(),
      recency: z.string().optional(),
      language: z.string().optional()
    },
    async (args) => text(service.start(args))
  );

  server.tool(
    "research_status",
    "Return status and progress for one research job.",
    { job_id: z.string() },
    async ({ job_id }) => text(service.status(job_id))
  );

  server.tool(
    "research_report",
    "Return a research report for one job.",
    { job_id: z.string(), format: formatSchema.default("markdown") },
    async ({ job_id, format }) => text(service.report(job_id, format), format)
  );

  server.tool(
    "research_sources",
    "List sources for one research job.",
    {
      job_id: z.string(),
      source_type: sourceTypeSchema.optional(),
      status: z.enum(["discovered", "fetching", "fetched", "failed", "skipped"]).optional(),
      limit: z.number().int().positive().default(50),
      offset: z.number().int().min(0).default(0),
      format: formatSchema.default("json")
    },
    async ({ job_id, source_type, status, limit, offset, format }) =>
      text(
        service.db.sourcesForJob(job_id, {
          sourceType: source_type as SourceType | undefined,
          status: status as SourceStatus | undefined,
          limit,
          offset
        }),
        format
      )
  );

  server.tool(
    "research_search",
    "Search stored chunks for one research job.",
    {
      job_id: z.string(),
      query: z.string().min(1),
      limit: z.number().int().positive().default(20),
      format: formatSchema.default("json")
    },
    async ({ job_id, query, limit, format }) => text(service.db.chunksForJob(job_id, limit, query), format)
  );

  server.tool(
    "research_get_source",
    "Return one source by source id.",
    { source_id: z.string(), format: formatSchema.default("json") },
    async ({ source_id, format }) => text(service.db.source(source_id) ?? { error: "not_found", source_id }, format)
  );

  server.tool(
    "research_get_chunks",
    "Return chunks for one source.",
    {
      source_id: z.string(),
      limit: z.number().int().positive().default(20),
      offset: z.number().int().min(0).default(0),
      format: formatSchema.default("json")
    },
    async ({ source_id, limit, offset, format }) => text(service.db.chunksForSource(source_id, limit, offset), format)
  );

  server.tool("research_active_jobs", "List active research jobs.", { format: formatSchema.default("json") }, async ({ format }) =>
    text(service.db.activeJobs(), format)
  );

  server.tool("research_due_jobs", "List active jobs whose next run time is due.", { format: formatSchema.default("json") }, async ({ format }) =>
    text(service.db.dueJobs(), format)
  );

  server.tool("research_cancel", "Cancel one research job.", { job_id: z.string() }, async ({ job_id }) => {
    service.db.updateJob(job_id, { status: "cancelled", completedAt: new Date().toISOString() });
    return text({ job_id, status: "cancelled" });
  });

  server.tool(
    "research_delete",
    "Delete one research job and its stored sources/chunks. Requires confirm=true.",
    { job_id: z.string(), confirm: z.boolean().default(false) },
    async ({ job_id, confirm }) => {
      if (!confirm) {
        return text({ error: "confirmation_required", job_id, message: "Call again with confirm=true to delete this job." });
      }
      return text(service.db.deleteJob(job_id));
    }
  );

  return { server, service };
}

export async function runServer(): Promise<void> {
  const { server, service } = await createServer();
  const transport = new StdioServerTransport();
  process.once("SIGINT", () => service.close());
  process.once("SIGTERM", () => service.close());
  await server.connect(transport);
}

function text(value: unknown, format: OutputFormat = "json") {
  return {
    content: [
      {
        type: "text" as const,
        text: formatPayload(value, format)
      }
    ]
  };
}
