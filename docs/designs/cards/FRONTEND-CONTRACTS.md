# 名片夹 · 前端函数定义与接口 (FRONTEND-CONTRACTS)

> 一份文档覆盖 5 屏新界面**全部前端相关的类型、组件 props、view-model、服务接口、API 形态、新增/扩展字段**。
> 标注：`[现有]` 真实仓库已有，直接用；`[扩展]` 在现有类型上加字段；`[新增]` 需新建。TS 语法为契约描述，落地时放入对应 `contract.ts` / `*-route-view-model.ts` / 组件文件。
> 配套：[IMPL-PLAN.md](IMPL-PLAN.md)。数据全部先 mock（mock-to-live 边界）。

---

## 0. 约定
- 页面级 view-model 命名 `Orbit*View` / `Orbit*ViewModel`，由 `*-route-view-model.ts` 产出；presenter 只吃它 + UI 回调。
- 服务接口在 `features/<m>/service.ts`，经 `service-factory.ts` 取；presenter 不直接调用。
- 所有 AI/规则推断字段带 `basis`（生成方式 + 依据 + 证据），对应 `<Basis>` 组件与 `provenance`。
- 枚举尽量复用现有：`OrbitContactPipelineStatus = 'to_contact'|'in_progress'|'partnered'`。

## 1. 公共基础类型 [新增]
```ts
// 生成方式（贯穿所有推断字段）
export type OrbitBasisKind = 'you' | 'evidence' | 'rule' | 'ai';

export interface OrbitBasis {
  kind: OrbitBasisKind;          // 用户设定 / 证据直采 / 统计规则 / AI 推断
  reason: string;                // 一句话依据（i18n 前的中文，或用 bilingual）
  evidenceIds?: readonly string[]; // 关联证据（跳详情/展开）
  editable?: boolean;            // AI 推断项是否可编辑
}

export type OrbitStrength = 'strong' | 'medium' | 'weak' | 'dormant';
export type OrbitContactSource = 'exchange' | 'scan' | 'qr' | 'event' | 'contact' | 'referral' | 'manual';
export type OrbitConfidence = 'high' | 'medium' | 'low';

export interface OrbitValueTag {
  label: string;                 // 潜在客户 / 合作伙伴 / 投资人 / 资源介绍人 …
  origin: 'ai' | 'user';         // 来源标记
  basis?: OrbitBasis;
}

export interface OrbitNextAction {
  text: string;                  // "发送合作资料"
  reason: string;                // 依据："你在沙龙承诺发资料，关系停在'已发现需求'"
  kind?: 'email' | 'meeting' | 'reactivate' | 'material' | 'greeting';
}
```

## 2. 共享组件（props / 函数签名）[新增]

### `<Basis>` — 极简可点依据图标 + 浮层（封装 `shared/ui/provenance-disclosure.tsx`）
```ts
export interface BasisProps {
  kind: OrbitBasisKind;
  reason: string;                       // bilingual 文案
  evidenceIds?: readonly string[];
  align?: 'left' | 'right' | 'below';   // 浮层方位
}
export function Basis(props: BasisProps): JSX.Element; // 图标 icon-only；hover/点击展开
```

### `<OrbitEmailComposeSheet>` — 邮件起草抽屉（邮件式，非 IM；发送前确认）
```ts
export interface OrbitEmailDraftView {
  to: string;                    // 收件人显示名
  contactId: string;
  subject: string;
  body: string;                  // AI 预填草稿
  citedElements: string[];       // 引用要素：来源活动/上次要点/待办承诺
}
export interface OrbitEmailComposeSheetProps {
  open: boolean;
  draft: OrbitEmailDraftView;
  onClose: () => void;
  onRewrite: () => void;         // AI 重写 → 拉新草稿
  onSend: () => void;            // 发送前需二次确认
}
// 数据来源：features/followups createMessageDraftGeneratorService() / app/api/message-drafts
```

