import assert from "node:assert/strict";
import test from "node:test";

import { createReadLedger, readReceiptFromLedger } from "../../shared/observability/read-receipts";
import { readReceiptLogPayload } from "../../shared/observability/read-receipts-sink";
import {
  P0_MEASUREMENT_UNTIL,
  enableRequestTiming,
  installPgConnectTiming,
  noteConnectOnLedger,
  p0MeasurementActive,
} from "../../shared/observability/request-timing";
import { parseWebMetric, webMetricRoute } from "../../shared/observability/web-metrics";

test("P0 window ends by itself", () => {
  assert.equal(p0MeasurementActive(P0_MEASUREMENT_UNTIL - 1), true);
  assert.equal(p0MeasurementActive(P0_MEASUREMENT_UNTIL), false);
});

test("receipts carry timing only while enabled; the log line gets connects, wall time and instance facts", () => {
  enableRequestTiming(false);
  const off = createReadLedger({ source: "app", route: "GET /api/x", sampleRate: 1 });
  assert.equal("timing" in readReceiptFromLedger(off), false);
  assert.equal("connects" in readReceiptLogPayload(readReceiptFromLedger(off)), false);

  enableRequestTiming(true);
  try {
    const ledger = createReadLedger({ source: "app", route: "GET /api/x", sampleRate: 1 });
    noteConnectOnLedger(ledger, 120.4);
    noteConnectOnLedger(ledger, 30);
    const payload = readReceiptLogPayload(readReceiptFromLedger(ledger));
    assert.equal(payload.connects, 2);
    assert.equal(payload.connectMs, 150);
    assert.equal(typeof payload.wallMs, "number");
    assert.equal(typeof payload.instanceAgeMs, "number");
    assert.ok((payload.instanceSeq ?? 0) >= 1);
    const later = createReadLedger({ source: "app", route: "GET /api/y", sampleRate: 1 });
    const laterPayload = readReceiptLogPayload(readReceiptFromLedger(later));
    assert.equal(laterPayload.connects, 0);
    assert.ok((laterPayload.instanceSeq ?? 0) > (payload.instanceSeq ?? 0));
  } finally {
    enableRequestTiming(false);
  }
});

function fakeClientClass(fail = false) {
  class FakeClient {
    calls = 0;
    connect(callback?: (error: unknown) => void): unknown {
      this.calls += 1;
      if (callback) {
        setTimeout(() => callback(fail ? new Error("refused") : null), 5);
        return undefined;
      }
      return new Promise((resolve, reject) => setTimeout(() => (fail ? reject(new Error("refused")) : resolve(undefined)), 5));
    }
  }
  return FakeClient;
}

test("connect timing: callback and promise forms are timed, results and errors pass through unchanged", async () => {
  const lines: string[] = [];
  const FakeClient = fakeClientClass();
  const ledger = createReadLedger({ source: "app", route: "GET /api/x", sampleRate: 1 });
  assert.equal(installPgConnectTiming(FakeClient, () => ledger, (line) => lines.push(line)), true);
  assert.equal(installPgConnectTiming(FakeClient, () => ledger, (line) => lines.push(line)), true, "second install is a no-op");

  enableRequestTiming(true);
  try {
    const client = new FakeClient();
    await new Promise<void>((resolve, reject) => client.connect((error) => (error ? reject(error) : resolve())));
    await client.connect();
    assert.equal(client.calls, 2);
    assert.equal(lines.length, 2);
    const first = JSON.parse(lines[0]!);
    assert.equal(first.event, "db_connect");
    assert.equal(first.attributed, true);
    assert.equal(first.route, "GET /api/x");
    assert.equal(readReceiptLogPayload(readReceiptFromLedger(ledger)).connects, 2);

    const Failing = fakeClientClass(true);
    installPgConnectTiming(Failing, () => {
      throw new Error("no store");
    }, (line) => lines.push(line));
    await assert.rejects(new Failing().connect() as Promise<unknown>, /refused/);
    const failedLine = JSON.parse(lines.at(-1)!);
    assert.equal(failedLine.failed, true);
    assert.equal(failedLine.attributed, false);
  } finally {
    enableRequestTiming(false);
  }

  const before = lines.length;
  await new FakeClient().connect();
  assert.equal(lines.length, before, "disabled: nothing is measured or logged");
});

test("web metric route hides ids and keeps the tab", () => {
  assert.equal(webMetricRoute("/app/tasks/1234567890", "?tab=todo&x=1"), "/app/tasks/[id]?tab=todo");
  assert.equal(webMetricRoute("/app/plan/type/5f0c6a2e-1b2c-4d3e-9f00-112233445566"), "/app/plan/type/[id]");
  assert.equal(webMetricRoute("/app/contacts/contact_9a8b7c6d5e4f3a2b1"), "/app/contacts/[id]");
  assert.equal(webMetricRoute("/app/events/center/profiles"), "/app/events/center/profiles");
});

test("web metric beacon accepts only the known shape", () => {
  assert.deepEqual(parseWebMetric({ kind: "nav", route: "/app/plan", from: "/app/home", urlMs: 13.6, contentMs: 812.2, skeleton: true, extra: "x" }), {
    kind: "nav",
    route: "/app/plan",
    from: "/app/home",
    skeleton: true,
    urlMs: 14,
    contentMs: 812,
  });
  assert.equal(parseWebMetric({ kind: "other", route: "/app" }), null);
  assert.equal(parseWebMetric({ kind: "load", route: "https://evil.example/" }), null);
  assert.equal(parseWebMetric({ kind: "load", route: "/app/a b" }), null);
  assert.deepEqual(parseWebMetric({ kind: "load", route: "/app", lcpMs: -1, ttfbMs: Number.NaN, jsKb: 1e9 }), { kind: "load", route: "/app" });
});
