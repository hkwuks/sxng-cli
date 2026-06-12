---
name: sxng
description: "Web search using SearXNG CLI. Use when you need to search the web for current information, documentation, or research. Supports deep multi-round search with knowledge graph, quality assessment, recovery strategies, and content extraction (including Obscura JS-rendering fallback for SPA/dynamic pages). Triggers: 'search for', 'look up', 'find information', 'web search', 'deep search', 'deep dive', 'extract content', 'JS rendering', 'SPA page', or any request needing up-to-date information."
---

# SearXNG Web Search

Use `sxng` CLI to search the web. Results are automatically deduplicated: URL normalization (trailing slash, fragments, query param order) removes exact duplicates, then SimHash removes near-duplicate content (e.g. mirrors, reprints). Default output format: **md** for search & graph navigation commands (graph-search/explore/drill/traverse); **json** for analysis commands (graph-preprocess, suggest-queries, strategy-info, recovery-analysis, session-report, graph-obfuscate). Use `-f` or `--format` to override.

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
| `-l, --search-limit` | `-l 20` | Max results (default: 10) |
| `-p, --page` | `-p 2` | Pagination |
| `--lang` | `--lang zh` | Result language (en, zh, ja, etc.) |
| `--time` | `--time week` | Filter: day/week/month/year/all |
| `--merge` | `--merge results.json` | Merge new results with previous search JSON |
| `--format` | `--format json` | Output format: md (default), json |
| `--queries` | `--queries "q1,q2,q3"` | Multi-query with RRF fusion |
| `--search-session` | `--search-session new` | Session dir or "new" to auto-create |
| `--owner` | `--owner "agent-1"` | Session owner (stored in meta.json) |
| `--desc` | `--desc "research topic"` | Session description |
| `--redundancy` | `--redundancy warn` | Redundancy check: warn / adjust / skip |
| `--quality` | `--quality` | Assess result quality for session |
| `--threshold-override` | `--threshold-override '{"resultCount":10}'` | Override quality thresholds |

## Extract

Extract full article content from web pages. Two-tier strategy: **Defuddle + linkedom** (fast, no browser) → **Obscura** (V8 JS rendering fallback for SPAs/dynamic pages).

```bash
sxng extract --urls "https://example.com/a,https://example.com/b"
sxng extract --from-json <session-name> search.json
sxng extract --session <session-name>

# With Obscura fallback for JS-heavy pages
sxng extract --urls "https://spa-site.com" --obscura

# Obscura direct markdown output (skips Defuddle re-parse, faster but no title/byline)
sxng extract --urls "https://spa-site.com" --obscura --obscura-dump markdown

# Custom Obscura path (auto-detected from PATH, ~/.local/bin/obscura, /usr/local/bin/obscura)
sxng extract --urls "https://spa-site.com" --obscura --obscura-path /path/to/obscura

# Session extract with Obscura fallback
sxng extract --session <session> --obscura
```

| Option | Description |
|--------|-------------|
| `--obscura` | Enable Obscura JS-rendering fallback |
| `--obscura-path <path>` | Path to Obscura binary (auto-detected if omitted) |
| `--obscura-dump <format>` | `html` (default, re-parsed by Defuddle) or `markdown` (direct output, faster but no metadata) |

> **Note**: `--session` (extract subcommand) vs `--search-session` (main command) — different flags for different commands.

## Deep Search

Deep search enables multi-round iterative research with quality assessment, recovery strategies, and knowledge graph navigation.

Session stores three files:
- **`results.json`** — Accumulated search results (URL dedup, multi-round accumulation)
- **`graph.json`** — Knowledge graph (structural + semantic layers)
- **`meta.json`** — Session metadata (owner, description, timestamps)

> **For detailed SOP including L1/L2/L3 complexity levels and evidence standards, read `skills/sxng/references/SOP.md`**

### 8-Phase Agent Workflow

