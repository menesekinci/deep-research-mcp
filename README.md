# Codex Deep Research MCP

Async deep research MCP server for Codex. It starts long-running research jobs, searches Brave/GitHub/Context7, fetches and cleans sources, stores chunks in local SQLite, and lets the agent retrieve reports or targeted evidence without dumping every page into context.

## Usage

```toml
[mcp_servers.deep-research]
command = "npx"
args = ["-y", "@menesekinci/codex-deep-research-mcp@latest"]
```

Until the npm package is published, use the GitHub fallback:

```toml
[mcp_servers.deep-research]
command = "npx"
args = ["-y", "github:menesekinci/codex-deep-research-mcp"]
```

Environment:

- `BRAVE_API_KEY` is required for web search.
- `GITHUB_TOKEN` is optional for higher limits/private repositories.
- `CONTEXT7_API_KEY` is optional.
- `CODEX_DEEP_RESEARCH_HOME` defaults to `~/.codex/deep-research`.

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

The server stores cleaned chunks and metadata by default, not raw HTML.
