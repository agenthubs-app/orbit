/**
 * R17 编组（host/DESIGN.md §2.4）。Owner: 甲 (R17).
 * - 产物：现有 event-ops 生成（AI，不改提示词）的 `table_content_shard` 输出；下書き画面 = 产物 + 规则后处理 + 主催者的拖动（overrides）。
 * - 规则后处理（`shared/compute/table-constraints.ts`）：同じ会社は別テーブル / 前回同席した人は避ける / 各テーブルに投資家 1名以上。
 * - 拖动只写 `event_ops_generation_overrides`（带版本）；发布时合成一份交给现有 publish（`composeGrouping`），冻结约束不变。
 * - 「新生成」每场 ≤3 次（按 generation 行计；失败那次的 retry 复用同一行，不计次）。
 * - 生成之后才承认的人不在快照里：显示为「未配置」，发布时不能入座（受付时再分配）。
 * - ラウンド数：现有引擎固定两轮；1 = 只用第 1 轮，2 = 两轮；3 轮本期不支持（暂缓）。
 */
import { applyMatchingMoves, avoidPreviousTablemates, ensureInvestorPerTable, pairKey, separateSameCompany } from "../../../../shared/compute/table-constraints";
import type { HostMatchingConditions, HostMatchingMember, HostMatchingMove, HostMatchingTable } from "../../../../shared/contract/host-console";
import type { EventOperationsGroupingResult, EventOperationsParticipant, EventOperationsTable } from "../../event-operations/contract";
import type { EventOperationsPostgresClient } from "../../event-operations/storage/postgres-client";
import { HostError } from "../service";

export const GENERATIONS_PER_EVENT = 3;
export const HOST_PLACED_REASON = "主催者が配置";
const INVESTOR = /投資|ＶＣ|\bVC\b|CVC|キャピタル|ベンチャーズ|Capital|Ventures|エンジェル|angel/iu;

export const isInvestor = (member: HostMatchingMember) => INVESTOR.test(`${member.standing ?? ""} ${member.org ?? ""} ${member.role ?? ""}`);
const letter = (n: number) => String.fromCharCode(64 + Math.max(1, Math.min(26, n)));
const tableNumber = (label: string) => label.charCodeAt(0) - 64;

export function memberFor(participant: EventOperationsParticipant | undefined, participantId: string): HostMatchingMember {
  const name = participant?.displayName ?? "";
  return { initial: name.trim().charAt(0), name, org: participant?.company ?? null, participantId, placedByHost: false, role: participant?.role ?? null, standing: null };
}

export function hostTablesFor(round: readonly EventOperationsTable[], roundIndex: number, directory: ReadonlyMap<string, EventOperationsParticipant>): HostMatchingTable[] {
  return round.map((table) => ({
    absent: 0,
    members: table.members.map((member) => memberFor(directory.get(member.participantId), member.participantId)),
    round: roundIndex,
    table: letter(table.tableNumber),
    theme: table.theme || null,
    why: table.rationale || null,
  }));
}

/** 下書き：产物 → 规则后处理 → 主催者的拖动。 */
export function draftTables(input: {
  grouping: EventOperationsGroupingResult;
  directory: ReadonlyMap<string, EventOperationsParticipant>;
  conditions: HostMatchingConditions;
  previousPairs: ReadonlySet<string>;
  actorOf: (participantId: string) => string;
  moves: readonly HostMatchingMove[];
  extraUnplaced: readonly HostMatchingMember[];
}): { tables: HostMatchingTable[]; unplaced: HostMatchingMember[]; unsatisfiedTables: number } {
  const rounds = input.conditions.roundCount >= 2 ? [input.grouping.roundOne, input.grouping.roundTwo] : [input.grouping.roundOne];
  let tables = rounds.flatMap((round, index) => hostTablesFor(round, index + 1, input.directory));
  if (input.conditions.separateCompanies) tables = separateSameCompany(tables).tables;
  if (input.conditions.avoidPreviousTablemates && input.previousPairs.size > 0) tables = avoidPreviousTablemates(tables, input.previousPairs, (member) => input.actorOf(member.participantId)).tables;
  let unsatisfiedTables = 0;
  if (input.conditions.investorPerTable) {
    const result = ensureInvestorPerTable(tables, isInvestor);
    tables = result.tables;
    unsatisfiedTables = result.unsatisfied;
  }
  const moved = applyMatchingMoves({ tables, unplaced: input.extraUnplaced }, input.moves);
  return {
    tables: moved.tables,
    unplaced: moved.unplaced,
    unsatisfiedTables,
  };
}

