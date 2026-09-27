// Loads Next's request stores with AsyncLocalStorage installed; must stay first.
import { nextRequestScope } from "../support/next-request-scope";

import assert from "node:assert/strict";
import { channel } from "node:diagnostics_channel";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";


import {
  createReadLedger,
  finalizeReadLedger,
  flushUnattributedReadReceipts,
  installReadReceiptSink,
  installRequestReadLedgerResolver,
  noteReadReceiptAccount,
  readReceiptsEnabled,
  readReceiptsSampleRate,
  recordReadReceiptMetric,
  runWithReadReceiptSource,
  type ReadReceipt,
} from "../../shared/observability/read-receipts";
import { installNextReadReceipts, readReceiptSourceFor } from "../../shared/observability/read-receipts-next";
import {
  accountFingerprint,
  axiomConfigFromEnv,
  createReadReceiptSink,
  type AxiomFetch,
} from "../../shared/observability/read-receipts-sink";
import { runMaintenancePass } from "../../features/operations/maintenance/pass";
import { meterPostgresPool } from "../../shared/storage/metered-postgres-pool";
import { createPostgresReadMetricsRunner, type PostgresReadMetric } from "../../shared/storage/postgres-read-metrics";

const ENABLED = { ORBIT_READ_RECEIPTS: "1" } as const;
const ACCOUNT = "account_raw_7f3c9e";
const SQL = "select id, secret_column from orbit_records where record_id = $1";
const PARAM = "record_param_4411";

function metric(rows: number, bytes: number, overrides: Partial<PostgresReadMetric> = {}): PostgresReadMetric {
  return { queryCount: 1, queryKind: "select", returnedRows: rows, approximateSerializedRowBytes: bytes, elapsedMs: 2, failed: false, ...overrides };
}

function captureSink() {
  const receipts: ReadReceipt[] = [];
  installReadReceiptSink((receipt) => {
    receipts.push(receipt);
  });
  return receipts;
}

function reset() {
  installReadReceiptSink(null);
  installRequestReadLedgerResolver(null);
}

function fakePool(rowsFor: (text: string) => unknown[]) {
  const calls: string[] = [];
  const client = {
    async query(text: string) {
      calls.push(`client:${text}`);
      return { rows: rowsFor(text), rowCount: rowsFor(text).length };
    },
    release() {},
  };
  const pool = {
    async query(config: string | { text: string }, values?: unknown, callback?: unknown) {
      const text = typeof config === "string" ? config : config.text;
      calls.push(`pool:${text}`);
      const result = { rows: rowsFor(text), rowCount: rowsFor(text).length };
      if (typeof values === "function") return (values as (e: null, r: unknown) => void)(null, result);
      if (typeof callback === "function") return (callback as (e: null, r: unknown) => void)(null, result);
      return result;
    },
    async connect() {
      return client;
    },
  };
  return { pool, calls };
}

test("receipts are on in the Next Node server, off in tests and scripts, with an explicit kill switch", () => {
  assert.equal(readReceiptsEnabled({}), false);
  assert.equal(readReceiptsEnabled({ NEXT_RUNTIME: "nodejs" }), true);
  assert.equal(readReceiptsEnabled({ NEXT_RUNTIME: "edge" }), false);
  assert.equal(readReceiptsEnabled({ NEXT_RUNTIME: "nodejs", ORBIT_READ_RECEIPTS: "0" }), false);
  assert.equal(readReceiptsEnabled({ ORBIT_READ_RECEIPTS: "1" }), true);
  assert.equal(readReceiptsSampleRate({}), 1);
  assert.equal(readReceiptsSampleRate({ ORBIT_READ_RECEIPTS_SAMPLE_RATE: "0.1" }), 0.1);
  assert.equal(readReceiptsSampleRate({ ORBIT_READ_RECEIPTS_SAMPLE_RATE: "7" }), 1);
  assert.equal(readReceiptsSampleRate({ ORBIT_READ_RECEIPTS_SAMPLE_RATE: "nope" }), 1);
});

