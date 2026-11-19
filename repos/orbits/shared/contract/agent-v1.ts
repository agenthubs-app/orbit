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
}

export interface AgentCardDisplayRowContract {
  /** 字段名（plannedDate、interaction.occurredOn…），只用来和 changes 对上，不显示。 */
  field: string;
  label: string;
  /** 原值，只有改已有记录时才有。 */
  before?: string | undefined;
  after: string;
}

/** 一张卡的当前版（GET /api/agent/ledger/[id] 与结果文档的 actionPreview 同一形状）。 */
export interface AgentActionPreviewContract {
  actionId: string;
  revision: number;
  /** 决定接口要原样带回的哈希。 */
  payloadHash: string;
  status: AgentCardStatus;
  expiresAt?: string | undefined;
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
  /** 被拒的原因：CARD_REVISION_CHANGED、CARD_CONTENT_CHANGED、CARD_EXPIRED、CARD_CLOSED、OPERATION_NOT_IN_REVIEW。 */
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
}

export interface AgentConnectionListContract {
  connections: readonly AgentConnectionContract[];
  options: readonly AgentConnectionScopeOptionContract[];
}

/** 同意页要显示的内容：谁在请求、请求了什么、同意后会跳回哪里。 */
export interface AgentConnectionConsentContract {
  clientName: string;
  clientHost: string;
  /** 同意后浏览器跳回的地址的主机名；本机回调（localhost、127.0.0.1）时页面要多提醒一句。 */
  redirectHost: string;
  redirectIsLoopback: boolean;
  requestedScopes: readonly string[];
  /** 页面一开始勾上的：客户端请求里的只读项。「可以提修改」从不预先勾上，要用户自己勾。 */
  preselectedScopes: readonly string[];
  options: readonly AgentConnectionScopeOptionContract[];
}

export interface AgentConnectionConsentInputContract {
  /** 授权请求的凭条（地址栏里的 request 参数）。 */
  request: string;
  decision: "allow" | "deny";
  scopes: readonly string[];
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