### `<OrbitRelationshipMap>` — 表盘星图（半径=强度、扇区=行业、光点=联系人、大小=价值）
```ts
export interface OrbitMapNode {
  contactId: string;
  initial: string;
  gradient: string;              // g-violet …
  ring: 0 | 1 | 2 | 3;           // 核心/进行/外圈/沉睡（对应 strength）
  sector: string;                // 行业 or 价值类型（按 mode）
  value: number;                 // 0..1 → 光点大小/亮度
  key?: boolean;                 // 是否高亮关键人（核心/本周该联系）
}
export interface OrbitMapView {
  mode: 'industry' | 'value';    // 扇区含义切换
  sectors: { label: string; weight: number; hot?: boolean }[];
  rings: { key: OrbitStrength; label: string; count: number }[];
  nodes: OrbitMapNode[];         // 规模大时后端已按密度采样/仅返回关键人 + 计数
}
export interface OrbitRelationshipMapProps {
  data: OrbitMapView;
  onSectorClick?: (sector: string) => void; // drill → 筛选名片列表
  onNodeClick?: (contactId: string) => void;
  onModeChange?: (mode: 'industry' | 'value') => void;
}
```

### `<OrbitToast>` / `<OrbitBottomSheet>` [新增]
```ts
export function useOrbitToast(): { toast: (msg: string) => void };
export interface OrbitBottomSheetProps { open: boolean; title: string; onClose: () => void; children: React.ReactNode; }
```

---

## 3. 屏 01 · 名片夹主列表 (`OrbitRealCardsList`)

### view-model 扩展 [扩展 `OrbitContactView`]
```ts
export interface OrbitContactView {
  // —— 现有 [现有] ——
  id: string; displayName: string; initial: string; g: string;
  company: string; title: string; industry: string;
  email: string; phone: string; wechat: string; lineId: string;
  offering: string; seeking: string; note: string;
  notes: OrbitContactNoteView[]; encounters: OrbitContactEncounterView[];
  met: string; lastEventId: string;
  pipelineStatus: OrbitContactPipelineStatus; stage: string;
  source: OrbitContactSource;            // [扩展] 原为 'exchange'|'scan'|'manual'，加 qr/event/referral/contact
  // —— 新增 [扩展] ——
  strength: OrbitStrength;               // 关系强度（互动近度+频率+证据数）
  valueTags: OrbitValueTag[];            // 价值标签（AI/手动）
  nextAction: OrbitNextAction | null;    // 下一步动作 + 依据
  lastInteractionAt: string | null;      // ISO；"3 天前互动"
  dormant: boolean;                      // 沉睡
  needsFollowup: boolean;                // 待跟进
}
```

### 自然语言搜索 [扩展 contacts 搜索服务]
```ts
export interface OrbitContactSearchInput {
  query: string;
  stage?: OrbitContactPipelineStatus | 'all';
  tags?: string[]; strength?: OrbitStrength[];
  nlIntent?: boolean;                    // [扩展] 走自然语言解析："帮我找认识餐饮老板的人"
}
export interface OrbitContactSearchResultView {
  interpreted?: string;                  // 回显理解："行业=餐饮 且 可介绍客户"
  contacts: OrbitContactView[];
}
// service: features/contacts createContactListSearchAndFilterService().search(input)
```

### presenter props
```ts
export function OrbitRealCardsList(props: { viewModel: OrbitContactsViewModel }): JSX.Element;
// PersonCard 内部：Avatar + 姓名/公司·职位 + <SourceBadge source> + valueTags.map(<Tag>) +
//   <StrengthDot strength> + <StatusPill pipelineStatus> + nextAction 行(<Basis kind="ai">) + lastInteractionAt
```

---

## 4. 屏 02 · 卡片详情 + 连接画像 (`OrbitRealCardDetail`)

