import type { RelationshipStrength } from "../../../shared/contract/relationship-strength";
import type { RelationshipTimelineItem, RelationshipTimelineResult } from "../../../shared/contract/relationship-timeline";

// pending_initialization is display-only, not a canonical lifecycle stage.
export type OrbitContactPipelineStatus = "to_contact" | "in_progress" | "partnered" | "archived" | "pending_initialization";
export type OrbitIntroStatus = "draft" | "sent";

export interface OrbitContactView {
  company: string;
  encounters: OrbitContactEncounterView[];
  displayName: string;
  email: string;
  g: string;
  id: string;
  industry: string;
  primaryIndustryId?: string;
  secondaryIndustryId?: string;
  secondaryIndustryLabel?: string;
  /** W0045：职级（六档）、规范地区与补全来源；详情弹窗 hero 区展示与轻量编辑。 */
  seniorityLevel?: string;
  region?: { countryCode: string; city: string | null };
  enrichmentOrigins?: Partial<Record<"industry" | "seniorityLevel" | "region", "ai" | "user" | "card">>;
  initial: string;
  lineId: string;
  location?: string;
  /** 名片备注：确认名片时聚合的其他信息与合并补充，只读展示。 */
  cardNotes?: string;
  lastEventId: string;
  met: string;
  note: string;
  notes: OrbitContactNoteView[];
  offering: string;
  phone: string;
  pipelineStatus: OrbitContactPipelineStatus;
  /** 关系状态原始枚举（列表/详情适配器填充；stage 字段是本地化显示标签，不可用于判断）。 */
  relationshipStatus?: "active" | "needs_follow_up" | "nurture" | "archived";
  seeking: string;
  source: OrbitContactSource;
  stage: string;
  title: string;
  wechat: string;
  // —— 名片夹复刻新增（静态演示数据）——
  strength: OrbitContactStrength;
  valueTags: string[];
  editableTags?: { value: string; label: string }[];
  nextAction: { text: string; reason: string; evidenceId?: string } | null;
  lastInteraction: string;
  editableInteraction?: { channel: string; occurredAt: string; summary: string };
  dormant: boolean;
  /** W0046：详情弹窗「最近互动」的聚合时间线（详情页服务端读好随详情下发；示例为前端静态数据）。 */
  timeline?: RelationshipTimelineResult;
  /** W0046：「写 memo」的关联活动推荐来源——近期已报名活动日程（服务端读取，读失败为空）。 */
  memoEventOptions?: readonly { eventId: string; title: string; startsAt: string }[];
  /** W0047：关系强度（读模型缓存，详情页服务端读好；null = 还没有算出）。示例为前端静态数据。 */
  relationshipStrength?: RelationshipStrength | null;
  /** W0047：依据里不在最近 20 条时间线中的信号对应的时间线条目（按信号 id 读回，至多 12 条）。 */
  relationshipSignalItems?: readonly RelationshipTimelineItem[];
}

export type OrbitContactStrength =
  | "strong"
  | "medium"
  | "weak"
  | "dormant"
  | "unscored";
export type OrbitContactSource = "exchange" | "scan" | "manual" | "qr" | "event" | "referral" | "contact";

export interface OrbitContactNoteView {
  body: string;
  createdAt: string;
  id: string;
  privacy?: "private" | "relationship_shared";
  sourceLabel?: string;
}

export interface OrbitContactPublicProfileView {
  bio: string;
  conversationPrompts: string[];
  industry: string;
  intro: string;
  offering: string[];
  seeking: string[];
  topics: string[];
}

export interface OrbitContactEncounterView {
  context: {
    metAt: string;
    publicProfile: OrbitContactPublicProfileView;
    reason: string;
    score: number;
    tableNo: number;
  };
  createdAt: string;
  eventId: string;
  id: string;
}

export interface OrbitPipelineStatusView {
  label: string;
  value: OrbitContactPipelineStatus;
}

export interface OrbitContactEventView {
  id: string;
  name: string;
}

export interface OrbitIntroView {
  blurb: string;
  contactAId?: string;
  contactBId?: string;
  createdAt?: string;
  id: string;
  labelA: string;
  labelB: string;
  statusBadge: OrbitIntroStatus;
  updatedAt?: string;
}

export interface OrbitContactsViewModel {
  connections: OrbitContactView[];
  events: OrbitContactEventView[];
  intros: OrbitIntroView[];
  pipelineStatuses: OrbitPipelineStatusView[];
}
