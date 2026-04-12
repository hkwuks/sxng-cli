---
name: searxng
description: Web search using SearXNG CLI. Use this skill when the user wants to search the web, find information online, look up documentation, research topics, or get current information from the internet. Triggers include "search for", "look up", "find information about", "web search", "search online", or any request requiring up-to-date information not available in the current context.
---

# SearXNG CLI - Web Search Tool

Use the SearXNG CLI command-line tool to perform web searches with customizable options, multiple output formats, and engine selection.

## Installation

Install the CLI globally:
```bash
npm install -g sxng-cli
```

Or use directly in a Node.js project:
```bash
npm install sxng-cli
```

## Configuration

Configure the CLI through a configuration file or environment variables.

### Configuration File

Create a `sxng.config.json` file in your working directory:

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

**Configuration Options:**

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `baseUrl` | string | URL of the SearXNG server | `http://localhost:8080` |
| `defaultEngine` | string | Default search engine to use for queries | (empty) |
| `allowedEngines` | array | List of allowed search engines (empty = all allowed) | `[]` |
| `defaultLimit` | number | Default number of results to return per query | `10` |
| `useProxy` | boolean | Enable HTTP proxy for requests | `false` |
| `proxyUrl` | string | HTTP proxy server URL | (empty) |
| `timeout` | number | Request timeout in milliseconds | `10000` |

### Environment Variables

Alternatively, configure via environment variables. These take precedence over config file settings:

| Variable | Description | Default |
|----------|-------------|---------|
| `SEARXNG_BASE_URL` | SearXNG server URL | `http://localhost:8080` |
| `SEARXNG_DEFAULT_ENGINE` | Default search engine to use | (empty) |
| `SEARXNG_ALLOWED_ENGINES` | Comma-separated list of allowed engines | (all engines) |
| `SEARXNG_DEFAULT_LIMIT` | Default number of results to return | `10` |
| `SEARXNG_USE_PROXY` | Enable proxy (`true` or `false`) | `false` |
| `SEARXNG_PROXY_URL` | Proxy server URL | (empty) |
| `SEARXNG_TIMEOUT` | Request timeout in milliseconds | `10000` |

### Configuration Priority

Settings are loaded in this order (highest to lowest priority):
1. Environment variables
2. `sxng.config.json` in current working directory
3. Default values

## Quick Setup with Interactive Configuration

For a guided setup experience, run:

```bash
sxng init
```

This command will interactively walk you through:
- SearXNG server URL configuration
- Default search engine selection
- Allowed engines whitelist
- Result limit settings
- Request timeout configuration
- HTTP proxy setup (optional)

The setup will create a `sxng.config.json` file in your current directory with your settings.

## AI-Assisted Configuration

If you need help generating or modifying configuration for your specific use case, you can ask an AI model to:
- Generate a `sxng.config.json` based on your requirements
- Suggest optimal settings for your use case
- Modify existing configurations

Example requests:
- "Generate a searxng config that uses Google and GitHub for searches with a 20 result limit"
- "I want to use a remote SearXNG server at searxng.example.com:8080 with proxy settings"
- "Configure searxng to only use academic search engines with 5 second timeout"

## CLI Commands and Options

### Basic Search

```bash
sxng <query>
sxng <query> [options]
```

Perform a basic web search with the given query.

**Example:**
```bash
sxng "TypeScript tutorial"
```

### Command-line Options

#### Search Query Customization

| Option | Short | Argument | Description |
|--------|-------|----------|-------------|
| `--engines` | `-e` | `<engines>` | Comma-separated list of search engines to use (e.g., `google,github,bing`) |
| `--categories` | `-c` | `<categories>` | Comma-separated list of result categories to search in |
| `--limit` | `-l` | `<n>` | Maximum number of results to return (default: value from config) |
| `--page` | `-p` | `<n>` | Page number for pagination (starts at 1) |
| `--lang` | | `<code>` | Language code for search results (e.g., `en`, `zh`, `ja`, `fr`) |
| `--time` | | `<range>` | Time range filter: `day`, `week`, `month`, `year`, or `all` |

**Examples:**
```bash
# Use specific search engines
sxng --engines google,github "react hooks"

# Search in specific categories
sxng --categories it,science "machine learning"

# Limit results and filter by time
sxng --limit 5 --time week "latest TypeScript news"

# Search in Chinese language
sxng --lang zh "Python 教程"

# Paginate through results
sxng --page 2 --limit 10 "web development"
```