```
Phase 1: Initial search
  sxng "initial query" --search-session <name> --owner <agent-id> --desc <topic>

Phase 2: Preprocess & entity discovery
  sxng graph-preprocess <session>
  [LLM] → Select high-value entities from TF-IDF / co-occurrence results

Phase 3: Build knowledge graph
  sxng graph-add <session> --data '{"entities":[...],"edges":[...]}'

Phase 4: Quality assessment
  sxng --search-session <name> --quality
  [LLM] → Is verdict "good"?

Phase 5: Query suggestions (if quality not met)
  sxng suggest-queries <session>
  [LLM] → Select next queries from topEntities / unexploredDomains

Phase 6: Continue search (with redundancy check)
  sxng "follow-up query" --search-session <name> --redundancy warn
  → Loop back to Phase 2 until quality is satisfactory

Phase 7: Recovery analysis (if consecutive poor rounds)
  sxng recovery-analysis <session>
  [LLM] → Choose: reformulate / engine_rotation / category_shift / backtrack

Phase 8: Graph exploration (after quality is good)
  sxng graph-search <session> --keyword <term>
  sxng graph-explore <session> --seed <entity>
  sxng graph-drill <session> --seed <entity> --relations <list>
  sxng graph-traverse <session> --path <path-id>
```

### Session Management

Sessions stored under `~/sxng-cli/sessions/` by default.

```bash
# Create new auto-named session
sxng --search-session new --owner "agent-1" --desc "async ecosystem research" "rust async"

# List all sessions
sxng session-list

# Delete sessions
sxng session-delete <session-name>
sxng session-delete --older 24
```

With `--search-session new`, CLI auto-generates a unique directory name and returns the path. Use that path for subsequent commands.

### Quality Assessment

After each search round, assess result quality:

```bash
sxng --search-session <session> --quality
```

Returns 5 independent indicators:

| Indicator | Measures | Default Threshold |
|-----------|----------|-------------------|
| resultCount | Number of unique results | >= 5 |
| contentDepth | Avg content length of extracted results | >= 150 chars |
| entityRichness | Agent-added entity count in graph | >= 2 |
| sourceDiversity | Distinct domains | >= 3 |
| novelty | Fraction of new results not similar to existing | >= 0.3 |

**Verdict logic**: good (all pass) / acceptable (<=2 fail) / poor (>=3 fail)

Override thresholds:
```bash
sxng --search-session <session> --quality --threshold-override '{"resultCount":3}'
```

### Decision: What to Do Based on Quality

| Verdict | Action |
|---------|--------|
| good | Enter Phase 8 (graph exploration) or synthesize answer |
| acceptable | Run `suggest-queries`, target failed indicators |
| poor | Run `recovery-analysis`, consider strategy shift |

### Recovery Strategies

When quality is poor, `recovery-analysis` suggests strategies:

| Strategy | When to Use | Action |
|----------|-------------|--------|
| reformulate | Query too specific | Remove qualifiers, broader terms |
| engine_rotation | Current engine missed results | Switch engines (e.g. google → arxiv+github) |
| category_shift | Category results are poor | Switch category (e.g. general → it) |
| backtrack | >=2 consecutive poor rounds | Return to last good round, explore different direction |

### Search Strategy

`sxng strategy-info <session>` tells you the current search stage:

- **broad_exploration** (first 2-3 rounds): Use general engines (google, bing)
- **targeted_deep_dive** (after growth slows): Use specialized sources (arxiv, github, semantic_scholar)

Transition signal: entity growth rate drops below threshold (default 0.2).

### Redundancy Check

Before searching, check if a query is too similar to previous ones:

```bash
sxng "query" --search-session <session> --redundancy warn   # Warn but continue
sxng "query" --search-session <session> --redundancy adjust  # Auto-adjust query
sxng "query" --search-session <session> --redundancy skip    # Skip redundant query
```

### Knowledge Graph

**Structural Layer** (auto-built by CLI every search):

| Node type | Prefix | Attributes |
|-----------|--------|------------|
| query | `q:` | label, query, round |
| result | `r:` | label, url, title, rank |
| domain | `d:` | label, domain |
| path | `p:` | pathType, hops, entities |

Edges: `yields` (query→result), `belongs_to` (result→domain), `includes` (path→entity)

**Semantic Layer** (added by you via graph-add after analysis):

| Node type | Prefix | Attributes |
|-----------|--------|------------|
| entity | `e:` | label, entityType, score, obfuscatedLabel |

