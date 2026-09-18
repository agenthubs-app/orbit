# Notification discovery runtime

This worker reads committed, actor-owned cloud records. It never opens the App database, sends a contact message, or creates a task. Accepting a suggestion uses the existing inbox action transaction and canonical task service.

Run from `repos/orbits`:

```sh
node --import tsx scripts/run-notification-discovery-worker.ts --watch --interval-ms 60000
```

Use the existing live PostgreSQL configuration and an explicit `ORBIT_TYPED_INBOX_ACTORS` allowlist. Each account must enable discovery in Web/App settings; message analysis is an independent, initially disabled setting. Provider configuration uses `ORBIT_DISCOVERY_API_KEY`, `ORBIT_DISCOVERY_PROVIDER`, `ORBIT_DISCOVERY_MODEL`, optional `ORBIT_DISCOVERY_ENDPOINT`, and an audited `ORBIT_DISCOVERY_REQUEST_COST_BOUND_USD`. No missing discovery key falls back to a developer credential. Reuse the existing model transport; tests inject a provider and prohibit external fetches.

The cumulative project cap remains USD 5. Before any real call, reconcile the historical ledger including all unknown increments, then record a conservative historical upper bound and its audit reference via `repository.reconcileBudget`. Never initialize from the old USD 0.012780 alone. The global budget lives in workspace `orbit-project-ai-budget`, collection `notificationDiscoveryBudget`, record `global`, across actors and feature workspaces in this database. Other project workers and databases must be reconciled before enabling paid execution; this is not a new independent allowance.

Each call reserves its audited maximum cost atomically; an unknown result retains the full reservation. `notificationDiscoveryCalls` stores the request ID, job IDs, provider/model/usage metadata where available, and outcome. Actual cost stays null until reconciled, never zero by assumption. The current implementation deliberately does not release reservations from unverified token prices. Unknown historical fees or insufficient budget defer jobs without consuming a model attempt. A missing dedicated provider also defers. A successful worker status or a fake-provider test does not prove a paid provider run.

Operational boundaries:

- 50 source references/page, 4 pages/200 per account round, 2 model requests, 20 packages/request; body allowlist and 2000 characters/source.
- Queue identity is account + source key/version + policy version. Source body is re-read before extraction and publication; queue rows contain references, not private excerpts.
- At the scan tail, the cursor wraps to the activation watermark. This bounded rescan catches records whose transaction committed late with an older updatedAt; existing job identities prevent model replay. It is not a full-contact model loop. Irrelevant contacts are rejected before extraction using existing need criteria.
- Three attempts total, retry after 5 minutes and then 30 minutes; 180-second account/claim leases recover crashed processes without resetting attempts. Permanent/ exhausted failures remain visible. Each account receives a bounded turn.
- The active inbox excludes a future scheduled reminder until its time. Date-only commitments schedule 09:00 in the account timezone, or now if discovered later that day, without fabricating a precise due time.
- Suggestions: three newly inserted records per account-local day, expiry seven days or an earlier factual window. Replay does not renew expiry or reading/disposition. Explicit provenance links join note/task/schedule facts; equal titles alone do not merge unrelated records.
- Disabling discovery cancels queued/running work; re-enabling starts at a new watermark and does not replay the old version. Changing message consent invalidates in-flight authorization and preserves non-message queues. Already published message excerpts are reauthorized at each inbox read/action.
- `/api/inbox/discovery/preferences` exposes actor-owned flags, queue counts and worker health. Product UI shows a readable unavailable state; internal failure codes and credentials are not shown. External email/calendar adapters are unavailable in this release, rather than simulated.

No new push sender is enabled here. Sprint0040 owns delivery quotas, device receipts, old-flow migration and provider-to-device evidence. While provider/budget evidence is unavailable, keep the runtime queue and code tests separate from real AI acceptance.
