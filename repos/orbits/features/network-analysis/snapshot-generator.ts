/**
 * W0048a：快照生成器接口与 mock 实现。
 *
 * 两个实现（mock、DeepSeek）同一接口：返回 JSON 文本 + 用量，解析与校验统一在 `snapshot-validator.ts`。
 * `billable = true` 表示一次 generate 发一次供应商 HTTP（服务在前后登记账本子账）；mock 不发 HTTP、不登记子账，
 * 持有者结算时落为 released（不计次，只记真实发生的用量，W48-6）。
 * mock 的文字只由真实输入拼出（姓名、公司、行业、档位），不编造人和数字以外的事实。
 */
import { SNAPSHOT_PROMPT_VERSION } from "./contract";

export interface SnapshotInputRecord {
  /** RelationshipTimelineItem.id，即依据里的 recordIds。 */
  id: string;
  source: string;
  occurredAt: string;
  title: string;
  excerpt?: string;
}

export interface SnapshotInputContact {
  id: string;
  name: string;
  organization: string | null;
  role: string | null;
  /** 行业英文标签（一级／二级）。 */
  industry: string | null;
  /** 派生 4 档（decision／manager／staff／other），原值不改。 */
  seniorityGroup: string;
  region: string | null;
  tier: string | null;
  dormant: boolean;
  records: SnapshotInputRecord[];
}

export interface SnapshotInputNeed {
  id: string;
  title: string;
  description: string | null;
  industry: string | null;
}

export interface SnapshotInput {
  goal: string | null;
  /** 本人已确认联系人总数（模型只看到前 ≤200 位）。 */
  contactTotal: number;
  contacts: SnapshotInputContact[];
  needs: SnapshotInputNeed[];
}

export interface SnapshotGeneratorUsage {
  inputTokens: number;
  outputTokens: number;
}

export class SnapshotGeneratorError extends Error {
  constructor(
    readonly code: "PROVIDER_TIMEOUT" | "PROVIDER_REQUEST_FAILED" | "INVALID_OUTPUT",
    message: string,
    /** 拿到响应时的用量；null = 没有响应（不计次）。 */
    readonly usage: SnapshotGeneratorUsage | null = null,
  ) {
    super(message);
    this.name = "SnapshotGeneratorError";
  }
}

export interface NetworkSnapshotGenerator {
  readonly provider: "deepseek" | "mock";
  readonly model: string;
  readonly promptVersion: string;
  /** 一次 generate 是否发一次供应商 HTTP（需要登记子账）。 */
  readonly billable: boolean;
  generate(input: SnapshotInput, options?: { signal?: AbortSignal }): Promise<{ content: string; usage: SnapshotGeneratorUsage | null }>;
}

function top<T>(items: readonly T[], key: (item: T) => string | null): { value: string; members: T[] } | null {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  let best: { value: string; members: T[] } | null = null;
  for (const [value, members] of groups) {
    if (!best || members.length > best.members.length || (members.length === best.members.length && value < best.value)) best = { members, value };
  }
  return best;
}

const SENIORITY_ZH: Record<string, string> = { decision: "决策层", manager: "管理层", other: "其他", staff: "执行层" };

/** 只由真实输入拼出的 mock 快照（开发、测试与生产默认；W48-9 生产仍为 mock）。 */
export function buildMockSnapshotContent(input: SnapshotInput): string {
  const contacts = input.contacts;
  const ids = (list: readonly SnapshotInputContact[]) => list.slice(0, 5).map((contact) => contact.id);
  const names = (list: readonly SnapshotInputContact[]) => list.slice(0, 3).map((contact) => contact.name).join("、");
  const namesEn = (list: readonly SnapshotInputContact[]) => list.slice(0, 3).map((contact) => contact.name).join(", ");
  const industry = top(contacts, (contact) => contact.industry);
  const seniority = top(contacts, (contact) => (contact.seniorityGroup !== "other" ? contact.seniorityGroup : null));
  const recent = contacts.filter((contact) => contact.records.length > 0);
  const blocks: Record<string, unknown>[] = [];
  blocks.push({
    contactIds: ids(contacts),
    en: `You have ${input.contactTotal} confirmed contacts${industry ? `; the largest group is ${industry.value} (${industry.members.length})` : ""}.`,
    kind: "diagnosis",
    recordIds: [],
    zh: `你已确认 ${input.contactTotal} 位联系人${industry ? `，人数最多的是「${industry.value}」（${industry.members.length} 位）` : ""}。`,
  });
  blocks.push(industry
    ? {
        contactIds: ids(industry.members),
        en: `${namesEn(industry.members)} work in ${industry.value}.`,
        kind: "insight",
        recordIds: [],
        zh: `${names(industry.members)} 都在「${industry.value}」。`,
      }
    : {
        contactIds: ids(contacts),
        en: `${namesEn(contacts)} have no industry recorded yet.`,
        kind: "insight",
        recordIds: [],
        zh: `${names(contacts)} 还没有记录行业。`,
      });
  blocks.push(seniority
    ? {
        contactIds: ids(seniority.members),
        en: `${seniority.members.length} contacts are at the ${seniority.value} level, e.g. ${namesEn(seniority.members)}.`,
        kind: "insight",
        recordIds: [],
        zh: `${seniority.members.length} 位处在${SENIORITY_ZH[seniority.value] ?? seniority.value}，例如 ${names(seniority.members)}。`,
      }
    : {
        contactIds: ids(contacts.slice(-3)),
        en: `${namesEn(contacts.slice(-3))} have no role level recorded yet.`,
        kind: "insight",
        recordIds: [],
        zh: `${names(contacts.slice(-3))} 还没有记录职级。`,
      });
  if (recent.length) {
    blocks.push({
      contactIds: ids(recent),
      en: `Recent interactions: ${namesEn(recent)}.`,
      kind: "insight",
      recordIds: recent.slice(0, 3).map((contact) => contact.records[0]!.id),
      zh: `最近有往来的是 ${names(recent)}。`,
    });
  }
  for (const need of input.needs) {
    const related = contacts.filter((contact) => need.industry && contact.industry === need.industry);
    if (!related.length) continue;
    blocks.push({
      contactIds: ids(related),
      en: `For "${need.title}", start from ${namesEn(related)}.`,
      kind: "gap",
      needId: need.id,
      recordIds: [],
      zh: `「${need.title}」可以先从 ${names(related)} 入手。`,
    });
  }
  return JSON.stringify({ blocks });
}

export function createMockSnapshotGenerator(): NetworkSnapshotGenerator {
  return {
    billable: false,
    model: "mock-network-snapshot",
    promptVersion: SNAPSHOT_PROMPT_VERSION,
    provider: "mock",
    async generate(input) {
      return { content: buildMockSnapshotContent(input), usage: null };
    },
  };
}
