# SXNG DeepSearch SOP

> **Proactive Deep Search**: When the user asks a question that requires multi-angle comparison, research, cross-validation, or any topic where simple search might not suffice — go straight to `--session` deep search. Do not start with simple search and "upgrade" later; creating a session from the first round costs nothing and gives you quality assessment, redundancy checks, and knowledge graph from the start. When uncertain between L1 and L2, choose L2.

> Standard Operating Procedure for multi-round deep research (Session + Knowledge Graph + Quality Assessment + Recovery)

## 1. Core Philosophy

**Search ≠ Answer**. A single search returns raw information, not verified facts. This SOP ensures output quality through **multi-round iteration + knowledge graph + quality assessment + recovery strategies**.

**Workflow**:

```
Intent Analysis → Query Planning → Multi-source Search → Content Extraction → Graph Building → Quality Assessment → Recovery/Suggestions → (Loop or Output)
```

---

## 2. Trigger Conditions

### When to Use Deep Search (`--session`)

| Scenario | Example |
|----------|---------|
| Multi-dimensional information synthesis | "2026 mainstream vector database comparison" |
| Scattered information requiring cross-validation | "PostgreSQL vs MySQL performance benchmarks" |
| Tech selection / research report | "Rust async ecosystem analysis" |
| Tracking topic evolution | "AI reasoning model development history" |
| Initial search yields insufficient results | Fewer than 5 relevant results |

### When to Use Simple Search (no `--session`)

**Only use simple search when the question is a trivial single-fact lookup with no need for cross-validation.** If there's any chance more depth is needed, start with `--session` — it doesn't cost extra and preserves options.

| Scenario | Example |
|----------|---------|
| Specific fact lookup | "Python dict get method usage" |
| Locating official docs | "FastAPI official documentation URL" |
| Error resolution | "Docker port already allocated fix" |
| Latest version number | "React latest version" |

---

## 3. Complexity Levels (L1/L2/L3)

Choose tool sequences based on problem complexity:

### L1: Single Fact (1-2 search rounds)

**Characteristics**:
- Unique, uncontroversial answer
- 1-2 keywords cover the topic
- No deep comparison needed

**Tool Sequence**:

```bash
# Step 1: Single search
sxng "FastAPI latest version" -l 5

# Step 2 (optional): Extract official page for verification
sxng extract --urls "https://pypi.org/project/fastapi/"
```

**Stop Conditions**:
- [x] Found >= 1 authoritative source (official docs / PyPI / GitHub)
- [x] No conflicting information

---

### L2: Multi-angle Comparison (2-4 search rounds)

**Characteristics**:
- Comparing 2-5 candidates
- Multiple dimensions needed (performance / features / pricing)
- Information requires cross-validation

**Tool Sequence**:

```bash
# Step 1: Create Session
sxng --session new --owner "agent-1" --desc "Vector DB comparison" \
     "vector database 2026 Pinecone Weaviate Qdrant comparison"

# Step 2: Preprocess + extract
sxng graph-preprocess <session> --format json
sxng extract --session <session>
# For JS-heavy pages (SPAs), add --obscura fallback:
# sxng extract --session <session> --obscura

# Step 3: Build knowledge graph
sxng graph-add <session> --data '{
  "entities": [
    {"label": "Pinecone", "entityType": "product", "score": 0.9},
    {"label": "Weaviate", "entityType": "product", "score": 0.85},
    {"label": "Qdrant", "entityType": "product", "score": 0.8}
  ],
  "edges": [
    {"source": "e:Pinecone", "target": "e:Weaviate", "relation": "competitor", "weight": 0.9}
  ]
}'

# Step 4: Quality assessment
sxng --session <session> --quality

# Step 5: If quality not met, get suggestions + supplementary search
sxng suggest-queries <session> --format json
sxng --session <session> --queries \
     "Pinecone pricing 2026,Weaviate vs Qdrant benchmark" --redundancy warn

# Step 6: Explore graph to verify coverage
sxng graph-explore <session> --seed "Pinecone" --format json
```

**Stop Conditions**:
- [x] Quality assessment verdict is good or acceptable
- [x] Each candidate has >= 2 independent sources
- [x] Key entities connected in graph

---

### L3: Deep Research (4+ search rounds)

