# Relationship Search and Orbit Agent Tool Boundaries

## Context

Orbit AI is the conversation orchestration layer. Relationship Search is a retrieval boundary for evidence-backed relationship data. The current code already separates these concepts in documentation, but implementation has begun to mix product tool policy into `features/orbit-ai`, especially for `contacts.recommend`.

This design records the target boundary before further live search, vector retrieval, or agent tool work.

## Decision

Use a central planner with distributed tool ownership:

```text
Orbit AI planner/runtime
  -> tool registry
  -> feature-owned tool adapter
  -> feature service and optional shared retrieval service
  -> normalized tool result
  -> Orbit AI artifact mapper / synthesis
```

Orbit AI owns intent planning, allowed tool names, schema validation, runtime guardrails, trace, artifact mapping, and final synthesis. Business features own tool policy.

Relationship Search remains a shared retrieval substrate. It does not own product recommendations or actions.

## Relationship Search Scope

Relationship Search answers: given a semantic or keyword query plus filters and constraints, which existing relationship records, evidence, connections, or candidate contacts match?

It may own:

- query and filter input contracts
- metadata filtering
- keyword/full-text retrieval
- vector retrieval
- graph constraints
- provider result mapping
- evidence ids, source refs, matched fields, score/rationale, and provenance

It must not own:

- final contact recommendation policy
- event-specific “who should I meet” decisions
- follow-up prioritization
- message drafting
- external side effects
- writes to Contacts, Events, Followups, Chat, or Agent state

## Feature Policy Scope

Features decide why to search and what to do with results.

- Contacts or Recommendations owns `contacts.recommend`: candidate eligibility, ranking, recommendation reason, and contact actions.
- Events owns `events.recommend`: event goals, attendee context, readiness, opening-line needs, and event-specific ranking.
- Followups owns `followups.reviewQueue`: overdue and dormant relationship interpretation, queue ranking, and reminder boundaries.
- Chat owns `chat.context`: conversation context, privacy boundary, and draft preparation.

These tools may call Relationship Search for candidate retrieval, but they decide how retrieved candidates become product artifacts.

## Hybrid Retrieval Model

Future AI search should not rely on vector search alone. The live search path should combine:

- semantic query for embedding/vector recall
- keyword query for lexical fallback or BM25
- metadata filters for industry, source type, value type, relationship stage, event id, contact id, follow-up status, and time range
- constraints for tenant, user, permissions, privacy scope, and evidence-required guarantees
- graph constraints for existing relationship paths and source-backed connections
- feature-specific reranking after retrieval

Structured fields are not a replacement for vector search. They are guardrails and context. They restrict candidate scope, prevent permission leaks, preserve explainability, and provide ranking boosts that pure semantic similarity cannot safely infer.

## Current Mock Behavior

The current `features/search` mock is deterministic:

- query text is tokenized into lowercase terms
- every token must be contained in the candidate search text
- filters are exact enum matches
- query and filter groups combine with AND
- values within a filter group combine with OR
- semantic search, embeddings, external indexes, live database reads, and external network calls are explicitly marked false

This is acceptable for a mock-first contract. It is not a semantic search implementation.

## Live Replacement Requirements

Live Relationship Search must keep the public service interface stable and map all provider hits into the Search contract.

Required properties:

- no result without evidence ids and source references
- no raw provider payloads, embedding vectors, raw scores, or analyzer internals in page data
- no raw sensitive query logging without redaction and account scoping
- metadata and permission constraints applied before broad semantic expansion
- explicit provenance for semantic search, embedding generation, cross-provider index queries, database reads, and provider calls
- controlled failure or omission when provider hits cannot be tied to source-backed relationship evidence

## Migration Implications

The existing `features/orbit-ai/contact-recommendation-matching.ts` can remain as a transitional implementation, but the target ownership should move the recommendation policy to Contacts or Recommendations.

Preferred direction:

```text
Orbit AI contacts.recommend
  -> Contacts/Recommendations tool adapter
  -> Relationship Search queryRelationships/queryCandidates
  -> Contacts/Recommendations ranking and action policy
  -> Orbit AI artifact mapping and synthesis
```

Events, Followups, and Chat should follow the same pattern instead of staying as Orbit AI preview-only artifacts.

## Testing Expectations

Tests should prove:

- Search mock remains deterministic and side-effect free.
- Live search preserves Search DTO shape and does not expose provider internals.
- Filters and permission constraints prevent vector retrieval from returning out-of-scope records.
- Feature-owned tools can use Search without moving business policy into Search.
- Orbit AI tool whitelist and trace show selected tools, source modules, artifact producers, safety, and evidence provenance.
