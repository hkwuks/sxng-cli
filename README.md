# 🔍 SXNG CLI

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

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-usage">Usage</a> •
  <a href="#-configuration">Configuration</a>
</p>

<p align="center">
  <a href="./README.zh-CN.md">🌏 中文</a>
</p>

---

## ✨ Features

- 🔎 **Multi-Engine Search** — Search across Google, Bing, DuckDuckGo, GitHub, StackOverflow, and 30+ engines simultaneously
- 🔄 **Dynamic Discovery** — Auto-fetches available engines and categories from your SearXNG server
- 📄 **Multiple Formats** — Markdown (LLM-optimized) or JSON output
- 🧠 **Deep Search** — Multi-round iterative research with session accumulation, quality assessment, and recovery strategies
- 🔍 **Content Extraction** — Extract full article content from URLs or session results, with Obscura (JS rendering) and Jina Reader fallbacks
- 🗂️ **Session Management** — Accumulate search results across rounds with deduplication; pending → approve → graph injection workflow
- 🔗 **External Result Fusion** — Inject results from Tavily, Exa, or any search tool into the same session pipeline via `results-add`; shared pending pool, unified quality assessment
- ⭐ **Quality Assessment** — 4 independent indicators: content depth, entity richness, source diversity, novelty
- 🕸️ **Knowledge Graph** — Structural (query→result→domain) + semantic (entity relations with source-round provenance) graph layers
- 🔄 **Query Redundancy Check** — Jaccard similarity + SimHash to avoid repeated queries
- 💡 **Agent-First Design** — Outputs structured analysis data (quality, suggestions, recovery) for LLM Agent decision-making
- 📁 **Local Document Search** — Index and BM25-search local Markdown/text files with field-weighted ranking; results auto-injected into the session pipeline as `source: "local"`
- ✅ **Claim—Evidence—Review Pipeline** — L2/L3 only: submit atomic claims, auto-search evidence, verify with stance, policy-aggregate for auto-approval or flag for Agent review

---

## 📦 Installation

### Self-host SearXNG

**For WSL**

WSL2 will automatically shut itself down after you exit all the connections. I suggest you use https://github.com/gardengim/keepwsl to keep it alive.

If you also want WSL to start automatically when Windows boots (so your SearXNG containers come up without manual intervention), do the following:

1. Press <kbd>Win</kbd>+<kbd>R</kbd>, type `shell:startup`, and press Enter — this opens Windows Startup folder
2. Right-click → New → Shortcut, set location to `"C:\Program Files\WSL\wsl.exe" -d Ubuntu cd ~`
3. Save the shortcut. Next time Windows starts, `cd ~` will fail (due to the missing backslash) but WSL will have already been launched — the terminal window closes automatically and WSL keeps running in the background.

Before starting the searXNG container, you must create a `settings.yml` file in the `./searxng` directory. You can visit https://github.com/searxng/searxng for specific configuration methods.

An example of `settings.yml` is just like below.

<details>
<summary>📋 Click to expand full settings.yml (30+ search engines)</summary>

