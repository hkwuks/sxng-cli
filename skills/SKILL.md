---
name: sxng
description: Web search using SearXNG CLI. Use when you need to search the web for current information, documentation, or research. Triggers: "search for", "look up", "find information", "web search", or any request needing up-to-date information.
---

# SearXNG Web Search

Use `sxng` CLI to search the web. Default output is markdown format.

## Usage

```bash
sxng <query> [options]
```

## Options

| Option | Example | Purpose |
|--------|---------|---------|
| `-e, --engines` | `-e google,github` | Specific search engines |
| `-c, --categories` | `-c it,science` | Filter by category |
| `-l, --limit` | `-l 20` | Max results (default: 10) |
| `-p, --page` | `-p 2` | Pagination |
| `--lang` | `--lang zh` | Result language (en, zh, ja, etc.) |
| `--time` | `--time week` | Filter: day/week/month/year/all |
| `-f, --format` | `-f json` | Output: md (default), json, csv, html |

## Examples

```bash
# Basic search (markdown output)
sxng "TypeScript best practices"

# Specific engines
sxng -e google,stackoverflow "React hooks"

# Recent results
sxng --time week "AI news"

# Chinese results
sxng --lang zh "Python 教程"

# JSON output for programmatic use
sxng -f json "docker compose"

# Pagination
sxng -l 10 -p 2 "web development"
```

## Utility Commands

```bash
sxng --engines-list    # List available engines
sxng --categories-list # List available categories
sxng --health          # Check server status
sxng init              # Interactive setup
```

## When to Use

- User asks to search the web
- Need current information not in context
- Looking up documentation or tutorials
- Researching topics or technologies

## Tips

- **Prefer specifying categories or engines** - Without `-e` or `-c`, all available engines are used
- Use `--time week` or `--time day` for recent information
- Your purpose is to dig deeply from the web, so do not limit `--lang` and so all unless you were asked to do so
- Run `sxng --health` first if searches fail
