/**
 * W0048a：快照三层更新的第 ③ 层判定（纯函数；顺序即优先级）。
 *
 *  1. 已确认联系人 < 3 → insufficient（不调用；展示交 W0054，W48-5）；
 *  2. 无快照 → first，自动；
 *  3. sourceDataVersion 相同 → fresh，0 次模型调用；
 *  4. goalDigest 变了 → goal_changed，自动（W48-3）；
 *  5. 从不足 3 人恢复：快照纳入的人中仍为本人已确认联系人的 < 3、且当前 ≥ 3 → threshold，自动（W54-4）；
 *  6. 新增 N 人满足 N ≥ 3 或 N ≥ ceil(0.2 × contactCount) → threshold，自动；
 *  7. 否则 stale：只返回 newContactCount（报告卡「新增 N 人未纳入 · 更新分析」）。
 */
import { SNAPSHOT_MIN_CONTACTS, SNAPSHOT_THRESHOLD_NEW_CONTACTS, SNAPSHOT_THRESHOLD_RATIO } from "./contract";

export interface SnapshotRefreshInput {
  /** 本人当前已确认联系人数。 */
  confirmedCount: number;
  current: { sourceDataVersion: string; goalDigest: string };
  /** 当前 current 快照；没有则 null。 */
  snapshot: {
    sourceDataVersion: string;
    goalDigest: string;
    contactCount: number;
    /** 快照纳入的人中，当前仍是本人已确认联系人的数量。 */
    retainedCount: number;
    /** 当前已确认、但不在快照纳入名单里的人数（SQL 一条 count 算出）。 */
    newContactCount: number;
  } | null;
}

export type SnapshotRefreshDecision =
  | { kind: "insufficient" }
  | { kind: "fresh" }
  | { kind: "auto"; trigger: "first" | "goal_changed" | "threshold"; newContactCount: number }
  | { kind: "stale"; newContactCount: number };

export function snapshotThresholdReached(newContactCount: number, contactCount: number): boolean {
  if (newContactCount <= 0) return false;
  return newContactCount >= SNAPSHOT_THRESHOLD_NEW_CONTACTS || newContactCount >= Math.ceil(SNAPSHOT_THRESHOLD_RATIO * contactCount);
}

export function decideSnapshotRefresh(input: SnapshotRefreshInput): SnapshotRefreshDecision {
  if (input.confirmedCount < SNAPSHOT_MIN_CONTACTS) return { kind: "insufficient" };
  const snapshot = input.snapshot;
  if (!snapshot) return { kind: "auto", newContactCount: input.confirmedCount, trigger: "first" };
  if (snapshot.sourceDataVersion === input.current.sourceDataVersion) return { kind: "fresh" };
  if (snapshot.goalDigest !== input.current.goalDigest) return { kind: "auto", newContactCount: snapshot.newContactCount, trigger: "goal_changed" };
  if (snapshot.retainedCount < SNAPSHOT_MIN_CONTACTS) return { kind: "auto", newContactCount: snapshot.newContactCount, trigger: "threshold" };
  if (snapshotThresholdReached(snapshot.newContactCount, snapshot.contactCount)) {
    return { kind: "auto", newContactCount: snapshot.newContactCount, trigger: "threshold" };
  }
  return { kind: "stale", newContactCount: snapshot.newContactCount };
}
