import assert from "node:assert/strict";
import test from "node:test";
import { StrictMode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PersonalScheduleWorkspace } from "../../app/(app)/app/tasks/personal-schedule-workspace";

test("personal schedule renders through its HTTP client and aborts requests on unmount", async (t) => {
  const signals: AbortSignal[] = [];
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    await Promise.resolve();
    init?.signal?.throwIfAborted();
    return Response.json({ success: true, data: { scheduleItems: [{
      id: "personal:one", sourceId: "personal:one", accountId: "owner", ownerUserId: "owner",
      kind: "personal", category: "personal", state: "upcoming", title: "个人安排",
      startsAt: "2026-09-17T00:00:00Z", createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z",
    }] } });
  });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<StrictMode><PersonalScheduleWorkspace actorId="owner" /></StrictMode>); });
  t.after(() => { act(() => root.unmount()); });
  assert.match(JSON.stringify(root.toJSON()), /个人安排/);
  assert.equal(root.root.findAllByProps({ role: "alert" }).length, 0);
  assert.ok(signals.some(signal => !signal.aborted));
  act(() => root.unmount());
  assert.ok(signals.every(signal => signal.aborted));
});
