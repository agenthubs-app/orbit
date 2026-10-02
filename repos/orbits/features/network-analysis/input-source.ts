/**
 * W0048a：快照生成的输入（只读）。
 *
 * - 联系人裁剪复用计划输入的单一来源：`createPostgresPlanContactReader`（PLAN_INPUT_CONTACTS_SQL）+ `selectPlanContacts`，
 *   模型最多看 200 位；随后一条窄语句取本人全部已确认联系人 id（快照的 includedContactIds，阈值比较用，避免超过
 *   200 位时被裁掉的人永远算「新增」），并只为选中的人带上职级（派生 4 档给模型，原值不改）与规范地区三个文本列。
 * - 每人最近 ≤2 条关系记录（W0046 RelationshipTimelineItem.id 即依据 recordIds）：只读选中的人、每来源每人 2 条
 *   （`recent-records.ts`，review P3）。
 * - 关系档位读 W0047 缓存（只读，不触发重算）。
 * - 计划里的人脉需求只经只读的 `PlanService.getCurrent()`（R-6，不调 getCurrentView／enterCurrentPhase）。
 */
import { seniorityGroup } from "../../shared/compute/seniority-group";
import { industryLabel, isIndustryIdCode, secondaryIndustryLabel } from "../../shared/domain/industries";
import { normalizeRegion, regionDisplayName } from "../../shared/domain/regions";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import type { PlanSnapshot } from "../plans/contract";
import { createPostgresPlanContactReader } from "../plans/input-source";
import { selectPlanContacts } from "../plans/input-selector";
import { createPostgresRelationshipStrengthStore } from "../relationship-strength/read-model";
import { readRecentRecordsForContacts } from "./recent-records";
import { SNAPSHOT_INPUT_CONTACT_LIMIT, SNAPSHOT_INPUT_EXCERPT_LIMIT } from "./contract";
import { confirmedContactPredicate } from "./repository";
import type { SnapshotInput, SnapshotInputContact, SnapshotInputNeed } from "./snapshot-generator";

type Row = Record<string, unknown>;

export interface SnapshotInputBundle {
  input: SnapshotInput;
  /** 本人全部已确认联系人 id（快照 includedContactIds）。 */
  includedContactIds: string[];
  /** 校验器允许的依据 id。 */
  allowed: { contactIds: Set<string>; recordIds: Set<string>; needIds: Set<string>; phrases: string[] };
}

export interface SnapshotInputSource {
  read(input: { actorId: string; goal: string | null; now: Date }): Promise<SnapshotInputBundle>;
}

/** 全部已确认联系人 id（窄列）；只为 $3 里选中的人带职级与地区三个文本列。 */
const CONTACT_IDS_AND_DETAILS_SQL = `/* network-snapshot:input:contact-ids */
  select c.record_id,
    case when c.record_id = any($3::text[]) then c.payload->'publicProfile'->>'seniorityLevel' end as seniority_level,
    case when c.record_id = any($3::text[]) then c.payload->'region'->>'countryCode' end as region_country,
    case when c.record_id = any($3::text[]) then c.payload->'region'->>'city' end as region_city
  from orbit_records c
  where ${confirmedContactPredicate("c")}
  order by c.record_id
  limit 5000`;

function excerpt(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.length > SNAPSHOT_INPUT_EXCERPT_LIMIT ? `${trimmed.slice(0, SNAPSHOT_INPUT_EXCERPT_LIMIT - 1)}…` : trimmed;
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

export function planNeedsForSnapshot(snapshot: Pick<PlanSnapshot, "items"> | null): SnapshotInputNeed[] {
  if (!snapshot) return [];
  return snapshot.items
    .filter((item) => item.kind === "network_need" && item.status !== "established")
    .map((item) => ({
      description: item.criteria?.description ?? null,
      id: item.id,
      industry: item.criteria?.secondaryIndustryId
        ? secondaryIndustryLabel(item.criteria.secondaryIndustryId, "en")
        : item.criteria?.primaryIndustryId
          ? industryLabel(item.criteria.primaryIndustryId, "en")
          : null,
      title: item.title,
    }));
}

export function createPostgresSnapshotInputSource(input: {
  client: TransactionalPostgresClient;
  workspaceId: string;
  /** 只读：生效计划（`PlanService.getCurrent()`）。 */
  readCurrentPlan: (actorId: string) => Promise<Pick<PlanSnapshot, "items"> | null>;
}): SnapshotInputSource {
  const { client, workspaceId } = input;
  const readContacts = createPostgresPlanContactReader({ client, workspaceId });
  const strengths = createPostgresRelationshipStrengthStore({ client, workspaceId });
  return {
    async read({ actorId, goal, now }) {
      const goalText = goal ?? "";
      const [contactRead, plan] = await Promise.all([readContacts(actorId, { goalText, now }), input.readCurrentPlan(actorId)]);
      const selected = selectPlanContacts({ actorId, contacts: contactRead.contacts, goalText, now, total: contactRead.total }).contacts
        .slice(0, SNAPSHOT_INPUT_CONTACT_LIMIT);
      const selectedIds = selected.map((contact) => contact.id);
      const [details, tierRows, recent] = await Promise.all([
        client.query<Row>(CONTACT_IDS_AND_DETAILS_SQL, [workspaceId, actorId, selectedIds]),
        strengths.readTiers(actorId, selectedIds),
        readRecentRecordsForContacts(client, workspaceId, { actorId, contacts: selected.map((contact) => ({ createdAt: contact.createdAt, id: contact.id })), now }),
      ]);
      const detailById = new Map(details.rows.map((row) => [String(row.record_id), row]));
      const tiers = new Map(tierRows.map((entry) => [entry.contactId, entry]));
      const recordIds = new Set<string>();
      const contacts: SnapshotInputContact[] = selected.map((contact) => {
        const detail = detailById.get(contact.id);
        const region = normalizeRegion(detail?.region_country ?? null, detail?.region_city ?? null);
        const tier = tiers.get(contact.id);
        const items = recent.get(contact.id) ?? [];
        for (const item of items) recordIds.add(item.id);
        return {
          dormant: tier?.dormant ?? false,
          id: contact.id,
          industry: industryOf(contact.primaryIndustryId, contact.secondaryIndustryId),
          name: contact.displayName,
          organization: contact.organization,
          records: items.map((item) => ({
            id: item.id,
            occurredAt: item.occurredAt,
            source: item.source,
            title: item.title.en,
            ...(excerpt(item.excerpt) ? { excerpt: excerpt(item.excerpt) } : {}),
          })),
          region: region ? regionDisplayName(region, "en") : null,
          role: contact.role,
          seniorityGroup: seniorityGroup(typeof detail?.seniority_level === "string" ? detail.seniority_level : null),
          tier: tier?.tier ?? null,
        };
      });
      const needs = planNeedsForSnapshot(plan);
      const includedContactIds = details.rows.map((row) => String(row.record_id));
      return {
        allowed: {
          contactIds: new Set(contacts.map((contact) => contact.id)),
          needIds: new Set(needs.map((need) => need.id)),
          phrases: [goal ?? "", ...needs.map((need) => need.title)].filter((phrase) => phrase.trim().length > 0),
          recordIds,
        },
        includedContactIds,
        input: { contactTotal: Math.max(contactRead.total, includedContactIds.length), contacts, goal: goal?.trim() || null, needs },
      };
    },
  };
}
