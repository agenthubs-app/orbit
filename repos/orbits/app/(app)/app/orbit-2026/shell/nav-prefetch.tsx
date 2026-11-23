"use client";

// 2026-11-23 加载慢 ④：壳的导航不再在挂载时预取（之前一挂载就发 12 个 RSC 请求，和页面首屏的数据请求抢）。
// - 后台预取：页面 load 之后、网络安静（连续 QUIET_MS 没有新请求完成，最多等 MAX_WAIT_MS）再空闲时整页预取一级页，
//   10-28 定的「切页立即显示」（staleTimes.static 15 分钟）照旧。
// - 意图预取：鼠标移上、键盘聚焦、手指按下时立刻整页预取那一页（对标 Remix / React Router 的 prefetch="intent"）。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ComponentProps } from "react";

type Router = ReturnType<typeof useRouter>;

const QUIET_MS = 800;
const MAX_WAIT_MS = 8000;
// PrefetchKind.FULL（next/dist 内部枚举的值）：整页预取，和之前 `<Link prefetch>` 一样。
const FULL = { kind: "full" } as unknown as Parameters<Router["prefetch"]>[1];

function prefetchFull(router: Router, href: string): void {
  try { router.prefetch(href, FULL); } catch { /* prefetch is only a hint */ }
}

/** Resolves once the page has loaded and no request has finished for QUIET_MS (capped at MAX_WAIT_MS). */
export function whenNetworkQuiet(win: Window = window, quietMs = QUIET_MS, maxWaitMs = MAX_WAIT_MS): { promise: Promise<void>; cancel: () => void } {
  let cancel = () => {};
  const promise = new Promise<void>((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let capTimer: ReturnType<typeof setTimeout> | undefined;
    let observer: PerformanceObserver | undefined;
    let done = false;
    const finish = () => { if (done) return; done = true; cleanup(); resolve(); };
    const cleanup = () => { clearTimeout(quietTimer); clearTimeout(capTimer); observer?.disconnect(); win.removeEventListener("load", start); };
    const rearm = () => { clearTimeout(quietTimer); quietTimer = setTimeout(finish, quietMs); };
    function start() {
      capTimer = setTimeout(finish, maxWaitMs);
      try {
        observer = new PerformanceObserver(rearm);
        observer.observe({ type: "resource" });
      } catch { /* no observer: the quiet timer alone */ }
      rearm();
    }
    cancel = () => { done = true; cleanup(); };
    if (win.document.readyState === "complete") start();
    else win.addEventListener("load", start, { once: true });
  });
  return { promise, cancel };
}

/** Background prefetch of the shell's main pages, after the page's own first requests are done. */
export function useDeferredShellPrefetch(hrefs: readonly string[]): void {
  const router = useRouter();
  const key = hrefs.join("|");
  useEffect(() => {
    const quiet = whenNetworkQuiet();
    let idle: number | undefined;
    let cancelled = false;
    void quiet.promise.then(() => {
      if (cancelled) return;
      const run = () => { if (!cancelled) for (const href of key.split("|")) prefetchFull(router, href); };
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(run, { timeout: 2000 });
      else run();
    });
    return () => {
      cancelled = true;
      quiet.cancel();
      if (idle !== undefined && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
    };
  }, [key, router]);
}

/** A shell link that does not prefetch on mount; it prefetches the whole page on hover, focus or touch. */
export function ShellLink({ href, onPointerEnter, onFocus, onTouchStart, ...rest }: Omit<ComponentProps<typeof Link>, "prefetch" | "href"> & { href: string }) {
  const router = useRouter();
  return (
    <Link
      {...rest}
      href={href}
      prefetch={false}
      onPointerEnter={(event) => { prefetchFull(router, href); onPointerEnter?.(event); }}
      onFocus={(event) => { prefetchFull(router, href); onFocus?.(event); }}
      onTouchStart={(event) => { prefetchFull(router, href); onTouchStart?.(event); }}
    />
  );
}
