# Search Pipeline — How Results Flow Through the System

## One Pool, One Pipeline

All results — whether from sxng search, external tools (tavily/exa), or any other source — go into **the same `results.json` pool** in the session directory. There is no separate path for external results. Everything follows the same flow:

```
                         ┌─────────────────────────────┐
                         │      results.json pool      │
                         │  (all results, deduped)      │
                         │  status: pending | approved  │
                         └─────────────────────────────┘
                                   │
                    ─── Pending ───┤
                                   │
                    ┌──────────────▼──────────────┐
                         │  Agent: --quality            │
                         │  → see pending id + revision │
                         │  → approve: --approve-file   │
                    └──────────────┬──────────────┘
                                   │
                    ─── Approved ──┤
                                   │
                    ┌──────────────▼──────────────┐
                    │  Auto-inject into graph     │
                    │  (structural edges:          │
                    │   query→result→domain)       │
                    └─────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  Agent: graph-add           │
                    │  → entities (semantic)       │
                    │  → edges (relations)         │
                    └─────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  Agent: claim-add           │
                    │  → auto evidence-search     │
                    │  → evidence-verify          │
                    │  → auto policy-aggregate    │
                    │  → Review (approved/        │
                    │     needsReview/rejected)    │
                    └─────────────────────────────┘
                                   │
                                   ▼
                         ┌──────────────────┐
                         │  Final output     │
                         │  (approved claims │
                         │   only)           │
                         └──────────────────┘
```

## How Results Enter the Pool

| Source | Command | Status |
|--------|---------|--------|
| sxng search | `sxng --session <session> "query"` | pending |
| External search | `sxng results-add <session> --kind search --tool <tool> --query "source query" --data-file <session-input>` | pending, requires extraction |
| External extracted body | `sxng results-add <session> --kind extracted --tool <tool> --query "source query" --data-file <session-input>` | pending approval |
| Content extraction | `sxng extract --session <session>` | updates content, same status |
| Entity/edge injection | `sxng graph-add <session> --data-file <session-input>` | entities/edges only |

> **Key rule**: `graph-add` does NOT accept results. Results must be in the pool first, approved, and injected into graph. Only then can `graph-add` reference result nodes in edges.

## Accumulation & Batch Processing

Results accumulate as pending. A warning fires at **≥30 pending results**, prompting quality assessment. This batch approach:

- Reduces token spend (one assessment per batch, not per result)
- Gives the Agent more context for quality decisions (sees all pending together)
- Lets external and sxng results be evaluated together

There is no hard upper limit — the Agent decides when to assess. The 30-count is a warning, not a block.

## Quality Assessment

`sxng --session <session> --quality` outputs:

1. **Quality score** — 3 programmatic indicators (contentDepth, sourceDiversity, novelty) with verdict (good/acceptable/poor)
2. **Pending results list** — each with stable `id`, `revision`, title, URL, source, content preview, and domain

The Agent examines the pending list (including content previews) and returns which indices to keep.

## Approval & Graph Injection

```bash
sxng --session <session> --quality --approve-file ./.sxng/sessions/<session>/agent-inputs/approve.json
```

This single command:
1. Marks selected `{id, revision}` results as `approved`
2. Injects them into the graph (structural layer: query→result→domain edges)
3. Reports how many nodes/edges were added

After approval, the result nodes exist in the graph and can be referenced by `graph-add` edges.

## Adding Entities & Edges (After Approval)

Once results are in the graph, run `graph-preprocess` and use `graph-add` for the semantic layer. Every entity and edge requires currently approved `sourceResultIds` from the supporting `resultProvenance` rows; result edges must use `resultProvenance[].id`, not a URL-derived guess. Give a new entity an explicit `id` when an edge in the same request references it.

```bash
sxng graph-add <session> --data-file ./.sxng/sessions/<session>/agent-inputs/graph.json
```

Edges can reference any existing node type: `e:` (entity), `r:` (result), `q:` (query), `d:` (domain), `p:` (path).

## Claim—Evidence—Review Pipeline (L2/L3 Only)

After the knowledge graph is built, the Agent can run the claim audit pipeline to verify individual statements before output. This is a **post-search** step — it does not modify the search pool or graph. Re-extract any chosen evidence URL first if it lacks `extractedAt`; verification rejects evidence without a real extraction time.

```
Synthesize draft → claim-add → evidence-search (auto) → 
evidence-verify → policy-aggregate (auto) → Agent adjusts output
```

See [Claim-Evidence-Review Audit](claim-evidence-review.md) for the full procedure.

## Content Extraction

`sxng extract --session <session>` reads only unextracted, unskipped URLs with fewer than two failures, fetches page content, and writes it back. It does NOT add new results. Explicit session URLs can be re-extracted. This means:

- Extract at any time, even before approval
- After extraction, quality assessment has richer content data
- Do not re-extract an already captured body unless the Agent explicitly selects that URL

## Session-Scoped JSON Input

All structured write inputs must be UTF-8 JSON files below `.sxng/sessions/<session>/agent-inputs/`. Inline JSON and files outside the owning session are rejected. This avoids PowerShell argument escaping, keeps concurrent sessions from sharing a fixed temporary filename, and leaves inputs available for inspection and retry.
