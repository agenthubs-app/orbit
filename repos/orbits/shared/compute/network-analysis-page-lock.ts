/**
 * R11b（PLANNER §2 B-1 / B-2，RD-33 主会话代定）：人脈分析整页锁，两端共用的纯函数。
 * Owner: 乙 (R11b). Used by: 服务端 `features/network-analysis/page-lock.ts`（re-export，Web 分析页加载路径），
 * Web 人脈一覧入口卡（`orbit-2026/network/network-model.ts`）、App 人脈一覧入口卡与分析页
 * （`src/screens/network/NetworkScreen.tsx`、`src/screens/network-analysis/**`，经 `src/api/compute` 副本）。
 *
 * - 人数取 R11a summary 的 `total`（同一账号、同一去重 / 删除口径），不在本线重新推导；
 * - 少于 10 人整页锁定（进度环 `total / 10`、还差几人），10 人立即解锁；
 * - 10–29 人显示「参考値」，30 人起不再显示；30 人是说明用的稳定线，不是第二道锁；
 * - 3 位已确认联系人（`analysis-threshold.ts`）只约束快照生成 / 重算，与本文件无关、互不替代。
 */

export const NETWORK_ANALYSIS_UNLOCK_CONTACTS = 10;
export const NETWORK_ANALYSIS_STABLE_CONTACTS = 30;

export type NetworkAnalysisPageLock =
  | { state: "locked"; total: number; required: number; missing: number }
  | { state: "open"; total: number; reference: boolean }
  /** 人数读不到：不能当 0 人锁，也不能当解锁；页面给可重试状态。 */
  | { state: "unknown" };

export function networkAnalysisPageLock(total: number | null | undefined): NetworkAnalysisPageLock {
  if (typeof total !== "number" || !Number.isFinite(total)) return { state: "unknown" };
  const count = Math.max(0, Math.floor(total));
  if (count < NETWORK_ANALYSIS_UNLOCK_CONTACTS) {
    return { state: "locked", total: count, required: NETWORK_ANALYSIS_UNLOCK_CONTACTS, missing: NETWORK_ANALYSIS_UNLOCK_CONTACTS - count };
  }
  return { state: "open", total: count, reference: count < NETWORK_ANALYSIS_STABLE_CONTACTS };
}
