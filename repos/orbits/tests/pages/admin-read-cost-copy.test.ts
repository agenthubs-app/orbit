import assert from "node:assert/strict";
import test from "node:test";

import { READ_COST_ADMIN_COPY } from "../../app/(app)/app/admin/read-cost/read-cost-copy";
import { readCostAlertNotification } from "../../features/operations/read-cost/alerts";

/**
 * Sprint 0122 (Codex 99-C): read-cost numbers cover only requests that
 * recorded database reads (sampled); requests without a DB read have no
 * ticket and reads without an account are unattributed. The admin page and the
 * spike alert must say so instead of implying every HTTP request is counted.
 */
test("the read-cost admin page describes recorded database reads, not all HTTP requests", () => {
  const copy = READ_COST_ADMIN_COPY;
  assert.match(copy.subtitle.zh, /记录了数据库读取的请求/);
  assert.match(copy.subtitle.zh, /不读数据库的请求不在内/);
  assert.match(copy.subtitle.en, /recorded database reads/i);
  assert.match(copy.requests.zh, /记录读取的请求/);
  assert.doesNotMatch(copy.requests.zh, /^请求数$/);
  assert.match(copy.requests.en, /recorded reads/i);
  assert.match(copy.accounts.zh, /不含未归属/);
  assert.match(copy.accounts.en, /unattributed/i);
});

test("the average-spike alert speaks of requests with recorded reads", () => {
  const notification = readCostAlertNotification({
    created_at: "2026-09-27T00:00:00Z", alert_id: "alert:1", day: "2026-09-26", notified_at: null,
    observed: 80 * 1024, rule: "route_average_spike", subject: "GET /api/dashboard", threshold: 40 * 1024,
  } as never, "account:admin");
  const text = JSON.stringify(notification);
  assert.match(text, /记录了数据库读取的请求/);
  assert.match(text, /request that recorded database reads/);
});
