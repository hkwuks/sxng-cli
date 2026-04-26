---
name: sxng
description: "Web search using SearXNG CLI. Use when you need to search the web for current information, documentation, or research. Supports deep multi-round search with knowledge graph, session accumulation, and content extraction. Triggers: 'search for', 'look up', 'find information', 'web search', 'deep search', 'deep dive', or any request needing up-to-date information."
---

# SearXNG Web Search

Use `sxng` CLI to search the web. Default output is markdown (md). Use `-f json` for JSON when needed by downstream tools.

## Quick Reference

```bash
sxng <query>                       # Search (markdown output)
sxng -f json <query>               # Search (JSON output)
sxng --queries "q1,q2,q3"          # Multi-query search with RRF fusion & dedup
sxng extract --urls "url1,url2"    # Extract article content from URLs
sxng extract --from-json file      # Extract content from search results JSON
sxng session-list                  # List all sessions
sxng session-delete --older 24     # Delete sessions older than 24 hours
```

## Search Options

| Option | Example | Purpose |
|--------|---------|---------|
| `-e, --engines` | `-e google,github` | Specific search engines |
| `-c, --categories` | `-c it,science` | Filter by category |
| `-l, --limit` | `-l 20` | Max results (default: 10) |
| `-p, --page` | `-p 2` | Pagination |
| `--lang` | `--lang zh` | Result language (en, zh, ja, etc.) |
| `--time` | `--time week` | Filter: day/week/month/year/all |
| `-f, --format` | `-f json` | Output format: md (default), json |
| `--queries` | `--queries "q1,q2,q3"` | Multi-query with RRF fusion |

## Extract

Extract full article content from web pages. You can use the built-in `sxng extract` or any other tool that fetches web content (MCP fetch tools, WebFetch, curl, etc). `sxng extract` uses linkedom + Mozilla Readability internally.

```bash
# Extract from specific URLs
sxng extract --urls "https://example.com/article1,https://example.com/article2"

# Extract from search results JSON file
sxng extract --from-json /tmp/search.json

# Or just use any other fetch tool you have available
```

> **Note**: Content extraction is not limited to `sxng extract`. Any web fetch tool (MCP, browser, curl) can extract content. `sxng extract` is just one option — use whatever works best for the target URL.

## Utility Commands

```bash
sxng --engines-list    # List available engines
sxng --categories-list # List available categories
sxng --health          # Check server status
sxng init              # Interactive setup
```

## Deep Search

Deep search enables multi-round iterative research: search → extract → analyze → search again, with results accumulating in a session directory. The session stores three files:

- **`results.json`** — Accumulated search result pool (URL dedup, multi-round accumulation)
- **`graph.json`** — Knowledge graph (structural + semantic layers)
- **`meta.json`** — Session metadata (owner, description, timestamps)

### Session Management

Sessions are stored under `~/.sxng/sessions/` by default. Each agent should create its own session to avoid mixing results.

```bash
# Create a new auto-named session (avoids collisions between agents)
sxng --session new --owner "agent-1" --desc "async ecosystem research" "rust async"

# List all sessions (shows owner, rounds, stats)
sxng session-list

# Delete specific sessions
sxng session-delete <session-name>

# Delete sessions older than N hours
sxng session-delete --older 24
```

When using `--session new`, the CLI auto-generates a unique directory name (e.g. `<session-name>`) and returns the path in the output. Use that path for subsequent `--session`, `extract --session`, `graph-add`, and `query-graph` calls.

`--owner` and `--desc` are stored in `meta.json` for identification. Set them when creating a session so you can tell which session belongs to which agent.

### How It Works

The deep search flow is an iterative loop. Each round follows the same pattern:

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────────┐
│  Search   │────→│  Extract  │────→│  Analyze  │────→│  graph-add   │
│ (--session)│     │  Content  │     │  (LLM)   │     │  (entities)  │
└──────────┘     └──────────┘     └──────────┘     └──────────────┘
      │                                                    │
      │          Decide: need more info?                   │
      │          ┌───────────────────────┐                 │
      │          │  Yes → next round      │←────────────────┘
      │          │  No  → synthesize answer│
      │          └───────────────────────┘
