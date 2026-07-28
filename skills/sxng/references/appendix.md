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

# Phase 2: Extract + preprocess
sxng extract --session $SESSION
sxng graph-preprocess $SESSION --format json

# Phase 3: Quality assessment + approve selected {id, revision} objects into the structural graph
sxng --session $SESSION --quality
# Save selected objects from quality output to approve.json, then approve and inject into graph:
sxng --session $SESSION --quality --approve-file ./.sxng/sessions/$SESSION/agent-inputs/approve.json

# Phase 4: Save semantic entities and edges with approved sourceResultIds from
# graph-preprocess in graph.json, then add them after result nodes exist.
sxng graph-add $SESSION --data-file ./.sxng/sessions/$SESSION/agent-inputs/graph.json

# Phase 5-6: If quality not met, supplementary search
sxng suggest-queries $SESSION --format json
sxng --session $SESSION --queries \
     "Qdrant rust implementation,HNSW vs IVF performance" --redundancy warn

# Re-extract + assess + approve + preprocess + add entities
sxng extract --session $SESSION
sxng --session $SESSION --quality
sxng --session $SESSION --quality --approve-file ./.sxng/sessions/$SESSION/agent-inputs/approve-round-2.json
sxng graph-preprocess $SESSION --format json
sxng graph-add $SESSION --data-file ./.sxng/sessions/$SESSION/agent-inputs/graph-round-2.json

# Phase 7: Recovery when consecutive poor rounds
sxng recovery-analysis $SESSION --format json
sxng strategy-info $SESSION --format json

# Phase 8: Graph exploration
sxng graph-search $SESSION --keyword "vector"
sxng graph-explore $SESSION --seed "Pinecone" --format json
sxng graph-drill $SESSION --seed "Pinecone" --relations "uses,competitor" --format json

# Phase 9: Claim—Evidence—Review (after draft, before output).
# Save claims and each {resultId, quote, charStart, charEnd} evidence object under agent-inputs.
sxng claim-add $SESSION --claims-file ./.sxng/sessions/$SESSION/agent-inputs/claims.json
sxng evidence-verify $SESSION --claim-id "cl_001" \
  --evidence-file ./.sxng/sessions/$SESSION/agent-inputs/evidence-cl_001.json \
  --stance support --reason "Official site confirms" --complete
sxng evidence-verify $SESSION --claim-id "cl_002" \
  --evidence-file ./.sxng/sessions/$SESSION/agent-inputs/evidence-cl_002.json --stance support --reason "..." --complete
sxng evidence-verify $SESSION --claim-id "cl_003" \
  --evidence-file ./.sxng/sessions/$SESSION/agent-inputs/evidence-cl_003.json --stance insufficient --reason "No benchmark data found" --complete

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
| Inline JSON or a project-root temp file | Put UTF-8 JSON in `.sxng/sessions/<session>/agent-inputs/` and use `--*-file` |
| Treating a search excerpt as a body | Import it with `--kind search`, then extract; use `--kind extracted` only for actual external bodies |

---

> **Back to**: [SOP](SOP.md) — core operational procedure