test("the shared metrics runner feeds receipts only when receipts are enabled", async () => {
  assert.equal(createPostgresReadMetricsRunner(undefined, {}), undefined, "disabled path stays a direct passthrough");
  const receipts = captureSink();
  try {
    const runner = createPostgresReadMetricsRunner(undefined, ENABLED);
    assert.ok(runner);
    await runWithReadReceiptSource("probe", () => runner(SQL, async () => ({ rows: [{ a: 1 }, { a: 2 }] })));
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]!.source, "task:probe");
    assert.equal(receipts[0]!.queryCount, 1);
    assert.equal(receipts[0]!.rowCount, 2);
    assert.equal(receipts[0]!.byteCount, Buffer.byteLength('{"a":1}') * 2);

    // An explicit observer (e.g. the test read-cost ledger) still sees every metric.
    const seen: PostgresReadMetric[] = [];
    const composed = createPostgresReadMetricsRunner((value) => void seen.push(value), ENABLED);
    await runWithReadReceiptSource("probe", () => composed!(SQL, async () => ({ rows: [{ a: 1 }] })));
    assert.equal(seen.length, 1);
    assert.equal(receipts.length, 2);
  } finally {
    reset();
  }
});

test("reads go to the task ledger first, then the request, and otherwise to unattributed — never dropped", async () => {
  const receipts = captureSink();
  const request = createReadLedger({ route: "GET /api/tasks", source: "app" });
  installRequestReadLedgerResolver(() => request);
  try {
    recordReadReceiptMetric(metric(3, 30));
    noteReadReceiptAccount(ACCOUNT);
    noteReadReceiptAccount("account_second");
    await runWithReadReceiptSource("reminders", async () => {
      recordReadReceiptMetric(metric(5, 50));
    });
    assert.deepEqual(
      receipts.map(({ source, queryCount, rowCount }) => ({ source, queryCount, rowCount })),
      [{ source: "task:reminders", queryCount: 1, rowCount: 5 }],
    );
    await finalizeReadLedger(request, { statusCode: 200, responseBytes: 900 });
    const requestReceipt = receipts[1]!;
    assert.equal(requestReceipt.route, "GET /api/tasks");
    assert.equal(requestReceipt.accountId, ACCOUNT, "first account wins");
    assert.equal(requestReceipt.rowCount, 3);
    assert.equal(requestReceipt.statusCode, 200);
    assert.equal(requestReceipt.responseBytes, 900);

    // A read after the request closed, or with no request at all, is still counted.
    recordReadReceiptMetric(metric(7, 70));
    installRequestReadLedgerResolver(null);
    recordReadReceiptMetric(metric(1, 10, { failed: true }));
    await flushUnattributedReadReceipts();
    const unattributed = receipts[2]!;
    assert.equal(unattributed.source, "unattributed");
    assert.equal(unattributed.route, null);
    assert.equal(unattributed.queryCount, 2);
    assert.equal(unattributed.rowCount, 8);
    assert.equal(unattributed.failedQueryCount, 1);
  } finally {
    reset();
  }
});

test("sampling drops the whole receipt, and a failing sink never fails the unit of work", async () => {
  const receipts = captureSink();
  try {
    const skipped = createReadLedger({ source: "web", sampleRate: 0.25, random: () => 0.9 });
    const kept = createReadLedger({ source: "web", sampleRate: 0.25, random: () => 0.1 });
    for (const ledger of [skipped, kept]) {
      ledger.queryCount = 1;
      await finalizeReadLedger(ledger);
    }
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]!.sampleRate, 0.25);

    installReadReceiptSink(() => {
      throw new Error("sink down");
    });
    const result = await runWithReadReceiptSource("resilient", async () => {
      recordReadReceiptMetric(metric(1, 1));
      return "done";
    });
    assert.equal(result, "done");
  } finally {
    reset();
  }
});

test("metered pools measure pool and client reads, keep pg results intact and pass callbacks through", async () => {
  const seen: PostgresReadMetric[] = [];
  const { pool, calls } = fakePool((text) => (text.startsWith("select") ? [{ id: 1 }, { id: 2 }] : []));
  const metered = meterPostgresPool(pool as never, (value) => void seen.push(value), {});
  const result = await (metered as unknown as typeof pool).query(SQL, [PARAM]);
  assert.deepEqual(result, { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 }, "the caller receives the untouched pg result");
  await (metered as unknown as typeof pool).query({ text: "select 1" });
  const client = await (metered as unknown as typeof pool).connect();
  await client.query("select from client");
  await client.query("insert into x values (1)");
  const again = await (metered as unknown as typeof pool).connect();
  assert.equal(again, client);
  await again.query("select once");
  await new Promise<void>((resolve) => {
    void (metered as unknown as typeof pool).query("select callback", (_error: unknown, _result: unknown) => resolve());
  });
  assert.equal(seen.length, 4, "pool select, pool config select, client select, reused client select; empty insert and callback form excluded");
  assert.deepEqual(seen.map((item) => item.returnedRows), [2, 2, 2, 2]);
  assert.ok(calls.includes("pool:select callback"));
  assert.equal(meterPostgresPool(pool as never, undefined, {}), pool, "metrics disabled: pool returned unchanged");
});