Edges: any relation type between entity↔entity or entity→result, with custom weights

### Graph Commands

#### graph-preprocess — Analyze session for entities

```bash
sxng graph-preprocess <session>                    # Default: top 30 terms, JSON
sxng graph-preprocess <session> --top 50 --format md
```

Returns: TF-IDF terms, co-occurrence pairs, existing entities, coverage stats.

#### graph-add — Add entities and edges

```bash
sxng graph-add <session> --data '{
  "entities": [
    {"label": "tokio", "entityType": "runtime", "score": 0.95},
    {"label": "async-std", "entityType": "runtime", "score": 0.85}
  ],
  "edges": [
    {"source": "e:tokio", "target": "e:async_std", "relation": "alternative_to", "weight": 0.9},
    {"source": "e:tokio", "target": "r:https_tokio_rs_", "relation": "mentioned_in", "weight": 1.0}
  ]
}'
```

Edge source/target must reference existing node IDs. Invalid references are skipped and reported in `skippedEdges`.

#### graph-search — Discover entities by keyword

```bash
sxng graph-search <session> --keyword "async"
sxng graph-search <session> --keyword "tokio" --limit 5 --format json
```

Returns matching entity IDs, labels, scores, and degrees. Use this to find entities before exploring them.

#### graph-explore — View entity relations

```bash
sxng graph-explore <session> --seed "tokio"
sxng graph-explore <session> --seed "tokio" --format json
```

Lists all outgoing/incoming relations for a seed entity, with suggested next steps.

#### graph-drill — Follow specific relation types

```bash
sxng graph-drill <session> --seed "tokio" --relations "alternative_to"
sxng graph-drill <session> --seed "tokio" --relations "alternative_to,depends_on" --format json
```

Returns triples for specified relation types, with next step suggestions.

#### graph-traverse — Traverse a reasoning path

```bash
sxng graph-traverse <session> --path "p:chain_001"
sxng graph-traverse <session> --path "p:chain_001" --format json
```

Walks a reasoning path node hop by hop, with source information. Path nodes are created by `graph-preprocess`.

#### graph-obfuscate — Entity obfuscation (experimental)

```bash
sxng graph-obfuscate <session> --list           # List obfuscation candidates
sxng graph-obfuscate <session> --fallback-rules  # Apply rule-based obfuscation
```

> **Note**: `--fallback-rules` is experimental. Recommended workflow: use `--list` to get candidates, have LLM generate obfuscated labels, then write them back via `graph-add`.

### Complete Example

Research "Rust async ecosystem differences and recommendations":

```bash
# Round 1: Create session and search
sxng --search-session new --owner "agent-1" --desc "async ecosystem" "rust async ecosystem"
# Output includes session path, e.g. ~/sxng-cli/sessions/ds_1234567890_abc

SESSION="ds_1234567890_abc"

# Extract content from results
sxng extract --session $SESSION

# Preprocess: get TF-IDF terms and co-occurrences
sxng graph-preprocess $SESSION --format json

# After reading results, add key entities to graph
sxng graph-add $SESSION --data '{
  "entities": [
    {"label": "tokio", "entityType": "technology", "score": 0.9},
    {"label": "async-std", "entityType": "technology", "score": 0.8},
    {"label": "smol", "entityType": "technology", "score": 0.7}
  ],
  "edges": [
    {"source": "e:tokio", "target": "e:async_std", "relation": "alternative_to"},
    {"source": "e:tokio", "target": "e:smol", "relation": "alternative_to"}
  ]
}'

# Assess quality
sxng --search-session $SESSION --quality

# If quality is acceptable/poor, get query suggestions
sxng suggest-queries $SESSION --format json

# Round 2: Focused search with redundancy check
sxng --search-session $SESSION --queries "tokio vs async-std comparison,rust async runtime benchmark 2024" --redundancy warn

# Extract again
sxng extract --session $SESSION

# Add new findings
sxng graph-add $SESSION --data '{"entities":[...],"edges":[...]}'

# Check quality again
sxng --search-session $SESSION --quality

# If good — explore the graph
sxng graph-search $SESSION --keyword "async"
sxng graph-explore $SESSION --seed "tokio" --format json
sxng graph-drill $SESSION --seed "tokio" --relations "alternative_to,depends_on" --format json

# If poor for multiple rounds — get recovery advice
sxng recovery-analysis $SESSION --format json

# When done, clean up
sxng session-delete --older 24
```

