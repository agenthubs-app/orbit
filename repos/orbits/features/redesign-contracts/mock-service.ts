// R08 mock behaviour of the redesign contracts, over the demo-world fixtures.
// In memory only: the state is shared by everyone using one dev server and resets
// when the process restarts; nothing is written to the database. The semantics
// follow the contracts — retries with the same mutation id / idempotency key give
// the first answer back, revoked codes stop working, PATCH and create persist.
import type { ContactCompletionAnswerInput, ContactCompletionQuestion, ContactCompletionResult } from "../../shared/contract/contact-completion";
import type { AccountDeletionRequestContract, AccountExportContract, AccountExportCreateInput } from "../../shared/contract/account";
import type { EventAssessmentContract, EventAssessmentCreateInput, EventAssessmentFacts } from "../../shared/contract/event-assessment";
import type { EventRecommendationDismissReason, EventRecommendationDismissResult } from "../../shared/contract/event-recommendation-feedback";
import type { HomeLayoutContract, HomeLayoutUpdateInput } from "../../shared/contract/home-layout";
import type {
  InviteCodeContract, InviteCodeCreateInput, InviteCodeFailureReason, InviteCodeHistoryItem, InviteCodeHistoryJoined, InviteCodePreview, InviteCodeRedeemInput,
  InviteCodeRedeemResult, InviteCodeShareUpdateInput, InviteConnectionView, InviteMergeInput, InviteSharedFieldKey, InviteSharedFields, InviteShareUpdateInput, InviteUnlinkInput, InviteUnlinkResult,
} from "../../shared/contract/invite-codes";
import { formatInviteCode, INVITE_CODE_ALPHABET, INVITE_DEFAULT_SHARED_KEYS, normalizeInviteCode } from "../../shared/compute/invite-code-format";
import { COMPLETION_OPTION_LABELS, resolveCompletionAnswer, type CompletionOption } from "../../shared/compute/completion-question-rules";
import { contactDensity } from "../../shared/compute/contact-density";
import { DEMO_EVENTS } from "../../shared/mock/demo-world";
import { demoCalendarExternalEvents, demoTodoPage } from "../../shared/mock/demo-world/todo";
import type { CalendarExternalEventsContract } from "../../shared/contract/calendar-external-events";
import type { TodoPageContract } from "../../shared/contract/todo-page";
import {
  demoAccountExport, demoAppVersion, demoCompletionOrganizationQuestion, demoCompletionQuestion, demoDeletionRequest, demoEventAssessment, demoEventAssessmentLoginRequired, demoEventAssessmentNeedsInput, demoEventAssessmentNotEventPage, demoEventAssessmentRange, demoHomeLayout,
  demoInviteAlreadyConnected, demoInviteCode, demoInviteConnection, demoInviteExpiredPeer, demoInviteFromPeer, demoInviteFullPeer, demoInviteHistory, DEMO_PLAN_NOW, type DemoInvitePeerCode,
} from "../../shared/mock/demo-world/fixtures";

// ── R16 每天一问（复核 M5：照 live 规则走）。演示世界一天一题：GET 给「どこで？」那题；答过 / 跳过后当天 GET 返回 null；
// 答案必须是选项之一（「会社は？」还可以手输公司名，「自分で入力」本身不算）→ 否则 invalid；同键重放同结果，换键 / 答后跳过 /
// 跳后再答 → conflict；结果带 densityAfter（D-10，按演示世界这两个人的已知信息算）。「会社は？」样例可以按 id 回答（卡片展示用）。
const COMPLETION_QUESTIONS: readonly ContactCompletionQuestion[] = [demoCompletionQuestion, demoCompletionOrganizationQuestion];
/** 演示世界里这两个人都有邮箱或电话（LinkedIn 导出带了邮箱 / 电话里存了号码）。 */
const COMPLETION_HAS_CONTACT_POINT: Readonly<Record<string, boolean>> = { [demoCompletionQuestion.contactId]: true, [demoCompletionOrganizationQuestion.contactId]: true };
export type CompletionMockResult = { result: ContactCompletionResult } | { failure: "not_found" | "invalid" | "conflict" };
type CompletionDone = { status: "answered" | "skipped"; key: string; result: ContactCompletionResult };