/** 发布用：把下書き卓写回 event-ops 的卓形状（主题、破冰、理由保留；被移动的人理由写「主催者が配置」）。 */
export function composeGrouping(base: EventOperationsGroupingResult, tables: readonly HostMatchingTable[], tableSize: number): EventOperationsGroupingResult {
  const snapshotIds = new Set([...base.roundOne, ...base.roundTwo].flatMap((table) => table.members.map((member) => member.participantId)));
  const promptsOf = new Map<string, readonly [string, string]>();
  const rationaleOf = new Map<string, string>();
  for (const table of [...base.roundOne, ...base.roundTwo]) {
    for (const [id, prompts] of Object.entries(table.memberPrompts)) promptsOf.set(id, prompts);
    for (const [id, reason] of Object.entries(table.memberRationales)) rationaleOf.set(id, reason);
  }
  const rebuild = (round: readonly EventOperationsTable[], index: number): EventOperationsTable[] => round.map((table) => {
    const draft = tables.find((item) => item.round === index && tableNumber(item.table) === table.tableNumber);
    const members = (draft?.members ?? []).filter((member) => snapshotIds.has(member.participantId));
    if (members.length > tableSize) throw new HostError("VALIDATION", "TABLE_TOO_LARGE");
    return {
      ...table,
      memberPrompts: Object.fromEntries(members.map((member) => [member.participantId, promptsOf.get(member.participantId) ?? table.icebreakers.slice(0, 2) as unknown as readonly [string, string]])),
      memberRationales: Object.fromEntries(members.map((member) => [member.participantId, member.placedByHost ? HOST_PLACED_REASON : rationaleOf.get(member.participantId) ?? table.rationale])),
      members: members.map((member, seat) => ({ participantId: member.participantId, seat: String(seat + 1) })),
    };
  }).filter((table) => table.members.length > 0);
  return { roundOne: rebuild(base.roundOne, 1), roundTwo: tables.some((table) => table.round === 2) ? rebuild(base.roundTwo, 2) : base.roundTwo };
}

