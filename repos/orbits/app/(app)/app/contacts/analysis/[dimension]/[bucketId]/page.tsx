/**
 * R11b 下钻名单（/app/contacts/analysis/[dimension]/[bucketId]）：新屏 `NetworkAnalysisListScreen`，路径保留（R11-12）。
 * 维度：industry / seniority / region / met / opportunity；旧的 `tier` 等维度回到分析页。不足 10 人与分析页一样锁定（直链绕不过）；
 * 名单由客户端读 GET /api/network/analysis/people（同一判定规则，人数与卡片一致）。W0005 示例期间回到分析页。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../../../api/_shared/authenticated-actor";
import { getOrbitServerLanguage } from "../../../../orbit-language-server";
import { NetworkAnalysisListScreen } from "../../../../orbit-2026/network-analysis/NetworkAnalysisListScreen";
import { resolveNetworkAnalysisReadDeps } from "../../../../../../../features/network-analysis/analysis-handlers";
import { networkAnalysisPageLock } from "../../../../../../../features/network-analysis/page-lock";
import type { NetworkAnalysisDimension } from "../../../../../../../shared/contract/network-analysis-view";

export const dynamic = "force-dynamic";
const DIMENSIONS: readonly NetworkAnalysisDimension[] = ["industry", "seniority", "region", "met", "opportunity"];

export default async function AppContactsAnalysisListPage({ params }: { params: Promise<{ dimension: string; bucketId: string }> }) {
  const { dimension, bucketId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    const next = `/app/contacts/analysis/${encodeURIComponent(dimension)}/${encodeURIComponent(bucketId)}`;
    redirect(`/app/account/login?next=${encodeURIComponent(next)}`);
  }
  const actor = await resolveAuthenticatedApiActorFromSession({ email: session.user.email, name: session.user.name, userId: session.user.id });
  if (!actor) throw new Error("Authenticated Orbit account membership is unavailable.");
  if (!(DIMENSIONS as readonly string[]).includes(dimension)) redirect("/app/contacts/dashboard?tab=structure");
  const language = await getOrbitServerLanguage();
  const lock = networkAnalysisPageLock(await (await resolveNetworkAnalysisReadDeps()).readTotal({ id: actor.id, workspaceId: actor.workspaceId }).catch(() => null));
  return (
    <NetworkAnalysisListScreen language={language} dimension={dimension as NetworkAnalysisDimension} bucketId={decodeURIComponent(bucketId)}
      lock={lock.state === "locked" ? lock : { state: "open" }} />
  );
}
