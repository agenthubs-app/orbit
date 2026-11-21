// Agent 第一版的新入口（agent-design AG01，设计稿 §3.7、§7、附录 D）。
// 协议版本 3：发送只负责落库、去重、应答，返回 requestId 和委托状态；
// 结果文档按 requestId 持久保存，两端用同一个查询读；实时通道只是它的另一种读法。
// 本文件只增不删（scripts/contract-snapshot.mjs）。后续 sprint 新增字段一律写成可选。

import type {
  AiPageContextContract,
  AiSessionOriginInputContract,
  AiSessionReferenceContract,
} from "./ai-sessions";

export type AgentProtocolVersion = 3;

/** 委托状态（设计稿 §7）。queued：前面还有一轮；waiting_user：有追问或卡在等用户。 */
export type AgentRequestStatus =
  | "queued"
  | "running"
  | "waiting_user"
  | "completed"
  | "failed"
  | "cancelled";

/** 子目标状态（设计稿附录 D）。 */
export type AgentPartStatus =
  | "answered"
  | "awaiting_clarification"
  | "awaiting_confirmation"
  | "awaiting_acceptance"
  | "suggested_external"
  | "waiting_dependency"
  | "declined"
  | "unfinished"
  | "failed";

/** AG03：子目标的承接结论与去向（设计稿附录 A），由服务端代码决定。 */
export type AgentPartVerdict = "accept" | "convert" | "decline";
export type AgentPartRoute =
  | "answer"
  | "read"
  | "probe"
  | "web_lookup"
  | "propose_write"
  | "offer_alternative"
  | "suggest_external_agent"
  | "explain_limit"
  | "clarify";
export type AgentPartWaitReason =
  | "object_ambiguous"
  | "permission_missing"
  | "dependency_pending"
  | "service_unavailable"
  | "awaiting_acceptance"
  | "awaiting_external_result";

export interface AgentPartResult {
  partId: string;
  status: AgentPartStatus;
  operationId?: string | undefined;
  /** AG03：这个子目标在本轮原话里对应的那一段（用户自己的话）。 */
  sourceQuote?: string | undefined;
  verdict?: AgentPartVerdict | undefined;
  route?: AgentPartRoute | undefined;
  waitReason?: AgentPartWaitReason | undefined;
  /** AG03：子目标停在这个状态的原因代码，如 not_in_this_version、budget、dependency_pending。 */
  reason?: string | undefined;
  /**
   * AG05：读取没有给全的地方（设计稿附录 C gaps）。no_record 查到零条；partial 有一部分读不到；
   * unreadable 引用的记录打不开；service_error 读取出错（不代表没有记录）。
   */
  gaps?: readonly AgentPartGap[] | undefined;
  /** AG05：读了多少（每类记录：翻了几页、看了几条、一共几条）。 */
  coverage?: readonly AgentPartCoverage[] | undefined;
}

/** AG05：缺口原因，取设计稿附录 C 的值。 */
export type AgentPartGap = "no_record" | "partial" | "unreadable" | "conflict" | "service_error" | "budget";

export interface AgentPartCoverage {
  kind: string;
  pagesRead: number;
  seen: number;
  total?: number | undefined;
  complete: boolean;
}

/**
 * AG05：协议 3 的消息引用，六类（设计稿 §3.6、附录 E）。旧的 note 视同 memo 继续可读。
 * 句中位置在 AG11。服务端逐条授权，引用不授予修改权。
 */
export type AgentReferenceType = AiSessionReferenceContract["type"];

/** AG11：句中位置（start、end）与活动种类（eventKind）作为可选字段加在 AiSessionReferenceContract 上，只随协议 3 发送。 */
export type AgentReferenceContract = AiSessionReferenceContract;

/** AG11：选择器的六类（「我去过」即 attendance）。 */
export type AgentReferenceSearchKind = "contact" | "memo" | "todo" | "schedule" | "event" | "attendance";

/**
 * AG11：选择器里的一条记录。detail 是同名时用来区分的信息，由两端按 shared/compute/agent-references.ts 写成一行：
 * 联系人写公司和职位，笔记写相关的人和日期，待办写截止日，日程和活动写时间（活动加地点），我去过写日期。
 */
export interface AgentReferenceCandidateContract {
  type: AgentReferenceSearchKind;
  id: string;
  name: string;
  eventKind?: "platform" | "private" | undefined;
  detail: {
    company?: string | undefined;
    role?: string | undefined;
    people?: readonly string[] | undefined;
    /** ISO 时刻或 YYYY-MM-DD。 */
    date?: string | undefined;
    dateKind?: "due" | "at" | "on" | "written" | undefined;
    place?: string | undefined;
  };
}

/** AG11：GET /api/agent/references/search 的结果。只查本人的记录；每类最多 limit 条，more 表示还有。 */
export interface AgentReferenceSearchResultContract {
  query: string;
  /** unavailable：这一类这次没读成（不是没有），两端照实说。 */
  groups: readonly { type: AgentReferenceSearchKind; items: readonly AgentReferenceCandidateContract[]; more: boolean; unavailable?: boolean | undefined }[];
}

/** AG11：POST /api/agent/references/check：已选的引用现在还打不打得开（草稿恢复、发送前用）。 */
export interface AgentReferenceCheckResultContract {
  references: readonly { type: AgentReferenceSearchKind; id: string; accessible: boolean; name: string | null }[];
}

