import fs from "node:fs";
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

interface ConfigFile {
  homeDir?: string;
  home_dir?: string;
  dbPath?: string;
  db_path?: string;
  braveApiKey?: string;
  brave_api_key?: string;
  githubToken?: string;
  github_token?: string;
  context7ApiKey?: string;
  context7_api_key?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const defaultHomeDir = path.join(os.homedir(), ".deep-research-mcp");
  const initialHomeDir = expandHome(env.DEEP_RESEARCH_HOME || env.CODEX_DEEP_RESEARCH_HOME || defaultHomeDir);
  const configPath = expandHome(env.DEEP_RESEARCH_CONFIG || path.join(initialHomeDir, "config.json"));
  const fileConfig = readConfigFile(configPath);
  const homeDir = expandHome(env.DEEP_RESEARCH_HOME || env.CODEX_DEEP_RESEARCH_HOME || fileConfig.homeDir || fileConfig.home_dir || defaultHomeDir);
  return {
    homeDir,
    dbPath: expandHome(env.DEEP_RESEARCH_DB || env.CODEX_DEEP_RESEARCH_DB || fileConfig.dbPath || fileConfig.db_path || path.join(homeDir, "research.sqlite")),
    braveApiKey: env.BRAVE_API_KEY || fileConfig.braveApiKey || fileConfig.brave_api_key,
    githubToken: env.GITHUB_TOKEN || fileConfig.githubToken || fileConfig.github_token,
    context7ApiKey: env.CONTEXT7_API_KEY || fileConfig.context7ApiKey || fileConfig.context7_api_key,
    defaultDepth: "standard",
    defaultSourceTypes: ["web", "github", "context7"]
  };
}

function readConfigFile(configPath: string): ConfigFile {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as ConfigFile;
  } catch (error) {
    throw new Error(`Unable to read Deep Research MCP config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
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
