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
                    │  Agent: --quality           │
                    │  → see pending with indices  │
                    │  → approve: --approve "0,1"  │
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
| External search | `sxng results-add <session> --query "source query" --data '[...]'` | pending |
| Content extraction | `sxng extract --session <session>` | updates content, same status |
| Entity/edge injection | `sxng graph-add <session> --data '{...}'` | entities/edges only |

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
2. **Pending results list** — each with an index number, title, URL, source, content preview, and domain

The Agent examines the pending list (including content previews) and returns which indices to keep.

## Approval & Graph Injection

```bash
sxng --session <session> --quality --approve "0,1,2"
```

This single command:
1. Marks those results as `approved`
2. Injects them into the graph (structural layer: query→result→domain edges)
3. Reports how many nodes/edges were added

After approval, the result nodes exist in the graph and can be referenced by `graph-add` edges.

## Adding Entities & Edges (After Approval)

Once results are in the graph, run `graph-preprocess` and use `graph-add` for the semantic layer. New entities require `sourceRounds` from the supporting `resultProvenance` rows; result edges must use `resultProvenance[].id`, not a URL-derived guess. Give a new entity an explicit `id` when an edge in the same request references it.

```bash
sxng graph-add <session> --data '{
  "entities": [
    {"id": "e:tokio", "label": "tokio", "entityType": "runtime", "sourceRounds": [1]}
  ],
  "edges": [
    {"source": "e:tokio", "target": "<resultProvenance id>", "relation": "documented_by"}
  ]
}'
```

Edges can reference any existing node type: `e:` (entity), `r:` (result), `q:` (query), `d:` (domain), `p:` (path).

## Claim—Evidence—Review Pipeline (L2/L3 Only)

After the knowledge graph is built, the Agent can run the claim audit pipeline to verify individual statements before output. This is a **post-search** step — it does not modify the search pool or graph. Re-extract any chosen evidence URL first if it lacks `extractedAt`; verification rejects evidence without a real extraction time.

```
Synthesize draft → claim-add → evidence-search (auto) → 
evidence-verify → policy-aggregate (auto) → Agent adjusts output
```

See [SOP Phase 9-10](SOP.md) for the full procedure.

## Content Extraction

`sxng extract --session <session>` reads URLs from the pool, fetches page content, and writes it back via `mergeExtractedContent`. It does NOT add new results — it only fills in the `content` field of existing entries. This means:

- Extract at any time, even before approval
- After extraction, quality assessment has richer content data
- Re-extract a URL to refresh content
