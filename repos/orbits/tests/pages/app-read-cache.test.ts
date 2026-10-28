/**
 * 浏览器端读取缓存的统一规则（orbit-last-answer.ts + orbit-write-watch.ts）：
 * 按账号记、换账号即清；新鲜期内挂载不重读；任何一次成功的同源 /api 写入把全部结果标成需要重读；
 * 读请求、认证请求、失败的写入不作废；登出清空。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  FRESH,
  answerFresh,
  clearAnswers,
  lastAnswer,
  markAllAnswersStale,
  onAnswersStale,
  rememberAnswer,
  resetLastAnswersForTests,
} from "../../app/(app)/app/orbit-last-answer";
import { resetSharedReadForTests, setSharedReadAccount } from "../../app/(app)/app/orbit-shared-read";

test.beforeEach(() => { resetSharedReadForTests(); resetLastAnswersForTests(); });

test("answers are kept per account: none without an account, and another account clears the last one's", () => {
  rememberAnswer("network:summary", { total: 3 });
  assert.equal(lastAnswer("network:summary"), undefined, "no account → nothing is remembered");

  setSharedReadAccount("user-a");
  rememberAnswer("network:summary", { total: 3 });
  assert.deepEqual(lastAnswer("network:summary"), { total: 3 });

  setSharedReadAccount("user-b");
  assert.equal(lastAnswer("network:summary"), undefined, "B never sees A's answer");
  setSharedReadAccount("user-a");
  assert.equal(lastAnswer("network:summary"), undefined, "and A's answers were cleared, not just hidden");
});

test("an answer is fresh for its window, and a write anywhere makes every answer stale (still shown)", () => {
  setSharedReadAccount("user-a");
  rememberAnswer("events:overview", ["e1"]);
  rememberAnswer("todo:page:2026-10-28:Asia/Tokyo", { items: [] });
  assert.equal(answerFresh("events:overview", FRESH.list), true);
  assert.equal(answerFresh("events:overview", 0), false, "older than the window → read again");
  assert.equal(answerFresh("missing", FRESH.list), false);

  let notified = 0;
  const stop = onAnswersStale(() => { notified += 1; });
  markAllAnswersStale();
  stop();
  assert.equal(notified, 1);
  assert.equal(answerFresh("events:overview", FRESH.list), false);
  assert.equal(answerFresh("todo:page:2026-10-28:Asia/Tokyo", FRESH.list), false);
  assert.deepEqual(lastAnswer("events:overview"), ["e1"], "a stale answer is still drawn while it is read again");

  rememberAnswer("events:overview", ["e2"]);
  assert.equal(answerFresh("events:overview", FRESH.list), true, "a new answer is fresh again");
});

test("sign-out clears every answer", () => {
  setSharedReadAccount("user-a");
  rememberAnswer("inbox:counts", { threads: 2, alerts: 0 });
  clearAnswers();
  assert.equal(lastAnswer("inbox:counts"), undefined);
});

test("only a successful same-origin /api write (not a read, not sign-in or sign-out, not a failure) marks the cache stale", async () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const calls: string[] = [];
  const fakeWindow = {
    location: { href: "https://orbitailink.com/app/home", origin: "https://orbitailink.com" },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      return new Response("{}", { status: String(input).includes("fail") ? 500 : 200 });
    },
  };
  (globalThis as { window?: unknown }).window = fakeWindow;
  try {
    const { installWriteWatch } = await import("../../app/(app)/app/orbit-write-watch");
    installWriteWatch();
    setSharedReadAccount("user-a");
    const fresh = () => { rememberAnswer("k", 1); return () => answerFresh("k", FRESH.list); };

    let isFresh = fresh();
    await fakeWindow.fetch("/api/contacts/summary");
    assert.equal(isFresh(), true, "a GET is a read");
    await fakeWindow.fetch("/api/auth/signout", { method: "POST" });
    assert.equal(isFresh(), true, "sign-in / sign-out are not data writes");
    await fakeWindow.fetch("https://elsewhere.example/api/x", { method: "POST" });
    assert.equal(isFresh(), true, "another origin is not ours");
    await fakeWindow.fetch("/api/tasks/fail", { method: "PATCH" });
    assert.equal(isFresh(), true, "a failed write changed nothing");
    await fakeWindow.fetch("/api/tasks/t1", { method: "PATCH", body: "{}" });
    assert.equal(isFresh(), false, "a successful write: read again");

    isFresh = fresh();
    await fakeWindow.fetch(new Request("https://orbitailink.com/api/notes", { method: "POST", body: "{}" }));
    assert.equal(isFresh(), false, "a Request object counts too");
    assert.equal(calls.length, 6, "every call still went through, unchanged");
  } finally {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});
