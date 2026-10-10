/**
 * R23 生成流程的输入来源：本人资料、可能是团队成员的联系人（C2）、选中的联系人（C3）、初版用的联系人（C6，≤200，沿用
 * v1 的 `input-source` 裁剪）、以及「人脈にも登録する」时建联系人（走现有手动建联系人服务，来源「プラン」）。
 *
 * - mock：演示世界（不写库）；live：只读本人的联系人（归属谓词同 `input-source.ts`）。
 * - 「共同創業者」等的判断：联系人的职位或标签里含共同創業者 / co-founder / 共同创始人（没有单独的标签字段时按职位），
 *   最多 5 人（DESIGN §5.2 C2）。
 */
import { DEMO_PEOPLE } from "../../../shared/mock/demo-world";
import { createManualContactCreationServiceForActor } from "../../acquisition/service-factory";
import { createProfileService } from "../../profile/service-factory";
import { createConfiguredPlanInputSource } from "../input-source";
import type { PlanPoolLike } from "../repository";

export interface PlanFlowProfile {
  name: string;
  headline: string | null;
}

export interface PlanFlowContact {
  id: string;
  name: string;
  organization: string | null;
  role: string | null;
  tags: string[];
  notes: string | null;
  industry: string | null;
}

export interface PlanFlowContextSource {
  profile(actorId: string): Promise<PlanFlowProfile>;
  /** 可能是团队成员的联系人（≤5）。 */
  teamCandidates(actorId: string): Promise<PlanFlowContact[]>;
  /** 按 id 读本人的联系人（别人的、不存在的不返回）。 */
  contacts(actorId: string, ids: readonly string[]): Promise<PlanFlowContact[]>;
  /** 初版的联系人（≤200，规则同 v1）。 */
  draftContacts(actorId: string, goalText: string, now: Date): Promise<PlanFlowContact[]>;
  /** 「人脈にも登録する」：建一张联系人卡，返回联系人 id（失败为 null，不挡流程）。 */
  addContact(actorId: string, input: { name: string; relationLabel: string }): Promise<string | null>;
}

export const PLAN_TEAM_CANDIDATE_LIMIT = 5;
const TEAM_PATTERN = /共同創業者|共同创始人|co-?founder/i;

export function looksLikeTeamMember(contact: Pick<PlanFlowContact, "role" | "tags">): boolean {
  return TEAM_PATTERN.test(contact.role ?? "") || contact.tags.some((tag) => TEAM_PATTERN.test(tag));
}

/** mock：演示世界（Kanade AI の CTO を共同創業者として扱う）。 */
export function createMockPlanFlowContext(): PlanFlowContextSource {
  const people: PlanFlowContact[] = DEMO_PEOPLE.map((person) => ({
    id: person.id,
    industry: null,
    name: person.name,
    notes: null,
    organization: person.company,
    role: person.role,
    tags: person.id === "demo-person-aoki" ? ["共同創業者"] : [],
  }));
  return {
    async addContact() { return null; },
    async contacts(_actorId, ids) { return people.filter((person) => ids.includes(person.id)); },
    async draftContacts() { return people; },
    async profile() { return { headline: "代表 · サンプル株式会社", name: "Orbit デモ" }; },
    async teamCandidates() { return people.filter(looksLikeTeamMember).slice(0, PLAN_TEAM_CANDIDATE_LIMIT); },
  };
}

type Row = Record<string, unknown>;
const OWN_CONTACTS = `
  from orbit_records c
  where c.workspace_id = $1 and c.collection_name = 'contacts' and c.lifecycle_state <> 'deleted' and c.user_id = $2
    and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb or c.payload->'accountId' = to_jsonb($2::text))
    and c.payload->>'lifecycleInitialization' is distinct from 'pending'
    and coalesce(trim(c.payload->>'displayName'), '') <> ''`;
const CONTACT_FIELDS = `c.record_id, c.payload->>'displayName' as name, c.payload->>'organization' as organization, c.payload->>'role' as role,
  c.payload->>'primaryIndustryId' as industry, case when jsonb_typeof(c.payload->'tags') = 'array' then c.payload->'tags' else '[]'::jsonb end as tags`;

function contactFromRow(row: Row): PlanFlowContact {
  const tags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  return { id: String(row.record_id), industry: text(row.industry), name: String(row.name), notes: null, organization: text(row.organization), role: text(row.role), tags };
}

/** live：与计划同一个连接池（只读）。 */
export function createLivePlanFlowContext(input: { pool: PlanPoolLike; workspaceId: string; mode?: string }): PlanFlowContextSource {
  const query = async (sql: string, values: unknown[]) => {
    const client = await input.pool.connect();
    try {
      return ((await client.query(sql, values)).rows ?? []) as Row[];
    } finally {
      client.release();
    }
  };
  return {
    async addContact(actorId, contact) {
      try {
        const service = createManualContactCreationServiceForActor(actorId, input.mode ?? "live");
        const created = await service.createManualContactDraft({ displayName: contact.name, note: contact.relationLabel, source: { label: "プラン" } });
        if (created.success !== true || !created.data.draft) return null;
        const confirmed = await service.confirmManualContactDraft({ draftId: created.data.draft.id });
        return confirmed.success === true ? confirmed.data.contactCandidate.candidateId : null;
      } catch (error) {
        console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "plan_flow_add_contact_failed" }));
        return null;
      }
    },
    async contacts(actorId, ids) {
      if (ids.length === 0) return [];
      return (await query(`select ${CONTACT_FIELDS} ${OWN_CONTACTS} and c.record_id = any($3::text[]) limit 20`, [input.workspaceId, actorId, [...ids]])).map(contactFromRow);
    },
    async draftContacts(actorId, goalText, now) {
      const source = createConfiguredPlanInputSource();
      if (!source) return [];
      const read = await source.listContacts(actorId, { goalText, now });
      return read.contacts.map((contact) => ({ id: contact.id, industry: contact.primaryIndustryId, name: contact.displayName, notes: null, organization: contact.organization, role: contact.role, tags: [] }));
    },
    async profile(actorId) {
      const result = await createProfileService(input.mode ?? "live").getProfile({ actorId });
      const profile = result.success === true ? result.data.profile : null;
      const headline = [profile?.role, profile?.organization].filter((part): part is string => Boolean(part && part.trim())).join(" · ");
      return { headline: headline || profile?.headline || null, name: profile?.displayName?.trim() || "—" };
    },
    async teamCandidates(actorId) {
      const rows = await query(
        `select ${CONTACT_FIELDS} ${OWN_CONTACTS}
           and (c.payload->>'role' ~* '共同創業者|共同创始人|co-?founder' or c.payload->'tags' ? '共同創業者')
         order by c.updated_at desc limit $3`,
        [input.workspaceId, actorId, PLAN_TEAM_CANDIDATE_LIMIT],
      );
      return rows.map(contactFromRow);
    },
  };
}
