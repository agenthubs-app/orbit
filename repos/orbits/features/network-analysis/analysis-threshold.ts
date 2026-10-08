/**
 * W0054（RN-12，W54-3／W54-4）：人脉分析门槛（纯函数，客户端可引用类型）。
 *
 * - 门槛与引导第 1 步同一常量（`START_REQUIRED_CONTACTS`，3 位）、同一计数谓词（`progress.ts` 的
 *   `CONFIRMED_CONTACT_COUNT_SQL`，读取器在 `analysis-threshold-reader.ts`）；
 * - 看真实数据的用户已确认联系人不足 3 位时，只把 AI 块（快照叙述、结构洞察、报告卡、洞察标签、
 *   行内洞察一句）换成一张「再添加 N 位联系人即可更新分析」卡；统计图、档位人数、覆盖度数字照常；
 * - 补回 3 位后由 W0048a 的恢复规则（快照纳入的人里仍在的 < 3、当前 ≥ 3 → 立即重算）排队重算，
 *   快照视图带 `freshness.recovering`，期间显示「正在更新分析」、不回显旧快照；后台池用完显示「明天更新」。
 */
import { START_REQUIRED_CONTACTS } from "../guide/start-steps";
import type { NetworkSnapshotView } from "./contract";

/** 人脉分析需要的已确认联系人数（= 引导第 1 步的 3 位）。 */
export const NETWORK_ANALYSIS_MIN_CONTACTS = START_REQUIRED_CONTACTS;

export interface AnalysisThreshold {
  confirmed: number;
  met: boolean;
  /** 还差几位（达到时为 0）。 */
  missing: number;
}

export function analysisThreshold(confirmedContacts: number): AnalysisThreshold {
  const confirmed = Number.isFinite(confirmedContacts) ? Math.max(0, Math.floor(confirmedContacts)) : 0;
  const missing = Math.max(0, NETWORK_ANALYSIS_MIN_CONTACTS - confirmed);
  return { confirmed, met: missing === 0, missing };
}

/**
 * 分析页 AI 块的替换卡（每页最多一张）：
 * - threshold：不足 3 位，「再添加 N 位联系人即可更新分析」+ 扫名片／导入人脉；
 * - updating：补回 3 位后正在重算（不回显旧快照）；
 * - deferred：重算因后台池当日用完顺延，「明天更新」。
 */
export type AnalysisGateView =
  | { kind: "threshold"; missing: number }
  | { kind: "updating" }
  | { kind: "deferred"; retryOn: string | null };

export function analysisGate(
  threshold: AnalysisThreshold | null | undefined,
  snapshot?: (Pick<NetworkSnapshotView, "freshness"> & Partial<Pick<NetworkSnapshotView, "quota">>) | null,
): AnalysisGateView | null {
  if (threshold && !threshold.met) return { kind: "threshold", missing: threshold.missing };
  if (!snapshot?.freshness.recovering) return null;
  if (snapshot.freshness.job === "deferred") return { kind: "deferred", retryOn: snapshot.freshness.retryOn ?? null };
  if (snapshot.freshness.job === "none" && snapshot.quota?.background.retryOn) {
    return { kind: "deferred", retryOn: snapshot.quota.background.retryOn };
  }
  return { kind: "updating" };
}

/** 门槛未达时代替真实快照读取的视图（不读库、不排队，0 次 AI）。 */
export function belowThresholdSnapshotView(): NetworkSnapshotView {
  return {
    blocks: [],
    contactCount: 0,
    freshness: { job: "none", newContactCount: 0, stale: false },
    generatedAt: null,
    quota: { background: { limit: 60, usedToday: 0 }, manual: { limit: 3, usedToday: 0 }, user: { limit: 10, usedToday: 0 } },
    state: "insufficient",
  };
}

/** 门槛卡的入口（与引导第 1 步同一组）。 */
export const ANALYSIS_GATE_SCAN_HREF = "/app/contacts/new?method=scan";
export const ANALYSIS_GATE_IMPORT_HREF = "/app/contacts/new?method=csv";