test("the Next adapter tags reads with the route template, method, source and account, and writes one receipt after the response", async () => {
  const receipts = captureSink();
  try {
    assert.equal(installNextReadReceipts({ sink: (receipt) => void receipts.push(receipt), env: ENABLED }), true);
    const next = nextRequestScope("/api/tasks/[id]", {
      "x-orbit-request-method": "GET",
      "user-agent": "Orbit/12 CFNetwork/1568 Darwin/24.0.0",
    });
    const runner = createPostgresReadMetricsRunner(undefined, ENABLED)!;
    await next.run(async () => {
      await runner(SQL, async () => ({ rows: [{ id: 1 }] }));
      noteReadReceiptAccount(ACCOUNT);
      await runner(SQL, async () => ({ rows: [{ id: 2 }, { id: 3 }] }));
    });
    assert.equal(next.afterTasks.length, 1, "after() is registered once per request");
    assert.equal(receipts.length, 0, "nothing is written before the response is sent");
    await next.runAfter();
    assert.equal(receipts.length, 1);
    assert.deepEqual(
      { ...receipts[0]!, occurredAt: "t", dbMs: 0 },
      {
        occurredAt: "t", route: "GET /api/tasks/[id]", source: "app", accountId: ACCOUNT,
        queryCount: 2, rowCount: 3, byteCount: Buffer.byteLength('{"id":1}') * 3, dbMs: 0,
        failedQueryCount: 0, responseBytes: null, statusCode: null, sampleRate: 1,
      },
    );
    assert.equal(readReceiptSourceFor("/api/queues/maintenance", null), "queue");
    assert.equal(readReceiptSourceFor("/api/internal/maintenance", "vercel-cron/1.0"), "cron");
    assert.equal(readReceiptSourceFor("/app/contacts", "Mozilla/5.0 (Macintosh)"), "web");
    assert.equal(readReceiptSourceFor("/api/tasks", "okhttp/4.12.0"), "app");
  } finally {
    reset();
  }
});

test("proxy session reads join the route's receipt; a request the proxy answers alone gets its own receipt", async () => {
  const receipts = captureSink();
  try {
    installNextReadReceipts({ sink: (receipt) => void receipts.push(receipt), env: ENABLED });
    const runner = createPostgresReadMetricsRunner(undefined, ENABLED)!;
    // Node publishes these for every HTTP request; the adapter tags the request on arrival.
    const arrive = () => {
      const request = { method: "GET", headers: { "user-agent": "okhttp/4" } as Record<string, string>, socket: { bytesWritten: 0 } };
      channel("http.server.request.start").publish({ request });
      return request;
    };
    const finish = (request: ReturnType<typeof arrive>, statusCode: number) => {
      request.socket.bytesWritten = 321;
      channel("http.server.response.finish").publish({ request, response: { statusCode, getHeader: () => undefined } });
    };

    const served = arrive();
    const proxy = nextRequestScope("/", served.headers, "/");
    await proxy.run(() => runner(SQL, async () => ({ rows: [{ session: 1 }] })));
    const proxyAfter = proxy.runAfter();
    const route = nextRequestScope("/api/contacts/[id]", served.headers);
    await route.run(() => runner(SQL, async () => ({ rows: [{ id: 1 }, { id: 2 }] })));
    const routeAfter = route.runAfter();
    finish(served, 200);
    await Promise.all([proxyAfter, routeAfter]);
    assert.equal(receipts.length, 1, "one receipt for the whole HTTP request");
    assert.equal(receipts[0]!.route, "GET /api/contacts/[id]");
    assert.equal(receipts[0]!.queryCount, 2, "the proxy's session read is included");
    assert.equal(receipts[0]!.rowCount, 3);
    assert.equal(receipts[0]!.statusCode, 200);
    assert.equal(receipts[0]!.responseBytes, 321);

    const rejected = arrive();
    const alone = nextRequestScope("/", rejected.headers, "/");
    await alone.run(() => runner(SQL, async () => ({ rows: [{ session: 1 }] })));
    const aloneAfter = alone.runAfter();
    finish(rejected, 401);
    await aloneAfter;
    assert.equal(receipts.length, 2);
    assert.equal(receipts[1]!.route, "GET (proxy)");
    assert.equal(receipts[1]!.queryCount, 1);
    assert.equal(receipts[1]!.statusCode, 401);
  } finally {
    reset();
  }
});

