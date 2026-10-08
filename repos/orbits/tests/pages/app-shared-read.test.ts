/**
 * W0021 SC-W0021-03：浏览器端读取的 in-flight 共享（`orbit-shared-read.ts`）。
 * 并发只发一次、一个调用方 abort 不影响其他、StrictMode 式卸载重挂不重发、失败不缓存、
 * 写后失效不交出旧值、换账号清掉进行中的读取且 key 含账号。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  invalidateSharedRead,
  resetSharedReadForTests,
  setSharedReadAccount,
  sharedRead,
} from "../../app/(app)/app/orbit-shared-read";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("concurrent reads of the same resource share one request", async () => {
  resetSharedReadForTests();
  setSharedReadAccount("user:a");
  let loads = 0;
  const gate = deferred<string>();
  const load = async () => {
    loads += 1;
    return gate.promise;
  };
  const a = sharedRead("r", load);
  const b = sharedRead("r", load);
  gate.resolve("value");
  assert.deepEqual(await Promise.all([a, b]), ["value", "value"]);
  assert.equal(loads, 1);
  // 结束后不缓存：下一次读取是新请求。
  await sharedRead("r", async () => {
    loads += 1;
    return "again";
  });
  assert.equal(loads, 2);
});

test("one consumer aborting does not cancel the others; the last one leaving aborts the request", async () => {
  resetSharedReadForTests();
  setSharedReadAccount("user:a");
  const gate = deferred<string>();
  let underlying: AbortSignal | null = null;
  const load = (signal: AbortSignal) => {
    underlying = signal;
    return gate.promise;
  };
  const first = new AbortController();
  const a = sharedRead("r", load, first.signal);
  const b = sharedRead("r", load);
  first.abort();
  await assert.rejects(a, { name: "AbortError" });
  await tick();
  assert.equal(underlying!.aborted, false, "the other consumer still needs the response");
  gate.resolve("value");
  assert.equal(await b, "value");

  const gate2 = deferred<string>();
  let underlying2: AbortSignal | null = null;
  const only = new AbortController();
  const c = sharedRead("r2", (signal) => {
    underlying2 = signal;
    return gate2.promise;
  }, only.signal);
  only.abort();
  await assert.rejects(c, { name: "AbortError" });
  await tick();
  assert.equal(underlying2!.aborted, true);
});

test("a StrictMode-style unmount and immediate remount joins the same request", async () => {
  resetSharedReadForTests();
  setSharedReadAccount("user:a");
  let loads = 0;
  const gate = deferred<string>();
  const load = async () => {
    loads += 1;
    return gate.promise;
  };
  const firstEffect = new AbortController();
  const first = sharedRead("r", load, firstEffect.signal);
  firstEffect.abort(); // cleanup
  const second = sharedRead("r", load); // effect runs again in the same task
  await assert.rejects(first, { name: "AbortError" });
  gate.resolve("value");
  assert.equal(await second, "value");
  assert.equal(loads, 1);
});

test("failures are not cached", async () => {
  resetSharedReadForTests();
  setSharedReadAccount("user:a");
  let loads = 0;
  await assert.rejects(sharedRead("r", async () => {
    loads += 1;
    throw new Error("503");
  }));
  assert.equal(await sharedRead("r", async () => {
    loads += 1;
    return "ok";
  }), "ok");
  assert.equal(loads, 2);
});

test("a write during an in-flight read never hands out the pre-write value", async () => {
  resetSharedReadForTests();
  setSharedReadAccount("user:a");
  const answers = [deferred<string>(), deferred<string>()];
  let loads = 0;
  const load = () => answers[loads++]!.promise;
  const before = sharedRead("plans/current", load);
  invalidateSharedRead("plans/current"); // 写成功了
  const after = sharedRead("plans/current", load); // 写之后的读取接上同一个请求
  answers[0]!.resolve("old");
  await tick();
  answers[1]!.resolve("new");
  assert.equal(await before, "new");
  assert.equal(await after, "new");
  assert.equal(loads, 2, "exactly one extra read after the write");
});

test("switching account aborts in-flight reads and keys reads by account", async () => {
  resetSharedReadForTests();
  setSharedReadAccount("user:a");
  let seen: AbortSignal | null = null;
  const pendingA = sharedRead("plans/current", (signal) => {
    seen = signal;
    return new Promise<string>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  });
  setSharedReadAccount(null); // 登出
  assert.equal(seen!.aborted, true);
  await assert.rejects(pendingA);
  setSharedReadAccount("user:b");
  let loads = 0;
  const gate = deferred<string>();
  const b = sharedRead("plans/current", async () => {
    loads += 1;
    return gate.promise;
  });
  gate.resolve("b's plan");
  assert.equal(await b, "b's plan");
  assert.equal(loads, 1, "B never joins A's request");
});
