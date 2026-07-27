# 🔍 SXNG CLI

> 📖 **完整文档请访问 GitHub**: https://github.com/hkwuks/sxng-cli#readme
> 
> 本 README 为快速参考，详细的安装指南（包括 SearXNG 自托管配置、Docker 部署、settings.yml 配置等）请参阅 GitHub 文档。

<p align="center">
  <b>A powerful command-line interface for <a href="https://github.com/searxng/searxng">SearXNG</a></b><br>
  Privacy-respecting web search from your terminal
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sxng-cli">
    <img src="https://img.shields.io/npm/v/sxng-cli?style=flat-square&color=cb3837" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/sxng-cli">
    <img src="https://img.shields.io/npm/dm/sxng-cli?style=flat-square&color=cb3837" alt="npm downloads">
  </a>
  <a href="https://github.com/hkwuks/sxng-cli/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/hkwuks/sxng-cli?style=flat-square&color=green" alt="license">
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square" alt="node version">
</p>

## ✨ Features

- 🔎 **Multi-Engine Search** — Search across Google, Bing, DuckDuckGo, GitHub, StackOverflow, and 30+ engines simultaneously
- 🔄 **Dynamic Discovery** — Auto-fetches available engines and categories from your SearXNG server
- 📄 **Multiple Formats** — Markdown (LLM-optimized) or JSON output
- 🧠 **Deep Search** — Multi-round iterative research with session accumulation, quality assessment, and recovery strategies
- 🔍 **Content Extraction** — Extract full article content from URLs or session results, with Obscura (JS rendering) and Jina Reader fallbacks
- 🗂️ **Session Management** — Accumulate search results across rounds; normalized URLs and full-text character 5-gram Jaccard remove duplicates before the pending → approve → graph injection workflow
- 🔗 **External Result Fusion** — Inject results from Tavily, Exa, or any search tool into the same session pipeline via `results-add`; shared pending pool, unified quality assessment
- ⭐ **Quality Assessment** — 3 independent indicators: content depth, source diversity, and novelty
- 🕸️ **Knowledge Graph** — Structural (query→result→domain) + semantic (entity relations with source-round provenance) graph layers
- 🔄 **Query Redundancy Check** — Word-level or character-bigram Jaccard detects repeated queries
- 💡 **Agent-First Design** — Outputs structured analysis data (quality, suggestions, recovery) for LLM Agent decision-making
- 📁 **Local Document Search** — Index and BM25-search local Markdown/text files; results auto-injected into the session pipeline as `source: "local"`
- ✅ **Claim—Evidence—Review Pipeline** — L2/L3 only: submit atomic claims, auto-search evidence, verify with stance, then policy-aggregate by publisher-domain diversity for auto-approval or Agent review

## 📦 Installation

