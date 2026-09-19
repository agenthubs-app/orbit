/**
 * 工作策略 route adapter — Orbit_0918 iOrbit strategy 屏。
 *
 * 壳同 actions/plan 屏：auth + 语言 + 顶栏；数据由客户端组件经既有
 * facts 快照 server action 加载，路由自身不做数据组装。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import type { OrbitLanguage } from "../../orbit-language-core";
import { AccountTopNav } from "../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { OrbitAgentStrategy } from "./orbit-agent-strategy";

export const dynamic = "force-dynamic";

// renderToStaticMarkup(await Page()) 在测试里没有真实请求作用域，
// next/headers 会抛错——沿用 today/schedule 页同款回退。
async function getStrategyPageLanguage(): Promise<OrbitLanguage> {
  try {
    return await getOrbitServerLanguage();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return "zh";
    }
    throw error;
  }
}

export default async function AgentStrategyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fagent%2Fstrategy");
  }
  const language = await getStrategyPageLanguage();

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <AccountTopNav active="agent" />
      <OrbitAgentStrategy language={language} />
    </>
  );
}