#### Output Format

| Option | Short | Argument | Description |
|--------|-------|----------|-------------|
| `--format` | `-f` | `<format>` | Output format: `json` (default), `csv`, or `html` |

Formats:
- **json**: Structured JSON output (default, suitable for programmatic use)
- **csv**: Comma-separated values (suitable for spreadsheets and data processing)
- **html**: HTML table format (suitable for viewing in browsers)

**Examples:**
```bash
# Output as JSON (default)
sxng "docker tutorial"

# Output as CSV
sxng "docker tutorial" --format csv

# Save results to CSV file
sxng "docker tutorial" --format csv > results.csv

# Output as HTML
sxng "docker tutorial" --format html > results.html
```

#### Administrative Commands

| Option | Description |
|--------|-------------|
| `--engines-list` | List all available search engines |
| `--categories-list` | List all available result categories |
| `--health` | Check SearXNG server health status |
| `-h, --help` | Display help message |

**Examples:**
```bash
# List all available search engines
sxng --engines-list

# List all available categories
sxng --categories-list

# Check server health
sxng --health

# Show help
sxng --help
```

## Output Format

### JSON Output (Default)

Standard envelope format with status, data, and error information:

```json
{
  "status": "ok",
  "data": {
    "query": "search query",
    "totalResults": 100,
    "returnedResults": 3,
    "results": [
      {
        "title": "Result Title",
        "url": "https://example.com",
        "content": "Snippet or description of the result...",
        "engine": "google",
        "category": "general"
      },
      {
        "title": "Another Result",
        "url": "https://example2.com",
        "content": "Another snippet...",
        "engine": "bing",
        "category": "general"
      }
    ],
    "suggestions": ["related query 1", "related query 2"],
    "answers": [],
    "unresponsiveEngines": []
  },
  "error": null,
  "hint": null
}
```

Fields:
- `status`: `ok` for successful search, `error` for failures
- `data.query`: The search query that was executed
- `data.totalResults`: Total number of results found
- `data.returnedResults`: Number of results returned in this response
- `data.results`: Array of search results
- `data.suggestions`: Related search suggestions
- `data.answers`: Direct answers if available
- `data.unresponsiveEngines`: Engines that failed to respond
- `error`: Error code if status is `error`
- `hint`: Helpful hint message for debugging

### CSV Output

Tab-separated values format with headers:

```
title	url	content	engine	category
Result Title	https://example.com	Snippet or description...	google	general
Another Result	https://example2.com	Another snippet...	bing	general
```

### HTML Output

Formatted HTML table that can be opened directly in a browser:

```html
<!DOCTYPE html>
<html>
<head><title>Search Results</title></head>
<body>
<table border="1">
    <tr><th>Title</th><th>Content</th><th>Engine</th></tr>
    <tr>
        <td><a href="https://example.com">Result Title</a></td>
        <td>Snippet or description...</td>
        <td>google</td>
    </tr>
</table>
</body>
</html>
```

## Practical Examples

```bash
# Simple search with results
sxng "machine learning tutorial"

# Save CSV results to file
sxng "REST API best practices" --format csv --limit 20 > api-results.csv

# Search in technology category with Google and Stack Overflow
sxng --engines google,stackoverflow --categories it "async await JavaScript" --limit 10

# Get recent news articles
sxng --time week --categories news "AI developments" --lang en

# Check available search engines before running query
sxng --engines-list

# Verify SearXNG server is running
sxng --health

# Display help for all available options
sxng --help
```

## Capabilities Summary

The SearXNG CLI provides the following capabilities:

- **Web Search**: Perform queries across multiple meta-search engines
- **Engine Selection**: Choose specific search engines to query
- **Category Filtering**: Narrow results by category (general, IT, science, news, etc.)
- **Time Range Filtering**: Filter results by publication time (day, week, month, year, all)
- **Language Support**: Set language preference for results
- **Result Pagination**: Navigate through paginated results
- **Result Limiting**: Control the number of results returned (default: 10)
- **Multiple Output Formats**: JSON, CSV, or HTML output
- **Health Monitoring**: Check SearXNG server status
- **Engine Discovery**: List all available search engines and categories
- **Proxy Support**: Configure HTTP proxy for requests
- **Timeout Control**: Adjust request timeout via configuration
