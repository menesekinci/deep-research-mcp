import os from "node:os";
import path from "node:path";

import type { ResearchDepth, SourceType } from "./research/types.js";

export interface AppConfig {
  homeDir: string;
  dbPath: string;
  braveApiKey?: string;
  githubToken?: string;
  context7ApiKey?: string;
  defaultDepth: ResearchDepth;
  defaultSourceTypes: SourceType[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const homeDir = expandHome(env.CODEX_DEEP_RESEARCH_HOME || path.join(os.homedir(), ".codex", "deep-research"));
  return {
    homeDir,
    dbPath: env.CODEX_DEEP_RESEARCH_DB || path.join(homeDir, "research.sqlite"),
    braveApiKey: env.BRAVE_API_KEY,
    githubToken: env.GITHUB_TOKEN,
    context7ApiKey: env.CONTEXT7_API_KEY,
    defaultDepth: "standard",
    defaultSourceTypes: ["web", "github", "context7"]
  };
}

function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}