```yml
use_default_settings: true

server:
  secret_key: "random string"
  limiter: false

outgoing:
  request_timeout: 30.0 # 全局默认超时
  max_request_timeout: 30.0
  pool_connections: 200
  pool_maxsize: 20
  retries: 2

search:
  safe_search: 0
  formats:
    - html
    - json
    - csv
    - rss

valkey:
  url: valkey://valkey:6379/0

engines:
  # ==================== 通用搜索 ====================
  - name: google
    engine: google
    shortcut: g

  - name: bing
    engine: bing
    shortcut: bi
    disabled: false

  - name: duckduckgo
    engine: duckduckgo
    shortcut: ddg

  - name: brave
    engine: brave
    shortcut: br

  - name: startpage
    engine: startpage
    shortcut: sp

  - name: qwant
    engine: qwant
    shortcut: qw
    disabled: false

  - name: yandex
    engine: yandex
    shortcut: yx
    disabled: false

  - name: karmasearch
    engine: karmasearch
    categories: [general, web]
    search_type: web
    shortcut: ka
    disabled: false

  # ==================== 中文搜索 ====================
  - name: baidu
    engine: baidu
    shortcut: bd
    disabled: false

  - name: sogou
    engine: sogou
    shortcut: sg
    disabled: false

  - name: 360search
    engine: 360search
    shortcut: 360so
    disabled: false

  - name: quark
    engine: quark
    shortcut: qk
    disabled: false

  # ==================== 编程相关 ====================
  - name: github
    engine: github
    shortcut: gh

  - name: github code
    engine: github_code
    shortcut: ghc

  - name: gitlab
    engine: gitlab
    base_url: https://gitlab.com
    shortcut: gl
    disabled: false

  - name: codeberg
    engine: gitea
    base_url: https://codeberg.org
    shortcut: cb
    disabled: false

  - name: stackexchange
    engine: stackexchange
    shortcut: se

  - name: stackoverflow
    engine: stackexchange
    shortcut: so
    categories: q&a
    stackexchange_site: stackoverflow

  - name: npm
    engine: npm
    shortcut: npm
    disabled: false

  - name: pypi
    engine: pypi
    shortcut: py

  - name: crates.io
    engine: crates
    shortcut: crate
    disabled: false

  - name: pkg.go.dev
    engine: pkg_go_dev
    shortcut: go
    disabled: false

  - name: metacpan
    engine: metacpan
    shortcut: cpan
    disabled: false

  - name: docker hub
    engine: docker_hub
    shortcut: dh

  - name: huggingface
    engine: huggingface
    shortcut: hf
    disabled: false

  - name: huggingface datasets
    engine: huggingface
    huggingface_endpoint: datasets
    shortcut: hfd
    disabled: false

  - name: hex
    engine: hex
    shortcut: hex
    disabled: false

  - name: mdn
    engine: json_engine
    shortcut: mdn
    categories: [it]
    paging: true
    search_url: https://developer.mozilla.org/api/v1/search?q={query}&page={pageno}
    results_query: documents
    url_query: mdn_url
    url_prefix: https://developer.mozilla.org
    title_query: title
    content_query: summary

  - name: arch linux wiki
    engine: archlinux
    shortcut: al

  - name: gentoo wiki
    engine: mediawiki
    shortcut: gentoo
    categories: ["it", "software wikis"]
    base_url: "https://wiki.gentoo.org/"
    api_path: "api.php"
    search_type: text
    

  - name: lobste.rs
    engine: xpath
    search_url: https://lobste.rs/search?q={query}&what=stories&order=relevance
    results_xpath: //li[contains(@class, "story")]
    url_xpath: .//a[@class="u-url"]/@href
    title_xpath: .//a[@class="u-url"]
    content_xpath: .//a[@class="domain"]
    categories: it
    shortcut: lo
    
    disabled: false

  # ==================== 知识/问答 ====================
  - name: wikipedia
    engine: wikipedia
    shortcut: wp
    display_type: ["infobox"]
    categories: [general]

  - name: wikidata
    engine: wikidata
    shortcut: wd
    
    weight: 2
    display_type: ["infobox"]
    categories: [general]

  - name: reddit
    engine: reddit
    shortcut: re
    disabled: false

  - name: hackernews
    engine: hackernews
    shortcut: hn
    disabled: false

  # ==================== 图片 ====================
  - name: google images
    engine: google_images
    shortcut: goi

  - name: bing images
    engine: bing_images
    shortcut: bii

  - name: duckduckgo images
    engine: duckduckgo_extra
    categories: [images]
    ddg_category: images
    shortcut: ddi

  - name: pinterest
    engine: pinterest
    shortcut: pin

  - name: unsplash
    engine: unsplash
    shortcut: us

  - name: pixabay
    engine: pixabay
    shortcut: pxb

  - name: deviantart
    engine: deviantart
    shortcut: da
    disabled: false

  - name: flickr
    categories: images
    shortcut: fl
    engine: flickr_noapi
    disabled: false

  - name: openverse
    engine: openverse
    categories: images
    shortcut: opv
    disabled: false

  - name: artic
    engine: artic
    shortcut: arc
    disabled: false

  # ==================== 视频 ====================
  - name: google videos
    engine: google_videos
    shortcut: gov

  - name: bing videos
    engine: bing_videos
    shortcut: biv

  - name: duckduckgo videos
    engine: duckduckgo_extra
    categories: [videos]
    ddg_category: videos
    shortcut: ddv

  - name: youtube
    engine: youtube_noapi
    shortcut: yt

  - name: bilibili
    engine: bilibili
    shortcut: bili
    disabled: false

  # ==================== 新闻 ====================
  - name: google news
    engine: google_news
    shortcut: gon

  - name: bing news
    engine: bing_news
    shortcut: bin

  - name: duckduckgo news
    engine: duckduckgo_extra
    categories: [news]
    ddg_category: news
    shortcut: ddn

  # ==================== 音乐 ====================
  - name: bandcamp
    engine: bandcamp
    shortcut: bc
    categories: music
    disabled: false

  - name: deezer
    engine: deezer
    shortcut: dz
    disabled: false

  - name: mixcloud
    engine: mixcloud
    shortcut: mc
    disabled: false

  - name: genius
    engine: genius
    shortcut: gen
    disabled: false

  # ==================== 学术/文档 ====================
  - name: arxiv
    engine: arxiv
    shortcut: arx

  - name: semantic scholar
    engine: semantic_scholar
    shortcut: sem

  - name: google scholar
    engine: google_scholar
    shortcut: gsch

  - name: pubmed
    engine: pubmed
    shortcut: pub

  - name: crossref
    engine: crossref
    shortcut: cr
    disabled: false

  # ==================== 社交媒体 ====================
  - name: lemmy posts
    engine: lemmy
    lemmy_type: Posts
    shortcut: lepo
    disabled: false

  - name: mastodon users
    engine: mastodon
    mastodon_type: accounts
    base_url: https://mastodon.social
    shortcut: mau
    disabled: false

  # ==================== 文件/种子 ====================
  - name: library genesis
    engine: xpath
    search_url: https://libgen.rs/search.php?req={query}
    url_xpath: //a[contains(@href,"book/index.php?md5")]/@href
    title_xpath: //a[contains(@href,"book/")]/text()[1]
    content_xpath: //td/a[1][contains(@href,"=author")]/text()
    categories: files
    shortcut: lg
    disabled: false

  - name: kickass
    engine: kickass
    base_url:
      - https://kickasstorrents.to
      - https://kickasstorrents.cr
    shortcut: kc
    disabled: false

  - name: annas archive
    engine: annas_archive
    base_url:
      - https://annas-archive.gl
      - https://annas-archive.vg
    shortcut: aa
    disabled: false

  # ==================== 翻译 ====================
  - name: lingva
    engine: lingva
    shortcut: lv
    disabled: false

  - name: currency
    engine: currency_convert
    shortcut: cc

  # ==================== 其他 ====================
  - name: imdb
    engine: imdb
    shortcut: imdb
    disabled: false

  - name: steam
    engine: steam
    shortcut: stm
    disabled: false

  - name: goodreads
    engine: goodreads
    shortcut: good
    disabled: false
```

