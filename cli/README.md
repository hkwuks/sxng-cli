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
- 📄 **Multiple Formats** — Markdown (LLM-optimized), JSON, CSV, or HTML output
- 🧠 **Deep Search** — Multi-round iterative research with session accumulation and knowledge graph
- 🔍 **Content Extraction** — Extract full article content from search results
- 🗂️ **Session Management** — Accumulate search results across multiple rounds with deduplication
- 🕸️ **Knowledge Graph** — Build semantic graphs of entities and relationships
- ⚡ **Fast & Lightweight** — Built with TypeScript, minimal dependencies
- 🔧 **Flexible Config** — Environment variables, config file, or interactive setup
- 🏥 **Health Check** — Verify server connectivity instantly
- 🌐 **Proxy Support** — HTTP/HTTPS proxy configuration

## 📦 Installation

> ⚠️ **完整安装指南**: [GitHub - Installation](https://github.com/hkwuks/sxng-cli#installation)
> 
> 包含 SearXNG 自托管配置、Docker 部署、30+ 搜索引擎 settings.yml 配置等。

```bash
npm install -g sxng-cli
```

Or from source:

```bash
git clone https://github.com/hkwuks/sxng-cli.git
cd sxng-cli/cli
npm install
npm run build
npm link
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
| `sxng --session new` | Create deep search session |
| `sxng session-list` | List all sessions |
| `sxng session-delete <session-name>` | Delete a session |
| `sxng graph-add <session>` | Add entities to knowledge graph |
| `sxng query-graph <session>` | Query knowledge graph |
| `sxng --health` | Check SearXNG server health |
| `sxng --engines-list` | List available search engines from server |
| `sxng --categories-list` | List available categories from server |

### Search Options

| Option | Description |
|--------|-------------|
| `-e, --engines <list>` | Comma-separated list of search engines (e.g., `google,github`) |
| `-c, --categories <list>` | Comma-separated list of categories (e.g., `it,science`) |
| `-l, --limit <n>` | Maximum number of results (default: 10) |
| `-p, --page <n>` | Page number for pagination |
| `--lang <code>` | Language code (e.g., `en`, `zh`, `ja`) |
| `--time <range>` | Time range: `day`, `week`, `month`, `year`, `all` |
| `-f, --format <fmt>` | Output format: `md`, `json`, `csv`, `html` (default: md) |
| `--queries <list>` | Multi-query with RRF fusion (e.g., `q1,q2,q3`) |
| `--session <session-name>` | Session directory or `new` for deep search |
| `--owner <session-name>` | Session owner identifier |
| `--desc <text>` | Session description |

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

Deep search enables multi-round iterative research with session accumulation and knowledge graph building.

### Quick Example

```bash
# Create a session and search
sxng --session new --owner "researcher" --desc "Rust async study" "rust async ecosystem"

# Extract content from results
sxng extract --session <session-name>

# Add knowledge graph entities
sxng graph-add <session-name> --data '{
  "entities": [
    {"label": "tokio", "entityType": "runtime", "score": 0.95},
    {"label": "async-std", "entityType": "runtime", "score": 0.85}
  ],
  "edges": [
    {"source": "e:tokio", "target": "e:async_std", "relation": "alternative_to", "weight": 0.9}
  ]
}'

# Query the graph
sxng query-graph <session-name> --seeds "tokio" --depth 2

# Continue research (results accumulate)
sxng --session <session-name> --queries "tokio vs async-std,benchmark 2024"
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
- Pure name (e.g., `my-session`) → `~/sxng-cli/sessions/my-session`
- Full path (e.g., `/custom/path/session`) → used as-is
- `new` → auto-generate unique name under `~/sxng-cli/sessions/`

### Knowledge Graph

**Structural Layer** (auto-built):
- `q:` — Query nodes
- `r:` — Result nodes
- `d:` — Domain nodes

**Semantic Layer** (via `graph-add`):
- `e:` — Entity nodes with type and score

## 🔗 Links

- **GitHub:** https://github.com/hkwuks/sxng-cli
- **npm:** https://www.npmjs.com/package/sxng-cli
- **SearXNG:** https://github.com/searxng/searxng

## 📄 License

MIT