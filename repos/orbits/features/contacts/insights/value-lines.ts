/**
 * W0061（D61）：「TA 能帮你」一句话的服务端批量只读数据源（首页 `GET /api/contacts/value-lines` 与候选接口共用）。
 *
 * - 0 次模型调用：只读 `contact_insights` 窄列（状态、单语言 `goal_relation`、依据，首页再带下一步）、本人联系人的
 *   姓名／公司／职位、依据解析所需事实；不 import 生成器、执行器、配额，也不经 `read.ts`（它静态 import 了配额常量），
 *   读取不标待更新（易错边界 1）。
 * - 越权：联系人按本人归属读取，他人的 id 静默丢弃（不返回、不报错）。
 * - 状态（不额外读关系目标）：没有洞察行 → pending（生成中）；`blocked_no_goal` → no_goal；ready 但没有当前语言的
 *   文字按 pending 处理。
 */
import type { ContactInsightState } from "../../../shared/contract/contact-insight";
import { resolveModuleMode } from "../../../shared/services/module-mode";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { resolveInsightEvidenceLabels, type EvidenceSqlExecutor, type InsightEvidenceLabel } from "./evidence-labels";
import { createPostgresContactInsightRepository, type ContactInsightValueLineRow } from "./repository";

/**
 * 一句话的洞察部分（单语言）；三处共用（详情由已读到的洞察视图换算成同一形状）。
 * 线上形状省略空字段（D39 窄读：未就绪只有 `state`），读取方一律按缺省 = 空处理。
 */
export interface ContactValueInsight {
  state: ContactInsightState;
  /** ready 时「TA 能帮你：」后面的正文（界面语言）。 */
  relation?: string | null;
  /** ready 洞察的下一步（只在首页请求时带，用作「为什么现在」的第二顺位）。 */
  nextStep?: string | null;
  evidence?: InsightEvidenceLabel[];
}

/** `GET /api/contacts/value-lines` 的一项：洞察部分 + 退化用的姓名与「公司 · 职位」。 */
export interface ContactValueLineData extends ContactValueInsight {
  contactId: string;
  /** 只读洞察模式（候选卡重取，`fields=insight`）不带姓名与公司职位。 */
  name?: string;
  /** 「公司 · 职位」；都空时缺省。 */
  subtitle?: string | null;
}

export const VALUE_LINES_MAX_IDS = 20;

export function valueInsightState(row: Pick<ContactInsightValueLineRow, "status" | "relation"> | null | undefined): ContactInsightState {
  if (!row) return "pending";
  if (row.status === "blocked_no_goal") return "no_goal";
  if (row.status === "failed") return "failed";
  if (row.status === "ready") return row.relation ? "ready" : "pending";
  return "pending";
}

export interface ValueLineDeps {
  client: EvidenceSqlExecutor;
  workspaceId: string;
}

function configuredDeps(): ValueLineDeps | null {
  if (resolveModuleMode() !== "live") return null;
  const runtime = createConfiguredTransactionalPostgresRuntime();
  return runtime ? { client: runtime.client, workspaceId: runtime.workspaceId } : null;
}

function cleanIds(contactIds: readonly string[], max: number): string[] {
  return [...new Set(contactIds.map((id) => (typeof id === "string" ? id.trim() : "")).filter((id) => id.length > 0 && id.length <= 512))].slice(0, max);
}