**Characteristics**:
- Research-grade report
- Systematic coverage of subtopics required
- Information may conflict, requiring adjudication

**Standard Operating Procedure (8-Phase SOP)**:

#### Phase 1: Intent Analysis & Initial Search

Sessions are stored under `.sxng/sessions/` by default.

**Output**:
- Core question in one sentence
- Decomposed into 3-7 sub-queries

```bash
sxng --session new --owner "researcher" --desc "RAG Vector DB deep research" \
     --queries "vector database 2026 ranking,vector DB for RAG comparison"
```

#### Phase 2: Preprocessing & Entity Discovery

```bash
# Get TF-IDF terms, co-occurrence pairs, existing entities
sxng graph-preprocess <session> --format json

# Extract key page content
sxng extract --session <session>
```

**Agent Decision Logic**:
- Select terms with tfidf > threshold that are not in existing entity list
- Prioritize terms with high co-occurrence count (high connectivity)
- Avoid overly broad terms

#### Phase 3: Build Knowledge Graph

```bash
sxng graph-add <session> --data '{
  "entities": [...],
  "edges": [...]
}'
```

The knowledge graph has two layers:
- **Structural** (auto-built): query→result→domain nodes and edges
- **Semantic** (added by you via `graph-add`): entity nodes with custom relation edges

When adding edges, `source`/`target` must reference existing node IDs. Node ID prefix rules:

| Prefix | Type | Format | Example |
|--------|------|--------|---------|
| `e:` | Entity | `e:<label>` | `e:tokio` |
| `r:` | Result | `r:<url>` | `r:https_tokio_rs_` |
| `q:` | Query | `q:<query>` | `q:rust_async` |
| `d:` | Domain | `d:<domain>` | `d:github_com` |
| `p:` | Path | `p:<type>_<num>` | `p:chain_001` |

References to non-existent nodes are skipped and reported in `skippedEdges`.

**External Search Results Integration**: When you use other search tools (tavily, exa, open-web-search, etc.) during a deep search session, you **must** inject their results into the knowledge graph via `graph-add`. This ensures the graph reflects all discovered information, not just sxng results.

```bash
# After running tavily/exa/open-web-search, inject results:
sxng graph-add <session> --data '{
  "results": [
    {"url": "https://...", "title": "...", "rank": 1, "source": "tavily"},
    {"url": "https://...", "title": "...", "rank": 2, "source": "exa"}
  ],
  "entities": [
    {"label": "EntityName", "entityType": "concept", "score": 0.8}
  ],
  "edges": [
    {"source": "r:https_...", "target": "e:EntityName", "relation": "mentions", "weight": 1},
    {"source": "e:EntityA", "target": "e:EntityB", "relation": "depends_on", "weight": 0.9}
  ]
}'
```

The `source` field (`"sxng"` | `"tavily"` | `"exa"` | `"open-web-search"` | ...) marks which tool produced each result. sxng-native results default to `"sxng"`. External results participate equally in quality assessment, path discovery, and domain diversity — the graph treats them identically regardless of source.

> **Note**: Results added via `graph-add` are marked as `pending` and require Agent approval (`--quality --approve`) before they appear in the graph for subsequent commands.

#### Phase 4: Quality Assessment & Approval

```bash
# Assess quality and list pending results
sxng --session <session> --quality

# Approve selected pending results (injects into graph automatically)
sxng --session <session> --quality --approve "0,1,2"
```

> **Results are accumulated as `pending`** — they are not in the knowledge graph until approved by the Agent via `--approve`. External results injected via `graph-add` also go through pending first.

4 independent indicators (contentDepth, entityRichness, sourceDiversity, novelty), each with its own threshold.

| Verdict | Action |
|---------|--------|
| good | Enter Phase 8 (graph exploration) or synthesize output |
| acceptable | Enter Phase 5 (query suggestions), targeted supplementation |
| poor | Enter Phase 7 (recovery analysis) |

#### Phase 5: Query Suggestions

```bash
sxng suggest-queries <session> --format json
```

**Agent Decision Logic**:
- `topEntities` has high degree × frequency but unexplored entities → search using them as keywords
- `unexploredDomains` is non-empty → choose query terms related to new domains
- `qualityLastRound.failedIndicators` contains "sourceDiversity" → add `-e` flag to use different engines

