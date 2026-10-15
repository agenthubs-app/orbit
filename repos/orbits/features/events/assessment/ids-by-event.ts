/**
 * 我自己的评估 id（按活动）：R27 详情的评估条要链接到「評価結果」时用。只按 workspace + actor 读，只回 id 与活动 id
 * （评估内容仍只由本模块读写）。Owner: 甲 (R26 / R27).
 */
type Query = (sql: string, values: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

export async function myAssessmentIdsByEvent(query: Query, workspaceId: string, actorId: string, eventIds: readonly string[]): Promise<Map<string, string>> {
  if (!eventIds.length) return new Map();
  const result = await query(`select id, event_id from event_assessments where workspace_id = $1 and actor_id = $2 and event_id = any($3::text[]) limit $4`, [workspaceId, actorId, [...eventIds], eventIds.length]);
  return new Map(result.rows.map((row) => [String(row.event_id), String(row.id)]));
}
