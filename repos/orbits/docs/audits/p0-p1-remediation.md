# P0/P1 remediation goal

## Execution prompt

Fix every identified P0, P1, and related risk to a mature-product standard.
For each capability, verify business semantics, actor isolation, representative
test data, page interaction, durable read-back, fail-closed behavior, and side
effect boundaries. An HTTP 200 response, a registered constructor, a fixed
template, an in-memory adapter, a source-code assertion, or a hand-written
report is not evidence that a user outcome works. External providers that are
not configured must be labelled unavailable or limited and must never simulate
success.

## Release gates

| Area | Current risk | Release gate |
| --- | --- | --- |
| Capability readiness | Metadata constructors were reported as `live-ready` | Readiness includes executable evidence and zero known limitations |
| Agent functional report | Static expectations could contradict the case data | Totals are derived from cases; limited cases remain visible until their executable evidence passes |
| Relationship search | Non-Latin queries tokenized to an empty query and returned every contact | Known Chinese terms match; unmatched Chinese queries return zero results |
| Relationship inbox | Live GET failed while POST created an ephemeral mock preview | Actor-scoped persistent create → list → detail → restart read-back |
| Relationship mock data | Large datasets repeat a small set of generic English bodies | Chinese, role-aware, multi-message histories with diversity thresholds |
| Recommendation evaluation | Golden cases existed without accuracy execution | Top-k, negative filtering, and minimum-quality thresholds run in CI |
| AI drafting and summaries | Some live paths were deterministic templates | Provider provenance is explicit; semantic golden cases and safe fallback behavior pass |
| OCR | Provider wiring was tested with a dummy byte string | Representative card images, field-level precision/recall, redaction, and cost gates pass |
| Password reset | UI advertises an unimplemented path | Complete token lifecycle and account-isolation tests, or honest unavailable UI |
| Notifications and external providers | Internal preparation could look like delivery | UI and API distinguish prepared, confirmed, delivered, and provider-unconfigured states |

## Severity

- **P0:** false completion claims, cross-account data, destructive or external
  side effects without confirmation, non-empty queries returning unfiltered
  private data, or successful UI states without durable records.
- **P1:** semantically wrong AI/rule results, unrealistic fixtures that mask
  failures, missing quality evaluation, advertised but unavailable provider
  workflows, or incomplete recovery states.

No item is closed by documentation alone. Each row must have executable service
tests and browser evidence before its limitation can be removed from the
capability registry.
