/**
 * W0051：一批洞察的输入（只读，0 写入）。
 *
 * 只读选中的 ≤20 位联系人（本人、已确认，与快照同一归属谓词）：
 * - 联系人窄列：姓名、公司、职位、行业、职级（派生 4 档给模型）、地区、W0045 补全来源与 offering／seeking／topics；
 * - 该联系人 memo 的 id 与时间（只进版本指纹，不读正文）；
 * - 最近 ≤5 条关系记录（W0046 RelationshipTimelineItem.id，即依据）：复用快照的窄读取；
 * - 生效计划的人脉需求（标题、行业、联系人关联状态）与待确认候选；
 * - 强度档读 W0047 缓存（只读；只用于相关度与提示词，不进版本指纹，R-10）。
 * - W0058：名片备注（联系人 `notes`，OCR 的部门也拼在这里）——去掉邮箱／电话／URL、截到 200 字后作为推测依据；
 * 不读邮箱、电话、memo 正文或任何私信。
 */
import { seniorityGroup } from "../../../shared/compute/seniority-group";
import { industryLabel, isIndustryIdCode, secondaryIndustryLabel } from "../../../shared/domain/industries";
import { normalizeRegion, regionDisplayName } from "../../../shared/domain/regions";
import type { RelationshipStrength, RelationshipTier } from "../../../shared/contract/relationship-strength";
import { MEMO_NOTE_ID_PREFIX } from "../../relationship-timeline/build";
import { confirmedContactPredicate } from "../../network-analysis/repository";
import { CONTACT_INSIGHT_RECENT_RECORDS_PER_CONTACT, readRecentRecordsForContacts } from "../../network-analysis/recent-records";
import { createPostgresRelationshipStrengthStore } from "../../relationship-strength/read-model";
import type { InsightInputContact, InsightInputNeed } from "./generator";
import type { InsightSqlExecutor } from "./repository";
import type { ContactInsightRelevanceInput } from "./relevance";
import type { ContactInsightVersionInput } from "./source-version";
import { sanitizeCardNotes } from "./profile-inference";

type Row = Record<string, unknown>;

export interface InsightContactSource {
  input: InsightInputContact;
  /** 版本指纹的输入（不含目标哈希）。 */
  version: Omit<ContactInsightVersionInput, "goalHash">;
  relevance: Omit<ContactInsightRelevanceInput, "now">;
}

export interface InsightInputBundle {
  needs: InsightInputNeed[];
  /** 只含读到的（本人、已确认）联系人；读不到的 id 不在这里。 */
  contacts: Map<string, InsightContactSource>;
}

export interface ContactInsightInputSource {
  read(input: { actorId: string; contactIds: readonly string[]; now: Date }): Promise<InsightInputBundle>;
}

export const INSIGHT_INPUT_CONTACTS_SQL = `/* contact-insights:input:contacts */
  select c.record_id,
    c.payload->>'displayName' as display_name,
    c.payload->>'organization' as organization,
    c.payload->>'role' as role,
    c.payload->>'primaryIndustryId' as primary_industry_id,
    c.payload->>'secondaryIndustryId' as secondary_industry_id,
    c.payload->'publicProfile'->>'seniorityLevel' as seniority_level,
    c.payload->'publicProfile'->'offering' as offering,
    c.payload->'publicProfile'->'seeking' as seeking,
    c.payload->'publicProfile'->'topics' as topics,
    c.payload->'region'->>'countryCode' as region_country,
    c.payload->'region'->>'city' as region_city,
    c.payload->'enrichment'->'fields' as enrichment_fields,
    left(c.payload->>'notes', 2000) as card_notes,
    coalesce(c.payload->>'createdAt', c.created_at::text) as created_at
  from orbit_records c
  where ${confirmedContactPredicate("c")} and c.record_id = any($3::text[])
  order by c.record_id`;