```

**Step-by-step:**

1. **Search** — `sxng --session <dir> <query>` runs a search, results accumulate in session
2. **Extract** — Get content from top results. Use `sxng extract --session <dir>` or any fetch tool
3. **Analyze** — As LLM, read the results/extracted content, identify entities and gaps
4. **Build graph** — `sxng graph-add <dir> --data '...'` adds entities and relationships
5. **Decide** — Check `sxng query-graph <dir> --seeds ...` to see what's connected. If gaps remain, loop back to step 1 with refined queries
6. **Synthesize** — When enough information is gathered, produce the final answer

### Session (--session)

Each `sxng --session <dir> <query>` automatically:
1. Deduplicates and accumulates results into `results.json`
2. Builds structural graph edges (query→result→domain) in `graph.json`
3. Returns RRF-fused display of all accumulated results

```bash
sxng --session /tmp/s "rust async ecosystem"          # Round 1
sxng --session /tmp/s --queries "tokio vs async-std,rust async benchmark"  # Round 2
```

### Extract with Session

`extract --session` reads URLs from session results and merges extracted content back:

```bash
sxng extract --session /tmp/s   # Extract from all session URLs, merge content into results.json
```

Or use any external fetch tool to extract content — just read the URLs from session output.

### Knowledge Graph

The graph has two layers:

**Structural Layer** (auto-built by CLI every search):

| Node type | Prefix | Attributes |
|-----------|--------|------------|
| query | `q:` | label, query, round |
| result | `r:` | label, url, title, rank |
| domain | `d:` | label, domain |

Edges: `yields` (query→result, weight=1/(rank+1)), `belongs_to` (result→domain, weight=1)

**Semantic Layer** (added by you via graph-add after analysis):

| Node type | Prefix | Attributes |
|-----------|--------|------------|
| entity | `e:` | label, entityType, score |

Edges: any relation type between entity↔entity or entity→result, with custom weights

### graph-add

Add entities and semantic edges after you analyze the search results:

```bash
sxng graph-add /tmp/s --data '{
  "entities": [
    {"label": "tokio", "entityType": "technology", "score": 0.9},
    {"label": "async-std", "entityType": "technology", "score": 0.8}
  ],
  "edges": [
    {"source": "e:tokio", "target": "e:async_std", "relation": "alternative_to", "weight": 0.9},
    {"source": "e:tokio", "target": "r:https_tokio_rs_", "relation": "mentioned_in", "weight": 1.0}
  ]
}'
```

Edge source/target must reference existing node IDs. Invalid references are skipped and reported in `skippedEdges`.

### query-graph

Explore the graph to decide whether to continue searching or synthesize an answer:

```bash
sxng query-graph /tmp/s --seeds "tokio" --depth 3          # human-readable
sxng query-graph /tmp/s --seeds "tokio" --depth 3 -f json  # raw data
```

Seed matching: exact ID → prefix match → label match (case-insensitive).

Default output (md) shows relationships in readable format. `-f json` returns raw graphology data.

### Complete Example

Research "Rust async ecosystem differences and recommendations":

```bash
# Round 1: Create session and search
sxng --session new --owner "agent-1" --desc "async ecosystem" "rust async ecosystem"
# Output includes session path, e.g. ~/.sxng/sessions/<session-name>

# Extract content from results (or use MCP fetch / any tool you prefer)
sxng extract --session ~/.sxng/sessions/<session-name>

# After reading results, identify key entities and add them
sxng graph-add ~/.sxng/sessions/<session-name> --data '{
  "entities": [
    {"label": "tokio", "entityType": "technology"},
    {"label": "async-std", "entityType": "technology"},
    {"label": "smol", "entityType": "technology"}
  ],
  "edges": [
    {"source": "e:tokio", "target": "e:async_std", "relation": "alternative_to"},
    {"source": "e:tokio", "target": "e:smol", "relation": "alternative_to"}
  ]
}'

# Check what we know so far
sxng query-graph ~/.sxng/sessions/<session-name> --seeds "tokio" --depth 2

# Gap found: need comparison details → Round 2 with focused queries
sxng --session ~/.sxng/sessions/<session-name> --queries "tokio vs async-std comparison,rust async runtime benchmark 2024"

# Extract again
sxng extract --session ~/.sxng/sessions/<session-name>

# Add new findings to graph
sxng graph-add ~/.sxng/sessions/<session-name> --data '{"entities":[...],"edges":[...]}'

# Check coverage — enough info? If yes, synthesize answer. If not, another round.
sxng query-graph ~/.sxng/sessions/<session-name> --seeds "tokio" --depth 3

# When done, clean up old sessions
sxng session-delete --older 24
```

### When to Stop

- New unique results < 3 per round
- Already 3+ search rounds
- Entity graph covers the topic sufficiently (check with `query-graph`)
- All follow-up angles exhausted

## When to Use

- Simple web search → `sxng <query>`
- Need article content → `extract --urls` or any fetch tool
- Deep research → deep search workflow (session + extract + graph-add loop)

## Tips

- Default format is md (compact, low token cost). Use `-f json` only when needed.
- Use `-c` or `-e` to target specific sources
- Use `--time week/day` for recent information
- Run `sxng --health` first if searches fail
- Content extraction: use `sxng extract` or any other fetch tool — both work
- `graph-add` accepts session directory path directly (resolves to `graph.json` inside)
- `query-graph` default output is md; `-f json` for raw graphology data