# Cloud authority with encrypted local mirrors

Orbit will keep authenticated server records as the cross-device and Orbit AI authority while the App maintains an actor-scoped, encrypted SQLite mirror and a bounded mutation outbox for explicitly supported offline work. This preserves fast and resilient mobile reads without creating a second source of truth: only server-acknowledged revisions are canonical, realtime messages are invalidation hints, and cursor synchronization repairs missed updates and deletions.

## Considered Options

- Network-only App reads: simplest authority model, but repeats full transfers and makes ordinary personal work fail during weak connectivity.
- Device-first authority with later cloud backup: strongest offline behavior, but makes multi-device conflicts, Web parity, permissions, and server-side AI visibility ambiguous.
- Cloud authority with an encrypted local durable mirror: adds synchronization and conflict handling, but keeps one explicit owner of truth while supporting bounded offline use.

## Consequences

Notes, confirmed tasks, confirmed relationship follow-ups, personal schedule items, contacts, and inbox projections may be mirrored locally. Offline writes are limited initially to notes, confirmed tasks, confirmed relationship follow-ups, and personal schedule items; invitations, registrations, shared meetings, permissions, account deletion, and AI side effects remain online-only. Device-only drafts are not model-visible, pending changes must be labelled as unavailable to Orbit AI, and the App must use foreground/cursor recovery even when realtime delivery exists.