#### Phase 6: Continue Search (with Redundancy Check)

```bash
sxng "follow-up query" --session <session> --redundancy warn
```

→ Return to Phase 2, loop until quality is satisfactory

#### Phase 7: Recovery Analysis (when consecutive poor quality)

```bash
sxng recovery-analysis <session> --format json
```

| Strategy | Applicable Scenario | Agent Action |
|----------|---------------------|-------------|
| reformulate | Query too specific, too few results | Remove qualifiers, use broader terms |
| engine_rotation | Current engine missed results | Switch engine combination (e.g., google → arxiv+github) |
| category_shift | Current category has poor results | Switch to different category (e.g., general → it) |
| backtrack | >=2 consecutive poor rounds | Return to last good quality round, explore different direction |

Also check search stage suggestions:

```bash
sxng strategy-info <session> --format json
```

- `broad_exploration`: First 2-3 rounds, use general engines
- `targeted_deep_dive`: After entity growth slows, switch to specialized engines (arxiv, github, semantic_scholar)

#### Phase 8: Graph Exploration (navigate knowledge space after quality is good)

```bash
# Discover entities
sxng graph-search <session> --keyword <term> --format json

# View entity relations
sxng graph-explore <session> --seed <entity> --format json

# Drill into specific relations
sxng graph-drill <session> --seed <entity> --relations <list> --format json

# Traverse reasoning paths
sxng graph-traverse <session> --path <path-id> --format json
```

**Agent Decision Logic**:
1. Check recommended commands in `suggestedNextSteps`
2. Evaluate weight and target score of each relation
3. Choose the relation direction with highest weight that hasn't been visited
4. Use `graph-drill` to get specific triples
5. If dead end, use alternativePaths suggestions

#### View Full Session Report

```bash
sxng session-report <session> --format json
```

---

## 4. Search Planning Framework

### 4.1 Intent Analysis

Extract from user question:

| Field | Description | Example |
|-------|-------------|---------|
| `core_question` | One-sentence restatement | "Best vector DB for RAG in 2026 Q2?" |
| `query_type` | factual/comparative/exploratory | "comparative" |
| `time_sensitivity` | realtime/recent/historical | "recent" |
| `terms_to_verify` | Terms to verify first | ["RAG workload", "HNSW"] |

### 4.2 Query Decomposition Principles

- **Non-overlapping**: Sub-queries should not duplicate each other
- **Dependency annotation**: When B depends on A's results, annotate `depends_on: [A]`
- **Quantity limit**: 3-7 sub-queries; if exceeded, split the topic

### 4.3 Strategy Selection

| Strategy | Applicable Scenario |
|----------|---------------------|
| `broad_exploration` | Exploratory ("what are the options") — first 2-3 rounds |
| `targeted_deep_dive` | Analytical (candidates identified, need details) — after entity growth slows |

Use `strategy-info` command to determine current stage.

---

## 5. Evidence Standards

### 5.1 Source Quality

**White List (trust by default)**:
- Official documentation (docs.*, README, official sites)
- Package managers (PyPI, npm, crates.io)
- Standards documents (PEP, RFC, W3C)
- Academic sources (arxiv.org, ACM, IEEE)

**Grey Zone (use cautiously)**:
- Tech blogs (check author authority)
- Stack Overflow (check votes and accepted answers)
- GitHub Issues (take trend signals, not as conclusions)

**Black List (avoid)**:
- SEO farms (keyword stuffing, machine-generated)
- AI-translated aggregator sites
- Content without publication dates

> When presenting search results, follow the Result Quality Filtering principle: keep liberally, filter conservatively — when uncertain, keep rather than delete (see Section 5.1).

### 5.2 Cross-Validation

**Hard Requirement**:
- Each factual conclusion needs >= 2 independent sources
- "Independent" = different domain + different author + not cross-posted

**Single authoritative source does not need Low annotation**:
```
FastAPI 0.136.0 was released on 2026-04-16.
Sources:
- [fastapi - PyPI](https://pypi.org/project/fastapi/)
```
**Single non-authoritative source needs annotation**:
```
A company plans to open-source its internal framework (Confidence: Low, single non-official source)
— Only one tech media report, company has not confirmed.

Sources:
- [Tech media report](https://example.com/article)
```

### 5.3 Conflict Resolution