</details>

An example of `docker-compose.yml` is just like below.

```yml
services:
   searxng:
        image: docker.io/searxng/searxng:latest
        container_name: searxng
        restart: unless-stopped
        ports:
            - "8080:8080"
        volumes:
            - ./searxng:/etc/searxng:Z
        depends_on:
            - valkey
        ulimits:
            nofile:
                soft: 10000
                hard: 65535

    valkey:
        container_name: valkey
        image: docker.io/valkey/valkey:9-alpine
        command: valkey-server --save 30 1 --loglevel warning
        restart: always
        volumes:
            - ./valkey:/data/
```

**Start the containers:**

```bash
docker compose up -d
```

This runs SearXNG (port `8080`) and Valkey in the background. Verify with `docker compose ps` or `sxng --health`.

### From npm (Recommended)

```bash
npm install -g sxng-cli
```

```bash
npx skills add hkwuks/sxng-cli
```

> ⚠️ **Skill Sync**: After updating `sxng-cli`, also update `sxng` skill to keep them in sync:
>
> ```bash
> npx skills update hkwuks/sxng-cli
> ```

### From Source

```bash
git clone https://github.com/hkwuks/sxng-cli.git
cd sxng-cli/cli
npm install
npm run build
npm link
```

### Obscura (Optional — for JS-heavy pages)

