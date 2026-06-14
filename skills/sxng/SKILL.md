---
name: sxng
description: "Web search using SearXNG CLI. Use when you need to search the web for current information, documentation, or research. Supports deep multi-round search with knowledge graph, quality assessment, recovery strategies, and content extraction (including Obscura JS-rendering fallback for SPA/dynamic pages). Triggers: 'search for', 'look up', 'find information', 'web search', 'deep search', 'deep dive', 'extract content', 'JS rendering', 'SPA page', or any request needing up-to-date information."
---

# SearXNG Web Search

Use `sxng` CLI to search the web. Results are automatically deduplicated (URL normalization + SimHash near-duplicate removal). CLI automatically filters out results with empty title or content.

## Quick Reference

```bash
# Simple search
sxng <query>                                # Search (markdown output)
sxng --format json <query>                  # Search (JSON output)
sxng --queries "q1,q2,q3"                  # Multi-query with RRF fusion & dedup

# Deep search session
sxng --search-session new --owner "agent-1" --desc "topic" "query"
sxng --search-session <session> "more queries"

# Content extraction
sxng extract --urls "url1,url2"             # Extract from URLs
sxng extract --session <session>            # Extract session results
sxng extract --urls "url1" --obscura        # Extract with JS-rendering fallback

# Quality & iteration
sxng --search-session <session> --quality   # Assess result quality
sxng suggest-queries <session>              # Get query suggestions
sxng strategy-info <session>                # Check search stage
sxng recovery-analysis <session>            # Get recovery strategies
sxng session-report <session>               # Full session report

# Knowledge graph
sxng graph-preprocess <session>             # TF-IDF + co-occurrence analysis
sxng graph-add <session> --data '{...}'     # Add entities/edges
sxng graph-search <session> --keyword "x"   # Discover entities
sxng graph-search <session> --keyword "x" --limit 5  # Limit results
sxng graph-explore <session> --seed "x"     # View entity relations
sxng graph-drill <session> --seed "x" --relations "r1,r2"  # Follow relations
sxng graph-traverse <session> --path "p:chain_001"  # Traverse reasoning paths
sxng graph-obfuscate <session> --list       # List obfuscation candidates

# Utility
sxng session-list                           # List all sessions
sxng session-delete --older 24              # Delete old sessions
sxng --engines-list                         # List available engines
sxng --categories-list                      # List available categories
sxng --health                               # Check server status
```

## Search Options

| Option | Example | Purpose |
|--------|---------|---------|
| `-e, --engines` | `-e google,github` | Specific search engines |
| `-c, --categories` | `-c it,science` | Filter by category |
| `-l, --limit` | `-l 20` | Max results (default: 10) |
| `-p, --page` | `-p 2` | Pagination |
| `--lang` | `--lang zh` | Result language |
| `--time` | `--time week` | Filter: day/week/month/year/all |
| `--format` | `--format json` | Output format: md (default), json |
| `--queries` | `--queries "q1,q2,q3"` | Multi-query with RRF fusion |
| `--merge` | `--merge prev.json` | Merge new results with previous search JSON |
| `--graph` | `--graph graph.json` | Save results to knowledge graph file |
| `--search-session` | `--search-session new` | Session dir or "new" to auto-create |
| `--owner` | `--owner "agent-1"` | Session owner |
| `--desc` | `--desc "research topic"` | Session description |
| `--redundancy` | `--redundancy warn` | Redundancy check: warn / adjust / skip |
| `--quality` | `--quality` | Assess result quality (requires --search-session) |
| `--threshold-override` | `--threshold-override '{"resultCount":10}'` | Override quality thresholds (JSON) |

## Extract

Extract full article content from web pages. Two-tier: **Defuddle + linkedom** (fast) → **Obscura** (JS rendering fallback).

```bash
sxng extract --urls "https://example.com/a,https://example.com/b"
sxng extract --session <session-name>
sxng extract --urls "https://spa-site.com" --obscura
```

| Option | Description |
|--------|-------------|
| `--obscura` | Enable JS-rendering fallback for SPAs |
| `--obscura-path <path>` | Path to Obscura binary (auto-detected if omitted) |
| `--obscura-dump <format>` | `html` (default) or `markdown` (faster, no metadata) |

> `--session` (extract subcommand) vs `--search-session` (main search command) — different flags.

## Deep Search

Deep search enables multi-round iterative research with quality assessment, recovery strategies, and knowledge graph navigation.

> **Read `skills/sxng/references/SOP.md` when doing any multi-result search** — it covers source credibility tiers (white/grey/black list), cross-validation rules, and the Result Quality Filtering principle (keep liberally, filter conservatively). For deep search specifically, it also has L1/L2/L3 complexity levels, the full 8-phase workflow with Agent decision logic, and anti-patterns to avoid.

