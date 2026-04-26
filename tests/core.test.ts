import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { ResearchScheduler, ResearchService } from "../src/research/service.js";
import type { SearchProvider } from "../src/research/types.js";
import { expandQueries } from "../src/research/queryExpansion.js";
import { normalizeUrl } from "../src/research/url.js";
import { ResearchDb } from "../src/storage/db.js";
import { nextAllowedFromHeaders } from "../src/utils/rateLimit.js";

describe("query and URL helpers", () => {
  it("expands queries by depth", () => {
    expect(expandQueries("sqlite memory", "standard").length).toBeGreaterThan(5);
    expect(expandQueries("sqlite memory", "exhaustive").length).toBeGreaterThan(
      expandQueries("sqlite memory", "standard").length
    );
  });

  it("normalizes tracking parameters and hashes", () => {
    expect(normalizeUrl("https://Example.com/docs/?utm_source=x&a=1#section")).toBe("https://example.com/docs?a=1");
  });
});

describe("rate limit helpers", () => {
  it("calculates next allowed time when a window is exhausted", () => {
    const date = nextAllowedFromHeaders("0, 100", "2, 1000");
    expect(date).toBeInstanceOf(Date);
    expect(date!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("config loading", () => {
  it("loads secrets from a config file and lets env override them", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-config-"));
    const configPath = path.join(tmp, "config.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        homeDir: path.join(tmp, "home"),
        braveApiKey: "file-brave",
        github_token: "file-github",
        context7ApiKey: "file-context7"
      })
    );

    const config = loadConfig({
      DEEP_RESEARCH_CONFIG: configPath,
      BRAVE_API_KEY: "env-brave"
    });

    expect(config.homeDir).toBe(path.join(tmp, "home"));
    expect(config.dbPath).toBe(path.join(tmp, "home", "research.sqlite"));
    expect(config.braveApiKey).toBe("env-brave");
    expect(config.githubToken).toBe("file-github");
    expect(config.context7ApiKey).toBe("file-context7");
  });
});

describe("research storage and scheduler", () => {
  it("returns top-level job_id and status fields from service tools", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-service-"));
    const service = await ResearchService.create({
      homeDir: tmp,
      dbPath: path.join(tmp, "research.sqlite"),
      defaultDepth: "standard",
      defaultSourceTypes: ["github"]
    });

    const started = service.start({
      query: "mcp test",
      source_types: ["github"],
      max_sources: 1,
      duration_minutes: 1
    });
    const status = service.status(started.job_id);

    expect(started.job_id).toBe(started.id);
    expect(status.job_id).toBe(started.id);
    expect(status.status).toBeDefined();
    service.close();
  });

  it("runs a job with a mocked provider and stores clean chunks", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-"));
    const db = await ResearchDb.open(path.join(tmp, "research.sqlite"));
    const job = db.createJob({
      query: "test query",
      depth: "standard",
      sourceTypes: ["web"],
      maxSources: 3,
      durationMinutes: 1
    });
    db.addQuery(job.id, "web", "test query official");
    db.saveAfterBatch();

    const provider: SearchProvider = {
      sourceType: "web",
      search: async () => ({
        candidates: [
          {
            sourceType: "web",
            provider: "mock",
            url: "https://example.com/page?utm_source=test",
            title: "Example Page",
            snippet: "A relevant example page.",
            content: "This is clean research text. ".repeat(200)
          }
        ]
      })
    };
    const scheduler = new ResearchScheduler(db, new Map([["web", provider]]));
    scheduler.kick();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const updated = db.getJob(job.id)!;
    const counts = db.counts(job.id);
    expect(updated.status).toBe("completed");
    expect(counts.chunks_total).toBeGreaterThan(0);
    expect(db.chunksForJob(job.id, 1)[0].text).toContain("clean research text");

    const deleted = db.deleteJob(job.id);
    expect(deleted.deleted_sources).toBe(1);
    expect(db.getJob(job.id)).toBeUndefined();
    db.close();
  });
});
