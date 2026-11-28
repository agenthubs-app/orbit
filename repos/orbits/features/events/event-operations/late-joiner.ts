/**
 * People who come after the matching was published (2026-11-28 用户定：「14:00 匹配开始以后如果有人新加进入来，也给他做分组和给自己的推荐。
 * 但是暂时不改变其他人的推荐。」).
 *
 * Computed on read from the published result plus the late joiner's own current matching card; nothing is written, so
 * the published result (and everyone else's recommendations and seats) stays byte-for-byte what was published.
 * - Their own recommendations: the same rules as the generation (match-rules.ts), over the published directory.
 * - Their seats: one existing table per round, never a new table. The smallest tables first; among those the one where
 *   they match the people already sitting there best; in round two, fewer round-one tablemates. Ties go by a hash of
 *   their participant id so two late joiners with similar profiles do not all land on the same table.
 * The same person with the same profile always gets the same answer.
 */
import { createHash } from "node:crypto";

import type {
  EventOperationsParticipant,
  EventOperationsParticipantRecommendations,
  EventOperationsPublishedResult,
  EventOperationsTable,
} from "./contract";
import { recommendationText, ruleMatch } from "./match-rules";

export const LATE_JOINER_NO_MATCH = {
  en: "No one here matches your goals directly yet — talk to your tablemates on the day.",
  ja: "今回の参加者には、目的に直接合う方がまだいません。当日は同じテーブルの方とぜひ話してみてください。",
  zh: "这次的参加者里暂时没有和你的目标直接对口的人，可以在现场多和同桌的人聊聊。",
} as const;

function tieBreak(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

/** The late joiner's own recommendations over the published directory (others' lists are not touched). */
export function lateJoinerRecommendations(
  me: EventOperationsParticipant,
  directory: readonly EventOperationsParticipant[],
  count: number,
): EventOperationsParticipantRecommendations {
  const picks = directory
    .filter((target) => target.actorId !== me.actorId && target.participantId !== me.participantId)
    .map((target) => ({ match: ruleMatch(me, target), target }))
    .filter((entry) => entry.match.value > 0)
    .sort((left, right) => right.match.value - left.match.value
      || tieBreak(me.participantId, left.target.participantId).localeCompare(tieBreak(me.participantId, right.target.participantId)))
    .slice(0, Math.max(0, count));
  if (!picks.length) {
    return { noMatchReason: LATE_JOINER_NO_MATCH.zh, noMatchReasonI18n: { ...LATE_JOINER_NO_MATCH }, recommendations: [], sourceParticipantId: me.participantId };
  }
  return {
    noMatchReason: null,
    recommendations: picks.map(({ match, target }, index) => {
      const i18n = recommendationText(me, target, match);
      return {
        icebreakers: i18n.zh.icebreakers,
        i18n,
        memberHint: i18n.zh.memberHint,
        rank: index + 1,
        reasons: i18n.zh.reasons,
        score: Math.max(1, Math.min(99, Math.round(20 + match.value * 9))),
        targetParticipantId: target.participantId,
      };
    }),
    sourceParticipantId: me.participantId,
  };
}

function pickTable(
  me: EventOperationsParticipant,
  tables: readonly EventOperationsTable[],
  people: ReadonlyMap<string, EventOperationsParticipant>,
  avoid: ReadonlySet<string>,
): EventOperationsTable | null {
  if (!tables.length) return null;
  const smallest = Math.min(...tables.map((table) => table.members.length));
  const scored = tables
    .filter((table) => table.members.length === smallest)
    .map((table) => {
      let fit = 0;
      let repeats = 0;
      for (const member of table.members) {
        const person = people.get(member.participantId);
        if (person) fit += ruleMatch(me, person).value + ruleMatch(person, me).value;
        if (avoid.has(member.participantId)) repeats += 1;
      }
      return { fit: fit - repeats * 40, key: tieBreak(me.participantId, String(table.tableNumber)), table };
    })
    .sort((left, right) => right.fit - left.fit || left.key.localeCompare(right.key));
  return scored[0]?.table ?? null;
}

function seated(table: EventOperationsTable, me: EventOperationsParticipant, roundNumber: 1 | 2): EventOperationsTable {
  return {
    ...table,
    members: [...table.members, { participantId: me.participantId, seat: `R${roundNumber}-T${table.tableNumber}-S${table.members.length + 1}` }],
  };
}

/** A copy of one existing table per round with the late joiner added (the published tables are not modified). */
export function lateJoinerTables(
  me: EventOperationsParticipant,
  published: Pick<EventOperationsPublishedResult, "directory" | "grouping">,
): { roundOneTable: EventOperationsTable | null; roundTwoTable: EventOperationsTable | null } {
  const people = new Map(published.directory.map((participant) => [participant.participantId, participant]));
  const one = pickTable(me, published.grouping.roundOne, people, new Set());
  const two = pickTable(me, published.grouping.roundTwo, people, new Set(one?.members.map((member) => member.participantId) ?? []));
  return {
    roundOneTable: one ? seated(one, me, 1) : null,
    roundTwoTable: two ? seated(two, me, 2) : null,
  };
}