### view-model [新增 `OrbitConnectionProfileView`]（在 `OrbitContactDetailView` 内）
```ts
export type OrbitRelationshipType =
  | 'prospect' | 'partner' | 'investor' | 'hiring' | 'advisor'
  | 'connector' | 'event_partner' | 'peer' | 'social' | 'friend';

export type OrbitRelationshipStage =
  | 'to_confirm' | 'connected' | 'greeted' | 'first_talk' | 'common_ground'
  | 'need_found' | 'action_agreed' | 'meeting_booked' | 'collaborating'
  | 'collaborated' | 'stalled' | 'dormant';               // §14.4 十二阶段

export interface OrbitValueDirectionView {         // 双向价值 §14.5
  items: string[];                                 // ["AI 产品能力", "试点合作机会"]
  basis: OrbitBasis;                               // AI 推断·可编辑
}
export interface OrbitTimelineEventView {          // 带证据的互动时间线
  id: string; at: string; body: string;
  evidenceId: string;                              // 每条挂证据
}
export interface OrbitConnectionProfileView {
  connectionId: string;
  relationshipType: OrbitRelationshipType;
  stage: OrbitRelationshipStage;                   // 进度条当前步
  stageRationale: string;                          // 阶段依据（可解释，DESIGN 约束）
  stageBasis: OrbitBasis;
  valueAToB: OrbitValueDirectionView;              // 我 → 对方
  valueBToA: OrbitValueDirectionView;              // 对方 → 我
  timeline: OrbitTimelineEventView[];
  nextAction: OrbitNextAction | null;
  highValue: boolean; dormant: boolean; needsFollowup: boolean;
}
export interface OrbitContactDetailView {
  contact: OrbitContactView;                       // 复用主列表字段
  profile: OrbitConnectionProfileView;             // [新增]
}
```

### service [现有 connections + 扩展]
```ts
// features/connections service-factory：
createConnectionAndEvidenceService().getConnection(id) / getTimeline(id)   // [现有]
createRelationshipStageAndProfileService().getStageAndProfile(id)          // [现有]
  → 扩展返回 valueAToB/valueBToA（可由 analysis 价值评分组装） [扩展]
// 阶段变更：changeStage({id, to, rationale, evidenceIds}) 必带 rationale+evidence
```

### presenter props
```ts
export function OrbitRealCardDetail(props: {
  viewModel: OrbitContactDetailView;
  onDraftEmail: () => void;      // 打开 <OrbitEmailComposeSheet>
}): JSX.Element;
```

---

## 5. 屏 03 · 人脉表盘 (`/home/cards/dashboard`)

### view-model [新增 `OrbitRelationshipDashboardView`]
```ts
export interface OrbitDashboardStat {
  key: 'total'|'core'|'highValue'|'newThisMonth'|'needsFollowup'|'dormant'|'active30d';
  value: number; deltaLabel?: string; deltaDir?: 'up'|'down';
  basis: OrbitBasis;             // "如何判定"
}
export interface OrbitDistributionRow { label: string; count: number; hot?: boolean; }
export interface OrbitDonutSlice { key: string; label: string; count: number; percent: number; color: string; }
export interface OrbitStrengthSplit { strong: number; medium: number; weak: number; pending: number; dormant: number; }
export interface OrbitOpportunity {           // 本周行动队列
  contactId: string; name: string; initial: string; gradient: string;
  reason: string; basis: OrbitBasis;
  action: OrbitNextAction;                     // 起草邮件/约会议/重新激活
}
export interface OrbitNetworkGapView {
  goalLabel: string; goalBasis: OrbitBasis;    // 回指 profile.currentGoal
  message: string;                             // "餐饮人脉仅 7%（9/128）"
  suggestions: string[];                       // 餐饮经营者/本地商户/主办方
}
export interface OrbitRelationshipDashboardView {
  goal: { label: string; setAt: string; profileHref: string; basis: OrbitBasis };
  overview: OrbitDashboardStat[];
  industry: OrbitDistributionRow[];            // §15.2.2 依据=contact.industry
  valueTypes: OrbitDonutSlice[];               // §15.2.3 依据=价值评分 §16
  strength: OrbitStrengthSplit;                // §15.2.4
  opportunities: OrbitOpportunity[];           // §15.2.5
  gaps: OrbitNetworkGapView;                   // §15.2.6
  map: OrbitMapView;                           // 星图
}
```