export const INSIGHT_INPUT_MEMOS_SQL = `/* contact-insights:input:memo-ids */
  select r.payload->>'contactId' as contact_id, n->>'noteId' as note_id, coalesce(n->>'occurredAt', n->>'createdAt') as at
  from orbit_records r
  cross join lateral jsonb_array_elements(case when jsonb_typeof(r.payload->'notes') = 'array' then r.payload->'notes' else '[]'::jsonb end) as n
  where r.workspace_id = $1 and r.collection_name = 'contact_detail_states' and r.user_id = $2 and r.payload->>'actorId' = $2
    and r.lifecycle_state <> 'deleted' and r.payload->>'contactId' = any($3::text[]) and n->>'noteId' like '${MEMO_NOTE_ID_PREFIX}%'`;

export const INSIGHT_INPUT_NEEDS_SQL = `/* contact-insights:input:plan-needs */
  select pi.id, pi.title, pi.criteria->>'primaryIndustryId' as primary_industry_id, pi.criteria->>'secondaryIndustryId' as secondary_industry_id,
    pi.contact_links
  from plan_items pi
  join plans p on p.workspace_id = pi.workspace_id and p.id = pi.plan_id and p.actor_id = pi.actor_id
  where p.workspace_id = $1 and p.actor_id = $2 and p.status = 'active' and pi.kind = 'network_need'
  order by pi.sort_key, pi.id
  limit 50`;

export const INSIGHT_INPUT_CANDIDATES_SQL = `/* contact-insights:input:pending-candidates */
  select contact_id, need_item_id from plan_match_candidates
  where workspace_id = $1 and actor_id = $2 and status = 'pending' and contact_id = any($3::text[])
  limit 400`;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function json(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

async function optional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    // 计划／匹配表还没迁移：按无计划处理。
    if (isUndefinedTable(error)) return fallback;
    throw error;
  }
}

function industryOf(primary: string | null, secondary: string | null): string | null {
  if (secondary && isIndustryIdCode(primary)) {
    try {
      return secondaryIndustryLabel(secondary as never, "en");
    } catch {
      // 二级不在目录里：退回一级。
    }
  }
  return isIndustryIdCode(primary) ? industryLabel(primary, "en") : null;
}

