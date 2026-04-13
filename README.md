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

## License

MIT
