/**
 * R11a 人脈（Web 一级页）：新 `NetworkScreen`（orbit-2026/network）——ShellPage + 右栏今日の 1問、
 * つながり / 情報の濃さ / 出どころ、页签（すべて / 目標に関係 / 要フォロー）、絞り込み、表格、联系人抽屉（?contact=）。
 * 数据都由客户端经 /api/contacts/page|summary、goal-related-ids 读（服务端 SQL 计数与筛选，读预算闸门照旧）。
 *
 * W0005 示例模式：开关打开且本人在引导期示例里时（`readDemoModeViewForActor`），仍用示例人物渲染旧「所有人脈」
 * （引导期示例归 R28，本 Sprint 不改）；开关关闭时那次判定不做任何读取。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { readDemoModeViewForActor } from "../_demo/demo-guide-view";
import { buildDemoNetworkViewModel } from "../_demo/demo-network";
import { getOrbitServerLanguage } from "../orbit-language-server";
import { NetworkScreen } from "../orbit-2026/network/NetworkScreen";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { NetworkAll } from "./network-0918/network-all";
import { NetworkDemoFrame } from "./network-0918/network-demo-frame";
import { NETWORK_SOURCES, type NetworkSource } from "./network-0918/network-model";

export const dynamic = "force-dynamic";

export default async function AppContactsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=%2Fapp%2Fcontacts");
  const actor = await resolveAuthenticatedApiActorFromSession({ email: session.user.email, name: session.user.name, userId: session.user.id });
  if (!actor) throw new Error("Authenticated Orbit account membership is unavailable.");
  const [params, language, guide] = await Promise.all([searchParams, getOrbitServerLanguage(), readDemoModeViewForActor({ actorId: actor.id, userId: session.user.id })]);
  if (guide) {
    const sourceGroup = typeof params?.sourceGroup === "string" ? params.sourceGroup : "all";
    const initialSource = (NETWORK_SOURCES as readonly string[]).includes(sourceGroup) ? sourceGroup as NetworkSource | "all" : "all";
    return <>
      <OrbitReferenceStyles /><OrbitVisualFreezeRuntime />
      <NetworkDemoFrame guide={guide} route="app-contacts-route">
        <NetworkAll viewModel={buildDemoNetworkViewModel(new Date(), language === "en" ? "en" : "zh")} initialSource={initialSource} />
      </NetworkDemoFrame>
    </>;
  }
  return <NetworkScreen language={language} nowIso={new Date().toISOString()} />;
}
