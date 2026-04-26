<img width="1672" height="941" alt="ChatGPT Image 26 Nis 2026 13_37_20" src="https://github.com/user-attachments/assets/1c981613-e309-4103-aba6-8c1cae50c83a" />

# Deep Research MCP

Async deep research MCP server for AI agents and MCP clients. It starts long-running research jobs, searches Brave/GitHub/Context7, fetches and cleans sources, stores chunks in local SQLite, and lets clients retrieve reports or targeted evidence without dumping every page into context.

## Install With NPX

No repository clone or global install is required. Add the package to your MCP client config and let `npx` download and run the latest published version on demand.

```toml
[mcp_servers.deep-research]
command = "npx"
args = ["-y", "@menesekinci/deep-research-mcp@latest"]
```

GitHub fallback for testing unreleased commits:

```toml
[mcp_servers.deep-research]
command = "npx"
args = ["-y", "github:menesekinci/deep-research-mcp"]
```

## Authentication And Secrets

Deep Research MCP reads credentials from environment variables or from a local config file. Environment variables always win over config file values.

Required and optional keys:

- `BRAVE_API_KEY` is required for web search.
- `GITHUB_TOKEN` is optional for higher limits/private repositories.
- `CONTEXT7_API_KEY` is optional.
- `DEEP_RESEARCH_HOME` defaults to `~/.deep-research-mcp`.
- `DEEP_RESEARCH_DB` can point directly to a custom SQLite file.
- `DEEP_RESEARCH_CONFIG` can point to a JSON config file. Default: `~/.deep-research-mcp/config.json`.

Legacy `CODEX_DEEP_RESEARCH_HOME` and `CODEX_DEEP_RESEARCH_DB` environment variables are still accepted as aliases.

### Option 1: MCP Config Env Block

Use this for a quick local setup. Do not commit files containing real tokens.

```toml
[mcp_servers.deep-research]
command = "npx"
args = ["-y", "@menesekinci/deep-research-mcp@latest"]

[mcp_servers.deep-research.env]
BRAVE_API_KEY = "..."
GITHUB_TOKEN = "..."
CONTEXT7_API_KEY = "..."
```

### Option 2: Local Config File

Use this when your MCP client config is shared or checked into a repository. Keep this file outside your project repo.

Default path:

```text
~/.deep-research-mcp/config.json
```

Example:

```json
{
  "braveApiKey": "...",
  "githubToken": "...",
  "context7ApiKey": "...",
  "homeDir": "~/.deep-research-mcp",
  "dbPath": "~/.deep-research-mcp/research.sqlite"
}
```

Then your MCP config can stay token-free:

```toml
[mcp_servers.deep-research]
command = "npx"
args = ["-y", "@menesekinci/deep-research-mcp@latest"]
```

For a custom config location:

```toml
[mcp_servers.deep-research.env]
DEEP_RESEARCH_CONFIG = "C:\\Users\\you\\.deep-research-mcp\\config.json"
```

## Storage

The server stores cleaned text chunks, source metadata, citations, events, and job state in SQLite. It does not store raw HTML by default.

## Tools

- `research_start`
- `research_status`
- `research_report`
- `research_sources`
- `research_search`
- `research_get_source`
- `research_get_chunks`
- `research_active_jobs`
- `research_due_jobs`
- `research_cancel`
- `research_delete`

## Typical Flow

1. Call `research_start` with a query, depth, and source types.
2. The tool returns a `job_id` and `next_check_after_seconds`.
3. Later, call `research_status`, `research_report`, `research_sources`, or `research_search`.
4. Only reports and relevant chunks are returned to the agent context; full fetched pages are kept in SQLite.