### Quick Start

```bash
# Create session and search
sxng --search-session new --owner "agent-1" --desc "topic" "query"
# Output includes session path, use it for subsequent commands

# Extract content from results
sxng extract --session <session>

# Preprocess for entity discovery
sxng graph-preprocess <session>

# Add entities to knowledge graph
sxng graph-add <session> --data '{"entities":[...],"edges":[...]}'

# Assess quality
sxng --search-session <session> --quality

# Get suggestions if quality needs improvement
sxng suggest-queries <session>

# Continue searching with redundancy check
sxng "follow-up" --search-session <session> --redundancy warn
```

### Session Management

Sessions stored under `~/sxng-cli/sessions/` by default.

```bash
sxng session-list                           # List all sessions
sxng session-delete <name>                  # Delete a session
sxng session-delete --older 24              # Delete sessions older than 24h
```

### Quality Assessment

```bash
sxng --search-session <session> --quality
```

Returns 5 independent indicators: resultCount, contentDepth, entityRichness, sourceDiversity, novelty. Verdict: good / acceptable / poor. Based on verdict, use `suggest-queries` or `recovery-analysis` for next steps.

### Knowledge Graph

Two layers:
- **Structural** (auto-built): query→result→domain nodes and edges
- **Semantic** (added by you via `graph-add`): entity nodes with custom relation edges

When adding edges, `source`/`target` must reference existing node IDs. Node ID prefixes:

| Prefix | Type | Format | Example |
|--------|------|--------|---------|
| `e:` | Entity | `e:<label>` | `e:tokio` |
| `r:` | Result | `r:<url>` | `r:https_tokio_rs_` |
| `q:` | Query | `q:<query>` | `q:rust_async` |
| `d:` | Domain | `d:<domain>` | `d:github_com` |
| `p:` | Path | `p:<type>_<num>` | `p:chain_001` |

Graph navigation commands: `graph-search` (discover), `graph-explore` (view relations), `graph-drill` (follow specific relations), `graph-traverse` (reasoning paths).

### When to Stop

- Quality verdict is "good"
- Already 3+ search rounds
- New unique results < 3 per round

## When to Use

**Simple Search** (`sxng <query>`): specific facts, API docs, error solutions, finding a URL.

**Deep Search** (`--search-session`): multi-dimensional comparison, cross-validation needed, research reports, or initial search reveals incomplete information.

See SOP for detailed L1/L2/L3 complexity guidelines.

## Command Reference

| Command | Purpose |
|---------|---------|
| `sxng <query>` | Search the web |
| `sxng extract` | Extract page content |
| `sxng graph-preprocess` | TF-IDF + co-occurrence analysis |
| `sxng graph-add` | Add entities/edges to graph |
| `sxng graph-search` | Discover entities by keyword |
| `sxng graph-explore` | View entity relations |
| `sxng graph-drill` | Follow specific relations |
| `sxng graph-traverse` | Traverse reasoning path |
| `sxng graph-obfuscate` | Entity obfuscation (experimental) |
| `sxng suggest-queries` | Query suggestions for next round |
| `sxng strategy-info` | Current search stage |
| `sxng recovery-analysis` | Recovery strategy analysis |
| `sxng session-report` | Full session history |
| `sxng session-list` | List all sessions |
| `sxng session-delete` | Delete sessions |
| `sxng init` | Interactive setup |

## Tips

- Default format: search & graph nav → md; analysis commands → json. Override with `-f` or `--format`.
- Results with empty title or content are automatically filtered out by CLI
- Use `--time week/day` for recent information
- Run `sxng --health` first if searches fail
- `--session` (extract subcommand) vs `--search-session` (main search command) — different flags
- Use `--redundancy warn` to avoid repeating similar queries
- Use `--quality` after each deep search round to decide whether to continue

## Result Quality Filtering

When presenting search results to the user, apply lightweight quality judgment based on your own understanding. This is not a separate step — just a natural part of reading and outputting results.

**Filter out** results that clearly fall into these categories:

- The title and snippet are both unrelated to the query intent (not just missing keywords — semantically off-topic)
- The snippet is pure SEO stuffing: keyword repetition with no factual content
- The page is a known low-quality aggregator (mirrors, scrapers, parked domains) and adds no value beyond what other results already provide

**Do NOT filter** results that are:

- Partially relevant or tangentially related — they may provide useful context
- Written in a different style or tone than expected — relevance matters more than presentation
- Missing some query terms but still on-topic — semantic match > keyword match
- From lesser-known sources — small blogs and forums often have the best answers

**Principle: keep liberally, filter conservatively.** When uncertain about a result's relevance, always keep it. It is better to show a slightly noisy result than to hide a useful one.
