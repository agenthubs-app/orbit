/**
 * iOrbit 兄弟屏的壳（Orbit_0918）——`agent/{actions,plan,strategy}` 三条路由共用。
 *
 * 与 `iorbit-shell.tsx` 同一套几何与作用域，但不带聊天 / 历史两个 hook：
 *   - 外层 `data-orbit-real-page="agent"`（冻结的 `orbit-reference-styles.tsx` 有 44 条
 *     该作用域规则，顶栏与既有富控件的皮肤靠它）
 *   - 内层 `data-orbit-real-page="iorbit-0918"` 承载 `IORBIT_STYLES`（「审阅修订」2）
 *   - 顶栏沿用 `AccountTopNav active="agent"`（「审阅修订」5）
 *   - `<main class="ir-main">`：设计 43 的 `max-width:1240px; margin:0 auto;
 *     padding:14px 40px 72px; display:flex; flex-direction:column; gap:26px`
 *
 * `data-orbit-agent-screen-title`（视觉隐藏 h1）与 `data-orbit-iorbit-ready`
 * 按「审阅修订」28 / 37 留在这里：前者测试与审计都吃，后者是像素比对的就绪标志
 * （这三屏有 pending/ready/empty/unavailable 多态，plan 还是客户端 fetch）。
 */
"use client";

import type { ReactNode } from "react";

import { AccountTopNav } from "../../orbit-account-shell";
import { IORBIT_STYLES } from "./iorbit-styles";

export function IOrbitScreenFrame({
  children,
  ready,
  screenTitle,
}: {
  children: ReactNode;
  /** 全部数据源都不再 pending 时为 true；像素比对等的就是它（「审阅修订」37）。 */
  ready: boolean;
  screenTitle: string;
}) {
  return (
    <div data-orbit-real-page="agent">
      <div
        data-orbit-iorbit-ready={ready ? "true" : "false"}
        data-orbit-real-page="iorbit-0918"
      >
        <style>{IORBIT_STYLES}</style>
        <h1 className="ir-screen-title" data-orbit-agent-screen-title>
          {screenTitle}
        </h1>
        <AccountTopNav active="agent" />
        <main className="ir-main">{children}</main>
      </div>
    </div>
  );
}