/** 洞察 + 依据（两条只读语句）；不带联系人资料。候选接口用（候选自带姓名、公司职位）。 */
export async function readContactValueInsights(
  input: { actorId: string; contactIds: readonly string[]; language: "zh" | "en"; withNextStep?: boolean },
  deps: ValueLineDeps | null = configuredDeps(),
  options: { onlyExisting?: boolean } = {},
): Promise<Map<string, ContactValueInsight>> {
  const ids = cleanIds(input.contactIds, VALUE_LINES_MAX_IDS);
  const result = new Map<string, ContactValueInsight>();
  if (!deps || !input.actorId.trim() || !ids.length) return result;
  const rows = await createPostgresContactInsightRepository({ client: deps.client, workspaceId: deps.workspaceId }).readValueLines(input.actorId, ids, {
    language: input.language,
    withNextStep: input.withNextStep === true,
  });
  const ready = [...rows].filter(([, row]) => valueInsightState(row) === "ready");
  const labels = await resolveInsightEvidenceLabels({ actorId: input.actorId, items: ready.map(([contactId, row]) => ({ contactId, evidence: row.evidence })) }, deps);
  for (const id of ids) {
    const row = rows.get(id) ?? null;
    if (!row && options.onlyExisting) continue;
    const state = valueInsightState(row);
    if (state !== "ready" || !row) {
      result.set(id, { state });
      continue;
    }
    const evidence = labels.get(id) ?? [];
    result.set(id, {
      ...(evidence.length ? { evidence } : {}),
      ...(row.nextStep ? { nextStep: row.nextStep } : {}),
      relation: row.relation,
      state,
    });
  }
  return result;
}

const OWNED_CONTACTS_SQL = `/* contact-value-lines:contacts */ select array_position($3::text[], c.record_id) as pos,
       left(c.payload->>'displayName', 80) as display_name,
       left(c.payload->>'organization', 80) as organization,
       left(c.payload->>'role', 80) as role
  from orbit_records c
 where c.workspace_id = $1 and c.collection_name = 'contacts' and c.lifecycle_state <> 'deleted' and c.user_id = $2
   and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb or c.payload->'accountId' = to_jsonb($2::text))
   and c.record_id = any($3::text[])`;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 首页：本人这些联系人的一句话（≤20 个 id；他人的 id 不返回）。三条只读语句：联系人资料 → 洞察窄列 → 依据事实。
 * 返回顺序与请求顺序一致。
 */
export async function readContactValueLines(
  input: { actorId: string; contactIds: readonly string[]; language: "zh" | "en" },
  deps: ValueLineDeps | null = configuredDeps(),
): Promise<ContactValueLineData[]> {
  const ids = cleanIds(input.contactIds, VALUE_LINES_MAX_IDS);
  if (!deps || !input.actorId.trim() || !ids.length) return [];
  const contacts = await deps.client.query<Record<string, unknown>>(OWNED_CONTACTS_SQL, [deps.workspaceId, input.actorId, ids]);
  const owned = new Map(contacts.rows.flatMap((row) => {
    const id = ids[Number(row.pos) - 1];
    return id ? [[id, row] as const] : [];
  }));
  const ownedIds = ids.filter((id) => owned.has(id));
  if (!ownedIds.length) return [];
  const insights = await readContactValueInsights({ actorId: input.actorId, contactIds: ownedIds, language: input.language, withNextStep: true }, deps);
  return ownedIds.map((id) => {
    const row = owned.get(id)!;
    const subtitle = [text(row.organization), text(row.role)].filter(Boolean).join(" · ");
    const insight: ContactValueInsight = insights.get(id) ?? { state: "pending" };
    return { ...insight, contactId: id, name: text(row.display_name) || "—", ...(subtitle ? { subtitle } : {}) };
  });
}

/**
 * 候选卡重取（`fields=insight`）：只读洞察窄列与依据，不读联系人资料（候选自带）。本人范围靠 `contact_insights`
 * 按 actor 隔离：只返回本人有洞察行的 id，他人或还没有行的 id 不返回（客户端保持「生成中」）。
 */
export async function readContactValueInsightLines(
  input: { actorId: string; contactIds: readonly string[]; language: "zh" | "en" },
  deps: ValueLineDeps | null = configuredDeps(),
): Promise<ContactValueLineData[]> {
  const ids = cleanIds(input.contactIds, VALUE_LINES_MAX_IDS);
  if (!deps || !input.actorId.trim() || !ids.length) return [];
  const insights = await readContactValueInsights({ ...input, withNextStep: false }, deps, { onlyExisting: true });
  return ids.flatMap((id) => {
    const insight = insights.get(id);
    return insight ? [{ ...insight, contactId: id }] : [];
  });
}
