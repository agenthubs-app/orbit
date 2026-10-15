/**
 * R17（host/DESIGN.md §2.9「抑制」、§10 A3）：报告与运营中心里来自参加者私人记录的数字只给聚合。Owner: 甲 (R17).
 * - 任何格子的人数 <5 → null（界面显示「—」）；
 * - 差分保护：同一维度只剩一个被抑制的格子时，再抑制剩下的最小格子（防止用合计减出被抑制的数）。
 */
export const SMALL_CELL_THRESHOLD = 5;

/** 单个计数：<阈值时 null。 */
export function suppressSmall(value: number | null | undefined, threshold = SMALL_CELL_THRESHOLD): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value < threshold ? null : value;
}

/** 一组同维度的计数（如每卓的交换数、各立場人数）：逐格抑制 + 差分保护。 */
export function suppressCells(values: readonly number[], threshold = SMALL_CELL_THRESHOLD): Array<number | null> {
  const out: Array<number | null> = values.map((value) => (value < threshold ? null : value));
  const suppressed = out.filter((value) => value === null).length;
  if (suppressed === 1) {
    let smallest = -1;
    out.forEach((value, index) => {
      if (value !== null && (smallest === -1 || value < (out[smallest] as number))) smallest = index;
    });
    if (smallest >= 0) out[smallest] = null;
  }
  return out;
}

/** 比率：分母（人数）<阈值时 null；否则四舍五入成整数百分比。 */
export function suppressedRate(numerator: number, denominator: number, threshold = SMALL_CELL_THRESHOLD): number | null {
  if (!Number.isFinite(denominator) || denominator < threshold || denominator <= 0) return null;
  return Math.round((Math.max(0, Math.min(numerator, denominator)) / denominator) * 100);
}

/** 各格人数 → 百分比（整数），先按人数做抑制与差分保护；总数 <阈值整组 null。 */
export function suppressedDistribution(counts: readonly number[], threshold = SMALL_CELL_THRESHOLD): Array<number | null> {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total < threshold) return counts.map(() => null);
  return suppressCells(counts, threshold).map((value) => (value === null ? null : Math.round((value / total) * 100)));
}
