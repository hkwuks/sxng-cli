# 🔍 SXNG CLI

<p align="center">
  <b>SearXNG 的命令行工具</b><br>
  终端中的隐私优先网页搜索
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
  <a href="#-特色功能">特色功能</a> •
  <a href="#-安装">安装</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-使用指南">使用指南</a> •
  <a href="#-配置">配置</a>
</p>

---

## ✨ 特色功能

- 🔎 **多引擎搜索** — 同时搜索 Google、Bing、DuckDuckGo、GitHub、StackOverflow 等 30+ 搜索引擎
- 🔄 **动态发现** — 自动从 SearXNG 服务器获取可用引擎和分类
- 📄 **多格式输出** — Markdown（LLM 优化）或 JSON 格式
- 🧠 **深度搜索** — 多轮迭代研究，支持会话累积和知识图谱
- 🔍 **内容提取** — 提取搜索结果页面的完整文章内容，JS 密集页面自动回退到 Obscura
- 🗂️ **会话管理** — 跨多轮搜索累积结果，自动去重
- 🕸️ **知识图谱** — 构建实体和关系的语义图
- ⚡ **快速轻量** — TypeScript 构建，最小依赖
- 🔧 **灵活配置** — 环境变量、配置文件或交互式设置
- 🏥 **健康检查** — 即时验证服务器连接
- 🌐 **代理支持** — HTTP/HTTPS 代理配置

---

## 📦 安装

### 自托管 SearXNG

**WSL 用户注意**

WSL2 会在所有连接退出后自动关闭。建议使用 https://github.com/gardengim/keepwsl 保持其运行。

启动 SearXNG 容器前，必须在 `./searxng` 目录下创建 `settings.yml` 文件。具体配置方法请访问 https://github.com/searxng/searxng。

以下是一个 `settings.yml` 示例。

<details>
<summary>📋 点击展开完整 settings.yml 配置（30+ 搜索引擎）</summary>

```yml
use_default_settings: true

server:
  secret_key: "random string"
  limiter: false

outgoing:
  request_timeout: 10.0
  max_request_timeout: 10.0
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

以下是一个 `docker-compose.yml` 示例。

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

### 通过 npm 安装（推荐）

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

### 从源码构建

```bash
git clone https://github.com/hkwuks/sxng-cli.git
cd sxng-cli/cli
npm install
npm run build
npm link
```

### Obscura（可选 — 用于 JS 密集页面）

[sxng extract](#-使用指南) 默认使用 **Defuddle + linkedom** 进行轻量级内容提取。当页面需要 JavaScript 渲染（SPA、动态内容）时，可启用 [Obscura](https://github.com/h4ckf0r0day/obscura) 作为回退：

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

# 验证
obscura --version
```

无需额外 npm 依赖 — Obscura 通过 CLI 调用。自动检测 `PATH`、`~/.local/bin/obscura` 或 `/usr/local/bin/obscura`。

---

## 🚀 快速开始

1. **安装 CLI：**
   ```bash
   npm install -g sxng-cli
   ```

2. **配置 CLI：**
   ```bash
   sxng init
   ```
   或设置环境变量：
   ```bash
   export SEARXNG_BASE_URL=http://your-searxng-instance:8080
   ```

3. **执行搜索：**
   ```bash
   sxng "TypeScript tutorial"
   ```

---

## 📖 使用指南

### 命令

| 命令 | 说明 |
|------|------|
| `sxng init` | 交互式配置设置 |
| `sxng <query>` | 执行网页搜索 |
| `sxng --queries "q1,q2"` | 多查询搜索（RRF 融合排序） |
| `sxng extract --urls <urls>` | 提取网页内容 |
| `sxng extract --obscura` | 使用 Obscura JS 渲染回退提取 |
| `sxng --session new` | 创建深度搜索会话 |
| `sxng session-list` | 列出所有会话 |
| `sxng session-delete <session-name>` | 删除指定会话 |
| `sxng graph-add <session>` | 向知识图谱添加实体 |
| `sxng query-graph <session>` | 查询知识图谱 |
| `sxng --health` | 检查 SearXNG 服务器健康状态 |
| `sxng --engines-list` | 列出服务器可用搜索引擎 |
| `sxng --categories-list` | 列出服务器可用分类 |
| `sxng --help` | 显示帮助信息 |

