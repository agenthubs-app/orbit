# iOrbit Full Test Baseline — 2026-07-27

Command: `pnpm test` in `repos/orbits`

- Tests: 1,256
- Passed: 1,256
- Failed: 0
- Skipped/cancelled/todo: 0
- Duration: 36.1 seconds
- Production build and TypeScript: passed separately.

The current baseline has no unexplained or open failures. The final three
regressions prove that live Agent Event reads receive the server-resolved actor,
relationship recommendation search cannot return another actor's graph, and the
Conversation API composes the actor-bound artifact service.

## Closed legacy Agent contract group

The previous 24 failures asserted retired GET-preview, old DOM, and mixed
route/service contracts. Each requirement was reconciled against the current
Conversation API → artifact → Run/Action Ledger architecture:

- current recommendation, conversation-history, localization, responsive, and
  privacy contracts are covered directly;
- ordinary turns clear stale tool panels while keeping the assistant reply;
- blank or concurrent sends are guarded and request state is exposed;
- calendar writes remain behind settings, permission, confirmation, and ledger
  boundaries;
- live route/storage failures remain explicit and do not fall back to Mock;
- server-resolved actor identity now reaches Event and relationship artifact
  reads.

No test was deleted merely to make the suite green; obsolete assertions were
replaced with tests of the approved current product boundary.
