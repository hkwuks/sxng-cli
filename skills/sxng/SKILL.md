---
name: sxng
description: "Search the web for ANY current information, facts, docs, answers, or content. ALWAYS invoke this skill when the user asks about real-world topics — technologies, products, libraries, frameworks, APIs, versions, prices, comparisons, tutorials, error solutions, documentation, reviews, news, or any factual question. CRITICAL RULE: search before relying on your training data when there's even a small chance the answer could be outdated or incomplete. Use even when the user doesn't say 'search' — any question about the current state of the world triggers this. Recognize inquiry patterns like: what is / how to / tell me about / find / compare / vs / latest / new / update / fix / error / solve / why does / when did / where can I / which is / guide / tutorial / example / documentation / review / alternative / difference / price / cost. Use deep search (--session) for multi-dimensional comparisons, research reports, thorough investigations, or when initial results are shallow. Use extract for page content from specific URLs."
---

# SearXNG Web Search

> **CRITICAL: Use this skill PROACTIVELY.** The default answer to any information-seeking question should be a web search, not your training data. When in doubt, search — a search costs seconds, a confidently wrong answer costs trust. This section is your trigger guide.

Use `sxng` CLI to search the web. Results are automatically deduplicated (URL normalization + SimHash near-duplicate removal). CLI automatically filters out results with empty title or content.

## Proactive Usage — Always Search When

| If the user... | Then... |
|---------------|---------|
| Asks about any technology, library, framework, tool, or product | → search for current info (versions, docs, comparisons, reviews) |
| Asks "what is", "how to", "tell me about", "find", "compare", "vs" | → search the web |
| Reports an error or unexpected behavior | → search for solutions, known issues, fixes |
| Wants a recommendation ("which is better", "best X for Y") | → deep search with multi-round session |
| Asks about prices, costs, or alternatives | → search for current data |
| Asks about events, dates, or news | → search (your training data is outdated for this) |
| Provides a URL and wants content extracted | → `sxng extract --urls` |
| Wants to understand a page's full content | → `sxng extract --urls` to get the article body |
| Has a question you're not 100% confident about | → search to verify |

**Rule of thumb**: If the answer exists on the web, use sxng. Do not guess, do not rely on static knowledge. Your training data is a snapshot; the web is current.

## Quick Reference

```bash
# Simple search
sxng <query>                                # Search (markdown output)
sxng --format json <query>                  # Search (JSON output)
sxng --queries "q1,q2,q3"                  # Multi-query with RRF fusion & dedup

# Deep search session
sxng --session new --owner "agent-1" --desc "topic" "query"
sxng --session <session> "more queries"

# Content extraction
sxng extract --urls "url1,url2"             # Extract from URLs
sxng extract --session <session>            # Extract session results
sxng extract --urls "url1" --obscura        # Fallback: JS rendering
sxng extract --urls "url1" --jina           # Fallback: Jina Reader

# Quality & iteration
sxng --session <session> --quality   # Assess result quality & list pending
sxng --session <session> --quality --approve "0,1,2"  # Approve pending results
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
sxng session-list                           # List workspace sessions
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
| `--session` | `--session new` | Session dir or "new" to auto-create |
| `--owner` | `--owner "agent-1"` | Session owner |
| `--desc` | `--desc "research topic"` | Session description |
| `--redundancy` | `--redundancy warn` | Redundancy check: warn / adjust / skip |
| `--quality` | `--quality` | Assess result quality (requires --session) |
| `--approve <indices>` | `--approve "0,1,2"` | Approve pending results by index (requires --quality) |
| `--threshold-override` | `--threshold-override '{"contentDepth":100}'` | Override quality thresholds (JSON) |

## Extract

Extract full article content from web pages. If simple extraction fails (SPA or JS-heavy pages), use `--obscura` or `--jina` as fallback.

```bash
sxng extract --urls "https://example.com/a,https://example.com/b"
sxng extract --session <session-name>
sxng extract --urls "https://spa-site.com" --obscura
sxng extract --urls "https://spa-site.com" --jina
```

| Option | Purpose |
|--------|---------|
| `--obscura` | JS-rendering fallback for SPA pages |
| `--jina` | Jina Reader fallback for complex pages |

## Deep Search

Deep search enables multi-round iterative research with quality assessment, recovery strategies, and knowledge graph navigation.

> **Read `skills/sxng/references/SOP.md` when doing any multi-result search** — it covers source credibility tiers (white/grey/black list), cross-validation rules, and the Result Quality Filtering principle (keep liberally, filter conservatively). For deep search specifically, it also has L1/L2/L3 complexity levels, the full 8-phase workflow with Agent decision logic, and anti-patterns to avoid.

### Quick Start

```bash
# Create session and search
sxng --session new --owner "agent-1" --desc "topic" "query"
# Output includes session path, use it for subsequent commands

# Extract content from results
sxng extract --session <session>

# Preprocess for entity discovery
sxng graph-preprocess <session>

# Add entities to knowledge graph
sxng graph-add <session> --data '{"entities":[...],"edges":[...]}'

# Assess quality
sxng --session <session> --quality

# Get suggestions if quality needs improvement
sxng suggest-queries <session>

# Continue searching with redundancy check
sxng "follow-up" --session <session> --redundancy warn
```

### Session Management

Sessions are stored under `.sxng/sessions/` in the current working directory. 

```bash
sxng session-list                           # List all sessions
sxng session-delete <name>                  # Delete a session
sxng session-delete --older 24              # Delete sessions older than 24h
```

### Quality Assessment

```bash
sxng --session <session> --quality
```

Returns 4 independent indicators: contentDepth, entityRichness, sourceDiversity, novelty. Verdict: good / acceptable / poor. Based on verdict, use `suggest-queries` or `recovery-analysis` for next steps.

Results are accumulated as *pending* and must be approved by the Agent before injection into the knowledge graph:

```bash
# View pending results with indices
sxng --session <session> --quality

# Approve selected pending results by comma-separated indices
sxng --session <session> --quality --approve "0,1,2"

# Approved results are automatically injected into the graph
```

When ≥30 results are pending, a warning is shown prompting quality assessment.

### Knowledge Graph

Two layers:
- **Structural** (auto-built): query→result→domain nodes and edges
- **Semantic** (added by you via `graph-add`): entity nodes with custom relation edges

**External search results**: When using other search tools (tavily, exa, open-web-search, etc.) during a deep search session, inject their results into the graph via `graph-add` with the `source` field. This ensures the graph reflects all discoveries, not just sxng results. Result nodes carry a `source` field (`"sxng"` | `"tavily"` | `"exa"` | ...) — sxng-native results default to `"sxng"`.

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

**Deep Search** (`--session`): multi-dimensional comparison, cross-validation needed, research reports, or initial search reveals incomplete information.

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
- If searches fail, retry the same command with the required sandbox/network permission before using fallback tools
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
