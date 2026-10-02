/**
 * W0048a：快照生成的输入（只读）。
 *
 * - 联系人裁剪复用计划输入的单一来源：`createPostgresPlanContactReader`（PLAN_INPUT_CONTACTS_SQL）+ `selectPlanContacts`，
 *   模型最多看 200 位；另一条小查询补职级（派生 4 档给模型，原值不改）与规范地区，并取本人全部已确认联系人 id
 *   作为快照的 includedContactIds（阈值比较用，避免超过 200 位时被裁掉的人永远算「新增」）。
 * - 每人最近 ≤2 条关系记录（W0046 RelationshipTimelineItem.id 即依据 recordIds），复用 W0047 的按 actor 批量时间线。
 * - 关系档位读 W0047 缓存（只读，不触发重算）。
 * - 计划里的人脉需求只经只读的 `PlanService.getCurrent()`（R-6，不调 getCurrentView／enterCurrentPhase）。
 */
import { seniorityGroup } from "../../shared/compute/seniority-group";
import { industryLabel, isIndustryIdCode, secondaryIndustryLabel } from "../../shared/domain/industries";
import { readStoredRegion, regionDisplayName } from "../../shared/domain/regions";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import type { PlanSnapshot } from "../plans/contract";
import { createPostgresPlanContactReader } from "../plans/input-source";
import { selectPlanContacts } from "../plans/input-selector";
import { createPostgresRelationshipStrengthStore } from "../relationship-strength/read-model";
import { readRelationshipTimelinesForActor } from "../relationship-strength/timelines";
import { SNAPSHOT_INPUT_CONTACT_LIMIT, SNAPSHOT_INPUT_EXCERPT_LIMIT, SNAPSHOT_INPUT_RECORDS_PER_CONTACT } from "./contract";
import { confirmedContactPredicate } from "./repository";
import type { SnapshotInput, SnapshotInputContact, SnapshotInputNeed } from "./snapshot-generator";

type Row = Record<string, unknown>;

export interface SnapshotInputBundle {
  input: SnapshotInput;
  /** 本人全部已确认联系人 id（快照 includedContactIds）。 */
  includedContactIds: string[];
  /** 校验器允许的依据 id。 */
  allowed: { contactIds: Set<string>; recordIds: Set<string>; needIds: Set<string> };
}

export interface SnapshotInputSource {
  read(input: { actorId: string; goal: string | null; now: Date }): Promise<SnapshotInputBundle>;
}

const CONTACT_DETAILS_SQL = `/* network-snapshot:input:contact-details */
  select c.record_id,
    c.payload->'publicProfile'->>'seniorityLevel' as seniority_level,
    c.payload->'region' as region
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
      const [contactRead, details, plan, timelines] = await Promise.all([
        readContacts(actorId, { goalText, now }),
        client.query<Row>(CONTACT_DETAILS_SQL, [workspaceId, actorId]),
        input.readCurrentPlan(actorId),
        readRelationshipTimelinesForActor(client, workspaceId, { actorId, now }),
      ]);
      const selected = selectPlanContacts({ actorId, contacts: contactRead.contacts, goalText, now, total: contactRead.total }).contacts
        .slice(0, SNAPSHOT_INPUT_CONTACT_LIMIT);
      const detailById = new Map(details.rows.map((row) => [String(row.record_id), row]));
      const tiers = new Map((await strengths.readTiers(actorId, selected.map((contact) => contact.id))).map((entry) => [entry.contactId, entry]));
      const recordIds = new Set<string>();
      const contacts: SnapshotInputContact[] = selected.map((contact) => {
        const detail = detailById.get(contact.id);
        const region = readStoredRegion(detail?.region ?? null);
        const tier = tiers.get(contact.id);
        const items = (timelines.timelines.get(contact.id) ?? [])
          .filter((item) => item.source !== "capture")
          .slice(0, SNAPSHOT_INPUT_RECORDS_PER_CONTACT);
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
          recordIds,
        },
        includedContactIds,
        input: { contactTotal: Math.max(contactRead.total, includedContactIds.length), contacts, goal: goal?.trim() || null, needs },
      };
    },
  };
}
