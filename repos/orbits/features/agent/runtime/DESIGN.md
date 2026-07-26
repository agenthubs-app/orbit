# Orbit Agent Runtime

The runtime is the durable execution boundary behind Agent conversations and
confirmed actions. A conversation may produce a read-only Run or a Run with one
or more action proposals; the same Run is then used by the Agent UI, ledger,
outbox worker, and audit views.

## Run lifecycle

- Each successful conversation persists an ordered step trace.
- Step order is explicit (`sequence`) so storage backends do not decide the
  visual or execution order.
- Run progress is derived from persisted steps, never from a client-side timer.
- A non-terminal Run may be canceled. Cancellation also cancels every
  non-terminal action and pending/retry-scheduled outbox item in that Run.
- A failed or canceled Run is retryable only when it has at least one failed or
  canceled step. Retry resets only those steps and increments their attempt.
- A completed Run cannot be canceled, and a Run with executing/completed
  actions cannot be canceled through the conversation surface.

These constraints prevent a canceled confirmation card from later executing in
the worker and keep retry scope narrow enough to preserve completed work.

## API and UI boundary

`GET /api/ai/runs/:id` returns the Run, ordered steps, linked actions, and
derived progress. `POST /api/ai/runs/:id/transition` accepts only `cancel` or
`retry`. The Agent status card renders this server state and polls only while a
Run or action remains non-terminal.

The service factory caches actor-scoped runtime instances so a request never
crosses user boundaries. The cache has an explicit implementation version:
when the runtime interface changes during development hot reload, stale service
instances are discarded instead of leaking an old method surface into new
routes.
