/**
 * W0059 来路记录器（挂在 `/app` layout，App Router 换页时常驻）。
 *
 * - 捕获阶段监听站内点击：`<a>` 指向 `/app/contacts/<id>`（普通左键、无修饰键、本窗口打开）时，
 *   写一次性导航意图。点击即使随后被页面处理器 preventDefault 再程序化跳转（首页今日要事标题），
 *   意图同样有效；没真的离开时（示例详情在本页打开）意图留在本标签页，30 秒内不被别处消费即失效。
 * - `noteContactNavigation(href)` 给程序化跳转（iOrbit 的 `navigate()`）在离开前调用。
 * - 详情挂载时 `consumeContactDetailReturn()` 读并删除意图，见 `detail-return.ts`。
 */
"use client";

import { useEffect } from "react";

import {
  consumeDetailReturnIntent,
  normalizeAppPath,
  writeDetailReturnIntent,
  type DetailNavigationEntry,
  type DetailReturnStorage,
} from "./detail-return";

function sessionStorageOrNull(): DetailReturnStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function currentAppPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function newNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 程序化跳转到联系人详情前调用（不是联系人详情的 href 什么都不做）。返回写入的 nonce。 */
export function noteContactNavigation(href: string): string | null {
  if (typeof window === "undefined") return null;
  const to = normalizeAppPath(href, window.location.origin);
  if (!to) return null;
  const nonce = newNonce();
  const intent = writeDetailReturnIntent(sessionStorageOrNull(), { from: currentAppPath(), to, now: Date.now(), nonce });
  return intent ? nonce : null;
}

function readNavigationEntry(): DetailNavigationEntry | null {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!entry) return null;
    const url = new URL(entry.name, window.location.origin);
    return { type: entry.type, path: `${url.pathname}${url.search}` };
  } catch {
    return null;
  }
}

/** 详情挂载时调用一次：有效来路返回来源路径，否则 null（读后即删）。 */
export function consumeContactDetailReturn(): string | null {
  if (typeof window === "undefined") return null;
  return consumeDetailReturnIntent(sessionStorageOrNull(), {
    current: currentAppPath(),
    now: Date.now(),
    navigation: readNavigationEntry(),
  });
}

export function ContactDetailReturnRecorder() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.hasAttribute("download")) return;
      const targetAttr = (anchor.getAttribute("target") ?? "").trim().toLowerCase();
      if (targetAttr && targetAttr !== "_self") return;
      noteContactNavigation(anchor.getAttribute("href") ?? "");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
