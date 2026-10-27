/**
 * R28：从引导第 5 步开始的名片批次记住返回目标，全站胶囊打开它时仍走引导外框；引导完成后忘掉。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { batchReturnTo, forgetBatchReturnTo, rememberBatchReturnTo } from "../../app/(app)/app/contacts/card-batch-return";

function installStorage() {
  const map = new Map<string, string>();
  const storage = {
    get length() { return map.size; },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => map.clear(),
  };
  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { localStorage: storage, dispatchEvent: () => true };
  return () => { (globalThis as { window?: unknown }).window = previous; };
}

test("a batch started from the guide keeps its return target until onboarding finishes", () => {
  const restore = installStorage();
  try {
    rememberBatchReturnTo("batch-1", "/app/profile/onboarding?screen=5");
    rememberBatchReturnTo("batch-2", "/app/start");
    rememberBatchReturnTo("batch-3", null);
    assert.equal(batchReturnTo("batch-1"), "/app/profile/onboarding?screen=5");
    assert.equal(batchReturnTo("batch-2"), "/app/start");
    assert.equal(batchReturnTo("batch-3"), null);
    forgetBatchReturnTo("/app/profile/onboarding?screen=5");
    assert.equal(batchReturnTo("batch-1"), null);
    assert.equal(batchReturnTo("batch-2"), "/app/start");
  } finally {
    restore();
  }
});