export interface AgentAnswerContract {
  text: string;
  sourceRefs: readonly string[];
  /** AG07：回答开头的依据行和可点开的记录（获批视觉稿「按你 11 月 12 日记的笔记回答 打开 ›」），由服务端代码写。 */
  basis?: AgentAnswerBasisContract | undefined;
  /** AG07：text 里代表确认卡的那一段（代码按冻结的预览写的）。显示卡片的客户端从正文里去掉这一段，只显示卡。 */
  cardLine?: string | undefined;
  /** AG09：这一轮实际发出的检索词和打开的网页（设计稿 §3.4“实际发出的检索词和打开的网页显示在回答旁边”），由服务端代码写。 */
  web?: AgentWebResultContract | undefined;
  /** AG19：回答按块排好的版本（段落、要点、记录卡片、说明条），由服务端代码写；text 仍是完整的文字版，旧端只读 text。 */
  blocks?: readonly AgentAnswerBlockContract[] | undefined;
  /** AG14：回答开头记忆的小标签（获批视觉稿第 5 组）；没用到记忆时没有。 */
  memoryUse?: readonly AgentAnswerMemoryUseContract[] | undefined;
}

/** AG09：联网的记录。被拦下的检索词不在这里（只按规则编号记在服务端）。 */
export interface AgentWebResultContract {
  /** 实际发给搜索供应商的检索词，原样。 */
  queries: readonly { text: string; sentAt: string; provider: "deepseek" }[];
  /** 这一轮打开（或试着打开）的网页：sourceRef, url, title, snippet|excerpt, sourceDate?, fetchedAt, readStatus。 */
  pages: readonly AgentWebPageContract[];
}

export interface AgentWebPageContract {
  sourceRef: string;
  url: string;
  title: string;
  /** 正文的开头一段（读到时）；没读到时为搜索结果的摘要或空。 */
  excerpt: string;
  sourceDate?: string | undefined;
  fetchedAt: string;
  readStatus: "ok" | "empty" | "timeout" | "provider_error";
}

export interface AgentAnswerBasisContract {
  /** 一句话说按什么答的，按回答的语言。 */
  text: string;
  /** 回答引用的记录，每条一个可点的入口；只列这一轮读到、核对过的记录。 */
  links: readonly AgentAnswerLinkContract[];
}

export interface AgentAnswerLinkContract {
  type: "memo" | "todo" | "schedule" | "contact" | "event";
  id: string;
  /** 入口上的字，如「11 月 12 日的笔记」。 */
  label: string;
  /** 笔记的第一位相关联系人（网页在联系人页上打开笔记）。 */
  contactId?: string | undefined;
}

/** 这一轮怎么结束的：用户停止，或处理失败的原因（错误码沿用 shared/errors，细分原因在 reason）。 */
export interface AgentRequestEndingContract {
  kind: "stopped_by_user" | "failed";
  at: string;
  reason?: string | undefined;
}

/**
 * 一次委托的结果文档。随处理推进逐项填入；revision 每次变化加一。
 * 只有这里写进去的内容算已交付，只在实时通道里出现过的不算。
 */
export interface AgentResultDocument {
  schemaVersion: 1;
  requestId: string;
  sessionId: string;
  status: AgentRequestStatus;
  revision: number;
  answer: AgentAnswerContract | null;
  partResults: readonly AgentPartResult[];
  ending?: AgentRequestEndingContract | undefined;
  updatedAt: string;
  /** AG02：这一轮出的确认卡（设计稿 §5.1 的 actionPreview）。两端只按它渲染，不自己拼字段。 */
  actionPreview?: AgentActionPreviewContract | undefined;
  /** AG04：这一轮给出的可点方向（追问的候选、没看懂时的方向、附带的入口）。两端照它显示，不自己编选项。 */
  clarifications?: readonly AgentClarificationContract[] | undefined;
}

/** AG04：一个可点的方向（设计稿 §3.11）。文字由服务端代码写；capability 都在附录 A 的能力清单里。 */
export interface AgentClarificationOptionContract {
  optionId: string;
  label: string;
  capability: string;
  /** 这个方向指向的记录（如追问“她”是谁时的候选人）。 */
  ref?: { type: string; id: string; name: string } | undefined;
}

/**
 * AG04：一组可点的方向。
 * question：要改记录却缺一项、或几种读法里有要写入的，问一句；not_understood：读不出要做什么；
 * entry：附带的入口（陈述后的“要记下来吗”、其余读法、接受替代方案），点了才算提出。
 */
export type AgentClarificationKind = "question" | "not_understood" | "entry";

export interface AgentClarificationContract {
  clarificationId: string;
  partId: string;
  kind: AgentClarificationKind;
  /** question 问的是什么：缺的对象，还是几种读法选哪一种。 */
  asks?: "object" | "reading" | undefined;
  options: readonly AgentClarificationOptionContract[];
  /** open：还能点；answered：点选或用文字回答过；shelved：用户没理会，已放下。 */
  state: "open" | "answered" | "shelved";
  selectedOptionId?: string | undefined;
  /** 用文字回答时，回答所在的那条消息的 requestId。 */
  answeredBy?: string | undefined;
}

/**
 * AG04：在可点方向下点选（POST /api/ai/conversations，protocolVersion 3，带 selection）。
 * 点选先落库、按会话顺序处理，接回原来那次委托，不产生新委托。
 */
export interface AgentSelectionInputContract {
  protocolVersion: AgentProtocolVersion;
  sessionId: string;
  /** 点选的去重键：同一次点击重发时不变。 */
  clientSelectionId: string;
  selection: { requestId: string; clarificationId: string; optionId: string };
}

