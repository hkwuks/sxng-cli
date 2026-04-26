# SearXNG CLI

A command-line interface for searching with SearXNG, a privacy-respecting meta search engine. Supports deep multi-round search with knowledge graph, session accumulation, and content extraction.

## Installation

```bash
npm install -g sxng-cli
# or
pnpm add -g sxng-cli
# or
yarn global add sxng-cli
```

## Quick Start

1. Set up a SearXNG server:
```bash
docker run -d --name searxng -p 8080:8080 searxng/searxng
```

2. Create a configuration file:
```bash
cp searxng.config.example.json searxng.config.json
# Edit the file with your settings
```

3. Run a search:
```bash
sxng "your search query"
```

## Configuration

Configuration can be provided via:
1. Environment variables (highest priority)
2. Config file: `./searxng.config.json` or `~/.sxng/config.json`
3. Default values (lowest priority)

See `searxng.config.example.json` for an example configuration.

## Usage

### Basic Search

```bash
# Simple search
sxng "TypeScript tutorial"

# Limit results
sxng "TypeScript tutorial" --limit 5

# Use specific engines
sxng --engines google,github "react hooks"

# Search in specific categories
sxng --categories it,science "machine learning"

# Recent results only
sxng --time week "latest news"

# Output as JSON
sxng -f json "docker tutorial"

# Check server health
sxng --health

# List available engines
sxng --engines-list

# List available categories
sxng --categories-list
```

### Multi-Query Search

Run multiple queries with RRF (Reciprocal Rank Fusion) result fusion and deduplication:

```bash
sxng --queries "tokio tutorial,rust async basics,tokio vs async-std"
```

### Content Extraction

Extract full article content from web pages:

```bash
# Extract from specific URLs
sxng extract --urls "https://example.com/article1,https://example.com/article2"

# Extract from search results JSON file
sxng extract --from-json search-results.json
```

## Deep Search

Deep search enables multi-round iterative research with session accumulation and knowledge graph building.

### Session Management

```bash
# Create a new session with auto-generated name
sxng --session new --owner "research-agent" --desc "Rust async research" "rust async ecosystem"

# List all sessions
sxng session-list

# Delete a specific session
sxng session-delete <session-name>

# Delete sessions older than N hours
sxng session-delete --older 24
```

### Deep Search Workflow

The deep search flow follows an iterative loop: search → extract → analyze → build graph → decide.

```bash
# Round 1: Create session and search
sxng --session new --owner "agent-1" --desc "async ecosystem research" "rust async ecosystem"
# Note the returned session path, e.g., ~/.sxng/sessions/<session-name>

# Extract content from results
sxng extract --session ~/.sxng/sessions/<session-name>

# Add entities and relationships to knowledge graph
sxng graph-add ~/.sxng/sessions/<session-name> --data '{
  "entities": [
    {"label": "tokio", "entityType": "runtime", "score": 0.95},
    {"label": "async-std", "entityType": "runtime", "score": 0.85}
  ],
  "edges": [
    {"source": "e:tokio", "target": "e:async_std", "relation": "alternative_to", "weight": 0.9}
  ]
}'

# Query the knowledge graph
sxng query-graph ~/.sxng/sessions/<session-name> --seeds "tokio" --depth 2

# Round 2: Search with multiple queries (results accumulate in session)
sxng --session ~/.sxng/sessions/<session-name> --queries "tokio vs async-std comparison,rust async benchmark 2024"

# Extract again and continue the loop...
```

### Session Data Structure

Each session stores three files in `~/.sxng/sessions/<session-name>/`:

- **`results.json`** — Accumulated search result pool (URL dedup, multi-round accumulation)
- **`graph.json`** — Knowledge graph (structural + semantic layers)
- **`meta.json`** — Session metadata (owner, description, timestamps)

### Knowledge Graph

The graph has two layers:

**Structural Layer** (auto-built by CLI every search):

| Node type | Prefix | Attributes |
|-----------|--------|------------|
| query | `q:` | label, query, round |
| result | `r:` | label, url, title, rank |
| domain | `d:` | label, domain |

**Semantic Layer** (added via `graph-add`):

| Node type | Prefix | Attributes |
|-----------|--------|------------|
| entity | `e:` | label, entityType, score |

## Options Reference

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| `--limit` | `-l` | Max results | `-l 20` |
| `--engines` | `-e` | Specific search engines | `-e google,github` |
| `--categories` | `-c` | Filter by category | `-c it,science` |
| `--page` | `-p` | Pagination | `-p 2` |
| `--lang` | | Result language | `--lang zh` |
| `--time` | | Time filter | `--time week` |
| `--format` | `-f` | Output format | `-f json` |
| `--queries` | | Multi-query with RRF fusion | `--queries "q1,q2,q3"` |
| `--session` | | Session directory or "new" | `--session new` |
| `--owner` | | Session owner identifier | `--owner "agent-1"` |
| `--desc` | | Session description | `--desc "research topic"` |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SEARXNG_BASE_URL` | SearXNG server URL | `http://localhost:8080` |
| `SEARXNG_DEFAULT_LIMIT` | Default result limit | `10` |
| `SEARXNG_TIMEOUT` | Request timeout in ms | `10000` |
| `SEARXNG_USE_PROXY` | Use proxy (`true`/`false`) | `false` |
| `SEARXNG_PROXY_URL` | Proxy URL | (none) |

## License

MIT
