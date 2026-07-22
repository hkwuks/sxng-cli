# Appendix: Complete Example & Anti-Patterns

> Worked examples and common mistakes for deep search sessions.
>
> This is a reference companion to the [SOP](SOP.md). Read the SOP first for the operational procedure.

## 1. Complete L3 Example: "2026 Vector Database Deep Comparison"

```bash
# Phase 1: Create Session
sxng --session new --owner "researcher" --desc "Vector DB deep research 2026" \
     --queries "vector database 2026 ranking,vector DB for RAG comparison"
SESSION="ds_1234567890_abcdef"

# Phase 2-3: Preprocess + extract + add entities (results go through approve first)
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

# Re-extract + add entities + assess + approve
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

# Phase 9: Claim—Evidence—Review (after draft, before output)
sxng claim-add $SESSION --claims '[
  {"text":"Pinecone is a managed vector database service","riskLevel":"low"},
  {"text":"HNSW is the most widely used ANN algorithm in vector DBs","riskLevel":"medium"},
  {"text":"Weaviate outperforms Qdrant on hybrid search","riskLevel":"high"}
]'
sxng evidence-verify $SESSION --claim-id "cl_001" \
  --evidence '{"resultUrl":"https://www.pinecone.io/learn/vector-database/","quote":"Pinecone is a fully managed vector database","charStart":45,"charEnd":93}' \
  --stance support --reason "Official site confirms" --complete
sxng evidence-verify $SESSION --claim-id "cl_002" \
  --evidence '...' --stance support --reason "..." --complete
sxng evidence-verify $SESSION --claim-id "cl_003" \
  --evidence '...' --stance insufficient --reason "No benchmark data found" --complete

# Phase 10: Agent adjusts output based on review results
# cl_001 → approved (cite), cl_002 → approved (cite), cl_003 → needsReview (do not cite or mark uncertain)

# Cleanup
sxng session-delete $SESSION
```

---

## 2. Anti-Patterns (Don'ts)

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
| Search backend fails → abandon session | Switch backend (tavily/exa), inject via `results-add`, keep session |
| SearXNG returns 0 results → create new session | The session is decoupled from any backend; use `results-add` instead |

---

> **Back to**: [SOP](SOP.md) — core operational procedure
