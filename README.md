# SearXNG Tools

This repository contains tools for working with SearXNG:

- **cli/** - Command-line interface for SearXNG search
- **skills/** - Skill definitions for AI assistants

## CLI

A TypeScript-based CLI tool for performing web searches via SearXNG.

### Features

- Search with multiple engines
- Filter by categories
- Time range filtering
- Multiple output formats (JSON, CSV, HTML)
- Health check
- List available engines and categories

### Installation

```bash
cd cli
npm install
npm run build
npm link
```

### Configuration

Copy the example config and edit:

```bash
cp cli/searxng.config.example.json cli/searxng.config.json
# Edit cli/searxng.config.json with your settings
```

## Skills

Skill definitions for Claude Code and other AI assistants.

## License

MIT