test("status code and response bytes come from Node's http diagnostics; a failing receipt write leaves the response unchanged", async () => {
  const warnings: string[] = [];
  const logs: string[] = [];
  const sink = createReadReceiptSink({
    write: async () => {
      throw Object.assign(new Error(`connect ECONNREFUSED ${PARAM}`), { code: "ECONNREFUSED" });
    },
    log: (line) => void logs.push(line),
    warn: (line) => void warnings.push(line),
  });
  const receipts: ReadReceipt[] = [];
  installNextReadReceipts({
    sink: async (receipt) => {
      receipts.push(receipt);
      await sink(receipt);
    },
    env: ENABLED,
  });
  const runner = createPostgresReadMetricsRunner(undefined, ENABLED)!;
  const afterRuns: Array<() => Promise<void>> = [];
  const body = JSON.stringify({ success: true, data: { id: "task_1" } });
  const server = createServer((req, res) => {
    const next = nextRequestScope("/api/tasks/[id]", Object.fromEntries(
      Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value ?? ""]),
    ));
    void next.run(async () => {
      await runner(SQL, async () => ({ rows: [{ id: "task_1" }] }));
      res.writeHead(201, { "content-type": "application/json" });
      res.end(body);
    });
    afterRuns.push(() => next.runAfter());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path: "/api/tasks/task_1", method: "GET" }, (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.deepEqual(response, { status: 201, text: body }, "the client sees exactly the handler's response");
    for (const run of afterRuns) await run();
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]!.route, "GET /api/tasks/[id]", "method comes from the diagnostics tag when proxy headers are absent");
    assert.equal(receipts[0]!.statusCode, 201);
    assert.ok((receipts[0]!.responseBytes ?? 0) > Buffer.byteLength(body), "response bytes include headers and body");
    assert.equal(warnings.length, 1);
    assert.deepEqual(JSON.parse(warnings[0]!), { event: "read_receipt_write_failed", error: "ECONNREFUSED" });
    assert.equal(logs.length, 1, "the log line is still written when the database row fails");
  } finally {
    server.closeAllConnections();
    server.close();
    reset();
  }
});

test("log and Axiom payloads carry only an account fingerprint and no SQL, parameters or token", async () => {
  const logs: string[] = [];
  const warnings: string[] = [];
  const posts: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const token = "xaat-test-token-not-real";
  const fetchStub: AxiomFetch = async (url, init) => {
    posts.push({ url, headers: init.headers, body: init.body });
    return posts.length === 1 ? { ok: true, status: 200 } : { ok: false, status: 503 };
  };
  const sink = createReadReceiptSink({
    write: async () => {},
    axiom: { token, dataset: "orbit-reads", fetch: fetchStub },
    log: (line) => void logs.push(line),
    warn: (line) => void warnings.push(line),
  });
  const receipt: ReadReceipt = {
    occurredAt: "2026-09-27T00:00:00.000Z", route: "GET /api/contacts/[id]", source: "app", accountId: ACCOUNT,
    queryCount: 2, rowCount: 3, byteCount: 400, dbMs: 4.5, failedQueryCount: 0, responseBytes: 120, statusCode: 200, sampleRate: 1,
  };
  await sink(receipt);
  await sink({ ...receipt, route: "POST /api/tasks" });

  assert.equal(posts.length, 2);
  assert.equal(posts[0]!.url, "https://api.axiom.co/v1/datasets/orbit-reads/ingest");
  assert.equal(posts[0]!.headers.authorization, `Bearer ${token}`);
  const shipped = JSON.parse(posts[0]!.body) as Array<Record<string, unknown>>;
  assert.equal(shipped.length, 1);
  assert.equal(shipped[0]!.account, accountFingerprint(ACCOUNT));
  assert.match(String(shipped[0]!.account), /^[0-9a-f]{16}$/);
  for (const text of [...logs, ...posts.map((post) => post.body), ...warnings]) {
    assert.ok(!text.includes(ACCOUNT), "raw account id leaked");
    assert.ok(!text.includes("select") && !text.includes(PARAM), "SQL or parameter leaked");
    assert.ok(!text.includes(token), "Axiom token leaked");
  }
  assert.deepEqual(JSON.parse(warnings[0]!), { event: "read_receipt_axiom_failed", status: 503, receipts: 1 });
});

