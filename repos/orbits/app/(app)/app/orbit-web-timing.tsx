"use client";

/**
 * P0 browser timing (docs/2026-11-21-data-access-redesign.md §5 P0): first load and each in-app page
 * change, sent as a small beacon to `/telemetry/web` (a log line, no database). Renders nothing and
 * switches itself off after the P0 week.
 */
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { p0MeasurementActive } from "../../../shared/observability/request-timing";
import { WEB_METRICS_PATH, webMetricRoute, type WebMetric } from "../../../shared/observability/web-metrics";

const BUSY_SELECTOR = '[role="progressbar"][aria-busy="true"]';
const SETTLE_MS = 300;
const NAV_TIMEOUT_MS = 20_000;
const LOAD_SEND_AFTER_MS = 15_000;

interface PendingNav {
  t0: number;
  from: string;
  navType: "click" | "push";
  urlAt: number | null;
  skeleton: boolean;
  clearSince: number | null;
}

function send(metric: WebMetric): void {
  try {
    const body = JSON.stringify(metric);
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.(WEB_METRICS_PATH, blob)) return;
    void fetch(WEB_METRICS_PATH, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => undefined);
  } catch {
    // Measurement never affects the page.
  }
}

function currentRoute(): string {
  return webMetricRoute(window.location.pathname, window.location.search);
}

export function OrbitWebTiming() {
  const pathname = usePathname();
  const pending = useRef<PendingNav | null>(null);
  const longTasks = useRef<Array<{ start: number; duration: number }>>([]);
  const lastRoute = useRef<string | null>(null);

  // First load + long tasks + click capture.
  useEffect(() => {
    if (!p0MeasurementActive() || typeof PerformanceObserver === "undefined") return;
    const observers: PerformanceObserver[] = [];
    const observe = (type: string, onEntry: (entry: PerformanceEntry) => void) => {
      try {
        const observer = new PerformanceObserver((list) => list.getEntries().forEach(onEntry));
        observer.observe({ type, buffered: true } as PerformanceObserverInit);
        observers.push(observer);
      } catch {
        // Unsupported entry type in this browser.
      }
    };
    let fcp: number | undefined;
    let lcp: number | undefined;
    observe("paint", (entry) => {
      if (entry.name === "first-contentful-paint") fcp = entry.startTime;
    });
    observe("largest-contentful-paint", (entry) => {
      lcp = entry.startTime;
    });
    observe("longtask", (entry) => {
      if (longTasks.current.length < 500) longTasks.current.push({ start: entry.startTime, duration: entry.duration });
    });

    const loadRoute = currentRoute();
    let loadSent = false;
    const sendLoad = () => {
      if (loadSent) return;
      loadSent = true;
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const scripts = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const jsBytes = scripts
        .filter((entry) => entry.initiatorType === "script")
        .reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
      const tasks = longTasks.current;
      send({
        kind: "load",
        route: loadRoute,
        navType: nav?.type,
        ttfbMs: nav?.responseStart,
        domReadyMs: nav?.domContentLoadedEventEnd || undefined,
        fcpMs: fcp,
        lcpMs: lcp,
        jsKb: jsBytes / 1024,
        longTasks: tasks.length,
        longTaskMs: tasks.reduce((sum, task) => sum + task.duration, 0),
        viewportW: window.innerWidth,
      });
    };
    const timer = window.setTimeout(sendLoad, LOAD_SEND_AFTER_MS);
    const onHidden = () => {
      if (document.visibilityState === "hidden") sendLoad();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", sendLoad);

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      pending.current = { t0: performance.now(), from: currentRoute(), navType: "click", urlAt: null, skeleton: false, clearSince: null };
    };
    document.addEventListener("click", onClick, true);

    return () => {
      observers.forEach((observer) => observer.disconnect());
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", sendLoad);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  // Each page change: address bar moved → wait until no skeleton has been on screen for SETTLE_MS.
  useEffect(() => {
    if (!p0MeasurementActive()) return;
    const route = currentRoute();
    const previous = lastRoute.current;
    lastRoute.current = route;
    if (previous === null || previous === route) return;
    const now = performance.now();
    const nav: PendingNav = pending.current ?? { t0: now, from: previous, navType: "push", urlAt: null, skeleton: false, clearSince: null };
    nav.urlAt = now;
    pending.current = null;

    let frame = 0;
    let finished = false;
    const finish = (timedOut: boolean) => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(frame);
      const end = timedOut ? performance.now() : (nav.clearSince ?? performance.now());
      const tasks = longTasks.current.filter((task) => task.start >= nav.t0 && task.start <= end);
      send({
        kind: "nav",
        route,
        from: nav.from,
        navType: nav.navType,
        urlMs: (nav.urlAt ?? now) - nav.t0,
        contentMs: end - nav.t0,
        skeleton: nav.skeleton,
        timedOut,
        longTasks: tasks.length,
        longTaskMs: tasks.reduce((sum, task) => sum + task.duration, 0),
        viewportW: window.innerWidth,
      });
    };
    const tick = () => {
      const t = performance.now();
      if (t - nav.t0 > NAV_TIMEOUT_MS) return finish(true);
      if (document.querySelector(BUSY_SELECTOR)) {
        nav.skeleton = true;
        nav.clearSince = null;
      } else {
        nav.clearSince ??= t;
        if (t - nav.clearSince >= SETTLE_MS) return finish(false);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      // A newer page change replaces this one before it settled: report what is known.
      if (!finished) finish(true);
    };
  }, [pathname]);

  return null;
}