[sxng extract](#-usage) uses **Defuddle + linkedom** by default for lightweight content extraction. When a page requires JavaScript rendering (SPAs, dynamic content), enable [Obscura](https://github.com/h4ckf0r0day/obscura) as a fallback:

```bash
# Linux x86_64
curl -LO https://github.com/h4ckf0r0day/obscura/releases/latest/download/obscura-x86_64-linux.tar.gz
tar xzf obscura-x86_64-linux.tar.gz
cp obscura ~/.local/bin/

# macOS Apple Silicon
curl -LO https://github.com/h4ckf0r0day/obscura/releases/latest/download/obscura-aarch64-macos.tar.gz
tar xzf obscura-aarch64-macos.tar.gz
cp obscura /usr/local/bin/

# Docker
docker run -d --name obscura -p 127.0.0.1:9222:9222 h4ckf0r0day/obscura

# Verify
obscura --version
```

No extra npm dependencies needed — Obscura is called via CLI. Auto-detected from `PATH`, `~/.local/bin/obscura`, or `/usr/local/bin/obscura`.

---

## 🚀 Quick Start

1. **Install the CLI:**
   ```bash
   npm install -g sxng-cli
   ```

2. **Configure the CLI:**
   ```bash
   sxng init
   ```
   Or set environment variable:
   ```bash
   export SEARXNG_BASE_URL=http://your-searxng-instance:8080
   ```

3. **Perform a search:**
   ```bash
   sxng "TypeScript tutorial"
   ```

---

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
| `sxng session-delete <session-name>` | Delete a session |
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
| `sxng --help` | Show help message |

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

# List available categories (fetched from server)
sxng --categories-list
```

---

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

Config file search order (first found wins):

1. **Local config** - `./sxng.config.json` (current working directory, for project-specific settings)
2. **Global config** - `~/sxng-cli/sxng.config.json` (user home directory, for global defaults)

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

---

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
# Session created: .sxng/sessions/<session-name>

# 2. Extract content from results
sxng extract --session <session-name>

# 3. Preprocess for entity discovery and result provenance
sxng graph-preprocess <session-name>

# 4. Add entities with source rounds from graph-preprocess resultProvenance
sxng graph-add <session-name> --data '{
  "entities": [
    {"label": "tokio", "entityType": "runtime", "score": 0.95, "sourceRounds": [1]},
    {"label": "async-std", "entityType": "runtime", "score": 0.85, "sourceRounds": [1]}
  ],
  "edges": [
    {"source": "e:tokio", "target": "e:async_std", "relation": "alternative_to", "weight": 0.9}
  ]
}'

# 5. Assess quality — results are pending until approved
sxng --session <session-name> --quality

# 6. Approve pending results by index (injects into graph)
sxng --session <session-name> --quality --approve "0,1,2,3"

# 7. Continue research with redundancy check
sxng --session <session-name> --queries "tokio vs async-std,benchmark 2026" --redundancy warn
```

### Session Management

| Command | Description |
|---------|-------------|
| `sxng --session new` | Create new auto-named session |
| `sxng --session <session-name>` | Use session by name (auto-resolves to `.sxng/sessions/<session-name>`) |
| `sxng --session <path>` | Use session by full path |
| `sxng session-list` | List all sessions with stats |
| `sxng session-delete <session-name>` | Delete specific session |
| `sxng session-delete --older <hours>` | Delete old sessions |

**Session Path Resolution:**
- Pure name (e.g., `my-session`) → `.sxng/sessions/my-session`
- Full path (e.g., `/custom/path/session`) → used as-is
- `new` → auto-generate unique name under `.sxng/sessions/`

### Session Data Structure

Each session stores three files in `.sxng/sessions/<session-name>/`:

- **`results.json`** — Accumulated search results (URL dedup, multi-round)
- **`graph.json`** — Knowledge graph (structural + semantic layers)
- **`meta.json`** — Session metadata (owner, description, timestamps)

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

Results from other search tools (Tavily, Exa, etc.) can be injected into any active session via `results-add`. They go through the same pipeline as native sxng results:

```bash
sxng results-add <session-name> --query "async runtime" --data '[
  {"url": "https://...", "title": "...", "source": "tavily"},
  {"url": "https://...", "title": "...", "source": "exa"}
]'
```

After injection, results are marked as `pending` and follow the same `--quality` → `--approve` → `graph-add` flow. The `source` field tracks which tool produced each result. Results from all sources share a single pending pool and are evaluated together in quality assessment. The required `--query` records the source query so `graph-preprocess` can provide correct `resultProvenance` rounds.

### Local Document Search

`doc-index` and `doc-search` enable BM25 full-text search over local documents, with results flowing directly into the session pipeline:

```bash
# Index documents (auto-triggered by doc-search, no separate step needed)
sxng doc-index ./docs

# Search and inject into session
sxng doc-search <session-name> "search query" --path ./docs
```

**How it works:**

1. **Auto-indexing** — `doc-search` automatically indexes the directory on first use if no index exists. Uses Orama BM25 with field-weighted boosting: title ×3, headings ×2, content ×1.
2. **Session injection** — Search results are formatted as `SessionResult[]` with `source: "local"` and injected into the session as pending.
3. **Same pipeline** — Results follow the exact same flow as web results: `--quality` → `--approve` → `graph-add`. Use `graph-preprocess` before adding new entities so their `sourceRounds` come from result provenance.
4. **Round-neutral** — Local document searches do **not** increment the session round counter (merged with the current web round via `skipRoundIncrement`).

**Index options:**

| Option | Description |
|--------|-------------|
| `-t, --type <exts>` | File extensions to index (default: `md,txt`) |

**Search options:**

| Option | Description |
|--------|-------------|
| `-k, --top <n>` | Top-K results (default: 10) |
| `--boost <field:w,...>` | Field weight overrides (e.g. `title:3,headings:2,content:1`) |

**When to use:**
- User explicitly asks to search local documents or notes
- Web search results are insufficient for the topic and relevant local docs exist
- Topic relates to private/internal information unlikely to be on the web

**Quality note:** Pure local search yields `sourceDiversity: 1` because all results share the same domain-less source. Always combine local and web results for adequate diversity in quality assessment.

---

## 🏗️ Architecture

### Content Extraction

`sxng extract` uses a multi-tier extraction strategy:

1. **Defuddle + linkedom** (default, lightweight) — Parses raw HTML with linkedom, extracts readable content with Defuddle. Fast, no browser needed.
2. **Obscura** (JS rendering fallback) — When Defuddle extracts too little content (< 50 chars), Obscura renders the page with V8 JS engine and re-extracts. Use `--obscura` to enable.
3. **Jina Reader** (alternative fallback) — Uses `r.jina.ai` to extract content from complex pages. Use `--jina` to enable.

```bash
# Default: Defuddle only (fast)
sxng extract --urls "https://example.com"

# With Obscura fallback for JS-heavy pages
sxng extract --urls "https://spa-site.com" --obscura

# With Jina Reader fallback
sxng extract --urls "https://complex-page.com" --jina
```

Extraction options:

| Option | Description |
|--------|-------------|
| `--obscura` | Enable Obscura fallback for JS-rendered pages |
| `--obscura-path <path>` | Path to Obscura binary (auto-detected if omitted) |
| `--obscura-dump <format>` | Obscura output format: `html` (default) or `markdown` |
| `--jina` | Enable Jina Reader (r.jina.ai) fallback |

### Dynamic Engine/Category Discovery

Unlike other CLI tools that hardcode supported engines and categories, this tool dynamically fetches them from your SearXNG server's `/config` endpoint:

- Engines and categories are retrieved at runtime from the server
- This ensures compatibility with any SearXNG instance configuration
- Adding new engines to your SearXNG instance automatically makes them available in the CLI

Use `sxng --engines-list` and `sxng --categories-list` to see what's available on your server.

### Output Format

The CLI supports multiple output formats:

- **Markdown (default)** - Optimized for LLM context windows, saves ~50% tokens vs JSON
- **JSON** - Structured envelope format for programmatic use

<details>
<summary>📝 Click to expand output format examples</summary>

#### Markdown Format (Default)

```markdown
## Search: machine learning

**5** results
Total: 42

### 1. [Machine Learning Tutorial](https://example.com/ml)

Learn machine learning from scratch...

Engine: google | Category: general | Score: 1

---

### Suggestions

- deep learning tutorial
- neural networks
```

#### JSON Envelope Format

```json
{
  "status": "ok|error",
  "data": { ... },
  "error": null,
  "hint": "..."
}
```

</details>

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=hkwuks/sxng-cli&type=date&legend=top-left&sealed_token=ugUt7g0kbmlxX_n5CevCTurOYzaaFJAXvBaDFvk81lpD4N7zYb5wbyXxkyisyxMZm2E2uFHH9cvA7Q8i84MG0izcZNqaQfgUeIxVEwuvCp_kVtv0BiKaLKkM6s2vhnnZTOaBp8wEnwWGZ2HWqLgvKlLjDWAiBh2GrCl3N7bAMTNrU3MMojGskEP7UK26)](https://www.star-history.com/?repos=hkwuks%2Fsxng-cli&type=date&legend=top-left)
