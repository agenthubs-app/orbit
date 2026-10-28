/**
 * 变更游标客户端（orbit-change-watch.ts）：第一次只记基准；某个区域的 token 变了，只把这个区域的缓存标成
 * 需要重读并通知订阅它的读取方；本页自己写入之后，下一次答案只当新基准（写入已经作废了全部）；没有账号不问。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { FRESH, answerFresh, onAnswersStale, rememberAnswer, resetLastAnswersForTests } from "../../app/(app)/app/orbit-last-answer";
import { resetSharedReadForTests, setSharedReadAccount } from "../../app/(app)/app/orbit-shared-read";

type Tokens = Record<"inbox" | "contacts" | "tasks" | "calendar" | "memo" | "agent", string>;

test("the cursor marks only the areas that moved, notifies their readers, and adopts the answer after an own write", async (t) => {
  resetSharedReadForTests();
  resetLastAnswersForTests();
  let tokens: Tokens = { inbox: "i1", contacts: "c1", tasks: "t1", calendar: "k1", memo: "m1", agent: "a1" };
  let asked = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    assert.equal(String(input), "/api/changes");
    asked += 1;
    return new Response(JSON.stringify({ success: true, data: { tokens } }), { status: 200, headers: { "x-poll-interval": "30" } });
  });
  const listeners = new Map<string, () => void>();
  const fakeWindow = { addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), location: { href: "https://orbit.test/app/home", origin: "https://orbit.test" } };
  (globalThis as { window?: unknown }).window = fakeWindow;
  (globalThis as { document?: unknown }).document = { visibilityState: "visible", addEventListener: (name: string, fn: () => void) => listeners.set(name, fn) };
  t.after(() => { delete (globalThis as { window?: unknown }).window; delete (globalThis as { document?: unknown }).document; });

  const watch = await import("../../app/(app)/app/orbit-change-watch");
  t.after(() => watch.stopChangeWatchForTests());
  watch.installChangeWatch();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(asked, 0, "no account yet: nothing is asked");

  setSharedReadAccount("user-a");
  rememberAnswer("network:summary", 1);
  rememberAnswer("inbox:counts", 2);
  const staleAreas: unknown[] = [];
  const stop = onAnswersStale((areas) => { staleAreas.push(areas); });

  const foreground = async () => { listeners.get("focus")?.(); await new Promise((resolve) => setTimeout(resolve, 0)); await new Promise((resolve) => setTimeout(resolve, 0)); };
  // The focus throttle is 2 s: move the clock past it between asks.
  let now = Date.now();
  t.mock.method(Date, "now", () => now);

  await foreground();
  assert.equal(asked, 1, "the first answer is the baseline");
  assert.deepEqual(staleAreas, []);

  tokens = { ...tokens, inbox: "i2" };
  now += 5_000;
  await foreground();
  assert.deepEqual(staleAreas, [["inbox"]], "only the inbox moved");
  assert.equal(answerFresh("inbox:counts", FRESH.list), false);
  assert.equal(answerFresh("network:summary", FRESH.list), true, "contacts were not touched");

  tokens = { ...tokens, contacts: "c2" };
  watch.adoptNextChanges();
  await new Promise((resolve) => setTimeout(resolve, 0)); await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(staleAreas, [["inbox"]], "after an own write the next answer is only the new baseline");

  tokens = { ...tokens, memo: "m2" };
  now += 5_000;
  await foreground();
  assert.deepEqual(staleAreas, [["inbox"], ["memo"]]);
  stop();
});
