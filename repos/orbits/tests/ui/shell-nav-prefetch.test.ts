// 2026-11-23 加载慢 ④：壳的一级页预取等页面 load 且网络安静之后再发，不和首屏数据请求抢。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

import { whenNetworkQuiet } from "../../app/(app)/app/orbit-2026/shell/nav-prefetch";

type Listener = () => void;
function fakeWindow(readyState: string) {
  const listeners: Listener[] = [];
  return {
    win: { document: { readyState }, addEventListener: (_: string, fn: Listener) => listeners.push(fn), removeEventListener: () => undefined } as unknown as Window,
    load: () => listeners.splice(0).forEach((fn) => fn()),
  };
}

test("waits for load, then for a quiet window; each finished request restarts the quiet window; capped", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const observers: Array<() => void> = [];
  const previous = globalThis.PerformanceObserver;
  globalThis.PerformanceObserver = class { constructor(private fn: () => void) { observers.push(() => this.fn()); } observe() {} disconnect() {} } as unknown as typeof PerformanceObserver;
  try {
    const { win, load } = fakeWindow("loading");
    let done = false;
    void whenNetworkQuiet(win, 800, 8000).promise.then(() => { done = true; });
    mock.timers.tick(5000);
    await Promise.resolve();
    assert.equal(done, false, "nothing before load");
    load();
    mock.timers.tick(700);
    observers[0]!(); // a data request finished
    mock.timers.tick(700);
    await Promise.resolve();
    assert.equal(done, false, "the quiet window restarted");
    mock.timers.tick(100);
    await Promise.resolve();
    assert.equal(done, true, "800 ms with nothing finishing");

    const busy = fakeWindow("complete");
    let capped = false;
    void whenNetworkQuiet(busy.win, 800, 8000).promise.then(() => { capped = true; });
    for (let at = 0; at < 7500; at += 500) { // 15 × 500 = 7500 ms, never 800 ms quiet
      observers.at(-1)!(); mock.timers.tick(500); }
    await Promise.resolve();
    assert.equal(capped, false);
    mock.timers.tick(500);
    await Promise.resolve();
    assert.equal(capped, true, "never waits longer than the cap");
  } finally { globalThis.PerformanceObserver = previous; mock.timers.reset(); }
});

test("the shell's links do not prefetch on mount; the main pages are prefetched by the deferred hook", () => {
  const shell = readFileSync("app/(app)/app/orbit-2026/shell/Orbit2026Shell.tsx", "utf8");
  assert.doesNotMatch(shell, /<Link\b/u, "every shell link goes through ShellLink (prefetch={false} + intent prefetch)");
  assert.doesNotMatch(shell, /\bprefetch\s*(=|className)/u);
  assert.match(shell, /useDeferredShellPrefetch\(SHELL_NAV_HREFS\)/u);
  const link = readFileSync("app/(app)/app/orbit-2026/shell/nav-prefetch.tsx", "utf8");
  assert.match(link, /prefetch=\{false\}/u);
  assert.match(link, /onPointerEnter=.*prefetchFull/u);
  assert.match(link, /onTouchStart=.*prefetchFull/u);
});