When sources disagree:

1. **Don't hide disagreements** — present evidence from both sides
2. **Assess authority** — official > mainstream media > self-media
3. **Assess timeliness** — recent > older
4. **Give judgment** — explain reasoning or honestly mark as uncertain

### 5.4 Citation Format

- Each source uses markdown link: `[Title](URL)`
- Forbidden: fabricating URLs, title without link, using evidence-free phrases like "multiple sources indicate"
---

## 7. Self-Check List

Before outputting final answer, verify:

- [ ] Every factual conclusion has `[Title](URL)` citation
- [ ] Single-source conclusions are marked **Confidence: Low**
- [ ] Source disagreements show evidence from both sides
- [ ] Used `sxng extract` to extract key page content
- [ ] L2/L3 levels used `--session` and knowledge graph
- [ ] L3 level used `--quality` assessment and decided next steps accordingly
- [ ] No evidence-free phrases like "it is generally believed" / "reports indicate"
- [ ] Graph coverage verified via `graph-explore`

---

## 8. Complete Example

### L3 Example: "2026 Vector Database Deep Comparison"

```bash
# Phase 1: Create Session
sxng --session new --owner "researcher" --desc "Vector DB deep research 2026" \
     --queries "vector database 2026 ranking,vector DB for RAG comparison"
SESSION="ds_1234567890_abcdef"

# Phase 2-3: Preprocess + extract + build graph
sxng graph-preprocess $SESSION --format json
sxng extract --session $SESSION
sxng graph-add $SESSION --data '{
  "entities": [
    {"label": "Pinecone", "entityType": "managed_service", "score": 0.95},
    {"label": "Weaviate", "entityType": "opensource", "score": 0.9},
    {"label": "Qdrant", "entityType": "opensource", "score": 0.85},
    {"label": "HNSW", "entityType": "algorithm", "score": 0.9}
  ],
  "edges": [
    {"source": "e:Pinecone", "target": "e:HNSW", "relation": "uses", "weight": 0.9},
    {"source": "e:Weaviate", "target": "e:HNSW", "relation": "uses", "weight": 0.95}
  ]
}'

# Phase 4: Quality assessment + approve
sxng --session $SESSION --quality
# Review pending results, then approve and inject into graph:
sxng --session $SESSION --quality --approve "0,1,2,3,4"

# Phase 5-6: If quality not met, supplementary search
sxng suggest-queries $SESSION --format json
sxng --session $SESSION --queries \
     "Qdrant rust implementation,HNSW vs IVF performance" --redundancy warn

# Re-extract + build graph + assess + approve
sxng extract --session $SESSION
sxng graph-add $SESSION --data '{"entities":[...],"edges":[...]}'
sxng --session $SESSION --quality
sxng --session $SESSION --quality --approve "0,1"

# Phase 7: Recovery when consecutive poor rounds
sxng recovery-analysis $SESSION --format json
sxng strategy-info $SESSION --format json

# Phase 8: Graph exploration
sxng graph-search $SESSION --keyword "vector"
sxng graph-explore $SESSION --seed "Pinecone" --format json
sxng graph-drill $SESSION --seed "Pinecone" --relations "uses,competitor" --format json

# Cleanup
sxng session-delete $SESSION
```

## 9. Anti-Patterns (Don'ts)

| Anti-Pattern | Correct Approach |
|-------------|-----------------|
| Drawing conclusions from a single search | Use `--session` multi-round iteration for L2/L3 |
| Using only one source | Cross-validate each fact with >= 2 independent sources |
| Ignoring source quality | Distinguish white list / grey zone / black list sources |
| Hiding information disagreements | Present disagreements and explain judgment basis |
| Fabricating citation links | Only use URLs actually visited |
| Reading summaries without extracting content | Use `extract` for key sources |
| Building knowledge graph without querying it | Use `graph-explore` to verify coverage |
| Continuing search without quality assessment | Use `--quality` each round, decide accordingly |
| Repeating queries wasting rounds | Use `--redundancy warn` to check redundancy |
| Not recovering from consecutive poor rounds | Use `recovery-analysis` for strategy suggestions |
| Not cleaning up sessions after use | Regularly run `session-delete --older` |
| Using `query-graph` | Deprecated, use `graph-explore` + `graph-drill` |