### When to Stop

- Quality verdict is "good"
- Already 3+ search rounds
- Entity graph covers the topic sufficiently (check with `graph-explore`)
- All follow-up angles exhausted
- New unique results < 3 per round

## When to Use

### Quick Decision Guide

**Use Simple Search (`sxng <query>`) when:**
- Looking for specific information (API usage, error solutions)
- The question has a definitive answer, solvable with 1-2 results
- Finding official docs or GitHub repo addresses

**Use Deep Search (`--search-session` workflow) when:**
- Multi-dimensional information integration needed (tech selection, market analysis)
- Information is scattered across sources requiring cross-validation
- Tracking evolution of a topic (ecosystem changes, version updates)
- Output is a research report, tech survey, or decision analysis
- Initial search reveals incomplete information requiring deeper digging

### Examples

| Your Need | Recommended Approach | Command Example |
|---------|---------------------|-----------------|
| "Python dict get method usage" | Simple search | `sxng "python dict get method"` |
| "Compare PostgreSQL vs MySQL performance" | **Deep Search** | `sxng --search-session new --owner "agent-1" "PostgreSQL vs MySQL benchmark"` |
| "React latest version features" | Simple search | `sxng "React 19 new features" --time month` |
| "Frontend build tools ecosystem survey" | **Deep Search** | `sxng --search-session new --owner "agent-1" "frontend build tools ecosystem"` |
| "Fix Docker port already allocated error" | Simple search | `sxng "docker port already allocated fix"` |

## Command Reference

| Command | Purpose | Key Output |
|---------|---------|------------|
| `sxng <query>` | Search the web | results, suggestions |
| `sxng extract` | Extract page content | extracted text |
| `sxng graph-preprocess` | TF-IDF + co-occurrence analysis | tfidfTerms, coOccurrences, existingEntities |
| `sxng graph-add` | Add entities/edges to graph | (updates graph.json) |
| `sxng graph-search` | Discover entities by keyword | id, label, score, degree |
| `sxng graph-explore` | View entity relations | outgoingRelations, incomingRelations, suggestedNextSteps |
| `sxng graph-drill` | Follow specific relations | triples, nextSteps |
| `sxng graph-traverse` | Traverse reasoning path | hops, sources |
| `sxng graph-obfuscate` | Entity obfuscation (experimental) | candidates / fallback labels |
| `sxng suggest-queries` | Query suggestions for next round | topEntities, unexploredDomains, qualityLastRound |
| `sxng strategy-info` | Current search stage | currentStage, recommendedEngines, recommendedCategories |
| `sxng recovery-analysis` | Recovery strategy analysis | availableStrategies, roundQualityHistory |
| `sxng session-report` | Full session history | quality, strategy, suggestions, recovery |
| `sxng session-list` | List all sessions | session names, stats |
| `sxng session-delete` | Delete sessions | (removes session dirs) |
| `sxng init` | Interactive setup | (writes config) |

## Tips

- Default format: search & graph nav commands → md; analysis commands (graph-preprocess, suggest-queries, strategy-info, recovery-analysis, session-report, graph-obfuscate) → json. Override with `-f` or `--format` on all commands.
- Use `-c` or `-e` to target specific sources
- Use `--time week/day` for recent information
- Run `sxng --health` first if searches fail
- Content extraction: use `sxng extract` or any other fetch tool — both work
- `--session` (extract subcommand) vs `--search-session` (main search command) — different flags, different commands
- Obscura auto-detects from PATH, `~/.local/bin/obscura`, `/usr/local/bin/obscura` — no `--obscura-path` needed if installed there
- `graph-add` accepts session name or directory path
- Use `--redundancy warn` to avoid repeating similar queries
- Use `--quality` after each round to decide whether to continue
- `graph-obfuscate --fallback-rules` is experimental — prefer LLM-generated labels
