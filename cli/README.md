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
- 🗂️ **Session Management** — Accumulate search results across rounds with deduplication; pending → approve → graph injection workflow
- ⭐ **Quality Assessment** — 4 independent indicators: content depth, entity richness, source diversity, novelty
- 🕸️ **Knowledge Graph** — Structural (query→result→domain) + semantic (entity relations) graph layers
- 🔄 **Query Redundancy Check** — Jaccard similarity + SimHash to avoid repeated queries
- 💡 **Agent-First Design** — Outputs structured analysis data (quality, suggestions, recovery) for LLM Agent decision-making

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

Content extraction uses **Defuddle + linkedom** by default. For JS-rendered pages (SPAs), enable [Obscura](https://github.com/h4ckf0r0day/obscura):

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
| `sxng graph-preprocess <session>` | TF-IDF + co-occurrence analysis |
| `sxng graph-add <session>` | Add entities/edges to knowledge graph |
| `sxng graph-search <session>` | Discover entities by keyword |
| `sxng graph-explore <session>` | View entity relations |
| `sxng graph-drill <session>` | Follow specific relations |
| `sxng graph-traverse <session>` | Traverse reasoning paths |
| `sxng graph-obfuscate <session>` | List obfuscation candidates |
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
```

### Quick Example

```bash
# 1. Create a session and search
sxng --session new --owner "agent-1" --desc "Rust async study" "rust async ecosystem"
# Outputs session path, e.g. .sxng/sessions/ds_1712345678_abcdef

# 2. Extract content from results
sxng extract --session ds_1712345678_abcdef

# 3. Preprocess for entity discovery (TF-IDF + co-occurrence)
sxng graph-preprocess ds_1712345678_abcdef

# 4. Add entities to knowledge graph
sxng graph-add ds_1712345678_abcdef --data '{
  "entities": [
    {"label": "tokio", "entityType": "runtime", "score": 0.95},
    {"label": "async-std", "entityType": "runtime", "score": 0.85}
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

## 🔗 Links

- **GitHub:** https://github.com/hkwuks/sxng-cli
- **npm:** https://www.npmjs.com/package/sxng-cli
- **SearXNG:** https://github.com/searxng/searxng

## 📄 License

MIT