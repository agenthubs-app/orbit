/**
 * R11a 人脈（Web 一级页）：新 `NetworkScreen`（orbit-2026/network）——ShellPage + 右栏今日の 1問、
 * つながり / 情報の濃さ / 出どころ、页签（すべて / 目標に関係 / 要フォロー）、絞り込み、表格、联系人抽屉（?contact=）。
 * 数据都由客户端经 /api/contacts/page|summary、goal-related-ids 读（服务端 SQL 计数与筛选，读预算闸门照旧）。
 *
 * 2026-10-30：引导期也显示本人的真实人脈（不再用 W0005 的旧示例页盖住刚导入的名片）；引导进度由 Task 横条与 /app/start 负责。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { getOrbitServerLanguage } from "../orbit-language-server";
import { NetworkScreen } from "../orbit-2026/network/NetworkScreen";

export const dynamic = "force-dynamic";

export default async function AppContactsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=%2Fapp%2Fcontacts");
  const actor = await resolveAuthenticatedApiActorFromSession({ email: session.user.email, name: session.user.name, userId: session.user.id });
  if (!actor) throw new Error("Authenticated Orbit account membership is unavailable.");
  return <NetworkScreen language={await getOrbitServerLanguage()} nowIso={new Date().toISOString()} />;
}