test("without both Axiom variables nothing is sent anywhere", async () => {
  assert.equal(axiomConfigFromEnv({}), null);
  assert.equal(axiomConfigFromEnv({ AXIOM_TOKEN: "t" }), null);
  assert.equal(axiomConfigFromEnv({ AXIOM_DATASET: "d" }), null);
  assert.deepEqual(axiomConfigFromEnv({ AXIOM_TOKEN: " t ", AXIOM_DATASET: "d" }), { token: "t", dataset: "d" });
  const originalFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async () => {
    fetched += 1;
    throw new Error("no network in tests");
  }) as typeof fetch;
  try {
    const sink = createReadReceiptSink({ write: async () => {}, axiom: axiomConfigFromEnv({}), log: () => {} });
    await sink({
      occurredAt: "2026-09-27T00:00:00.000Z", route: null, source: "unattributed", accountId: null,
      queryCount: 1, rowCount: 1, byteCount: 1, dbMs: 1, failedQueryCount: 0, responseBytes: null, statusCode: null, sampleRate: 1,
    });
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("0121 the configured sample rate also governs background tasks (real maintenance entry) and the unattributed ledger", async () => {
  const receipts: ReadReceipt[] = [];
  const runner = createPostgresReadMetricsRunner(undefined, ENABLED)!;
  // One maintenance task that performs one metered read, run through the real pass entry.
  const readingTask = { name: "probe", run: async () => { await runner(SQL, async () => ({ rows: [{ id: 1 }] })); return { read: 1 }; } };
  const runPass = () => runMaintenancePass({ tasks: [readingTask], log: () => {} });
  try {
    installNextReadReceipts({ sink: (receipt) => void receipts.push(receipt), env: { ...ENABLED, ORBIT_READ_RECEIPTS_SAMPLE_RATE: "0" } });
    const result = await runPass();
    assert.equal(result.ok, 1, "the task itself still runs");
    recordReadReceiptMetric(metric(2, 20));
    await flushUnattributedReadReceipts();
    assert.equal(receipts.length, 0, "sample rate 0: neither the task nor unattributed reads write a receipt");

    installNextReadReceipts({ sink: (receipt) => void receipts.push(receipt), env: { ...ENABLED, ORBIT_READ_RECEIPTS_SAMPLE_RATE: "0.5" } });
    const runs = 400;
    for (let i = 0; i < runs; i++) await runPass();
    const taskReceipts = receipts.filter((receipt) => receipt.source === "task:maintenance:probe");
    assert.ok(taskReceipts.length > runs * 0.3 && taskReceipts.length < runs * 0.7, `about half sampled (${taskReceipts.length}/${runs})`);
    assert.ok(taskReceipts.every((receipt) => receipt.sampleRate === 0.5), "the receipt carries the rate the rollup scales by");
    for (let i = 0; i < 200; i++) {
      recordReadReceiptMetric(metric(1, 1));
      await flushUnattributedReadReceipts();
    }
    const unattributed = receipts.filter((receipt) => receipt.source === "unattributed");
    assert.ok(unattributed.length > 60 && unattributed.length < 140, `about half of unattributed flushes sampled (${unattributed.length}/200)`);
    assert.ok(unattributed.every((receipt) => receipt.sampleRate === 0.5));

    // Default (no sample rate configured) keeps every task receipt.
    receipts.length = 0;
    installNextReadReceipts({ sink: (receipt) => void receipts.push(receipt), env: ENABLED });
    await runPass();
    assert.deepEqual(receipts.map((receipt) => [receipt.source, receipt.sampleRate]), [["task:maintenance:probe", 1]]);
  } finally {
    reset();
  }
});
