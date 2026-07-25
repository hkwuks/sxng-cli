# Claim—Evidence—Review Audit (L2/L3 Only)

Run this only after completing Phase 1–8 of the deep-search SOP and synthesizing
a draft from approved results and the knowledge graph, before the final answer.
L1 searches have no session or approved-results pool, so they do not run it.

## Timeline

```
Phase 1-8: deep-search SOP
         ↓
Synthesize draft from approved results + knowledge graph
         ↓
Claim—Evidence—Review (two steps)
         ↓
Adjust final output from the Review
         ↓
Final output (cite approved claims only)
```

## CLI Interaction

```bash
# Step 1: Submit all claims and automatically search for evidence.
sxng claim-add <session> --claims '[
  {"text":"Tokio is the most widely used async runtime in Rust ecosystem","riskLevel":"medium"},
  {"text":"Rust 2024 edition introduced async closures","riskLevel":"low"},
  {"text":"async-std is no longer actively maintained","riskLevel":"medium"}
]'
# Returns claims and evidence candidates for every claim.

# Step 2: For each claim, confirm evidence and submit a stance.
sxng evidence-verify <session> --claim-id "cl_001" \
  --evidence '{"resultUrl":"https://tokio.rs/","quote":"Tokio is the most widely used async runtime...","charStart":1284,"charEnd":1359}' \
  --stance 'support' --reason 'Official docs confirm directly' \
  --complete
# Returns evidence, verdict, and review; --complete triggers aggregation.

# Repeat Step 2 for cl_002 and cl_003.
```

For the three-claim example, this uses four CLI calls: one batch `claim-add`
and three `evidence-verify` calls.

## Review Decision

```
Review result
     │
 ┌───┴────────┐
 │            │
approved   needsReview
 │            │
cite it   ┌───┴──────────────┐
          │                  │
    revise the claim     conflicting evidence
    and re-verify        preserve the disagreement in output
                         no action → drop it; do not cite it
```