export function createHostMatchingStore(deps: { client: EventOperationsPostgresClient; workspaceId: string }) {
  const { client, workspaceId } = deps;
  return {
    async conditions(eventId: string, tableSize: number): Promise<HostMatchingConditions> {
      const result = await client.query<{ round_count: number; constraints: Record<string, unknown> | string }>(`select round_count, constraints from event_ops_matching_conditions where workspace_id = $1 and event_id = $2`, [workspaceId, eventId]);
      const row = result.rows[0];
      const flags = (typeof row?.constraints === "string" ? JSON.parse(row.constraints) : row?.constraints ?? {}) as Record<string, unknown>;
      return { avoidPreviousTablemates: flags.avoidPreviousTablemates !== false, investorPerTable: flags.investorPerTable !== false, roundCount: Number(row?.round_count ?? 2), separateCompanies: flags.separateCompanies !== false, tableSize };
    },

    async saveConditions(actorId: string, eventId: string, conditions: HostMatchingConditions): Promise<void> {
      if (conditions.roundCount > 2) throw new HostError("VALIDATION", "ROUND_COUNT_UNSUPPORTED");
      await client.query(
        `insert into event_ops_matching_conditions (workspace_id, event_id, round_count, constraints, updated_by, updated_at) values ($1, $2, $3, $4::jsonb, $5, now())
         on conflict (workspace_id, event_id) do update set round_count = excluded.round_count, constraints = excluded.constraints, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        [workspaceId, eventId, conditions.roundCount, JSON.stringify({ avoidPreviousTablemates: conditions.avoidPreviousTablemates, investorPerTable: conditions.investorPerTable, separateCompanies: conditions.separateCompanies }), actorId],
      );
    },

    async overrides(generationId: string): Promise<{ moves: HostMatchingMove[]; version: number }> {
      const result = await client.query<{ moves: HostMatchingMove[] | string; version: number }>(`select moves, version from event_ops_generation_overrides where workspace_id = $1 and generation_id = $2`, [workspaceId, generationId]);
      const row = result.rows[0];
      return { moves: row ? (typeof row.moves === "string" ? JSON.parse(row.moves) : row.moves) : [], version: Number(row?.version ?? 0) };
    },

    /** 追加拖动（版本不对 → VERSION_CONFLICT）。 */
    async saveOverrides(actorId: string, eventId: string, generationId: string, expectedVersion: number, moves: readonly HostMatchingMove[]): Promise<number> {
      return client.transaction(async (executor) => {
        const current = await executor.query<{ moves: HostMatchingMove[] | string; version: number }>(`select moves, version from event_ops_generation_overrides where workspace_id = $1 and generation_id = $2 for update`, [workspaceId, generationId]);
        const row = current.rows[0];
        const version = Number(row?.version ?? 0);
        if (version !== expectedVersion) throw new HostError("VERSION_CONFLICT");
        const merged = [...(row ? (typeof row.moves === "string" ? JSON.parse(row.moves) : row.moves) : []), ...moves].slice(-500);
        await executor.query(
          `insert into event_ops_generation_overrides (workspace_id, generation_id, event_id, moves, version, updated_by, updated_at) values ($1, $2, $3, $4::jsonb, $5, $6, now())
           on conflict (workspace_id, generation_id) do update set moves = excluded.moves, version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
          [workspaceId, generationId, eventId, JSON.stringify(merged), version + 1, actorId],
        );
        return version + 1;
      });
    },

    /** 本主办方上一场已发布活动里同卓的两人（按 actor）。 */
    async previousPairs(eventId: string, organizerActorId: string): Promise<Set<string>> {
      const result = await client.query<{ dto: { grouping?: EventOperationsGroupingResult; directory?: EventOperationsParticipant[] } | string }>(
        `select publication.published_dto as dto from event_ops_publication_heads head
           join event_ops_publications publication on publication.workspace_id = head.workspace_id and publication.publication_id = head.publication_id
           join event_ops_events e on e.workspace_id = head.workspace_id and e.event_id = head.event_id
          where head.workspace_id = $1 and e.organizer_actor_id = $2 and head.event_id <> $3
          order by e.starts_at desc nulls last limit 1`,
        [workspaceId, organizerActorId, eventId],
      ).catch(() => ({ rows: [] as Array<{ dto: string }> }));
      const raw = result.rows[0]?.dto;
      const dto = (typeof raw === "string" ? JSON.parse(raw) : raw) as { grouping?: EventOperationsGroupingResult; directory?: EventOperationsParticipant[] } | undefined;
      const pairs = new Set<string>();
      if (!dto?.grouping) return pairs;
      const actorOf = new Map((dto.directory ?? []).map((participant) => [participant.participantId, participant.actorId]));
      for (const table of [...dto.grouping.roundOne, ...dto.grouping.roundTwo]) {
        const ids = table.members.map((member) => actorOf.get(member.participantId) ?? member.participantId);
        for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) pairs.add(pairKey(ids[i]!, ids[j]!));
      }
      return pairs;
    },
  };
}

export type HostMatchingStore = ReturnType<typeof createHostMatchingStore>;