export function createPostgresContactInsightInputSource(input: { client: InsightSqlExecutor; workspaceId: string }): ContactInsightInputSource {
  const { client, workspaceId } = input;
  const strengths = createPostgresRelationshipStrengthStore({ client: client as never, workspaceId });
  return {
    async read({ actorId, contactIds, now }) {
      const ids = [...new Set(contactIds)].slice(0, 50);
      const params = [workspaceId, actorId, ids];
      const [contactRows, memoRows, needRows, candidateRows, strengthRows] = await Promise.all([
        client.query<Row>(INSIGHT_INPUT_CONTACTS_SQL, params),
        client.query<Row>(INSIGHT_INPUT_MEMOS_SQL, params),
        optional(client.query<Row>(INSIGHT_INPUT_NEEDS_SQL, [workspaceId, actorId]), { rows: [] as Row[] }),
        optional(client.query<Row>(INSIGHT_INPUT_CANDIDATES_SQL, params), { rows: [] as Row[] }),
        strengths.readStrengths(actorId, ids).catch((): RelationshipStrength[] => []),
      ]);
      const contacts = contactRows.rows.filter((row) => text(row.display_name));
      const recent = await readRecentRecordsForContacts(client, workspaceId, {
        actorId,
        contacts: contacts.map((row) => ({ createdAt: text(row.created_at) ?? now.toISOString(), id: String(row.record_id) })),
        now,
        perContact: CONTACT_INSIGHT_RECENT_RECORDS_PER_CONTACT,
      });
      const needs = needRows.rows.map((row) => ({
        id: String(row.id),
        industryId: text(row.primary_industry_id),
        input: { id: String(row.id), industry: industryOf(text(row.primary_industry_id), text(row.secondary_industry_id)), title: String(row.title ?? "") } satisfies InsightInputNeed,
        links: (Array.isArray(json(row.contact_links)) ? (json(row.contact_links) as Row[]) : []).flatMap((link) =>
          typeof link?.contactId === "string" && (link.state === "linked" || link.state === "established") ? [{ contactId: link.contactId, state: link.state as "linked" | "established" }] : [],
        ),
      }));
      const activeNeedIds = new Set(needs.map((need) => need.id));
      const needIndustries = new Set(needs.map((need) => need.industryId).filter((id): id is string => Boolean(id)));
      const memosBy = new Map<string, { id: string; at: string | null }[]>();
      for (const row of memoRows.rows) {
        const contactId = String(row.contact_id);
        memosBy.set(contactId, [...(memosBy.get(contactId) ?? []), { at: text(row.at), id: String(row.note_id) }]);
      }
      const candidatesBy = new Map<string, Set<string>>();
      for (const row of candidateRows.rows) {
        const needId = String(row.need_item_id);
        if (!activeNeedIds.has(needId)) continue;
        const contactId = String(row.contact_id);
        candidatesBy.set(contactId, (candidatesBy.get(contactId) ?? new Set()).add(needId));
      }
      const strengthBy = new Map(strengthRows.map((strength) => [strength.contactId, strength]));
      const result = new Map<string, InsightContactSource>();
      for (const row of contacts) {
        const id = String(row.record_id);
        const primary = text(row.primary_industry_id);
        const secondary = text(row.secondary_industry_id);
        const region = normalizeRegion(text(row.region_country), text(row.region_city));
        const strength = strengthBy.get(id);
        const links = needs.flatMap((need) => need.links.filter((link) => link.contactId === id).map((link) => ({ needId: need.id, state: link.state })));
        const linkedNeedIds = new Set(links.map((link) => link.needId));
        const candidates = [...(candidatesBy.get(id) ?? [])].filter((needId) => !linkedNeedIds.has(needId));
        const planLink = links.some((link) => link.state === "established") ? "established" : links.length ? "linked" : null;
        const cardNotes = sanitizeCardNotes(text(row.card_notes));
        result.set(id, {
          input: {
            cardNotes,
            dormant: strength?.dormant ?? false,
            id,
            industry: industryOf(primary, secondary),
            name: text(row.display_name)!,
            needLinks: [...links, ...candidates.map((needId) => ({ needId, state: "candidate" as const }))],
            organization: text(row.organization),
            records: (recent.get(id) ?? []).map((item) => ({ id: item.id, occurredAt: item.occurredAt, source: item.source, title: item.title.en })),
            region: region ? regionDisplayName(region, "en") : null,
            role: text(row.role),
            seniorityGroup: seniorityGroup(text(row.seniority_level)),
            tier: strength?.tier ?? null,
          },
          relevance: {
            industryMatchesNeed: primary !== null && needIndustries.has(primary),
            lastSignalAt: strength?.lastSignalAt ?? null,
            pendingCandidate: candidates.length > 0,
            planLink,
            tier: (strength?.tier ?? null) as RelationshipTier | null,
          },
          version: {
            cardNotes,
            displayName: text(row.display_name)!,
            enrichedValues: {
              offering: json(row.offering),
              primaryIndustryId: primary,
              region: region ? `${region.countryCode}:${region.city ?? ""}` : null,
              secondaryIndustryId: secondary,
              seeking: json(row.seeking),
              seniorityLevel: text(row.seniority_level),
              topics: json(row.topics),
            },
            enrichmentFields: (json(row.enrichment_fields) as Record<string, unknown> | null) ?? null,
            memos: memosBy.get(id) ?? [],
            organization: text(row.organization),
            planLinks: links,
            role: text(row.role),
          },
        });
      }
      return { contacts: result, needs: needs.map((need) => need.input) };
    },
  };
}