function completionOptions(question: ContactCompletionQuestion): CompletionOption[] {
  const fixed: Record<string, CompletionOption["target"]> = {
    [COMPLETION_OPTION_LABELS.forgot]: { kind: "forgot" },
    [COMPLETION_OPTION_LABELS.formerColleague]: { kind: "former_colleague" },
    [COMPLETION_OPTION_LABELS.intro]: { kind: "intro" },
    [COMPLETION_OPTION_LABELS.typeIn]: { kind: "type_in" },
  };
  return question.options.map((label) => ({
    label,
    target: fixed[label] ?? (question.kind === "organization"
      ? { kind: "organization", value: label }
      : { eventId: DEMO_EVENTS.find((event) => event.title === label)?.id ?? label, kind: "event", title: label }),
  }));
}

type LayoutResult = { conflict: true; current: HomeLayoutContract } | { conflict: false; layout: HomeLayoutContract } | { reused: true };

// ── R15 招待コード（DESIGN §4.2 mock）。演示世界里只有一个人（演示账号）：发码的是我，兑换的也是我
// （兑换的是别人发给我的码，fixtures 的 demoInviteFromPeer / demoInviteAlreadyConnected）。时钟固定在演示世界的
// 「现在」（DEMO_PLAN_NOW），测试用 setInviteClock 换。失败与 live 同形：不存在 / 作废 / 被替换 / 格式错 /
// 过期超过 30 天 → 同一个 404 INVITE_UNAVAILABLE；过期、满员、自己的码 → 409 带各自的 reason。
export type InviteFailure = { failure: "unavailable" | "conflict"; reason: InviteCodeFailureReason };
type MyCode = { contract: InviteCodeContract; joined: InviteCodeHistoryJoined[]; supersededAt?: string };
type PeerCode = DemoInvitePeerCode & { usedCount: number };

const DAY_MS = 86_400_000;
const EXPIRED_PREVIEW_DAYS = 30;
/** 演示账号的资料（发码时按选择的键从这里读值，客户端传的 shared 值一律不用）。 */
const DEMO_PROFILE: Required<Pick<InviteSharedFields, "displayName" | "organization" | "role" | "offering" | "seeking" | "email" | "phone">> = {
  ...(demoInviteCode.shared as Required<Pick<InviteSharedFields, "displayName" | "organization" | "role">>),
  offering: ["新規事業の壁打ち"], seeking: ["シリーズA の投資家"], email: "demo@example.com", phone: "03-0000-0000",
};

/** 资料里按键取值（名字总是带上；organization 带会社和役職）。 */
function pickShared(profile: InviteSharedFields, keys: readonly InviteSharedFieldKey[]): InviteSharedFields {
  const picked: InviteSharedFields = { displayName: profile.displayName };
  for (const key of keys) {
    if (key === "organization") Object.assign(picked, profile.organization ? { organization: profile.organization } : {}, profile.role ? { role: profile.role } : {});
    else if (profile[key] !== undefined) Object.assign(picked, { [key]: profile[key] });
  }
  return picked;
}
/** 预览永远不含邮箱和电话。 */
const withoutContact = ({ email: _email, phone: _phone, ...rest }: InviteSharedFields): InviteSharedFields => rest;
const sharedKeysOf = (fields: InviteSharedFields): InviteSharedFieldKey[] =>
  (["organization", "offering", "seeking", "email", "phone"] as const).filter((key) => fields[key] !== undefined);