### service / API
```ts
// [新增] createRelationshipDashboardService().getDashboard(input): OrbitRelationshipDashboardResult
export interface OrbitDashboardInput { userId: string; goalContext: string; mode?: 'industry'|'value'; }
// 复用现有 API：
//   GET /api/dashboard/summary        → overview
//   GET /api/dashboard/distributions  → industry + valueTypes + strength
//   GET /api/dashboard/opportunities  → opportunities
//   GET /api/dashboard/network-gaps   → gaps
//   （map 由后端从 strength+industry+value 聚合，规模大时密度采样）
```

### presenter props
```ts
export function OrbitRealCardsDashboard(props: {
  viewModel: OrbitRelationshipDashboardView;
  onDrill: (filter: { by: 'strength'|'industry'|'value'; key: string }) => void; // → /home/cards 筛选
  onDraftEmail: (contactId: string) => void;
  onMode: (mode: 'industry'|'value') => void;
}): JSX.Element;
```

---

## 6. 屏 04 · 导入 + 名片复核 (`contacts/new`, `OrbitRealCardsScan`)

### service [现有 `features/acquisition`，直接接]
```ts
// createBusinessCardScanOcrService().scanBusinessCard(input): BusinessCardScanOcrResult   [现有]
// createBusinessCardReviewService():                                                       [现有]
interface BusinessCardReviewService {
  getReviewDraft(input: { draftId: string; scenario?: string }): BusinessCardReviewResult;
  updateReviewDraft(input: { draftId: string; reviewedFields?: Partial<BusinessCardReviewedFields>; reviewerLabel?: string }): BusinessCardReviewResult;
  confirmReviewedDraft(input: { draftId: string; actorLabel?: string }): BusinessCardReviewConfirmationResult;
}
// BusinessCardReviewDraft / BusinessCardReviewField{reviewState:'needs_review'|'accepted'|'edited', confidence:'high'|'medium'|'low', evidenceId} 均已在 business-card-review-contract.ts 定义 [现有]
```

### view-model [新增 `OrbitCardReviewView`]（把合约 DTO 映射成 render-neutral）
```ts
export type OrbitReviewFieldKey = 'displayName'|'role'|'organization'|'email'|'phone';
export interface OrbitReviewRowView {
  key: OrbitReviewFieldKey; label: string;
  value: string;                         // OCR 原值 / 当前值
  confidence: OrbitConfidence;           // 圆点颜色
  state: 'needs_review' | 'accepted' | 'edited';
  evidenceId: string;
}
export interface OrbitImportSourceView {
  key: 'scan'|'qr'|'event'|'contact'|'referral';
  title: string; desc: string; trust: 'high'|'medium'|'low'; selected: boolean;
}
export interface OrbitCardReviewView {
  scanState: 'success' | 'empty' | 'pending' | 'failure';
  ocr: { displayName: string; role: string; organization: string; provenanceLabel: string };
  rows: OrbitReviewRowView[];
  relationshipContext: string;
  suggestedNextAction: string;
  confirmation: { state: 'pending' | 'confirmed'; question: string; blockedReason?: string };
  contactWriteExecuted: false;           // 确认前不写库（UI 明示）
  sources: OrbitImportSourceView[];
}
```

### presenter props
```ts
export function OrbitRealCardsScan(props: {
  viewModel: OrbitCardReviewView;
  onAccept: (key: OrbitReviewFieldKey) => void;
  onEdit: (key: OrbitReviewFieldKey, value: string) => void;
  onConfirm: () => void;                 // pending 前禁用
  onSaveDraft: () => void;
  onPickSource: (key: OrbitImportSourceView['key']) => void;
}): JSX.Element;
// 复核行用 .rev 行式（去 AI 感）：字段名 · 置信度圆点 · 内联可编辑 · <Basis kind="evidence"> · 已确认/待确认
```

---

## 7. 屏 05 · 跟进管线 + 活动后整理 (`OrbitRealCardsPipeline` + after-event)

