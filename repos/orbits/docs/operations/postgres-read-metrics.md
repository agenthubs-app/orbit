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