function myCodeStatus(code: MyCode, now: number): InviteCodeHistoryItem["status"] {
  if (code.contract.revokedAt) return "revoked";
  if (code.supersededAt) return "superseded";
  if (Date.parse(code.contract.expiresAt) <= now) return "expired";
  return code.contract.usedCount >= code.contract.maxUses ? "full" : "active";
}
/** 能预览的状态：作废 / 被替换 / 过期超过 30 天都当作不存在。 */
function previewStatus(status: InviteCodeHistoryItem["status"], expiresAt: string, now: number): InviteCodePreview["status"] | null {
  if (status === "revoked" || status === "superseded") return null;
  if (status === "expired") return now - Date.parse(expiresAt) > EXPIRED_PREVIEW_DAYS * DAY_MS ? null : "expired";
  return status;
}
function peerStatus(peer: PeerCode, now: number): InviteCodeHistoryItem["status"] {
  if (Date.parse(peer.preview.expiresAt) <= now) return "expired";
  return peer.usedCount >= peer.maxUses ? "full" : "active";
}
/** 演示里新发的码：固定前缀 + 序号，保证不与已有码重复，也都在字母表里。 */
function demoNewCode(sequence: number): string {
  let digits = "";
  let rest = sequence;
  for (let index = 0; index < 4; index += 1) {
    digits = INVITE_CODE_ALPHABET[rest % INVITE_CODE_ALPHABET.length] + digits;
    rest = Math.floor(rest / INVITE_CODE_ALPHABET.length);
  }
  return `N3WC-${digits}`;
}

function freshInviteState() {
  const [current, ...past] = demoInviteHistory;
  const mine: MyCode[] = [{ contract: demoInviteCode, joined: current.joined }];
  for (const item of past) {
    mine.push({
      contract: { sample: true, code: item.code, link: `https://orbitailink.com/i/${item.code}`, maxUses: item.maxUses, usedCount: item.usedCount, createdAt: item.createdAt, expiresAt: item.expiresAt, shared: demoInviteCode.shared },
      joined: item.joined,
      ...(item.status === "superseded" ? { supersededAt: item.expiresAt } : {}),
    });
  }
  return {
    clock: null as string | null,
    mine,
    creates: new Map<string, InviteCodeContract>(),
    peers: new Map<string, PeerCode>([demoInviteFromPeer, demoInviteAlreadyConnected, demoInviteExpiredPeer, demoInviteFullPeer].map((peer) => [normalizeInviteCode(peer.preview.code)!, { ...peer }])),
    connections: new Map<string, InviteConnectionView>([[demoInviteConnection.contactId, demoInviteConnection]]),
    redeems: new Map<string, { code: string; result: InviteCodeRedeemResult | InviteFailure }>(),
    shares: new Map<string, InviteConnectionView>(),
    unlinks: new Map<string, InviteUnlinkResult>(),
    merges: new Map<string, InviteConnectionView>(),
  };
}

function freshState() {
  return {
    layout: demoHomeLayout as HomeLayoutContract,
    layoutMutations: new Map<string, { fingerprint: string; result: LayoutResult }>(),
    invite: freshInviteState(),
    // R26: plus the failure-state fixtures (login required / not an event page / poster 1 of 3 / filled-in range).
    assessments: new Map<string, EventAssessmentContract>([demoEventAssessment, demoEventAssessmentLoginRequired, demoEventAssessmentNotEventPage, demoEventAssessmentNeedsInput, demoEventAssessmentRange].map((item) => [item.id, item])),
    /** R26: a created mock assessment reads as `reading` once, then as the ready demo (no AI, no database). */
    assessmentReads: new Map<string, number>(),
    assessmentCreates: new Map<string, EventAssessmentContract>(),
    exports: new Map<string, AccountExportContract>([[demoAccountExport.id, demoAccountExport]]),
    exportCreates: new Map<string, AccountExportContract>(),
    deletion: null as AccountDeletionRequestContract | null,
    completion: new Map<string, CompletionDone>(),
  };
}
let state = freshState();
const assessmentGlobal = globalThis as typeof globalThis & { __orbitR26MockAssessments?: Map<string, EventAssessmentContract> };
/** R26: the mock assessments (a design-board fixture override on globalThis wins). */
function assessMap(): Map<string, EventAssessmentContract> {
  return assessmentGlobal.__orbitR26MockAssessments ?? state.assessments;
}
const nowIso = () => new Date().toISOString();
const inviteNow = () => Date.parse(state.invite.clock ?? DEMO_PLAN_NOW);
const UNAVAILABLE: InviteFailure = { failure: "unavailable", reason: "INVITE_UNAVAILABLE" };
const conflict = (reason: InviteCodeFailureReason): InviteFailure => ({ failure: "conflict", reason });