### 搜索选项

| 选项 | 说明 |
|------|------|
| `-e, --engines <list>` | 逗号分隔的搜索引擎列表（如 `google,github`） |
| `-c, --categories <list>` | 逗号分隔的分类列表（如 `it,science`） |
| `-l, --limit <n>` | 最大结果数（默认：10） |
| `-p, --page <n>` | 翻页页码 |
| `--lang <code>` | 语言代码（如 `en`、`zh`、`ja`） |
| `--time <range>` | 时间范围：`day`、`week`、`month`、`year`、`all` |
| `-f, --format <fmt>` | 输出格式：`md`、`json`、`csv`、`html`（默认：md） |
| `--queries <list>` | RRF 融合多查询（如 `q1,q2,q3`） |
| `--session <session-name>` | 会话目录或 `new` 创建深度搜索会话 |
| `--owner <session-name>` | 会话所有者标识 |
| `--desc <text>` | 会话描述 |

### 示例

```bash
# 基本搜索（默认 Markdown 输出）
sxng "machine learning"

# JSON 输出
sxng --format json "machine learning"

# 指定引擎搜索
sxng --engines google,duckduckgo "privacy tools"

# 搜索 IT 和科学分类
sxng --categories it,science "kubernetes tutorial"

# 限制结果数并按时间过滤
sxng --limit 5 --time week "latest AI news"

# CSV 输出
sxng --format csv "python tutorial" > results.csv

# 多查询 RRF 融合搜索
sxng --queries "tokio tutorial,rust async basics,async-std guide"

# 列出可用引擎（从服务器获取）
sxng --engines-list

# 列出可用分类（从服务器获取）
sxng --categories-list
```

---

## ⚙️ 配置

配置优先级（从高到低）：
1. 环境变量
2. 本地配置文件（`./sxng.config.json`）
3. 全局配置文件（`~/sxng-cli/sxng.config.json`）
4. 默认值

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SEARXNG_BASE_URL` | SearXNG 服务器 URL | *（必填）* |
| `SEARXNG_DEFAULT_ENGINE` | 默认搜索引擎 | *（无）* |
| `SEARXNG_ALLOWED_ENGINES` | 逗号分隔的允许引擎列表 | *（全部）* |
| `SEARXNG_DEFAULT_LIMIT` | 默认结果数限制 | `10` |
| `SEARXNG_DEFAULT_FORMAT` | 默认输出格式（`md`、`json`、`csv`、`html`） | `md` |
| `SEARXNG_USE_PROXY` | 是否使用代理（`true`/`false`） | `false` |
| `SEARXNG_PROXY_URL` | 代理 URL | *（无）* |
| `SEARXNG_TIMEOUT` | 请求超时时间（毫秒） | `10000` |

### 配置文件

配置文件搜索顺序（先找到的优先）：

1. **本地配置** - `./sxng.config.json`（当前工作目录，用于项目级设置）
2. **全局配置** - `~/sxng-cli/sxng.config.json`（用户主目录，用于全局默认值）

创建 `sxng.config.json`：

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

## 🧠 深度搜索

深度搜索支持多轮迭代研究，具备会话累积和知识图谱构建能力。

### 快速示例

```bash
# 创建会话并搜索
sxng --session new --owner "researcher" --desc "Rust async study" "rust async ecosystem"
# 已创建会话：~/sxng-cli/sessions/<session-name>

# 从结果中提取内容（按名称或路径）
sxng extract --session <session-name>
# 或：sxng extract --session ~/sxng-cli/sessions/<session-name>

# 添加知识图谱实体（按名称或路径）
sxng graph-add <session-name> --data '{
  "entities": [
    {"label": "tokio", "entityType": "runtime", "score": 0.95},
    {"label": "async-std", "entityType": "runtime", "score": 0.85}
  ],
  "edges": [
    {"source": "e:tokio", "target": "e:async_std", "relation": "alternative_to", "weight": 0.9}
  ]
}'

