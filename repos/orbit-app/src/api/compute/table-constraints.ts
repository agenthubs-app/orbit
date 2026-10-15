/**
 * R17（host/DESIGN.md §2.4「条件」「人工调整层」、§3.3）：编组的规则后处理与人工调整。Owner: 甲 (R17).
 * - 生成产物（现有 event-ops，AI）不改；条件「同じ会社は別テーブル / 前回同席した人は避ける / 各テーブルに投資家 1名以上」
 *   在生成后用规则在桌间交换（贪心，有次数上限），**不改提示词**。
 * - 拖动只记 moves（`event_ops_generation_overrides`）；下書き画面 = 产物 + 后处理 + moves，发布时再合成冻结。
 * 纯函数：输入输出都是新数组，不改参数。
 */
import type { HostMatchingMember, HostMatchingMove, HostMatchingTable } from "../contract/host-console";

export interface MatchingLayout {
  tables: readonly HostMatchingTable[];
  unplaced: readonly HostMatchingMember[];
}

/** 内部可改的卓（成员数组可改）；对外仍是 `HostMatchingTable`。 */
type WorkTable = Omit<HostMatchingTable, "members"> & { members: HostMatchingMember[] };
const clone = (tables: readonly HostMatchingTable[]): WorkTable[] => tables.map((table) => ({ ...table, members: [...table.members] }));

/** 依次应用拖动（同一人多次移动以最后一次为准）；移到不存在的卓视为未配置。 */
export function applyMatchingMoves(layout: MatchingLayout, moves: readonly HostMatchingMove[]): { tables: WorkTable[]; unplaced: HostMatchingMember[] } {
  const tables = clone(layout.tables);
  let unplaced = [...layout.unplaced];
  for (const move of moves) {
    let found: HostMatchingMember | undefined;
    for (const table of tables) {
      if (table.round !== move.round) continue;
      const index = table.members.findIndex((member) => member.participantId === move.participantId);
      if (index >= 0) { found = table.members[index]; table.members.splice(index, 1); }
    }
    const fromUnplaced = unplaced.find((member) => member.participantId === move.participantId);
    if (fromUnplaced) { found ??= fromUnplaced; unplaced = unplaced.filter((member) => member.participantId !== move.participantId); }
    if (!found) continue;
    const moved = { ...found, placedByHost: true };
    const target = move.toTable === null ? undefined : tables.find((table) => table.round === move.round && table.table === move.toTable);
    if (target) target.members.push(moved);
    else unplaced = [...unplaced, moved];
  }
  return { tables, unplaced };
}

type Conflict = (member: HostMatchingMember, others: readonly HostMatchingMember[]) => boolean;

/** 在同一轮里，把与卓内其他人冲突的人和别的卓里不冲突的人对调（贪心，最多 maxSwaps 次）。 */
function resolveBySwaps(tables: readonly HostMatchingTable[], conflict: Conflict, maxSwaps: number): { tables: WorkTable[]; swaps: number } {
  const next = clone(tables);
  let swaps = 0;
  const rounds = [...new Set(next.map((table) => table.round))];
  for (const round of rounds) {
    const inRound = next.filter((table) => table.round === round);
    for (const table of inRound) {
      for (let i = 0; i < table.members.length && swaps < maxSwaps; i += 1) {
        const member = table.members[i]!;
        const rest = table.members.filter((_, index) => index !== i);
        if (member.placedByHost || !conflict(member, rest)) continue;
        outer: for (const other of inRound) {
          if (other === table) continue;
          for (let j = 0; j < other.members.length; j += 1) {
            const candidate = other.members[j]!;
            if (candidate.placedByHost) continue;
            const otherRest = other.members.filter((_, index) => index !== j);
            if (conflict(candidate, rest) || conflict(member, otherRest)) continue;
            table.members[i] = candidate;
            other.members[j] = member;
            swaps += 1;
            break outer;
          }
        }
      }
    }
  }
  return { swaps, tables: next };
}

const companyKey = (member: HostMatchingMember) => (member.org ?? "").replace(/\s+/gu, "").replace(/株式会社|（株）|\(株\)/gu, "").toLowerCase();

/** 同じ会社は別テーブル。 */
export function separateSameCompany(tables: readonly HostMatchingTable[], maxSwaps = 50): { tables: WorkTable[]; swaps: number } {
  return resolveBySwaps(tables, (member, others) => companyKey(member) !== "" && others.some((other) => companyKey(other) === companyKey(member)), maxSwaps);
}

/** 前回同席した人は避ける：`previousPairs` 是上一场已发布席位里同卓的两人（`a|b`，字典序）。 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function avoidPreviousTablemates(tables: readonly HostMatchingTable[], previousPairs: ReadonlySet<string>, keyOf: (member: HostMatchingMember) => string, maxSwaps = 50): { tables: WorkTable[]; swaps: number } {
  return resolveBySwaps(tables, (member, others) => others.some((other) => previousPairs.has(pairKey(keyOf(member), keyOf(other)))), maxSwaps);
}

/** 各テーブルに投資家 1名以上：从有 ≥2 位投资人的卓移给没有的卓（同轮对调）；人数不够时返回满足不了的卓数。 */
export function ensureInvestorPerTable(tables: readonly HostMatchingTable[], isInvestor: (member: HostMatchingMember) => boolean): { tables: WorkTable[]; unsatisfied: number } {
  const next = clone(tables);
  for (const round of [...new Set(next.map((table) => table.round))]) {
    const inRound = next.filter((table) => table.round === round);
    for (const needy of inRound.filter((table) => !table.members.some(isInvestor))) {
      const donor = inRound.find((table) => table.members.filter(isInvestor).length >= 2);
      if (!donor) continue;
      const investorIndex = donor.members.findIndex((member) => isInvestor(member) && !member.placedByHost);
      const swapIndex = needy.members.findIndex((member) => !isInvestor(member) && !member.placedByHost);
      if (investorIndex < 0 || swapIndex < 0) continue;
      const investor = donor.members[investorIndex]!;
      donor.members[investorIndex] = needy.members[swapIndex]!;
      needy.members[swapIndex] = investor;
    }
  }
  return { tables: next, unsatisfied: next.filter((table) => !table.members.some(isInvestor)).length };
}
