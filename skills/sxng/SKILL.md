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

# Claim—Evidence—Review (L2/L3 only, after search)
sxng claim-add <session> --claim '<json>'                    # Add single claim
sxng claim-add <session> --claims '<json array>'             # Batch add claims
sxng claim-list <session>                                    # List claims
sxng evidence-search <session> --claim-id <id>               # Search evidence candidates (read-only)
sxng evidence-verify <session> --claim-id <id> \             # Verify evidence + stance
  --evidence '<json>' --stance support --reason '...' --complete
sxng evidence-list <session> --claim-id <id>                 # List evidence for a claim
sxng verdict-list <session> --claim-id <id>                  # List verdicts for a claim
sxng policy-aggregate <session>                              # Manual policy aggregation
sxng review-list <session>                                   # List reviews

# Quality & iteration
sxng --session <session> --quality   # Assess result quality & list pending
sxng --session <session> --quality --approve "0,1,2"  # Approve pending results
sxng suggest-queries <session>              # Get query suggestions
sxng strategy-info <session>                # Check search stage
sxng recovery-analysis <session>            # Get recovery strategies
sxng session-report <session>               # Full session report

# Knowledge graph
sxng graph-preprocess <session>             # TF-IDF + co-occurrence analysis
sxng results-add <session> --data '[...]'  # Append external results as pending
sxng graph-add <session> --data '{...}'     # Add entities/edges (after approval)
sxng graph-search <session> --keyword "x"   # Discover entities
sxng graph-search <session> --keyword "x" --limit 5  # Limit results
sxng graph-explore <session> --seed "x"     # View entity relations
sxng graph-drill <session> --seed "x" --relations "r1,r2"  # Follow relations
sxng graph-traverse <session> --path "p:chain_001"  # Traverse reasoning paths
sxng graph-obfuscate <session> --list       # List obfuscation candidates

# Local document search
sxng doc-index <path>                        # Index documents (auto-triggered by doc-search)
sxng doc-search <session> <query> --path <p>  # Search indexed docs & inject into session

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

Deep search enables multi-round iterative research with session accumulation, quality assessment, recovery strategies, and knowledge graph navigation.

> Read the [SOP](references/SOP.md) for core procedures and [Evidence Standards](references/evidence-standards.md) for source quality rules before starting.

> **🔗 Session Continuity Rule (Hard Requirement)**
>
> Once a deep search session is created, **ALL results from ALL search backends MUST go into that same session** via `results-add`. The session is the state container — abandoning it discards the knowledge graph, quality history, redundancy state, and strategy progression.
>
> **Allowed:**
> - Switch search backends when one fails (sxng → tavily → exa → open-web-search)
> - Inject external results into the current session via `results-add`
> - Extract content from URLs independently and add to the session
>
> **Forbidden:**
> - Create a **new session** for the same topic while an active session exists
> - Abandon the session and output results outside it
> - Use a different search flow that bypasses the existing session
>
> **Exception**: Only create a new session if the current one is **corrupted** (e.g. `results.json` is unreadable). A search backend returning 0 results or errors is NOT corruption — switch backends, not sessions.

### Pipeline Overview

All results go into the same pool, same pipeline:

```bash
sxng --session <session> "query"  ──┐
sxng results-add <session> ...    ──┤──→ results.json (pending)
                                    │
sxng extract --session <session>  ──┘   (updates content only)
                                    │
                    ┌───────────────▼───────────────┐
                    │  --quality (view pending)     │
                    │  --approve "0,1" (→ graph)    │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  graph-add (entities/edges)   │
                    └───────────────────────────────┘
                    │
                    │  (L2/L3 only)
                    │
                    ┌───────────────▼───────────────┐
                    │  claim-add (+ auto evidence)  │
                    │  evidence-verify (+ auto      │
                    │    policy-aggregate → review)  │
                    └───────────────┬───────────────┘
                    │
                    ┌───────────────▼───────────────┐
                    │  Agent adjusts final output   │
                    │  (only cite approved claims)  │
                    └───────────────────────────────┘
```

- **All results** (sxng + external) become `pending` in the same `results.json`
- **Extract** only fills `content` — does not add new results
- **Approve** injects approved results into graph (structural edges)
- **graph-add** only adds entities/edges — results go through approve first
- **Claim pipeline** (L2/L3 only): Agent submits claims → CLI auto-searches evidence → Agent verifies → CLI aggregates policy → Agent adjusts output

### Quick Start

```bash
# Create session and search
sxng --session new --owner "agent-1" --desc "topic" "query"
# Output includes session path, use it for subsequent commands

# Extract content from results
sxng extract --session <session>

# Preprocess for entity discovery
sxng graph-preprocess <session>

# Assess quality & approve pending results (injects approved into graph)
sxng --session <session> --quality
sxng --session <session> --quality --approve "0,1,2"

# Add entities/edges to knowledge graph (after results in graph)
sxng graph-add <session> --data '{"entities":[...],"edges":[...]}'

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

Returns 3 independent indicators: contentDepth, sourceDiversity, novelty. Verdict: good / acceptable / poor. Based on verdict, use `suggest-queries` or `recovery-analysis` for next steps.

All results accumulate as *pending* in the same pool. At **≥30 pending**, CLI warns the Agent to assess. The Agent runs quality, sees pending results with indices, and approves:

```bash
# View pending results with indices (and quality score)
sxng --session <session> --quality

# Approve selected indices — injects into graph automatically
sxng --session <session> --quality --approve "0,1,2"
```

One `--approve` call processes results from all sources together.

### Knowledge Graph

Two layers:
- **Structural** (auto-built via `--approve`): query→result→domain nodes and edges
- **Semantic** (added by you via `graph-add`): entity nodes with custom relation edges

Results must be approved first (→ structural layer). Then use `graph-add` to add entities/edges referencing those result nodes.

```bash
# Correct order:
# 1. Search or results-add
sxng --session <session> "query"
sxng results-add <session> --data '[...]'  # external results

# 2. Extract content (optional, any time)
sxng extract --session <session>

# 3. Approve pending → structural graph built
sxng --session <session> --quality --approve "0,1,2"

# 4. Add entities/edges (now result nodes exist)
sxng graph-add <session> --data '{"entities":[...],"edges":[...]}'
```

**External search results**: When using other search tools (tavily, exa, etc.), inject results via the same pipeline—`results-add` → `--approve` → `graph-add` — exactly like sxng results.

When adding edges, `source`/`target` must reference existing node IDs:

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
| `sxng results-add` | Append external results as pending |
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
| `sxng claim-add` | Submit claims (single or batch, auto evidence-search) |
| `sxng claim-list` | List claims |
| `sxng evidence-search` | Search candidate evidence (read-only) |
| `sxng evidence-verify` | Confirm evidence + submit stance (+ optional auto-policy) |
| `sxng evidence-list` | List evidence for a claim |
| `sxng verdict-list` | List verdicts for a claim |
| `sxng policy-aggregate` | Run policy aggregation manually |
| `sxng review-list` | List reviews |

## Tips

- Default format: search & graph nav → md; analysis commands → json. Override with `-f` or `--format`.
- Results with empty title or content are automatically filtered out by CLI
- Use `--time week/day` for recent information
- If searches fail, retry the same command with the required sandbox/network permission before using fallback tools
- Use `--quality` after accumulating enough pending results (≥30 triggers a warning)
- Use `--redundancy warn` to avoid repeating similar queries

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
