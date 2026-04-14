# SearXNG CLI

A TypeScript-based command-line interface for performing web searches via [SearXNG](https://github.com/searxng/searxng) - a privacy-respecting metasearch engine.

## Features

- **Web Search** - Search across multiple search engines simultaneously
- **Dynamic Engine/Category Discovery** - Automatically fetches available engines and categories from your SearXNG server (no hardcoded lists)
- **Multiple Output Formats** - JSON (default), CSV, or HTML
- **Flexible Configuration** - Environment variables, config file, or interactive setup
- **Health Check** - Verify SearXNG server connectivity
- **Proxy Support** - HTTP/HTTPS proxy configuration

## Installation

### Self-host SearXNG

**For WSL**
WSL2 will automatically shut itself down after you exit all the connections. I suggest you use https://github.com/gardengim/keepwsl to keep it alive.

Before starting the searXNG container, you must create a `settings.yml` file in the `./searxng` directory. You can visit https://github.com/searxng/searxng for specific configuration methods.

An example of `settings.yml` is just like below.

```yml
use_default_settings: true

server:
  secret_key: "your key (use a random string)"
  limiter: false

outgoing:
  request_timeout: 8.0 # 全局默认超时

search:
  formats:
    - html
    - json
    - csv

valkey:
  url: valkey://valkey:6379/0

engines:
  # 通用搜索
  - name: google
    engine: google
    shortcut: g

  - name: bing
    engine: bing
    shortcut: b
    disabled: false

  - name: duckduckgo
    engine: duckduckgo
    shortcut: ddg

  - name: brave
    engine: brave
    shortcut: br

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
    shortcut: 360
    disabled: false

  - name: quark
    engine: quark
    shortcut: qk
    disabled: false

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

  # 编程相关
  - name: github
    engine: github
    shortcut: gh

  - name: github code
    engine: github_code
    shortcut: ghc

  - name: gitlab
    engine: gitlab
    shortcut: gl
    disabled: false

  - name: stackexchange
    engine: stackexchange
    shortcut: se

  - name: npm
    engine: npm
    shortcut: npm
    disabled: false

  - name: pypi
    engine: pypi
    shortcut: py

  - name: crates
    engine: crates
    shortcut: crate

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
    shortcut: docker

  - name: huggingface
    engine: huggingface
    shortcut: hf
    disabled: false

  - name: hex
    engine: hex
    shortcut: hex
    disabled: false

  # 知识/问答
  - name: wikipedia
    engine: wikipedia
    shortcut: wp

  - name: reddit
    engine: reddit
    shortcut: re
    disabled: false

  - name: hackernews
    engine: hackernews
    shortcut: hn
    disabled: false

  - name: stackoverflow
    engine: stackexchange
    shortcut: so
    categories: q&a
    stackexchange_site: stackoverflow

  # 图片/视频
  - name: google images
    engine: google_images
    shortcut: gi

  - name: bing images
    engine: bing_images
    shortcut: bi

  - name: youtube
    engine: youtube_noapi
    shortcut: yt

  - name: bilibili
    engine: bilibili
    shortcut: bili
    disabled: false

  - name: pinterest
    engine: pinterest
    shortcut: pin

  - name: unsplash
    engine: unsplash
    shortcut: us

  - name: pixabay
    engine: pixabay
    shortcut: pxb

  # 学术/文档
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

  - name: mdn
    engine: microsoft_learn
    shortcut: mdn

  # 其他
  - name: imdb
    engine: imdb
    shortcut: imdb
    disabled: false

  - name: steam
    engine: steam
    shortcut: stm
    disabled: false
```

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

    valkey:
        container_name: valkey
        image: docker.io/valkey/valkey:9-alpine
        command: valkey-server --save 30 1 --loglevel warning
        restart: always
        volumes:
            - ./valkey:/data/
```

### From npm (Recommended)

```bash
npm install -g sxng-cli
```

### From Source

```bash
git clone https://github.com/hkwuks/sxng-cli.git
cd sxng-cli/cli
npm install
npm run build
npm link
```

## Quick Start

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

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `sxng init` | Interactive configuration setup |
| `sxng <query>` | Perform a web search |
| `sxng --health` | Check SearXNG server health |
| `sxng --engines-list` | List available search engines from server |
| `sxng --categories-list` | List available categories from server |
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
| `-f, --format <fmt>` | Output format: `json`, `csv`, `html` (default: json) |

### Examples

```bash
# Basic search
sxng "machine learning"

# Search with specific engines
sxng --engines google,duckduckgo "privacy tools"

# Search IT and Science categories
sxng --categories it,science "kubernetes tutorial"

# Limit results and filter by time
sxng --limit 5 --time week "latest AI news"

# Output as CSV
sxng --format csv "python tutorial" > results.csv

# List available engines (fetched from server)
sxng --engines-list

# List available categories (fetched from server)
sxng --categories-list
```

## Configuration

Configuration priority (highest to lowest):
1. Environment variables
2. Config file (`./sxng.config.json`)
3. Default values

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SEARXNG_BASE_URL` | SearXNG server URL | *(required)* |
| `SEARXNG_DEFAULT_ENGINE` | Default search engine | *(none)* |
| `SEARXNG_ALLOWED_ENGINES` | Comma-separated allowed engines | *(all)* |
| `SEARXNG_DEFAULT_LIMIT` | Default result limit | `10` |
| `SEARXNG_USE_PROXY` | Use proxy (`true`/`false`) | `false` |
| `SEARXNG_PROXY_URL` | Proxy URL | *(none)* |
| `SEARXNG_TIMEOUT` | Request timeout in ms | `10000` |

### Config File

Create `sxng.config.json` in your working directory:

```json
{
  "baseUrl": "http://localhost:8080",
  "defaultEngine": "",
  "allowedEngines": [],
  "defaultLimit": 10,
  "useProxy": false,
  "proxyUrl": "",
  "timeout": 10000
}
```

## Architecture

### Dynamic Engine/Category Discovery

Unlike other CLI tools that hardcode supported engines and categories, this tool dynamically fetches them from your SearXNG server's `/config` endpoint:

- Engines and categories are retrieved at runtime from the server
- This ensures compatibility with any SearXNG instance configuration
- Adding new engines to your SearXNG instance automatically makes them available in the CLI

Use `sxng --engines-list` and `sxng --categories-list` to see what's available on your server.

### Output Format

All responses use a standardized envelope format:

```json
{
  "status": "ok|error",
  "data": { ... },
  "error": null,
  "hint": "..."
}
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run locally
npm start -- "search query"
```

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=hkwuks/sxng-cli&type=date&legend=top-left)](https://www.star-history.com/?repos=hkwuks%2Fsxng-cli&type=date&legend=top-left)

## License

MIT