/** 点选的应答。拒收（所选不在当时给出的候选里、这组方向已关闭）返回 409，error.context.reason 写明原因。 */
export interface AgentSelectionReceiptContract {
  protocolVersion: AgentProtocolVersion;
  requestId: string;
  sessionId: string;
  clientSelectionId: string;
  clarificationId: string;
  optionId: string;
  status: AgentRequestStatus;
  replayed: boolean;
  acceptedAt: string;
}

/** 卡片状态（设计稿附录 D）：沿用账本的十种，新增 expired。 */
export type AgentCardStatus =
  | "awaiting_confirmation"
  | "deferred"
  | "approved"
  | "executing"
  | "completed"
  | "partially_failed"
  | "failed"
  | "rejected"
  | "canceled"
  | "undone"
  | "expired";

/** 逐项回执（设计稿附录 D）。needs_review、user_confirmed、abandoned 是 AG02 新增的。 */
export type AgentCardOperationStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "skipped"
  | "undone"
  | "needs_review"
  | "user_confirmed"
  | "abandoned";

/** 卡片出新版时，标出变化的一行：卡上原来显示的值、现在的值、要改成的值。 */
export interface AgentCardChangeContract {
  operationId: string;
  field: string;
  shownBefore: unknown;
  now: unknown;
  to?: unknown;
}

export interface AgentCardOperationPreviewContract {
  operationId: string;
  partId?: string | undefined;
  /** 操作目录里的名字，如 todo.create、todo.update。 */
  capability: string;
  target?: { collection: string; id: string } | undefined;
  before?: Readonly<Record<string, unknown>> | undefined;
  after: Readonly<Record<string, unknown>>;
  /** 卡上用来认出对象的内容，如标题。 */
  shown?: Readonly<Record<string, unknown>> | undefined;
  dependsOn?: readonly string[] | undefined;
  /** 用户读到的一行字，按卡片的语言，日期带星期。 */
  text: string;
  status: AgentCardOperationStatus;
  /** AG07：卡上这一项怎么显示（获批视觉稿）。全部由服务端代码按卡片语言写好并冻结；AG07 之前冻结的卡没有它。 */
  display?: AgentCardOperationDisplayContract | undefined;
  /** AG13：这一项执行后没做成时服务端写的原因（按卡片语言），如「活动没有删：待办「约山本吃饭」还关联着它」。 */
  outcome?: string | undefined;
}

/** AG07：卡上一项的显示内容。两端照它显示，只按 change 选「改」「新增」这类固定词，不自己拼日期和差异。 */
export interface AgentCardOperationDisplayContract {
  /** update：改一条已有记录；create：新增一条；AG12：delete 删除一条（可恢复的写在 note）、restore 恢复原来那一条。 */
  change: "update" | "create" | "delete" | "restore";
  /** 记录的叫法加名字，如 待办「给小林发修订报价」。 */
  record: string;
  rows: readonly AgentCardDisplayRowContract[];
  /** 这一项要等前面某项成功才执行时的说明，如「第 1 项成功后才执行」。 */
  note?: string | undefined;
  /**
   * AG15（获批视觉稿 15-1，用户要求精简）：新建定时任务的卡在卡上只显示三行「什么时候」「挑什么」「之后」，每行由服务端
   * 把 rows 里的几项拼成一句；rows 照旧逐项分开（冻结的事实不变）。zone：任务的时区与这台设备不同时，改用 zone.text。
   */
  lines?: readonly AgentCardDisplayLineContract[] | undefined;
}

/** AG15：卡上合并显示的一行。fields 是它合并的 rows 的字段名。 */
export interface AgentCardDisplayLineContract {
  key: "when" | "pick" | "after";
  label: string;
  text: string;
  fields: readonly string[];
  zone?: { id: string; text: string } | undefined;
}

export interface AgentCardDisplayRowContract {
  /** 字段名（plannedDate、interaction.occurredOn…），只用来和 changes 对上，不显示。 */
  field: string;
  label: string;
  /** 原值，只有改已有记录时才有。 */
  before?: string | undefined;
  after: string;
  /** AG14（D1）：原来的和改成的左右两栏并排（记忆的内容）；没有时照旧一行「旧 → 新」。 */
  sideBySide?: boolean | undefined;
}

/** 一张卡的当前版（GET /api/agent/ledger/[id] 与结果文档的 actionPreview 同一形状）。 */
export interface AgentActionPreviewContract {
  actionId: string;
  revision: number;
  /** 决定接口要原样带回的哈希。 */
  payloadHash: string;
  status: AgentCardStatus;
  expiresAt?: string | undefined;
  /** AG15：卡片过期的原因。superseded 表示同一条定时任务的下一期出了新卡，这张被取代；不写表示放得太久。 */
  expiredReason?: "superseded" | undefined;
  /** AG15（D15-5、D15-6）：过期的卡下面那一行小字，服务端按卡片语言写好（哪天出的、什么都没做；或哪一期出了新卡）。 */
  expiredNote?: string | undefined;
  /** AG15（D15-6）：取代这张卡的新卡和它那一期的触发时刻。 */
  supersededBy?: { actionId: string; firedAt: string } | undefined;
  origin?:
    | { kind: "conversation"; conversationId: string; requestId: string }
    | { kind: "automation"; ruleId: string; firedAt: string }
    | { kind: "connection"; connectionId: string; externalRequestKey: string }
    | undefined;
  title: string;
  /** AG07：卡片冻结时用的语言；卡上的固定词（按钮、状态）也用它，两端因此逐字相同。 */
  locale?: "zh" | "ja" | "en" | undefined;
  /** 每项一行，合起来就是卡上的文字。 */
  summary: string;
  operations: readonly AgentCardOperationPreviewContract[];
  /** 最近一次因数据变化出新版时的差异。 */
  changes?: readonly AgentCardChangeContract[] | undefined;
  /** 旧版的编号和哈希（旧版载荷保留在服务端）。 */
  revisions: readonly { revision: number; payloadHash: string }[];
  updatedAt: string;
}

