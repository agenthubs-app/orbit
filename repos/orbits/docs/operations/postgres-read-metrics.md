# Postgres read metrics

The shared Postgres adapters expose opt-in, privacy-safe read metrics through
`createPgLiveRecordSqlClient` and `createTransactionalPostgresClient`. The
default is disabled.

To emit one safe JSON log line per read query, set:

```text
ORBIT_PG_READ_METRICS=1
```

For application-owned aggregation, pass an observer instead:

```ts
const client = createPgLiveRecordSqlClient({
  connectionString,
  readMetrics: {
    observer: (metric) => readMetricsSink.add(metric),
  },
});
```

Each callback receives only:

- `queryCount`: always `1` for the completed query event;
- `queryKind`: `select`, `with`, `show`, `values`, `explain`, or `table`;
- `returnedRows`: the number of rows returned by `pg`;
- `approximateSerializedRowBytes`: the sum of UTF-8 `JSON.stringify(row)` byte
  lengths after driver decoding;
- `elapsedMs`: time around the underlying pool/connection query promise; and
- `failed`: whether the query rejected.

The byte value is an application-side estimate of decoded row serialization. It
is not Neon billed wire bytes and excludes protocol framing, server-side work,
compression, pool bookkeeping, and any other transport or billing overhead.
It also excludes JSON array separators because it sums rows individually.
`WITH` is classified as read-shaped by a leading-keyword heuristic; its CTE body
is not parsed, so this is not a pure-read guarantee. A `WITH` statement that
contains a write CTE is counted and must be interpreted as a mixed query.

Transaction control statements and mutation-shaped SQL are not measured. A
failed read emits zero rows and zero bytes, then rethrows the original database
error. Observer, timing, and serialization errors are swallowed. No SQL text,
parameters, row contents, connection strings, or actor identifiers are included
in metrics or the opt-in log line. Observers may return `Promise<void>`; that
promise is not awaited, and its rejection is consumed. Enabling the feature adds
no database queries; when disabled, the runner returns the underlying query
promise without timing, SQL inspection, row serialization, or logging.

## Request read receipts (monitoring O1)

Every metered read is also added to a per-unit ledger that ends as one row in
`orbit_read_receipts` (see `shared/observability/read-receipts.ts`):

- **Request**: inside the Next.js Node server the first read of a request
  creates the ledger and registers one `after()` callback; the receipt is
  written after the response is sent. Route is Next's template with the HTTP
  method (`GET /api/contacts/[id]`), source is `app`, `web`, `cron`, `queue`
  or `other` (from the route and User-Agent), account comes from
  `resolveAuthenticatedApiActorFromSession`. Status code and response bytes
  come from Node's `http.server.*` diagnostics channels and stay null where
  those do not fire. Requests that read nothing produce no receipt.
- **Background task**: `runWithReadReceiptSource(name, fn)` records the reads
  as `task:<name>` (maintenance tasks use `task:maintenance:<task>`).
- **Anything else** goes to an `unattributed` ledger flushed every 60 s or
  1000 queries, so unowned reads remain visible.

All pools are metered: the two shared clients through
`createPostgresReadMetricsRunner`, feature-owned pools through
`meterPostgresPool(new Pool(...))`. `tests/audits/postgres-pool-metering.test.ts`
fails on any runtime pool constructed without it.

Each receipt is also logged as one `{"event":"read_receipt",...}` JSON line
with the account replaced by a 16-hex fingerprint. When both `AXIOM_TOKEN` and
`AXIOM_DATASET` are set, the same payload is POSTed in batches to Axiom's
ingest API; with either missing nothing is sent. Database, log and Axiom
failures only produce a `read_receipt_*_failed` warning and never change the
response.

| Variable | Default | Effect |
| --- | --- | --- |
| `ORBIT_READ_RECEIPTS` | on under `NEXT_RUNTIME=nodejs`, off elsewhere | `0` disables, `1` forces on (e.g. a worker) |
| `ORBIT_READ_RECEIPTS_SAMPLE_RATE` | `1` | fraction of requests that write a receipt; stored per row as `sample_rate` |
| `AXIOM_TOKEN`, `AXIOM_DATASET` | unset | both required to ship receipts to Axiom |

The table is created by `runOrbitRecordsMigration` (`npm run db:migrate:live`
or `scripts/migrate-web-runtime.ts`). Retention (14 days) and daily rollups are
O2 work; nothing deletes receipts yet.
