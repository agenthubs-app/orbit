/**
 * 人脉页示例模式的外框（W0005）：`DemoModeProvider` + 顶栏（右侧挂横条收起后的药丸）+ 拦截层。
 *
 * 单独成文件：顶栏会牵连 `next/navigation`，而 `network-shell.tsx` 要能被脱离 Next 单独打包
 * （contact-card-browser 浏览器测试）。只有服务端页面在「在示例里」时引用本文件。
 * `route` 是原页面的 `data-orbit-route` 标记；外层保留 `data-orbit-real-page="network"`（顶栏样式靠它）。
 */
"use client";

import { ShellDemoPill } from "../../orbit-2026/shell/ShellDemoPill";
import type { ReactNode } from "react";

import { DemoInterceptLayer, DemoModeProvider, type DemoModeView } from "../../_demo/demo-mode-core";

export function NetworkDemoFrame({ children, guide, route }: { children: ReactNode; guide: DemoModeView; route: string }) {
  return (
    <DemoModeProvider view={guide}>
      <div data-orbit-guide-demo="on" data-orbit-real-page="network" data-orbit-route={route}>
        <ShellDemoPill />
        {children}
        <DemoInterceptLayer />
      </div>
    </DemoModeProvider>
  );
}