/** POST /api/agent/ledger/[id]/transition 的按钮决定（设计稿 §5.1）。可执行的字段一律由服务端重新读取。 */
export interface AgentCardDecisionInputContract {
  transition: "confirm" | "reject" | "retry" | "mark_done" | "abandon";
  revision: number;
  payloadHash: string;
  clientDecisionId: string;
  /** 处理待核对项时必带。 */
  operationId?: string | undefined;
}

export interface AgentCardDecisionResultContract {
  decisionId: string;
  clientDecisionId: string;
  actionId: string;
  decision: AgentCardDecisionInputContract["transition"];
  operationId?: string | undefined;
  outcome: "accepted" | "already_decided" | "refused";
  /** 这次是否产生了一个新的、被接受的决定。 */
  accepted: boolean;
  /** 同一个 clientDecisionId 重发：返回第一次的结果。 */
  replayed: boolean;
  /** 被拒的原因：CARD_REVISION_CHANGED、CARD_CONTENT_CHANGED、CARD_EXPIRED、CARD_CLOSED、OPERATION_NOT_IN_REVIEW；AG18 加 PROPOSALS_PAUSED（回退开关 ORBIT_AGENT_V1_PROPOSALS=paused 时，什么都不执行）。旧接口（旧草稿卡、旧待办页的接受）在新入口打开后拒收时 error.context.reason 为 CONFIRM_ON_NEW_CLIENT。 */
  reason?: string | undefined;
  message: string;
  revision: number;
  changes?: readonly AgentCardChangeContract[] | undefined;
  decidedAt: string;
}

/** POST /api/ai/conversations，protocolVersion 3。requestId 由服务端按会话与客户端消息键生成。 */
export interface AgentSendInputContract {
  protocolVersion: AgentProtocolVersion;
  sessionId: string;
  /** 客户端消息键：同一条消息超时重发时不变，服务端据此去重。 */
  clientMessageId: string;
  locale: "en" | "ja" | "zh";
  message: string;
  /** AG05：六类引用（AiSessionReferenceType 加了 memo、todo、schedule、attendance）；旧的 note 视同 memo。 */
  references: readonly AiSessionReferenceContract[];
  origin?: AiSessionOriginInputContract | undefined;
  pageContext?: AiPageContextContract | undefined;
  /** AG20a（设计稿 §3.1，2026-11-20 决定 8）：设备的时区（IANA 名，如 Asia/Tokyo）。服务端校验后作为本轮「今天」「周五」「下午三点」的基准；不带或无效时用部署的时区。 */
  timeZone?: string | undefined;
}

/** 发送的应答：收下即返回，不等模型。 */
export interface AgentSendReceiptContract {
  protocolVersion: AgentProtocolVersion;
  requestId: string;
  sessionId: string;
  clientMessageId: string;
  status: AgentRequestStatus;
  /** 服务端在这个会话里的接收顺序，从 1 起。 */
  receivedSeq: number;
  /** 这次是同一条消息的重发，返回的是原来那次委托。 */
  replayed: boolean;
  acceptedAt: string;
}

export type AgentSessionEventKind = "accepted" | "status" | "document";

/** AG07：处理中走到哪一步（获批视觉稿「正在查你的笔记 → 正在读网页 → 正在整理回答」），由代码按步骤给出。 */
export type AgentRunStage = "reading" | "web" | "composing";

/** 实时通道的一条事件。seq 在会话内递增；重连带上最后收到的 seq，服务端只推其后的。 */
export interface AgentSessionEventContract {
  seq: number;
  sessionId: string;
  requestId: string;
  kind: AgentSessionEventKind;
  status: AgentRequestStatus;
  at: string;
  /** kind 为 document 时带上这一版结果文档。 */
  document?: AgentResultDocument | undefined;
  /** AG07：处理中的一步（kind 为 status、status 为 running 时可有）。只是进度，不算交付。 */
  stage?: AgentRunStage | undefined;
}

/** GET /api/ai/conversations/sessions/[id]/events 的 JSON 读法（不用事件流时）。 */
export interface AgentSessionEventsPageContract {
  sessionId: string;
  events: readonly AgentSessionEventContract[];
  /** 本页最后一条的 seq；没有新事件时等于请求里的 after。 */
  lastSeq: number;
}

/** 停止当前这一轮的应答（POST /api/ai/runs/[requestId]/transition）。 */
export interface AgentCancelResultContract {
  requestId: string;
  /** 这次请求是否改变了状态；已结束的委托返回 false 和它原来的结果。 */
  changed: boolean;
  document: AgentResultDocument;
}

/* ── AG13：私人活动、我去过（参会自述）、活动引用 ─────────────────────────── */

/**
 * AG13（设计稿附录 E「活动引用」）：指向一场活动。platform 是平台活动（普通用户不可改），private 是用户自己建的私人活动，
 * 只有本人能看到。卡上引用本卡第 n 项新建的活动时先写 localCreateRef: n（从 1 起），执行到它时由服务端换成正式编号。
 */
export type EventRefContract =
  | { kind: "platform"; id: string }
  | { kind: "private"; id: string };

