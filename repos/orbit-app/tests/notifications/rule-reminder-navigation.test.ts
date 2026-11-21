import assert from "node:assert/strict";
import test from "node:test";

import { notificationDeliveryPath } from "../../src/api/endpoints";
import { agentScheduledTaskRunSchema } from "../../src/api/schema/agent-v1";
import { authorizedDeliveryHref } from "../../src/notifications/delivery-navigation";

/**
 * agent-design AG16-2 (视觉稿 16-5「点开去哪」): a scheduled task's reminder carries one opaque id. Tapping it asks the
 * server what that id points at — under the phone's own sign-in — and goes to that period's inbox entry. The App's
 * existing delivery navigation takes the server's answer as it is; nothing on the reminder itself decides where a tap
 * goes.
 */
const deliveryId = "rule-push:0123456789abcdef0123456789abcdef";
const answer = (target: Record<string, unknown>) => ({ body: "有新结果，请到 Orbit 查看。", data: { deliveryId }, deliveryId, status: "delivered", target: { deliveryId, kind: "inbox", ...target }, title: "Orbit" });

test("a reminder's tap goes to the inbox entry the server names, and nowhere the reminder could name itself", () => {
  assert.equal(notificationDeliveryPath(deliveryId), `/api/notifications/deliveries/${encodeURIComponent(deliveryId)}`);
  assert.equal(authorizedDeliveryHref(answer({ href: "/inbox/notifications/inbox%3Aabc", status: "available" }), deliveryId), "/inbox/notifications/inbox%3Aabc");
  // The entry is gone (the task was deleted, the entry dismissed): no navigation.
  assert.equal(authorizedDeliveryHref(answer({ status: "unavailable" }), deliveryId), null);
  // An answer for another id, or an address outside the inbox, is refused.
  assert.equal(authorizedDeliveryHref(answer({ href: "/inbox/notifications/inbox%3Aabc", status: "available" }), "rule-push:ffffffffffffffffffffffffffffffff"), null);
  for (const href of ["https://evil.invalid", "/settings", "/inbox/notifications/../../settings", "/inbox/notifications/a?actorId=b"]) {
    assert.equal(authorizedDeliveryHref(answer({ href, status: "available" }), deliveryId), null, href);
  }
});

test("the task history the App will show keeps the result's time and the reminder apart, and reads the reminder's own line", () => {
  const run = {
    computeAttempts: 1, computedAt: "2026-11-20T00:10:00.000Z", delivery: { attempts: 1, deliveredAt: "2026-11-20T00:10:00.000Z", state: "delivered" }, items: [], line: "已放进收件箱（3条）", outcome: "delivered",
    push: { attempts: 2, deliveredAt: "2026-11-20T00:20:00.000Z", line: "第一次没送出去，后来补送到了。没有重新算。", state: "delivered", targets: [{ deviceId: "d1", platform: "ios", state: "delivered" }] },
    runId: "autorun:0123456789abcdef0123456789abcdef", scheduledAt: "2026-11-20T00:00:00.000Z", skipped: 0, skippedDays: [], taskId: "rule:1", text: "",
  };
  assert.equal(agentScheduledTaskRunSchema.safeParse(run).success, true);
  for (const push of [
    { attempts: 0, line: "没有提醒：当时是免打扰时段。结果在收件箱里。", reason: "quiet_hours", state: "skipped", targets: [] },
    { attempts: 1, line: "提醒没送到：手机的通知被关了。结果在收件箱里。", reason: "permission_revoked", state: "failed", targets: [{ deviceId: "d1", platform: "ios", state: "revoked" }] },
    { attempts: 0, line: "当时没开提醒", state: "not_requested", targets: [] },
    { attempts: 0, line: null, state: "not_requested" },
    // A server from before AG16 sends only these three fields.
    { attempts: 0, state: "pending" },
  ]) assert.equal(agentScheduledTaskRunSchema.safeParse({ ...run, push }).success, true, JSON.stringify(push));
  assert.equal(agentScheduledTaskRunSchema.safeParse({ ...run, push: { attempts: 0, state: "sent" } }).success, false);
});
