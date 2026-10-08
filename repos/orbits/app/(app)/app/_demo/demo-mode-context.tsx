/**
 * 引导期示例模式的前端骨架（W0004；W0005／W0014 复用）。
 *
 * - `DemoModeProvider`：服务端算出「在示例里」时由 iOrbit 壳挂上；没挂时 `useDemoMode()`
 *   返回 null，所有组件照旧走真实数据。
 * - `guardWrite(label)`：示例里的写操作（打勾、确认、问 iOrbit、发送…）一律改成弹出
 *   「这是示例」拦截层，不发任何请求。
 * - `DemoBanner`：概览屏顶部的「示例预览」横条（进度、下一步、开始／继续引导、收起）。
 *   不能永久关闭；「收起」只把它折成导航栏右侧的 `DemoNavPill`，收起状态写进引导记录
 *   （`PATCH /api/guide/state`），换浏览器也一致。更新串行发送、只发最新的选择；写失败时
 *   只保留本次页面里的状态，不在本机留任何可重放的记录（共用浏览器换账号也不会串）。
 * - `DemoHandoffGuard`：示例壳挂载时把别处留下的「待发提问」（sessionStorage）和 `?q=`
 *   取出并清掉、改弹拦截层——否则它们会在引导完成后第一次进真实 iOrbit 时自动发出。
 * - `DemoTag`：示例人名旁的「示例」虚线角标。
 *
 * 引导页 `/app/start` 在 W0006 才上线；在那之前「开始／继续引导」会落到 404。
 */
"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { takePendingAsk } from "../orbit-global-ask/orbit-ask-draft";
import { useOrbitAskTarget, type OrbitAskTarget } from "../orbit-global-ask/orbit-ask-context";
import { useOrbitLanguage } from "../orbit-language-context";
import { useDemoMode } from "./demo-mode-core";

// 核心（Provider、横条、药丸、角标、拦截层）在 demo-mode-core.tsx；这里原样转出，W0004 的引用不变。
export * from "./demo-mode-core";

/** 当前地址去掉 `q` 后的相对 URL；没有 `q` 时返回 null。 */
function urlWithoutQuery(location: Pick<Location, "hash" | "pathname" | "search">): string | null {
  const params = new URLSearchParams(location.search);
  if (!params.has("q")) return null;
  params.delete("q");
  const search = params.toString();
  return `${location.pathname}${search ? `?${search}` : ""}${location.hash ?? ""}`;
}

/**
 * 示例壳挂载时消费掉所有「会自动发出的提问」：别的页面暂存的待发提问（取出即删）
 * 与地址栏的 `?q=`（用 replaceState 去掉），改弹「这是示例」。示例壳不挂对话 hook，
 * 若不在这里清掉，引导完成后第一次进真实 iOrbit 时它们会被自动发出去。
 */
export function DemoHandoffGuard() {
  const demo = useDemoMode();
  const { t } = useOrbitLanguage();
  const guardWrite = demo?.guardWrite;
  const label = t({ en: "conversation", zh: "对话" });
  const ranRef = useRef(false);
  useEffect(() => {
    if (!guardWrite || ranRef.current || typeof window === "undefined") return;
    ranRef.current = true;
    const pending = takePendingAsk();
    let hadQuery = false;
    try {
      const cleaned = urlWithoutQuery(window.location);
      if (cleaned !== null) {
        hadQuery = true;
        window.history?.replaceState?.(window.history.state, "", cleaned);
      }
    } catch {
      // 地址改不了也不影响拦截：示例壳本来就不读 `?q=`。
    }
    if (pending || hadQuery) guardWrite(label);
  }, [guardWrite, label]);
  return null;
}

const NO_ASK_CHIPS: OrbitAskTarget["chips"] = [];

/**
 * 顶栏全局提问框在 iOrbit 页上也是展开的。示例里接管它：提问一律弹拦截层，
 * 不暂存成「待发提问」（否则引导完成后第一次进真实 iOrbit 会把它悄悄发出去）。
 */
export function DemoAskTarget() {
  const demo = useDemoMode();
  const { t } = useOrbitLanguage();
  const guardWrite = demo?.guardWrite;
  const label = t({ en: "conversation", zh: "对话" });
  const onAsk = useCallback(() => guardWrite?.(label), [guardWrite, label]);
  const target = useMemo(
    () => (guardWrite ? { busy: false, chips: NO_ASK_CHIPS, onAsk } : null),
    [guardWrite, onAsk],
  );
  useOrbitAskTarget(target);
  return null;
}