### 跟进任务 [现有 `features/followups`]
```ts
// FollowupTask{ taskId, title, triggerKind:'new_connection'|'event_encounter'|'promised_action'|'dormant_relationship',
//   priority:'today'|'this_week'|'nurture', dueInDays, connectionId, contactName, organization,
//   recommendedAction, rationale, source, evidenceIds }   [现有]
// createFollowupTaskGenerationService().list(input) / generate(input)   [现有]
// createMessageDraftGeneratorService()（起草邮件）                        [现有]
```

### 管线 view-model [扩展]
```ts
export interface OrbitPipelineCardView {
  contact: Pick<OrbitContactView,'id'|'displayName'|'initial'|'g'|'company'|'source'>;
  status: OrbitContactPipelineStatus;
  task: {                                // 来自 FollowupTask
    type: 'greeting'|'send_material'|'schedule'|'reactivate';
    dueLabel: string; priority: 'high'|'medium'|'low';
  };
  nextAction: OrbitNextAction;           // 带依据
}
export interface OrbitPipelineView {
  columns: { status: OrbitContactPipelineStatus; label: string; cards: OrbitPipelineCardView[] }[];
  reminders: OrbitReminderView[];        // §12.5
}
export interface OrbitReminderView {
  id: string; icon: 'mail'|'calendar'|'alert'; text: string;
  basis: OrbitBasis; subLabel: string;
}
```

### 活动后整理 view-model [新增 `OrbitAfterEventView`]
```ts
export interface OrbitTriageQueueItem {
  contactId: string; name: string; initial: string; gradient: string;
  source: OrbitContactSource; statusLabel: string;
  triaged: boolean;                      // 待整理/已整理
}
export interface OrbitTriageCardView {   // 当前逐位整理卡
  contactId: string; name: string; org: string; initial: string; gradient: string;
  index: number; total: number;         // 1 / 5 + 上一位/下一位
  sourceContext: { text: string; basis: OrbitBasis };          // 来源上下文（只读）
  suggestedTags: OrbitValueTag[];                              // 建议标签（可编辑）
  summaryMemo: string;                                         // 交流摘要（存入连接画像）
  summaryDestinationNote: string;                             // "存入 TA 的连接画像时间线"
}
export interface OrbitAfterEventView {
  eventId: string; eventName: string;
  newCount: number; toTriage: number;
  queue: OrbitTriageQueueItem[];
  current: OrbitTriageCardView;
}
```

### presenter props
```ts
export function OrbitRealCardsPipeline(props: {
  viewModel: OrbitPipelineView;
  afterEvent: OrbitAfterEventView;
  onSelectTriage: (contactId: string) => void;   // 切换逐位整理
  onSaveSummary: (contactId: string, memo: string) => void; // 存入连接画像
  onDraftEmail: (contactId: string) => void;      // 个性化邮件（一人一封，非群发）
  onSetReminder: (contactId: string) => void;
  onBatchDraft: () => void;                        // "为全部各起草一封"（逐封确认）
}): JSX.Element;
```

---

## 8. API 端点一览
| 端点 | 方法 | 用途 | 状态 |
|---|---|---|---|
| `/api/contacts` | GET | 名片列表 + 扩展字段 | 扩展 envelope |
| `/api/contacts/search` | POST | 自然语言搜索 | [扩展] |
| `/api/contacts/[id]` | GET | 详情 + 连接画像 | 扩展 |
| `/api/connections/*` | GET | evidence/timeline/stage-profile/双向价值 | [现有]+扩展 |
| `/api/dashboard/{summary,distributions,opportunities,network-gaps}` | GET | 表盘聚合 | [现有] |
| `/api/contact-drafts` · `/api/confirmations` | POST | 名片复核/确认入库 | [现有] |
| `/api/message-drafts` · `/api/message-drafts/[id]` | GET/POST | 邮件草稿 | [现有] |
| `/api/tasks`（followups） | GET/POST | 跟进任务/提醒 | [现有] |

所有 envelope 覆盖 `success / empty / pending / failure` 四态；mock 断言无外部调用；确认入库/发送邮件保留「确认前不写库 / 发送前确认」保证。