> ⚠️ **完整安装指南**: [GitHub - Installation](https://github.com/hkwuks/sxng-cli#installation)
> 
> 包含 SearXNG 自托管配置、Docker 部署、30+ 搜索引擎 settings.yml 配置等。

```bash
npm install -g sxng-cli
```

```bash
npx skills add hkwuks/sxng-cli
```

> ⚠️ **Skill 同步**：更新 `sxng-cli` 后，请同步更新 `sxng` skill 以保持功能一致：
>
> ```bash
> npx skills update hkwuks/sxng-cli
> ```

Or from source:

```bash
git clone https://github.com/hkwuks/sxng-cli.git
cd sxng-cli/cli
npm install
npm run build
npm link
```

### Obscura (Optional — for JS-heavy pages)

Content extraction uses **Defuddle + linkedom** by default. For JS-rendered pages (SPAs), enable [Obscura](https://github.com/h4ckf0r0day/obscura). When `--obscura` is used and the binary is absent, sxng automatically downloads the matching release asset from the official GitHub HTTPS download endpoint.

```bash
# Linux x86_64
curl -LO https://github.com/h4ckf0r0day/obscura/releases/latest/download/obscura-x86_64-linux.tar.gz
tar xzf obscura-x86_64-linux.tar.gz
cp obscura ~/.local/bin/

# Verify
obscura --version
```

## 🚀 Quick Start

1. **Configure the CLI:**
   ```bash
   sxng init
   ```
   Or set environment variable:
   ```bash
   export SEARXNG_BASE_URL=http://your-searxng-instance:8080
   ```

2. **Perform a search:**
   ```bash
   sxng "TypeScript tutorial"
   ```

## 📖 Usage

### Commands

| Command | Description |
|---------|-------------|
| `sxng init` | Interactive configuration setup |
| `sxng <query>` | Perform a web search |
| `sxng --queries "q1,q2"` | Multi-query search with RRF fusion |
| `sxng extract --urls <urls>` | Extract content from web pages |
| `sxng extract --session <name>` | Extract session results and merge content |
| `sxng extract --obscura` | JS-rendering fallback for SPA pages |
| `sxng extract --jina` | Jina Reader fallback for complex pages |
| `sxng --session new` | Create deep search session |
| `sxng --session <name> --quality` | Assess result quality, list pending results |
| `sxng --session <name> --quality --approve "0,1"` | Approve pending results by index |
| `sxng suggest-queries <session>` | Get query suggestion data for Agent |
| `sxng strategy-info <session>` | Check current search stage |
| `sxng recovery-analysis <session>` | Get recovery strategies for poor quality |
| `sxng session-report <session>` | Full session analysis report |
| `sxng session-list` | List all sessions |
| `sxng session-delete <name>` | Delete a session |
| `sxng graph-preprocess <session>` | TF-IDF + co-occurrence + result provenance analysis |
| `sxng graph-add <session>` | Add entities/edges to the knowledge graph; new entities require source rounds |
| `sxng graph-search <session>` | Discover entities by keyword |
| `sxng graph-explore <session>` | View entity relations |
| `sxng graph-drill <session>` | Follow specific relations |
| `sxng graph-traverse <session>` | Traverse reasoning paths |
| `sxng graph-obfuscate <session>` | List obfuscation candidates |
| `sxng results-add <session> --query <query> --data <json>` | Inject external search results into session as pending |
| `sxng doc-index <path>` | Index local documents for BM25 search |
| `sxng doc-search <session> <query> --path <path>` | Search indexed docs and inject results into session |
| `sxng claim-add <session> --claims <json>` | Submit atomic claims (single or batch, auto evidence-search) |
| `sxng claim-list <session>` | List claims |
| `sxng evidence-search <session> --claim-id <id>` | Search candidate evidence (read-only) |
| `sxng evidence-verify <session> --claim-id <id>` | Confirm evidence + submit stance (+ optional auto-policy) |
| `sxng evidence-list <session> --claim-id <id>` | List evidence for a claim |
| `sxng verdict-list <session> --claim-id <id>` | List verdicts for a claim |
| `sxng policy-aggregate <session>` | Run policy aggregation manually |
| `sxng review-list <session>` | List reviews |
| `sxng --health` | Check SearXNG server health |
| `sxng --engines-list` | List available search engines |
| `sxng --categories-list` | List available categories |

### Search Options

| Option | Description |
|--------|-------------|
| `-e, --engines <list>` | Comma-separated list of search engines (e.g., `google,github`) |
| `-c, --categories <list>` | Comma-separated list of categories (e.g., `it,science`) |
| `-l, --limit <n>` | Maximum number of results (default: 10) |
| `-p, --page <n>` | Page number for pagination |
| `--lang <code>` | Language code (e.g., `en`, `zh`, `ja`) |
| `--time <range>` | Time range: `day`, `week`, `month`, `year`, `all` |
| `-f, --format <fmt>` | Output format: `md` (default) or `json` |
| `--queries <list>` | Multi-query with RRF fusion (e.g., `q1,q2,q3`) |
| `--session <session-name>` | Session directory or `new` for deep search |
| `--owner <session-name>` | Session owner identifier |
| `--desc <text>` | Session description |
| `--redundancy <action>` | Query redundancy check: `warn`, `adjust`, `skip` |
| `--quality` | Assess result quality (requires --session) |
| `--approve <indices>` | Approve pending results by comma-separated indices |
| `--threshold-override <json>` | Override quality thresholds (JSON) |
| `--merge <file>` | Merge new results with previous search JSON |

### Examples

```bash
# Basic search (outputs Markdown by default)
sxng "machine learning"

# Output as JSON
sxng --format json "machine learning"

# Search with specific engines
sxng --engines google,duckduckgo "privacy tools"

# Search IT and Science categories
sxng --categories it,science "kubernetes tutorial"

# Limit results and filter by time
sxng --limit 5 --time week "latest AI news"

# Multi-query search with RRF fusion
sxng --queries "tokio tutorial,rust async basics,async-std guide"

# List available engines (fetched from server)
sxng --engines-list
```

## ⚙️ Configuration

Configuration priority (highest to lowest):
1. Environment variables
2. Local config file (`./sxng.config.json`)
3. Global config file (`~/sxng-cli/sxng.config.json`)
4. Default values

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SEARXNG_BASE_URL` | SearXNG server URL | *(required)* |
| `SEARXNG_DEFAULT_ENGINE` | Default search engine | *(none)* |
| `SEARXNG_ALLOWED_ENGINES` | Comma-separated allowed engines | *(all)* |
| `SEARXNG_DEFAULT_LIMIT` | Default result limit | `10` |
| `SEARXNG_DEFAULT_FORMAT` | Default output format (`md`, `json`, `csv`, `html`) | `md` |
| `SEARXNG_USE_PROXY` | Use proxy (`true`/`false`) | `false` |
| `SEARXNG_PROXY_URL` | Proxy URL | *(none)* |
| `SEARXNG_TIMEOUT` | Request timeout in ms | `10000` |

### Config File

Create `sxng.config.json`:

```json
{
  "baseUrl": "http://localhost:8080",
  "defaultEngine": "",
  "allowedEngines": [],
  "defaultLimit": 10,
  "defaultFormat": "md",
  "useProxy": false,
  "proxyUrl": "",
  "timeout": 10000
}
```

## 🧠 Deep Search

Deep search enables multi-round iterative research with session accumulation, quality assessment, agent-controlled graph injection, and recovery strategies.

### Workflow

```
Search → Extract → Preprocess → Build Graph → Quality Assess → Approve → (Loop or Explore)
                                                                         ↓
                                          (L2/L3) Claim—Evidence—Review → Final Output
```

### Quick Example

```bash
# 1. Create a session and search
sxng --session new --owner "agent-1" --desc "Rust async study" "rust async ecosystem"
# Outputs session path, e.g. .sxng/sessions/ds_1712345678_abcdef

# 2. Extract content from results
sxng extract --session ds_1712345678_abcdef

# 3. Preprocess for entity discovery and result provenance
sxng graph-preprocess ds_1712345678_abcdef

# 4. Add entities with source rounds from graph-preprocess resultProvenance
sxng graph-add ds_1712345678_abcdef --data '{
  "entities": [
    {"label": "tokio", "entityType": "runtime", "score": 0.95, "sourceRounds": [1]},
    {"label": "async-std", "entityType": "runtime", "score": 0.85, "sourceRounds": [1]}
  ],
  "edges": [
    {"source": "e:tokio", "target": "e:async_std", "relation": "alternative_to", "weight": 0.9}
  ]
}'

# 5. Assess quality — results are pending until approved
sxng --session ds_1712345678_abcdef --quality

# 6. Approve pending results by index (injects into graph)
sxng --session ds_1712345678_abcdef --quality --approve "0,1,2,3"

# 7. Continue research with redundancy check
sxng --session ds_1712345678_abcdef --queries "tokio vs async-std,benchmark 2026" --redundancy warn
```

### Quality and Evidence Semantics

- Extracted web content is deduplicated by normalized URL, then by full-text character 5-gram Jaccard similarity. Query redundancy uses a separate word-level or character-bigram Jaccard check.
- `--quality` assesses the newest recorded round against earlier approved results. A URL already seen in an earlier round is non-novel, even when it reappears in the newest round.
- Claim policy treats two normalized publisher domains as two sources. It does not infer corporate ownership, editorial relationships, or syndication across domains.

### Session Management

| Command | Description |
|---------|-------------|
| `sxng --session new` | Create new auto-named session |
| `sxng --session <session-name>` | Use session by name |
| `sxng session-list` | List all sessions with stats |
| `sxng session-delete <session-name>` | Delete specific session |
| `sxng session-delete --older <hours>` | Delete old sessions |

**Session Path Resolution:**
- Pure name (e.g., `my-session`) → `.sxng/sessions/my-session`
- Full path (e.g., `/custom/path/session`) → used as-is
- `new` → auto-generate unique name under `.sxng/sessions/`

### Knowledge Graph

Two layers:

**Structural** (auto-built):
| Prefix | Type | Example |
|--------|------|---------|
| `q:` | Query node | `q:rust_async` |
| `r:` | Result node | `r:https://example.com/page` |
| `d:` | Domain node | `d:github_com` |

**Semantic** (via `graph-add`):
| Prefix | Type | Example |
|--------|------|---------|
| `e:` | Entity node | `e:tokio` |
| `p:` | Path node | `p:chain_001` |

Graph navigation commands: `graph-search` (discover entities), `graph-explore` (view relations), `graph-drill` (follow specific relations), `graph-traverse` (traverse reasoning paths).

`graph-preprocess` returns `resultProvenance` (`url`, `title`, `rounds`) for each result. For every new entity, select the supporting results, union their `rounds`, and send that array as `sourceRounds`. This lets `strategy-info` calculate entity growth from verified search rounds.

### External Search Results

Results from other search tools (Tavily, Exa, etc.) can be injected into any active session via `results-add`, following the same pipeline as native sxng results:

```bash
sxng results-add <session-name> --query "async runtime" --data '[
  {"url": "https://...", "title": "...", "source": "tavily"}
]'
```

After injection, results are `pending` and follow `--quality` → `--approve` → `graph-add`. The required `--query` records the source query so `graph-preprocess` can provide correct `resultProvenance` rounds.

### Claim—Evidence—Review Pipeline (L2/L3 Only)

After search, extraction, and graph building, the Agent can run the claim audit pipeline to verify individual statements before final output. CLI does the deterministic work (evidence anchoring, hash verification, Jaccard matching, policy rules); the Agent does all semantic reasoning (claim extraction, stance judgement, final output decisions).

**Workflow:**

```
Agent writes draft → claim-add (auto evidence-search) → 
evidence-verify (with --complete auto-policy) → Review → Agent adjusts output
```

**Quick Example:**

```bash
# 1. Submit claims from your draft
sxng claim-add my-session --claims '[
  {"text":"Tokio is the most widely used async runtime","riskLevel":"medium"},
  {"text":"async-std is no longer actively maintained","riskLevel":"medium"}
]'
# → returns claims with IDs + auto-discovered evidence candidates

# 2. Verify evidence + submit stance (+ auto policy aggregation)
sxng evidence-verify my-session --claim-id "cl_001" \
  --evidence '{"resultUrl":"https://tokio.rs/","quote":"Tokio is the most widely used async runtime...","charStart":45,"charEnd":93}' \
  --stance support --reason "Official docs confirm" --complete
# → returns evidence + verdict + review (decision: approved / needsReview)

# 3. Check final reviews
sxng review-list my-session
```

**Key Principles:**
- **Deterministic checks**: CLI validates URL in approved results, UTF-16 offsets within range, SHA256 hash of quote matches source
- **No embedded LLM**: All semantic work (claim extraction, stance) is done by the Agent outside the CLI
- **Policy rules**: 7 rules (singleRefute → highRiskInsufficient → dualSourceSupport → dualSourceMixed → singleSource → allInsufficient → fallback) — pure rule engine, no model calls
- **`--complete` flag**: Evidence + verdict + auto-policy in one call

| Commands | Purpose |
|----------|---------|
| `claim-add` | Submit claims (auto-triggers evidence search) |
| `evidence-verify` | Confirm evidence + submit stance + optional auto-policy |
| `policy-aggregate` | Manual re-aggregation |
| `claim-list` / `evidence-list` / `verdict-list` / `review-list` | Query pipeline state |

The pipeline is **only available for L2/L3 deep search sessions** — L1 simple searches have no session or approved results pool.

### Local Document Search

`doc-index` and `doc-search` enable BM25 full-text search over local documents, with results flowing directly into the session pipeline:

```bash
# Index (auto-triggered by doc-search)
sxng doc-index ./docs

# Search and inject into session
sxng doc-search <session-name> "query" --path ./docs
```

**How it works:** auto-indexing on first use (Orama BM25, title×3 / headings×2 / content×1), results injected as `source: "local"` pending, same `--quality` → `--approve` → `graph-add` flow. Use `graph-preprocess` before adding new entities so their `sourceRounds` come from result provenance. Local searches do **not** increment the round counter.

**Quality note:** Pure local search yields `sourceDiversity: 1`. Combine with web results for adequate diversity.

### Known Limitations

- Session and claim state is stored across JSON files without transactional concurrent-write protection.
- URL extraction is not an SSRF security boundary; use only trusted public URLs.
- Local document scanning has no defined symbolic-link boundary or cycle policy.
- Index rebuilds overwrite the current persistence files; an interruption or disk failure can require re-indexing.

See [PRD-005 design improvements](docs/prds/PRD-005-design-improvements.md) for the deferred remediation plan.

## 💡 Projects Using SXNG CLI

SXNG CLI's deep search workflow (session accumulation, quality assessment, knowledge graph, claim–evidence–review) is used by projects that need persistent, multi-round research capabilities:

- **[1052 OS](https://github.com/1052666/1052-OS)** — A personal AI operating system. Its `search-pack` integrates persistent research sessions, quality assessment, content extraction, and a claim–evidence–review pipeline, all powered by the same deep search concepts that drive SXNG CLI.

> Open a PR to add your project here.

## 🔗 Links

- **GitHub:** https://github.com/hkwuks/sxng-cli
- **npm:** https://www.npmjs.com/package/sxng-cli
- **SearXNG:** https://github.com/searxng/searxng

## 📄 License

MIT