function redeemOnce(code: string, input: InviteCodeRedeemInput): InviteCodeRedeemResult | InviteFailure {
  const preview = redesignMock.invitePreview(code);
  if ("failure" in preview) return preview;
  if (preview.isOwnCode) return conflict("OWN_CODE");
  const peer = state.invite.peers.get(normalizeInviteCode(code)!)!;
  const contactId = peer.redeem.contactId;
  const peerFields = pickShared(peer.peer, peer.sharedKeys);
  if (state.invite.connections.has(contactId)) return { outcome: "already_connected", contactId, peer: peerFields };
  if (preview.status === "expired") return conflict("INVITE_EXPIRED");
  if (preview.status === "full") return conflict("INVITE_FULL");
  peer.usedCount += 1;
  state.invite.connections.set(contactId, {
    sample: true, contactId, connectedAt: new Date(inviteNow()).toISOString(), via: { code: formatInviteCode(code)! },
    sharedByMe: [...input.sharedKeys], sharedByPeer: sharedKeysOf(peerFields), pausedFields: [],
  });
  return { outcome: "connected", contactId, peer: peerFields };
}

export const redesignMock = {
  calendarExternalEvents(from: string, to: string): CalendarExternalEventsContract {
    const page = structuredClone(demoCalendarExternalEvents);
    page.events = page.events.filter(event => Date.parse(event.startsAt) < Date.parse(to) && Date.parse(event.endsAt ?? event.startsAt) >= Date.parse(from));
    return page;
  },
  todoPage(date?: string, timeZone?: string): TodoPageContract {
    const page: TodoPageContract = structuredClone(demoTodoPage);
    page.date = date ?? page.date;
    page.timeZone = timeZone ?? page.timeZone;
    const formatter = new Intl.DateTimeFormat("en", { timeZone: page.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    page.followups.items = page.followups.items.map(item => {
      const parts = item.dueAt ? Object.fromEntries(formatter.formatToParts(new Date(item.dueAt)).map(part => [part.type, part.value])) : null;
      return { ...item, overdue: Boolean(parts && `${parts.year}-${parts.month}-${parts.day}` < page.date) };
    });
    page.counts.overdue = page.followups.items.filter(item => item.overdue).length;
    return page;
  },
  homeLayout: () => state.layout,
  /** 409 when the expected revision is stale; the same mutationId again returns the first result. */
  putHomeLayout(input: HomeLayoutUpdateInput): LayoutResult {
    const fingerprint = JSON.stringify(input);
    const replay = state.layoutMutations.get(input.mutationId);
    if (replay) return replay.fingerprint === fingerprint ? replay.result : { reused: true };
    const webChanged = JSON.stringify(input.web) !== JSON.stringify(state.layout.web);
    const result: LayoutResult = input.expectedRevision !== state.layout.revision
      ? { conflict: true, current: state.layout }
      : { conflict: false, layout: { revision: state.layout.revision + 1, app: input.app, web: input.web,
        ...((input.hintDismissedAt ?? state.layout.hintDismissedAt) ? { hintDismissedAt: input.hintDismissedAt ?? state.layout.hintDismissedAt } : {}),
        ...(state.layout.webCustomizedAt || webChanged ? { webCustomizedAt: state.layout.webCustomizedAt ?? new Date().toISOString() } : {}) } };
    if ("layout" in result) state.layout = result.layout;
    state.layoutMutations.set(input.mutationId, { fingerprint, result });
    return result;
  },
  /** 今天的题：答过 / 跳过任何一题后当天 null（与 live 一天一题同口径）。 */
  completionQuestion: (): ContactCompletionQuestion | null => (state.completion.size > 0 ? null : demoCompletionQuestion),
  completionAnswer(questionId: string, input: ContactCompletionAnswerInput): CompletionMockResult {
    const question = COMPLETION_QUESTIONS.find((item) => item.id === questionId);
    if (!question) return { failure: "not_found" };
    const done = state.completion.get(questionId);
    if (done) return done.status === "answered" && done.key === input.idempotencyKey ? { result: done.result } : { failure: "conflict" };
    const effect = resolveCompletionAnswer({ answer: input.answer, kind: question.kind ?? "met_where", options: completionOptions(question) });
    if (!effect) return { failure: "invalid" };
    const densityAfter = contactDensity({
      hasContactPoint: COMPLETION_HAS_CONTACT_POINT[question.contactId] ?? false,
      hasGoalRelation: false,
      hasIdentity: true,
      hasInteraction: false,
      hasMetContext: question.kind !== "organization" && (effect.kind === "event" || effect.kind === "note"),
      selfReported: false,
    }).level;
    const result: ContactCompletionResult = { densityAfter, next: null, questionId, status: "answered" };
    state.completion.set(questionId, { key: input.idempotencyKey, result, status: "answered" });
    return { result };
  },
  completionSkip(questionId: string, input: { idempotencyKey: string }): CompletionMockResult {
    if (!COMPLETION_QUESTIONS.some((item) => item.id === questionId)) return { failure: "not_found" };
    const done = state.completion.get(questionId);
    if (done) return done.status === "skipped" && done.key === input.idempotencyKey ? { result: done.result } : { failure: "conflict" };
    const result: ContactCompletionResult = { next: null, questionId, status: "skipped" };
    state.completion.set(questionId, { key: input.idempotencyKey, result, status: "skipped" });
    return { result };
  },
  /** The active code: null after it was revoked, superseded or expired. */
  currentInvite(): InviteCodeContract | null {
    const current = state.invite.mine[0];
    const status = current ? myCodeStatus(current, inviteNow()) : null;
    return current && (status === "active" || status === "full") ? current.contract : null;
  },
  /** A new code replaces every code of mine still standing (superseded); values come from my profile by the chosen keys. */
  createInvite(input: InviteCodeCreateInput): InviteCodeContract {
    // 复核 m3：重放返回这张码现在的样子（之后改过共享项目就是改后的值，与 `GET /current` 一致），不是发码那一刻的快照。
    // live 在重放时还会比对内容（maxUses / sharedKeys 与这张码不同 → 409，见 `features/invite-codes/service.ts` 的 create）；
    // 演示世界不做冲突判断。
    const replay = state.invite.creates.get(input.idempotencyKey);
    if (replay) return state.invite.mine.find((item) => item.contract.code === replay.code)?.contract ?? replay;
    const now = inviteNow();
    const at = new Date(now).toISOString();
    // 还在用的（有效 / 满员）都被替换；已过期、已作废的保持各自的状态。
    for (const code of state.invite.mine) if (["active", "full"].includes(myCodeStatus(code, now))) code.supersededAt = at;
    const code = demoNewCode(state.invite.creates.size + 1);
    const created: InviteCodeContract = {
      sample: true, code, link: `https://orbitailink.com/i/${code}`, maxUses: input.maxUses, usedCount: 0, createdAt: at, expiresAt: new Date(now + 7 * DAY_MS).toISOString(),
      shared: pickShared(DEMO_PROFILE, input.sharedKeys ?? INVITE_DEFAULT_SHARED_KEYS),
    };
    state.invite.mine.unshift({ contract: created, joined: [] });
    state.invite.creates.set(input.idempotencyKey, created);
    return created;
  },
  /** R15 P1: what the current code shares, from now on (same code, link, expiry and uses); null when there is no current code. */
  // 复核 m2：与 live 同一个 PUT 语义——不按键重放：每次都按当前码应用，没有当前码 → null（404）。
  updateCurrentInviteShare(input: InviteCodeShareUpdateInput): InviteCodeContract | null {
    if (!redesignMock.currentInvite()) return null;
    const current = state.invite.mine[0]!;
    current.contract = { ...current.contract, shared: pickShared(DEMO_PROFILE, input.sharedKeys) };
    return current.contract;
  },
  /** Only my code that is still standing can be revoked (again: the same answer). */
  revokeInvite(code: string): InviteCodeContract | null {
    const normalized = normalizeInviteCode(code);
    const found = state.invite.mine.find((item) => normalizeInviteCode(item.contract.code) === normalized);
    if (!found || found.supersededAt) return null;
    found.contract = { ...found.contract, revokedAt: found.contract.revokedAt ?? new Date(inviteNow()).toISOString() };
    return found.contract;
  },
  /** Public preview (DESIGN §6): a code that is gone or never was is one and the same 404. */
  invitePreview(code: string): InviteCodePreview | InviteFailure {
    const normalized = normalizeInviteCode(code);
    const now = inviteNow();
    const mine = state.invite.mine.find((item) => normalizeInviteCode(item.contract.code) === normalized);
    if (mine) {
      const status = previewStatus(myCodeStatus(mine, now), mine.contract.expiresAt, now);
      if (!status) return UNAVAILABLE;
      return { sample: true, code: mine.contract.code, expiresAt: mine.contract.expiresAt, shared: withoutContact(mine.contract.shared), status, inviterAlreadyConnected: false, isOwnCode: true };
    }
    const peer = normalized ? state.invite.peers.get(normalized) : undefined;
    if (!peer) return UNAVAILABLE;
    const status = previewStatus(peerStatus(peer, now), peer.preview.expiresAt, now);
    if (!status) return UNAVAILABLE;
    return { ...peer.preview, shared: withoutContact(peer.preview.shared), status, inviterAlreadyConnected: state.invite.connections.has(peer.redeem.contactId), isOwnCode: false };
  },
  /** Redeem: one use per new connection; the same pair again is already_connected and costs nothing; a retry with the same key replays. */
  inviteRedeem(code: string, input: InviteCodeRedeemInput): InviteCodeRedeemResult | InviteFailure {
    const replay = state.invite.redeems.get(input.idempotencyKey);
    if (replay) return replay.result;
    const result = redeemOnce(code, input);
    state.invite.redeems.set(input.idempotencyKey, { code, result });
    return result;
  },
  /** GET /api/invite-codes: my codes, newest first, at most 20. */
  inviteHistory(): InviteCodeHistoryItem[] {
    const now = inviteNow();
    return [...state.invite.mine]
      .sort((a, b) => Date.parse(b.contract.createdAt) - Date.parse(a.contract.createdAt))
      .slice(0, 20)
      .map((item) => ({ sample: true, code: item.contract.code, createdAt: item.contract.createdAt, expiresAt: item.contract.expiresAt, status: myCodeStatus(item, now), usedCount: item.contract.usedCount, maxUses: item.contract.maxUses, joined: item.joined }));
  },
  inviteConnection: (contactId: string) => state.invite.connections.get(contactId) ?? null,
  /** What I share with this person from now on (the next sync round applies it in live). */
  updateInviteShare(contactId: string, input: InviteShareUpdateInput): InviteConnectionView | null {
    const replay = state.invite.shares.get(input.idempotencyKey);
    if (replay) return replay;
    const found = state.invite.connections.get(contactId);
    if (!found) return null;
    const updated = { ...found, sharedByMe: [...input.sharedKeys] };
    state.invite.connections.set(contactId, updated);
    state.invite.shares.set(input.idempotencyKey, updated);
    return updated;
  },
  /** Unlink (DESIGN §2.6): the connection ends on both sides; nobody is told. */
  unlinkInvite(contactId: string, input: InviteUnlinkInput): InviteUnlinkResult | null {
    const replay = state.invite.unlinks.get(input.idempotencyKey);
    if (replay) return replay;
    if (!state.invite.connections.delete(contactId)) return null;
    const result: InviteUnlinkResult = { outcome: "unlinked", ...(input.keepAsContact ? { keptContactId: contactId } : {}) };
    state.invite.unlinks.set(input.idempotencyKey, result);
    return result;
  },
  /**
   * R15 复核 S1：我确认「同じ人」→ 统合进建议里已有的那条（连接改挂到那条上，建议消失）；`dismiss` = 「別の人」只去掉建议。
   * 不是招待连接 → null（404）；统合时没有建议 → null（404）。同一个键重放第一次的答案。
   */
  resolveInviteMerge(contactId: string, input: InviteMergeInput, action: "merge" | "dismiss"): InviteConnectionView | null {
    const replay = state.invite.merges.get(`${action}:${input.idempotencyKey}`);
    if (replay) return replay;
    const found = state.invite.connections.get(contactId);
    if (!found) return null;
    // 「別の人」没有建议时原样返回（与 live 一样幂等）；统合没有建议 = 没东西可统合。
    if (!found.mergeSuggestion) return action === "dismiss" ? found : null;
    const { mergeSuggestion, ...rest } = found;
    const next: InviteConnectionView = action === "merge" ? { ...rest, contactId: mergeSuggestion.contactId } : rest;
    state.invite.connections.delete(contactId);
    state.invite.connections.set(next.contactId, next);
    state.invite.merges.set(`${action}:${input.idempotencyKey}`, next);
    return next;
  },
  /** Tests only: put a merge suggestion on a connection. */
  setInviteMergeSuggestion(contactId: string, suggestion: InviteConnectionView["mergeSuggestion"]) {
    const found = state.invite.connections.get(contactId);
    if (found) state.invite.connections.set(contactId, { ...found, mergeSuggestion: suggestion });
  },
  /** Tests only: the mock clock (null = the demo world's now). */
  setInviteClock(iso: string | null) { state.invite.clock = iso; },
  /** Tests only: how many times a peer code was used. */
  invitePeerUsage: (code: string) => state.invite.peers.get(normalizeInviteCode(code) ?? "")?.usedCount ?? -1,
  /** Tests only. */
  setInvitePeerUsage(code: string, usedCount: number) { const peer = state.invite.peers.get(normalizeInviteCode(code) ?? ""); if (peer) peer.usedCount = usedCount; },
  assessments: () => [...assessMap().values()].sort((a, b) => Number(a.userDecision === "dismissed") - Number(b.userDecision === "dismissed") || b.total - a.total),
  assessment(id: string) {
    const found = assessMap().get(id);
    if (!found) return null;
    if (found.status !== "reading" || !id.startsWith("demo-assessment-new-")) return found;
    const reads = (state.assessmentReads.get(id) ?? 0) + 1;
    state.assessmentReads.set(id, reads);
    if (reads < 2) return found;
    const ready: EventAssessmentContract = { ...demoEventAssessment, id, sourceKind: found.sourceKind, facts: { ...demoEventAssessment.facts, ...found.facts }, createdAt: found.createdAt };
    assessMap().set(id, ready);
    return ready;
  },
  createAssessment(input: EventAssessmentCreateInput): EventAssessmentContract {
    const replay = state.assessmentCreates.get(input.idempotencyKey);
    if (replay) return replay;
    const facts: EventAssessmentFacts = input.sourceKind === "url" ? { url: input.url } : input.sourceKind === "manual" ? input.facts : {};
    const created: EventAssessmentContract = { ...demoEventAssessment, id: `demo-assessment-new-${assessMap().size + 1}`, sourceKind: input.sourceKind, status: "reading", facts, scoreBreakdown: [], total: 0, verdict: "conditional", missingFields: ["startsAt"], createdAt: nowIso() };
    assessMap().set(created.id, created);
    state.assessmentCreates.set(input.idempotencyKey, created);
    return created;
  },
  patchAssessment(id: string, facts: EventAssessmentFacts, unknownFields: readonly string[] = []): EventAssessmentContract | null {
    const found = assessMap().get(id);
    if (!found) return null;
    const filled = [...new Set([...(found.userFilledFields ?? []), ...(Object.keys(facts) as (keyof EventAssessmentFacts)[]), ...(unknownFields as (keyof EventAssessmentFacts)[])])];
    const missingFields = found.missingFields.filter((field) => !(field in facts) && !unknownFields.includes(field));
    // 原样采用推测值的项（同 live）：保留 guessed 并给出 adoptedGuessFields。
    const adopted = (Object.keys(facts) as (keyof EventAssessmentFacts)[]).filter((key) => found.factBasis?.[key] === "guessed" && facts[key] === found.facts[key]);
    const extra = adopted.length ? { adoptedGuessFields: adopted } : {};
    const next: EventAssessmentContract = found.id === demoEventAssessmentNeedsInput.id && missingFields.length === 0
      ? { ...demoEventAssessmentRange, id: found.id, facts: { ...demoEventAssessmentRange.facts, ...facts }, userFilledFields: filled, ...extra }
      : { ...found, facts: { ...found.facts, ...facts }, missingFields, userFilledFields: filled, ...extra };
    assessMap().set(id, next);
    return next;
  },
  addAssessmentToPlan(id: string): boolean {
    const found = assessMap().get(id);
    if (!found) return false;
    assessMap().set(id, { ...found, userDecision: "added" });
    return true;
  },
  dismissAssessment(id: string): boolean {
    const found = assessMap().get(id);
    if (!found) return false;
    assessMap().set(id, { ...found, userDecision: "dismissed" });
    return true;
  },
  /** Mock: the AI entries are shown (sample data; no AI is called). */
  assessmentAvailability: () => ({ aiReadAvailable: true, dailyLeft: 5, monthlyLeft: 10, monthlyLimit: 10 }),
  /** R26 design-board fixtures (dev route only): replace the mock assessments; `null` restores the demo world. */
  overrideAssessments(items: readonly EventAssessmentContract[] | null) {
    // Next dev bundles each route separately: the override lives on globalThis so every route sees it (as the plan fixtures do).
    if (items === null) delete assessmentGlobal.__orbitR26MockAssessments;
    else assessmentGlobal.__orbitR26MockAssessments = new Map(items.map((item) => [item.id, item]));
    state.assessmentCreates = new Map();
    state.assessmentReads = new Map();
  },
  /** Only the demo events can be dismissed. */
  dismiss(eventId: string, reason: EventRecommendationDismissReason): EventRecommendationDismissResult | null {
    return DEMO_EVENTS.some((event) => event.id === eventId) ? { eventId, reason, dismissedAt: nowIso() } : null;
  },
  accountExports: () => [...state.exports.values()],
  accountExport: (id: string) => state.exports.get(id) ?? null,
  createAccountExport(input: AccountExportCreateInput): AccountExportContract {
    const replay = state.exportCreates.get(input.idempotencyKey);
    if (replay) return replay;
    const created: AccountExportContract = { id: `demo-export-${state.exports.size + 1}`, scope: input.scope, status: "queued", requestedAt: nowIso() };
    state.exports.set(created.id, created);
    state.exportCreates.set(input.idempotencyKey, created);
    return created;
  },
  deletionRequest: () => state.deletion,
  requestDeletion() { state.deletion = state.deletion && !state.deletion.cancelledAt ? state.deletion : demoDeletionRequest; return state.deletion; },
  /** DELETE is idempotent: with no request it answers null. */
  cancelDeletion() { state.deletion = state.deletion ? { ...state.deletion, cancelledAt: state.deletion.cancelledAt ?? nowIso() } : null; return state.deletion; },
  appVersion: () => demoAppVersion,
  /** Tests only. */
  reset() { state = freshState(); delete assessmentGlobal.__orbitR26MockAssessments; },
};