# 查询图谱（按名称或路径）
sxng query-graph <session-name> --seeds "tokio" --depth 2

# 继续研究（结果会累积）
sxng --session <session-name> --queries "tokio vs async-std,benchmark 2024"
```

### 会话管理

| 命令 | 说明 |
|------|------|
| `sxng --session new` | 创建自动命名的会话 |
| `sxng --session <session-name>` | 按名称使用会话（自动解析为 `~/sxng-cli/sessions/<session-name>`） |
| `sxng --session <path>` | 按完整路径使用会话 |
| `sxng session-list` | 列出所有会话及统计信息 |
| `sxng session-delete <session-name>` | 删除指定会话 |
| `sxng session-delete --older <hours>` | 删除超过指定小时的旧会话 |

**会话路径解析：**
- 纯名称（如 `my-session`）→ `~/sxng-cli/sessions/my-session`
- 完整路径（如 `/custom/path/session`）→ 直接使用
- `new` → 在 `~/sxng-cli/sessions/` 下自动生成唯一名称

### 会话数据结构

每个会话在 `~/sxng-cli/sessions/<session-name>/` 下存储三个文件：

- **`results.json`** — 累积的搜索结果（URL 去重，多轮搜索）
- **`graph.json`** — 知识图谱（结构层 + 语义层）
- **`meta.json`** — 会话元数据（所有者、描述、时间戳）

### 知识图谱

**结构层**（自动构建）：
- `q:` — 查询节点
- `r:` — 结果节点
- `d:` — 域名节点

**语义层**（通过 `graph-add`）：
- `e:` — 实体节点，包含类型和评分

---

## 🏗️ 架构

### 内容提取

`sxng extract` 使用双层提取策略：

1. **Defuddle + linkedom**（默认，轻量）— 使用 linkedom 解析原始 HTML，通过 Defuddle 提取可读内容。速度快，无需浏览器。
2. **Obscura**（可选回退）— 当 Defuddle 提取内容过少（< 50 字符）时，Obscura 使用 V8 JS 引擎渲染页面并重新提取。使用 `--obscura` 启用。

```bash
# 默认：仅 Defuddle（快速）
sxng extract --urls "https://example.com"

# 为 JS 密集页面启用 Obscura 回退
sxng extract --urls "https://spa-site.com" --obscura

# Obscura 直接 Markdown 输出（跳过 Defuddle 重新解析）
sxng extract --urls "https://spa-site.com" --obscura --obscura-dump markdown

# 自定义 Obscura 二进制路径
sxng extract --urls "https://spa-site.com" --obscura --obscura-path /path/to/obscura
```

提取选项：

| 选项 | 说明 |
|------|------|
| `--obscura` | 为 JS 渲染页面启用 Obscura 回退 |
| `--obscura-path <path>` | Obscura 二进制路径（省略则自动检测） |
| `--obscura-dump <format>` | Obscura 输出格式：`html`（默认）或 `markdown` |

### 动态引擎/分类发现

与其他硬编码引擎和分类的 CLI 工具不同，本工具动态从 SearXNG 服务器的 `/config` 接口获取信息：

- 运行时从服务器获取引擎和分类
- 确保与任何 SearXNG 实例配置兼容
- 向 SearXNG 实例添加新引擎会自动在 CLI 中生效

使用 `sxng --engines-list` 和 `sxng --categories-list` 查看服务器可用项。

### 输出格式

CLI 支持多种输出格式：

- **Markdown（默认）** — 针对 LLM 上下文窗口优化，比 JSON 节省约 50% token
- **JSON** — 结构化信封格式，适合程序化使用

<details>
<summary>📝 点击展开输出格式示例</summary>

#### Markdown 格式（默认）

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

#### JSON 信封格式

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

## 🛠️ 开发

---

## ⭐ Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=hkwuks/sxng-cli&type=date&legend=top-left)](https://www.star-history.com/?repos=hkwuks%2Fsxng-cli&type=date&legend=top-left)