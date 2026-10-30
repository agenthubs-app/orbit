/**
 * R11b 人脈分析（/app/contacts/dashboard）：新屏 `NetworkAnalysisScreen`（orbit-2026/network-analysis）。
 * `?tab=structure|opportunities|insight` 深链保留（默认構造；旧的无 tab「概览」不再另成第四页，B-3）。
 *
 * 服务端读取（features/network-analysis/analysis-page-loader.ts）：先读 R11a summary 的 total；不足 10 人整页锁定，
 * 0 次行读取、0 次计划读取、0 次快照 GET / 排队（B-1 / B-8）。10 人起读分析视图（R11a 行 + 计划需要），并按界面语言读快照
 * （ja 无日文句时不显示 AI 句，不回退）与依据姓名。人数读不到时显示重试，不当作 0 人。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { getOrbitServerLanguage } from "../../orbit-language-server";
import { NetworkAnalysisScreen } from "../../orbit-2026/network-analysis/NetworkAnalysisScreen";
import { analysisTabFrom } from "../../orbit-2026/network-analysis/analysis-labels";
import { loadNetworkAnalysisPage } from "../../../../../features/network-analysis/analysis-page-loader";

export const dynamic = "force-dynamic";

export default async function AppContactsDashboardPage({ searchParams }: {
  searchParams?: Promise<{ tab?: string | string[] } & Record<string, string | string[] | undefined>>;
} = {}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=%2Fapp%2Fcontacts%2Fdashboard");
  const actor = await resolveAuthenticatedApiActorFromSession({ email: session.user.email, name: session.user.name, userId: session.user.id });
  if (!actor) throw new Error("Authenticated Orbit account membership is unavailable.");
  const [params, language] = await Promise.all([searchParams, getOrbitServerLanguage()]);
  const initialTab = analysisTabFrom(typeof params?.tab === "string" ? params.tab : null);
  const data = await loadNetworkAnalysisPage({ id: actor.id, workspaceId: actor.workspaceId }, language);
  return <NetworkAnalysisScreen language={language} view={data.view} snapshot={data.snapshot} evidenceNames={data.evidenceNames} initialRail={data.rail} initialTab={initialTab} />;
}