export interface PrivateEventContract {
  id: string;
  accountId: string;
  title: string;
  startsAt: string;
  endsAt?: string | undefined;
  /** AG20a（设计稿附录 E `allDay?`）：只说了哪天、没说几点；startsAt 是那天 0 点（按用户时区），显示时只写日期。 */
  allDay?: boolean | undefined;
  venue?: string | undefined;
  notes?: string | undefined;
  /** 每次写入加一。 */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** 一天里的时段（「晚上」「下午」），只用来显示用户自己说的时间。 */
export type AttendanceDayPart = "morning" | "noon" | "afternoon" | "evening" | "night";

/** AG13：用户自己记的「我去过」。和主办方的签到、报名分开存，谁也不替谁写；同一账号同一场活动只有一条。 */
export interface AttendanceNoteContract {
  id: string;
  accountId: string;
  eventRef: EventRefContract;
  /** 本地日期 YYYY-MM-DD。 */
  attendedOn: string;
  dayParts?: readonly AttendanceDayPart[] | undefined;
  /** 用户自己的一句话。 */
  selfNote?: string | undefined;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/* ── AG14：个人记忆（设计稿 §6、附录 E）。设置页与对话读写的是同一批条目：规范账号加工作区。 ── */

/** 约束（constraint）是「一直遵守的」，其余三类是「酌情参考的」。 */
export type AgentMemoryCategoryContract = "identity" | "goal" | "preference" | "constraint";

/** 条目用在哪类任务上；`all` 是所有回答。没有任何一项的旧条目是「还没归类」。 */
export type AgentMemoryTaskContract = "all" | "event.recommend" | "contact.recommend" | "memo.summarize" | "todo.plan" | "schedule.plan";

/** 代码可以拿来排序或筛选的值；和正文出自同一份冻结的卡片载荷。 */
export interface AgentMemoryStructuredContract {
  preferredDays?: readonly ("Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun")[] | undefined;
  dayPart?: "morning" | "afternoon" | "evening" | undefined;
  strength?: "prefer" | "only" | "avoid" | undefined;
  topics?: readonly string[] | undefined;
  replyLanguage?: "zh" | "ja" | "en" | undefined;
}

/** 一条在用的记忆。删掉的条目不在任何列表里（只留删除标记，没有正文）。 */
export interface AgentMemoryEntryContract {
  memoryId: string;
  category: AgentMemoryCategoryContract;
  content: string;
  /** manual：用户在设置页自己写的；conversation：对话里出卡、点了确认才保存的。 */
  source: "manual" | "conversation";
  createdAt: string;
  updatedAt: string;
  /** 新建为 1，每改一次加一；修改和删除带上它，条目已经变了就返回 409。 */
  revision: number;
  status: "active" | "deleted";
  appliesTo: readonly AgentMemoryTaskContract[];
  structured: AgentMemoryStructuredContract | null;
  /** 本地日期 YYYY-MM-DD，含当天；null 表示不限。到期日是 validUntil。 */
  validFrom: string | null;
  validUntil: string | null;
  sourceMessageRef: string | null;
  deletedAt?: string | null | undefined;
}

/** 两个开关：enabled 是「回答时参考这些」，allowConversationLearning 是「从对话里记住新的（会先问你）」。 */
export interface AgentMemorySettingsContract {
  enabled: boolean;
  allowConversationLearning: boolean;
  updatedAt: string;
}

/** GET /api/agent/memory。memoryVersion 随每次新增、修改、删除前进。 */
export interface AgentMemoryListContract {
  memories: readonly AgentMemoryEntryContract[];
  settings: AgentMemorySettingsContract;
  memoryVersion: number;
  /** 「一直遵守的」每次最多加载多少条（20）；超过时管理页提示合并，多出的不会被用到。 */
  ruleLimit?: number | undefined;
}

/** POST /api/agent/memory 的请求体（设置页上用户自己添加，不出卡）。 */
export interface AgentMemoryCreateInputContract {
  category: AgentMemoryCategoryContract;
  content: string;
  appliesTo?: readonly AgentMemoryTaskContract[] | undefined;
  structured?: AgentMemoryStructuredContract | null | undefined;
  validFrom?: string | null | undefined;
  validUntil?: string | null | undefined;
}

/** PATCH /api/agent/memory/[id] 的请求体；至少改一项。删除是 DELETE /api/agent/memory/[id]?expectedRevision=n。 */
export interface AgentMemoryUpdateInputContract {
  category?: AgentMemoryCategoryContract | undefined;
  content?: string | undefined;
  appliesTo?: readonly AgentMemoryTaskContract[] | undefined;
  structured?: AgentMemoryStructuredContract | null | undefined;
  validFrom?: string | null | undefined;
  validUntil?: string | null | undefined;
  expectedRevision?: number | undefined;
}

/** PATCH /api/agent/memory/settings 的请求体。 */
export interface AgentMemorySettingsInputContract {
  enabled?: boolean | undefined;
  allowConversationLearning?: boolean | undefined;
}

/* ── AG19：回答排版与记录卡片（获批视觉稿 2026-11-19，D1–D6）──────────────── */

/** AG19：回答里一条记录的种类（「我去过」即 attendance）。 */
export type AgentAnswerRecordKind = "event" | "contact" | "todo" | "memo" | "schedule" | "attendance";

/**
 * AG19：回答里的一张记录卡片。上行、名字、下行都由服务端按回答的语言写好（日期带星期）；
 * 两端只按 kind 选图标和去处，不自己拼日期，也不另读记录。
 */
export interface AgentAnswerRecordContract {
  kind: AgentAnswerRecordKind;
  /** 记录编号（活动为活动编号；我去过为那条自述的编号）。 */
  id: string;
  title: string;
  /** 上行：类型标签后面的那一句（时间、公司和职位、截止时间…）。 */
  top?: string | undefined;
  /** 下行：地点、最近一次往来、已过期几天… */
  sub?: string | undefined;
  /** late：下行用提醒色（已过期的待办）。 */
  subTone?: "late" | undefined;
  /** 按主题挑出来时的一句理由。 */
  why?: string | undefined;
  /** 记录已删除或现在看不到：虚线卡，不可点。 */
  gone?: boolean | undefined;
  /** 笔记的第一位相关联系人（网页在联系人页上打开笔记，D5）。 */
  contactId?: string | undefined;
  /** 活动、我去过：平台活动还是用户自己建的私人活动。 */
  eventKind?: "platform" | "private" | undefined;
  /** 我去过：这条自述说的那场活动的编号（平台活动进它的详情页，私人活动在活动页里打开）。 */
  eventId?: string | undefined;
  /** 日程、我去过：所在的那一天 YYYY-MM-DD（网页日历停在这一天）。 */
  day?: string | undefined;
}

/** AG19：要点里的一点。head 是开头加粗的几个字（可没有）。 */
export interface AgentAnswerPointContract {
  head?: string | undefined;
  text: string;
}

/** AG19：「这次没做的部分」里的一条：用户原话里的那一段、为什么没做、能马上照着做的那一句。 */
export interface AgentAnswerNoteItemContract {
  quote?: string | undefined;
  text: string;
  action?: string | undefined;
}

/**
 * AG19：回答的一块，按显示顺序排。
 * conclusion：讨论类回答的第一句（加粗）；paragraph：一段正文；points：要点；
 * records：一组记录卡片，先显示 shown 张，其余收在 moreLabel（「还有 3 位」）下面，点一下原地展开；
 *   size 为 mini 时是文字下面「提到的记录」那种两行小卡，caption 是它上面的小字；
 * note：灰底的说明条（这次没做的部分），title 是开头那行小字。
 * 两端遇到不认识的 type 就跳过那一块。
 */
export type AgentAnswerBlockContract =
  | { type: "conclusion"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "points"; items: readonly AgentAnswerPointContract[] }
  | { type: "records"; items: readonly AgentAnswerRecordContract[]; shown: number; size?: "full" | "mini" | undefined; caption?: string | undefined; moreLabel?: string | undefined; lessLabel?: string | undefined }
  | { type: "note"; title: string; items: readonly AgentAnswerNoteItemContract[]; go?: AgentAnswerGoContract | undefined };

/* ── AG14 界面（获批视觉稿 2026-11-20，D1–D10 取 A）──────────────── */

/** AG14：说明条末尾的入口（「去设置 ›」），两端各自换成自己的页面地址；memoryId 有值时那一条直接打开。 */
export interface AgentAnswerGoContract {
  label: string;
  to: "memory_settings";
  memoryId?: string | undefined;
}

/**
 * AG14：回答开头记忆的小标签，紧跟「按你的 N 条记录回答」（D4）。整句由服务端按回答语言写好：
 * used「按你存的偏好「周末上午」挑的」（带「修改 ›」，D5 点了到设置页这一条）；
 * skipped「只这一次：没按你存的「周末上午」」（不带「修改」）；
 * rule「按你定的规矩，没放晚上的」——一直遵守的只在让结果少了东西时才写（D6），带「修改 ›」。
 */
export interface AgentAnswerMemoryUseContract {
  kind: "used" | "skipped" | "rule";
  memoryId: string;
  text: string;
}

/* ── AG17：外部连接（用户自己的 Claude、Codex 经 MCP 接入）────────────────── */

/** 一个领域能勾什么：只读，以及（有的领域）可以提修改。 */
export interface AgentConnectionScopeOptionContract {
  domain: "contacts" | "events" | "attendance" | "todos" | "memos" | "schedule";
  read: string;
  /** 这个领域还不能由外部提修改时为 null。 */
  propose: string | null;
}

/** 设置里的一条连接：哪个客户端、能读什么、能改什么、上次什么时候用过。 */
export interface AgentConnectionContract {
  id: string;
  clientName: string;
  /** 客户端身份文档所在的主机名（如 claude.ai），和名字一起显示。 */
  clientHost: string;
  scopes: readonly string[];
  createdAt: string;
  lastUsedAt: string | null;
  /** 它提的、还在等用户确认的修改有几项（视觉稿 D10；断开时会一起作废的也是这几项）。 */
  waitingProposals?: number | undefined;
}

export interface AgentConnectionListContract {
  connections: readonly AgentConnectionContract[];
  options: readonly AgentConnectionScopeOptionContract[];
  /** 用户抄进 Claude、Codex 的地址（就是 MCP 端点本身，令牌绑定在它上面）；服务没配好时为 null。 */
  connectAddress?: string | null | undefined;
}

/** 同意页要显示的内容：谁在请求、请求了什么、同意后会跳回哪里、现在登录的是谁、这个客户端现在已经能做什么。 */
export interface AgentConnectionConsentContract {
  clientName: string;
  clientHost: string;
  /** 同意后浏览器跳回的地址的主机名；本机回调（localhost、127.0.0.1）时页面要多提醒一句。 */
  redirectHost: string;
  redirectIsLoopback: boolean;
  requestedScopes: readonly string[];
  /** 页面一开始选上的：已有的原样保留，加上客户端这次请求的只读项。「可以提修改」从不预先选上，要用户自己点。 */
  preselectedScopes: readonly string[];
  options: readonly AgentConnectionScopeOptionContract[];
  /** 现在登录的账号。key 由账号派生（不是账号编号），提交时原样带回，用来发现中途换了账号。 */
  account?: { key: string; name: string | null; email: string | null } | undefined;
  /** 这个客户端已经连着时：它现在能做什么、从哪天起连着。第一次连接时为 null。 */
  current?: { scopes: readonly string[]; connectedAt: string } | null | undefined;
}

export interface AgentConnectionConsentInputContract {
  /** 授权请求的凭条（地址栏里的 request 参数）。 */
  request: string;
  decision: "allow" | "deny";
  scopes: readonly string[];
  /** 页面打开时的账号 key；和现在登录的不一致时不执行，回 409 并带上新的同意页内容。 */
  accountKey?: string | undefined;
}

export interface AgentConnectionConsentResultContract {
  /** 浏览器接下来要去的地址（客户端登记的回调地址）。 */
  redirectTo: string;
}

/** 确认链接页：这条外部提议现在的样子。卡片本身沿用 AgentActionPreviewContract。 */
export interface AgentProposalViewContract {
  proposalId: string;
  clientName: string;
  createdAt: string;
  card: AgentActionPreviewContract;
  /** 不能再确认时页面显示的一句话（已失效要重新提、已作废、已否决），由服务端按卡的语言写好。 */
  notice?: string | undefined;
}

// ── agent-design AG15：定时任务与它的运行历史（设计稿 §5.3、§10「我的定时任务」）。本块由 AG15 追加。 ──

/** 一期运行的结果：已送达 / 没有新的 / 已算出未送出 / 失败 / 需处理。 */
export type AgentScheduledTaskRunOutcome = "delivered" | "no_match" | "undelivered" | "failed" | "needs_attention";

/** 一期运行。算出结果的时刻（computedAt）和结果送到用户手里的情况（delivery、push）分开记。 */
export interface AgentScheduledTaskRunContract {
  runId: string;
  taskId: string;
  /** 这一期计划触发的时刻（不是实际跑的时刻）。 */
  scheduledAt: string;
  computedAt: string;
  outcome: AgentScheduledTaskRunOutcome;
  /** 中断恢复时在这一期之前跳过的期数（只补最近一期）。 */
  skipped: number;
  /** 历史里的一行说明，服务端写好，两端照着显示。 */
  line: string;
  /** 这一期的完整内容（收件箱里那一段）；没有要送的内容时是空串。 */
  text: string;
  /** 这一期列出的记录，可以点进各自的页面。 */
  items: readonly { ref: string; kind: "event" | "contact" | "todo"; id: string; title: string; line: string; card?: AgentAnswerRecordContract | undefined }[];
  /** AG15 界面：结果页卡片上方的「按什么挑的」和卡片下面的几行小字（服务端写好，不含内部用词）。 */
  detail?: { basis: string; notes: readonly string[]; source?: { caption: string; card: AgentAnswerRecordContract } | undefined } | undefined;
  /** 这一期产生的待确认的卡（在收件箱里确认）。 */
  cardId?: string | undefined;
  /** 算了几次才算成（1 是一次算成；大于 1 是先失败、用同一期再试成功的）。 */
  computeAttempts: number;
  /**
   * 站内收件箱的投递。attempts 大于 1 是补送过（补送不重新算）。cancelled 时 cancelReason 说明为什么没送：
   * rule_paused 送出前暂停了；rule_changed 送出前改了任务；rule_removed 送出前删了任务；reference_unreadable 用来挑的笔记打不开了。
   */
  delivery: { state: "none" | "pending" | "delivered" | "cancelled"; attempts: number; deliveredAt?: string | undefined; cancelReason?: "rule_paused" | "rule_changed" | "rule_removed" | "reference_unreadable" | undefined };
  /** 中断恢复时跳过的那几期的本地日期（YYYY-MM-DD，最早的在前，最多 12 个）。 */
  skippedDays: readonly string[];
  /** 需处理时的原因说明（服务端写好），例如引用的笔记读不到了。 */
  attention?: { reason: "reference_unreadable"; message: string; referenceTitle?: string | undefined } | undefined;
  /** 推送提醒的投递（AG16 起使用；AG15 只记这条任务有没有开提醒）。 */
  push: { state: "not_requested" | "pending" | "delivered" | "failed" | "skipped"; attempts: number; deliveredAt?: string | undefined; lastAttemptAt?: string | undefined; reason?: AgentScheduledTaskPushReason | undefined; line?: string | null | undefined; targets?: readonly AgentScheduledTaskPushTargetContract[] | undefined };
  /**
   * AG15 界面（获批视觉稿 15-4「历史里每种情况怎么写」）：历史里这一期怎么显示，服务端按任务语言写好。day 这一期的日子；
   * time 算完的时刻（重试过的写在 text 里，这里为 null）；skippedNote 中间跳过了几期的那一行；opens 点开看什么。
   */
  display?: { day: string; time: string | null; text: string; skippedNote: string | null; opens: "result" | "card" | null } | undefined;
}

/** AG15 界面：表单（改一条任务、用表单新建）。笔记只带编号，名字只用来显示。 */
export interface AgentScheduledTaskFormContract {
  title: string;
  schedule: { kind: "daily"; time: string; timeZone: string } | { kind: "weekly"; daysOfWeek: readonly number[]; time: string; timeZone: string };
  domain: "event" | "contact" | "todo";
  /** 活动从哪段时间里挑（只对活动）。 */
  window?: "weekend" | "week" | "month" | "upcoming" | undefined;
  /** 「从哪里挑」现在的说法（改的时候显示，不从表单回写）。 */
  scopeText?: string | undefined;
  basis: { kind: "note"; noteId: string; title: string } | { kind: "field"; field: "startsAt" | "lastInteraction" | "dueAt" | "plannedDate" } | { kind: "topic"; words: string };
  maxItems: number;
  validUntil: string | null;
  push: boolean;
}

/** 「我的定时任务」里的一条任务。每一行的文字由服务端写好，和确认卡上的一致。 */
export interface AgentScheduledTaskContract {
  id: string;
  title: string;
  /** active 运行中；paused 已暂停；completed 已结束（过了有效期，或一次性的已经跑完）。 */
  status: "active" | "paused" | "completed";
  version: number;
  /** 下次预计运行的时刻；暂停或已结束时为 null。到点后约 10 分钟内运行。 */
  nextRunAt: string | null;
  /** 检查时间所用的时区（IANA 名称）；显示下次日期时一并写明。 */
  timeZone: string | null;
  /** 检查时间、候选范围、排序依据、条数、有效期、提醒方式、下次预计运行，各一行。AG15 界面：note 是值下面的灰色小字。 */
  rows: readonly { field: string; label: string; value: string; note?: string | undefined }[];
  notify: { inApp: boolean; push: boolean };
  lastRun: AgentScheduledTaskRunContract | null;
  createdAt: string;
  updatedAt: string;
  // ── AG15 界面（获批视觉稿 15-3、15-4）：两端照着显示的字，服务端按任务语言写好。 ──
  /** 挑的是哪类记录（列表左边的图标）。 */
  domain?: "event" | "contact" | "todo" | null | undefined;
  /** 列表里的第二、三行和黄底那行：检查时间（已结束的写跑到哪天）；下次与上次；需要你处理。 */
  summary?: { schedule: string; status: string; attention: string | null } | undefined;
  /** 最近一期需要用户处理（笔记打不开了）。 */
  needsAttention?: boolean | undefined;
  /** 详情页「下次运行」：日子和「9:00 之后约10分钟内」。 */
  next?: { day: string; time: string } | null | undefined;
  /** 详情页「上次结果」：「今天 9:04」和结果那句；opens 点开看什么。 */
  last?: { runId: string; when: string; text: string; opens: "result" | "card" | null } | null | undefined;
  /** 改这条任务时表单的初值。 */
  form?: AgentScheduledTaskFormContract | undefined;
}

/** GET /api/agent/automations 里的 tasks。 */
export interface AgentScheduledTaskListContract {
  tasks: readonly AgentScheduledTaskContract[];
}

/** GET /api/agent/automations/[id]/runs。 */
export interface AgentScheduledTaskHistoryContract {
  task: AgentScheduledTaskContract;
  /** 最近的在前。 */
  runs: readonly AgentScheduledTaskRunContract[];
}

// ── AG16：定时任务的提醒（设计稿 §5.3）。结果一律进站内收件箱；提醒是每条任务自己的开关。 ──

/** 这一期的提醒为什么没发，或者没送到。前七种是有意不发（skipped），后五种是想发但没送到（failed）。 */
export type AgentScheduledTaskPushReason =
  | "quiet_hours" | "daily_cap" | "notifications_off"
  | "reminder_off" | "rule_paused" | "rule_removed" | "result_not_sent"
  | "no_device" | "permission_revoked" | "provider_rejected" | "outcome_unknown" | "not_configured";

/** 一期的提醒发往的一台设备：只有编号、种类和状态。 */
export interface AgentScheduledTaskPushTargetContract {
  deviceId: string;
  platform: "ios" | "android" | "web";
  state: "delivered" | "retry" | "revoked" | "rejected" | "unknown";
}

/**
 * 一期的提醒（AgentScheduledTaskRunContract.push），和算出结果的时刻（computedAt）分开记。AG16 起服务端总会带上：
 * `line` 是写好的第二行（「提醒已送到」「提醒没送到：手机的通知被关了。结果在收件箱里。」），没有可说的时候是 null；
 * `targets` 是这一期发往的设备；`reason` 是没发或没送到的原因；state 多了一种 skipped（有意不发）。
 */
export type AgentScheduledTaskRunPushContract = AgentScheduledTaskRunContract["push"];

/** 页面上直接拨提醒开关（不出卡）：PUT /api/agent/automations/[id]/reminder。locale 是提醒那句话用的语言。 */
export interface AgentScheduledTaskReminderInputContract {
  push: boolean;
  locale?: "zh" | "en" | "ja" | undefined;
}

/** 这台浏览器或手机在服务端登记的通知状态：GET /api/devices/push-tokens/[id]。 */
export interface AgentPushDeviceStateContract {
  deviceId: string;
  platform: "ios" | "android" | "web";
  permission: "granted" | "provisional" | "denied" | "undetermined";
  /** 现在会不会往这台设备发。 */
  active: boolean;
  revokedAt?: string | undefined;
  /** user：用户自己在这台设备上关的；provider_rejected：发提醒时推送服务拒收（通知在系统设置里被关了），服务端才发现。 */
  revokedReason?: "user" | "provider_rejected" | undefined;
}

/** 浏览器订阅要用的公钥：GET /api/devices/web-push。publicKey 为 null 表示这个部署还没开浏览器通知。 */
export interface AgentWebPushConfigContract {
  publicKey: string | null;
}
