/**
 * R27 参加登録 facade（契约 event-join）。Owner: 甲 (R27).
 * - 问题 = 现有 AI 自适应访谈（≤5 问，带签名 token）；多选 / 上限按字段定（会いたい人 多选，話したいテーマ ≤2）。
 * - 资料：カバー率 / 各项 / 話題 是规则；只有 `draft` 时才调用现有 persona（E4 的自己紹介下書き）。
 * - 提交：先走普通报名；活动开了审核（409 admission）就走审核申请。公開範囲按字段由服务端定（registrationFieldVisibility）。
 * - 日历（2026-11-27 用户定「报名成功后自动加入日历」）：报名成功（审核中 = 暂定 / 已确定 = 正式标题）时服务端自动写一条个人日程，
 *   幂等键按账号 + 活动（+ 第几次写入）固定；用户点「移除」= 删掉并记下不要（之后的同步不再自动重建，除非他再点添加）。
 *   之后跟真实状态走：审核通过去掉「暂定」、被拒 / 取消删除（syncTentative）；主办方中止删除全部、改期更新时间（syncEvent）。
 */
import { profileEditCloseAt } from "../admission/registration-close";
import type { HostEventContact } from "../../../shared/contract/host-events";
import type { HostSetupQuestion } from "../../../shared/contract/host-console";
import type { EventJoinAnswer, EventJoinWechatAnswer, EventJoinCalendarRemoveResult, EventJoinCancelResult, EventJoinCurrent, EventJoinPrefilledField, EventJoinProfile, EventJoinProfileItemKey, EventJoinQuestion, EventJoinResult, EventJoinStep, EventJoinTentativeResult } from "../../../shared/contract/event-join";
import { OFFER_OPTIONS, SEEK_OPTIONS, TOPIC_OPTIONS } from "../../../shared/compute/profile-tag-options";
import { JOIN_COVERAGE_ITEMS, JOIN_ITEM_OF_FIELD, joinCoverage } from "../../../shared/domain/join-coverage";
import { PROFILE_ONBOARDING_GOALS } from "../../../shared/compute/profile-onboarding-goal";
import { HOST_QUESTION_PROFILE_ITEM, hostQuestionOptionAliases, hostQuestionProfilePrefill, localizeQuestion } from "../../../shared/domain/host-question-library";
import { AppError } from "../../../shared/errors/app-error";
import type { JourneyLanguage } from "./prep-core";

/** 报名 / 改资料被拒的原因（409 的 context.reason）：已截止 / 主办方已审核，不能改 / 被拒 / 已取消（要重新报名）。 */
export type JoinRefusal = "JOIN_CLOSED" | "JOIN_LOCKED" | "JOIN_REJECTED" | "JOIN_CANCELLED";
export class JoinRefusedError extends AppError {
  constructor(readonly reason: JoinRefusal, message: string) { super("CONFLICT", message); }
}

export const JOIN_TOTAL = 5;
/**
 * 回答条数的上限（5 题 + 确认页用户自己点「补上」的 4 项）。2026-11-27 起新报名不再自动追问第 6 题；
 * 只有用户主动点「补上 / 编辑」才会多答（可选），所以仍按这个上限收。
 */
export const JOIN_ANSWER_MAX = JOIN_TOTAL + 4;
/** 每题约 20 秒（「残り 約1分」）。 */
const SECONDS_PER_QUESTION = 20;

/** 字段 → 资料项（カバー率：会社・役職 44 + 其余各 14；画板 72 % / 86 % / 100 %）。 */
const ITEM_OF_FIELD: Readonly<Record<string, EventJoinProfileItemKey>> = JOIN_ITEM_OF_FIELD;
const ITEMS: readonly EventJoinProfileItemKey[] = JOIN_COVERAGE_ITEMS;
type AnswerItem = Exclude<EventJoinProfileItemKey, "company">;
/** 访谈优先补的顺序（会いたい人・提供できること 两道核心题在前，再是目的、话题）。 */
const ANSWER_ITEMS: readonly AnswerItem[] = ["target", "offer", "purpose", "topics"];
const FIELD_OF_ITEM: Readonly<Record<AnswerItem, string>> = { offer: "valueOffered", purpose: "desiredOutcome", target: "targetAttendees", topics: "experienceHighlight" };
/** 资料里已经有的（公司・职位、行业由资料补上），报名访谈不再问。 */
const PROFILE_FIELDS = ["positioning", "industry"] as const;

/** 这一答填的是哪一项：访谈字段按 ITEM_OF_FIELD，主办方的申込質問按题库 id（HOST_QUESTION_PROFILE_ITEM，不看文案）。 */
function itemOfAnswer(field: string): AnswerItem | null {
  if (field.startsWith(HOST_QUESTION_FIELD_PREFIX)) return HOST_QUESTION_PROFILE_ITEM[field.slice(HOST_QUESTION_FIELD_PREFIX.length)] ?? null;
  return (ITEM_OF_FIELD[field] as AnswerItem | undefined) ?? null;
}

export function filledItems(answers: readonly EventJoinAnswer[]): Set<EventJoinProfileItemKey> {
  const filled = new Set<EventJoinProfileItemKey>(["company"]);
  for (const answer of answers) { const item = itemOfAnswer(answer.field); if (item && answer.answer.trim()) filled.add(item); }
  return filled;
}

/** 报名接口 / 审核申请都要求签名回答里有这两项（EVENT_PROFILE_CORE_FIELDS）。 */
const CORE_ITEMS: readonly AnswerItem[] = ["target", "offer"];

/** 访谈没问到的核心项在提交时补成签名固定题：来自覆盖它的主办方题，或资料里的「求めていること / 提供できること」。 */
export interface JoinDerivedAnswer { field: "targetAttendees" | "valueOffered"; answer: string; source: "host" | "profile" }

/**
 * 资料标签能补上的核心项（按当前语言，用「 · 」连接）。`tags` 来自公开投影（projectPublicProfile）：本人关了
 * 「提供・求めていること」的公开，这两项就是空的——不静默补进对参会者公开的回答，缺的核心项继续追问（2026-11-26 用户定）。
 */
function profileCoreAnswers(tags: JoinProfileTags | null, language: JourneyLanguage): Partial<Record<AnswerItem, string>> {
  const text = (list: readonly string[] | undefined) => localizedTags(list, language).join(" · ");
  const out: Partial<Record<AnswerItem, string>> = {};
  if (text(tags?.seeking)) out.target = text(tags?.seeking);
  if (text(tags?.offering)) out.offer = text(tags?.offering);
  return out;
}

/**
 * 核心项（会いたい人・提供できること）谁来提供：访谈问到了就用访谈；否则用覆盖它的主办方回答；再否则用资料标签；都没有 = 还得问。
 * `derived` 交给提交端签成固定题，`unresolved` 是还必须追问的项。
 */
export function resolveCoreAnswers(answers: readonly EventJoinAnswer[], tags: JoinProfileTags | null, language: JourneyLanguage): { derived: JoinDerivedAnswer[]; unresolved: AnswerItem[] } {
  const fromProfile = profileCoreAnswers(tags, language);
  const derived: JoinDerivedAnswer[] = [];
  const unresolved: AnswerItem[] = [];
  for (const item of CORE_ITEMS) {
    const field = FIELD_OF_ITEM[item] as JoinDerivedAnswer["field"];
    if (answers.some((answer) => answer.field === field && answer.answer.trim())) continue;
    const host = answers.find((answer) => answer.field.startsWith(HOST_QUESTION_FIELD_PREFIX) && itemOfAnswer(answer.field) === item && answer.answer.trim());
    if (host) derived.push({ answer: host.answer.trim().slice(0, 1000), field, source: "host" });
    else if (fromProfile[item]) derived.push({ answer: fromProfile[item]!, field, source: "profile" });
    else unresolved.push(item);
  }
  return { derived, unresolved };
}

/** 题库「その他 / 其他 / Other」不当成话题。 */
const OTHER_TEXTS = new Set(["その他", "其他", "Other"]);

const tri = (language: JourneyLanguage, ja: string, zh: string, en: string) => (language === "zh" ? zh : language === "en" ? en : ja);

export function questionShape(field: string, language: JourneyLanguage): Pick<EventJoinQuestion, "multi" | "max" | "help"> {
  if (field === "targetAttendees") return { help: tri(language, "参加者にも表示されます（複数可）", "同场参会者也能看到（可多选）", "Also shown to attendees (choose any)"), max: null, multi: true };
  if (field === "experienceHighlight") return { help: null, max: 2, multi: true };
  // 2026-11-26：资料里的强项 / 目标各自一个选项、各自预选，可以单独取消（以前并成「A · B · C」一个选项）。
  if (field === "valueOffered") return { help: null, max: null, multi: true };
  if (field === "desiredOutcome") return { help: null, max: 2, multi: true };
  return { help: null, max: null, multi: false };
}

export function joinStep(answered: number, question: (Omit<EventJoinQuestion, "multi" | "max" | "help"> & { multi?: boolean }) | null, language: JourneyLanguage, total = JOIN_TOTAL): EventJoinStep {
  const done = !question || answered >= total;
  const remaining = Math.max(0, total - answered);
  const { multi, ...rest } = question ?? ({} as Omit<EventJoinQuestion, "multi" | "max" | "help"> & { multi?: boolean });
  return {
    done,
    index: done ? answered : answered + 1,
    question: done ? null : { ...rest, ...questionShape(rest.field, language), ...(multi !== undefined ? { max: null, multi } : {}) },
    remainingMinutes: Math.max(done ? 0 : 1, Math.round((remaining * SECONDS_PER_QUESTION) / 60)),
    total,
  };
}

const answerParts = (text: string) => text.split(/\s*[·、,，]\s*/).map((item) => item.trim()).filter((item) => item && !OTHER_TEXTS.has(item));

export function profileFromAnswers(answers: readonly EventJoinAnswer[], extras: { profileItems?: readonly EventJoinProfileItemKey[]; selfIntro?: EventJoinProfile["selfIntro"]; selfIntroBasis?: string | null; personaTopics?: readonly string[]; editableUntil?: string | null; reviewUntil?: string | null; review: boolean }): EventJoinProfile {
  // `profileItems`：提交时由资料标签补上的核心项（resolveCoreAnswers），确认页同样算有值（只在问完后传，答题中不算）。
  const filled = new Set([...filledItems(answers), ...(extras.profileItems ?? [])]);
  const coverage = joinCoverage(filled);
  // 话题 chip 只来自话题题（访谈的话题题与主办方 lib-topic 等）和 persona 的 topics；能提供的、目的、想见的人的回答不混进来。
  const topicAnswers = answers.filter((answer) => itemOfAnswer(answer.field) === "topics").flatMap((answer) => answerParts(answer.answer));
  const notTopics = new Set(answers.filter((answer) => { const item = itemOfAnswer(answer.field); return item !== null && item !== "topics"; }).flatMap((answer) => answerParts(answer.answer)));
  const topics = [...new Set([...topicAnswers, ...(extras.personaTopics ?? []).filter((topic) => !notTopics.has(topic))])].slice(0, 6);
  return {
    coverage,
    editableUntil: extras.editableUntil ?? null,
    items: ITEMS.map((key) => ({ done: filled.has(key), key, ...(extras.profileItems?.includes(key) ? { fromProfile: true } : {}) })),
    review: extras.review,
    reviewUntil: extras.reviewUntil ?? null,
    selfIntro: extras.selfIntro ?? null,
    selfIntroBasis: extras.selfIntroBasis ?? null,
    topics,
  };
}

/** 「仮：CFO Night」（结果出来后改成「CFO Night」）。 */
export function tentativeTitle(title: string, language: JourneyLanguage, final = false): string {
  const short = title.replace(/\s*(Tokyo|東京)?\s*vol\.?\s*\d+\s*$/i, "").replace(/\s+Tokyo$/i, "").trim() || title;
  return final ? short : tri(language, `仮：${short}`, `暂定：${short}`, `Tentative: ${short}`);
}

/**
 * 资料里已经有的：会いたい人 = 求めていること、提供できること = 提供、话题 = topics、目标 = relationshipGoal 读出的目标 id；
 * 职级 / 行业用来给主办方的「立場」题预选（hostQuestionProfilePrefill）。
 */
export interface JoinProfileTags {
  offering: readonly string[];
  seeking: readonly string[];
  topics?: readonly string[];
  goalIds?: readonly string[];
  seniority?: string | null;
  industryId?: string | null;
  secondaryIndustryId?: string | null;
}

const OPTIONS_MAX = 12;
/** 预选的资料项最多几个（每项单独一个选项）。 */
const PREFILL_MAX = 6;

/** 资料标签按当前语言、去重。 */
function localizedTags(list: readonly string[] | undefined, language: JourneyLanguage): string[] {
  return [...new Set((list ?? []).map((item) => localizeProfileTag(item.trim(), language)).filter(Boolean))].slice(0, PREFILL_MAX);
}

/** 资料目标（PROFILE_ONBOARDING_GOALS 的 id）按当前语言。 */
function goalLabels(ids: readonly string[] | undefined, language: JourneyLanguage): string[] {
  return (ids ?? []).flatMap((id) => { const goal = PROFILE_ONBOARDING_GOALS.find((item) => item.id === id); return goal ? [goal[language]] : []; });
}

/** 资料里能给这个访谈字段预选的选项（当前语言）。 */
export function profileOptionsFor(field: string, tags: JoinProfileTags | null, language: JourneyLanguage): string[] {
  if (!tags) return [];
  if (field === "targetAttendees") return localizedTags(tags.seeking, language);
  if (field === "valueOffered") return localizedTags(tags.offering, language);
  if (field === "experienceHighlight") return localizedTags(tags.topics, language);
  if (field === "desiredOutcome") return goalLabels(tags.goalIds, language);
  return [];
}

/** 选项去重用：去掉空白与标点、小写；同一张三语标签表里的不同写法算同一个。 */
const normalizeOption = (text: string) => text.toLowerCase().replace(/[\s·・、,，/／&＆()（）「」"'.。-]/gu, "");
function sameOption(a: string, b: string): boolean {
  const x = normalizeOption(a);
  const y = normalizeOption(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // 「客户引荐」与「渠道与客户引荐」：一边完整包含另一边（≥2 字）也当同一项。
  if ((x.length >= 2 && y.includes(x)) || (y.length >= 2 && x.includes(y))) return true;
  const tagX = PROFILE_TAG_OPTIONS.find((option) => [option.ja, option.zh, option.en].some((text) => normalizeOption(text) === x));
  return Boolean(tagX && [tagX.ja, tagX.zh, tagX.en].some((text) => normalizeOption(text) === y));
}

const PROFILE_TAG_OPTIONS = [...OFFER_OPTIONS, ...SEEK_OPTIONS, ...TOPIC_OPTIONS];
/** 资料话题 → TOPIC_OPTIONS 的中文写法（题库预选表的键）；表外的自定义话题不参与。 */
function profileTopicKeys(topics: readonly string[] | undefined): string[] {
  return (topics ?? []).flatMap((topic) => { const hit = TOPIC_OPTIONS.find((option) => option.ja === topic || option.zh === topic || option.en === topic); return hit ? [hit.zh] : []; });
}

/** 资料标签命中三语候选表（任一语言的写法）就换成当前语言；自己写的标签原样。 */
export function localizeProfileTag(tag: string, language: JourneyLanguage): string {
  const hit = PROFILE_TAG_OPTIONS.find((option) => option.ja === tag || option.zh === tag || option.en === tag);
  return hit ? hit[language] : tag;
}

/**
 * 资料里填过的放到选项最前并先选上（按当前语言显示，每项单独一个选项，用户可以单独取消）；访谈生成的选项里与之相同 / 同义的去掉。
 * 单选题只预选第一项。有上限的多选题（话题 ≤2、目的 ≤2）只预选到上限。
 */
export function prefillQuestion(question: EventJoinQuestion, tags: JoinProfileTags | null, language: JourneyLanguage = "ja"): EventJoinQuestion {
  const values = profileOptionsFor(question.field, tags, language);
  if (!values.length) return question;
  const prefill = question.multi ? values.slice(0, question.max ?? PREFILL_MAX) : values.slice(0, 1);
  const rest = question.options.filter((option) => !values.some((value) => sameOption(value, option)));
  return { ...question, options: [...values, ...rest].slice(0, OPTIONS_MAX), prefill };
}

export interface JoinProfileFacts { organization: string | null; role: string | null; industry: string | null }

/** 问题页「…はプロフィールから入力済み」列出的项：资料里确实有的公司 / 职位 / 行业（顺序固定）。 */
export function prefilledFields(facts: JoinProfileFacts | null): EventJoinPrefilledField[] {
  if (!facts) return [];
  return ([["company", facts.organization], ["title", facts.role], ["industry", facts.industry]] as const).flatMap(([key, value]) => (value?.trim() ? [key] : []));
}

const FACT_QUESTIONS = {
  industry: { en: "What industry are you in?", zh: "你所在的行业是什么？" },
  positioning: { en: "What are your role and company?", zh: "你的职位和公司是什么？" },
} as const;

/**
 * 活动侧的公司・职位、行业取自报名回答（event-operations/participant.ts）。问答没问到时，用个人资料里的补上，
 * 当作本人回答的固定题：「職位 @ 会社」。只有职位没有公司时不补（会被当成公司名）。
 */
export function profileFactQuestions(facts: JoinProfileFacts | null, answered: readonly string[], language: "en" | "zh") {
  const organization = facts?.organization?.trim();
  const role = facts?.role?.trim();
  const industry = facts?.industry?.trim();
  const values = { industry, positioning: organization ? (role ? `${role} @ ${organization}` : organization) : undefined };
  return (["positioning", "industry"] as const).flatMap((field) => {
    const answer = values[field]?.slice(0, 80);
    if (!answer || answered.includes(field)) return [];
    return [{ answer, field, options: [answer, language === "en" ? "Prefer not to say" : "不填"], prompt: FACT_QUESTIONS[field][language] }];
  });
}

export interface JoinCurrentRegistration {
  status: EventJoinCurrent["status"];
  /** 主办方已经决定（通过 / 安排候补）。 */
  decided: boolean;
  answers: readonly { answer: string; fixed: boolean; question: Omit<EventJoinQuestion, "multi" | "max" | "help"> }[];
  hostAnswers: Readonly<Record<string, string>>;
  selfIntro: string | null;
}

export interface JoinPorts {
  event(eventId: string): Promise<{ title: string; startsAt: string; endsAt: string | null; review: boolean; registrationClosesAt: string | null; hostContact?: HostEventContact | null } | null>;
  /**
   * `more`：用户在确认页点了「追加 / 質問に戻る」，即使访谈认为够了也再问一题（live 由 AI 自己决定，可能仍然结束）。
   * `plan`：`skipFields` = 不要再问的字段（资料已有 / 主办方题已覆盖）；`focusFields` = 满 5 题后只针对缺的项追问。
   */
  next(eventId: string, answers: readonly EventJoinAnswer[], language: JourneyLanguage, more?: boolean, plan?: JoinInterviewPlan): Promise<Omit<EventJoinQuestion, "multi" | "max" | "help"> | null>;
  /** `topics`：persona 认出的「想聊的话题」（只放话题，确认页话题 chip 用）。 */
  persona(eventId: string, answers: readonly EventJoinAnswer[], language: JourneyLanguage): Promise<{ selfIntroDraft?: string | null; tags?: readonly string[]; topics?: readonly string[] } | null>;
  profileIntro(actorId: string): Promise<string | null>;
  profileTags?(actorId: string, language?: JourneyLanguage): Promise<JoinProfileTags | null>;
  /** 资料里的公司・职位・行业（问题页「入力済み」一行只列有的项）。缺省或读不到 = 不显示那一行。 */
  profileFacts?(actorId: string, language: JourneyLanguage): Promise<JoinProfileFacts | null>;
  /**
   * `from`：谁、用什么语言报名——问答没问到的公司・职位、行业由资料补上。
   * `from.derived`：访谈没问到的核心项（主办方题或资料标签提供），提交端签成固定题一起交。
   */
  submit(eventId: string, answers: readonly EventJoinAnswer[], from?: { actorId: string; language: JourneyLanguage; derived?: readonly JoinDerivedAnswer[] }): Promise<{ status: "registered" | "pending_review"; submittedAt: string }>;
  /**
   * 2026-11-27 用户新增「已加群的报名自动通过」：活动（已公开的报名设置）是否打开了这个开关。缺省 = 没有这个功能（照旧审核）。
   */
  wechatAutoAdmit?(eventId: string): Promise<boolean>;
  /**
   * 自报已加群的审核申请自动通过：走与主办方「承認」同一条状态迁移（同事务的受付番号 / 通知 / 名额）。
   * 只动「審査中」的申请；满员时按现有规则（候补或不动），返回之后的状态（registered = 已确定参加）。
   */
  autoAdmit?(actorId: string, eventId: string): Promise<"registered" | "pending_review">;
  /** 留痕：这次的自报回答与是否因此自动通过（主办方列表显示「自报已加群 · 自动通过」）。 */
  saveWechatReport?(actorId: string, eventId: string, report: { answer: EventJoinWechatAnswer; autoAdmitted: boolean }): Promise<void>;
  /** 确认页上的自己紹介，跟这次报名一起留存（显示给这场活动的其他参会者）。 */
  saveIntro(actorId: string, eventId: string, text: string): Promise<void>;
  /** 清掉这场活动的自己紹介（取消报名、或这次报名没带介绍时；文字一并抹掉，不只是隐藏）。 */
  removeIntro?(actorId: string, eventId: string): Promise<void>;
  /** 取消报名（现有取消路由）；之后由 syncTentative 删掉仮予定。 */
  cancel(eventId: string): Promise<void>;
  createSchedule(actorId: string, input: { title: string; startsAt: string; endsAt: string; idempotencyKey: string }): Promise<string>;
  readTentative(actorId: string, eventId: string): Promise<JoinTentativeRecord | null>;
  saveTentative(actorId: string, eventId: string, record: JoinTentativeRecord): Promise<void>;
  /** `false` = 那条日程已经不在了（用户自己删了）。 */
  renameSchedule(actorId: string, scheduleItemId: string, title: string): Promise<void | boolean>;
  removeSchedule(actorId: string, scheduleItemId: string): Promise<void>;
  /** 日程还在不在（用户可能在日历里自己删了）；没有这个端口 = 当作还在。 */
  scheduleExists?(actorId: string, scheduleItemId: string): Promise<boolean>;
  /** 改期：同时改开始 / 结束时间与标题；`false` = 日程已经不在了。 */
  updateSchedule?(actorId: string, scheduleItemId: string, patch: { title: string; startsAt: string; endsAt: string }): Promise<void | boolean>;
  /** 这场活动所有人的日历记录（主办方中止 / 改期时一次读出，不逐人查）。 */
  eventTentatives?(eventId: string): Promise<readonly { actorId: string; record: JoinTentativeRecord }[]>;
  now?(): number;
  /** 这个人这场活动现在的报名（没有 = null）；`answers` 是重新签过名的访谈回答，`fixed` = 固定题（主办方题 / 资料补的，或 AI 用不了时问的）。 */
  current?(actorId: string, eventId: string, language: JourneyLanguage): Promise<JoinCurrentRegistration | null>;
  /** 固定题（不调 AI）：编辑时缺的核心项用它补问。 */
  fixedQuestion?(actorId: string, eventId: string, field: string, language: JourneyLanguage): Promise<Omit<EventJoinQuestion, "multi" | "max" | "help"> | null>;
  registrationStatus(actorId: string, eventId: string): Promise<"registered" | "pending_review" | "rejected" | "cancelled" | "none">;
  /** R17（host/DESIGN.md §2.7）：主办方公开的申込質問（先问，再由访谈补足到 5 问）。没有就不问。 */
  hostQuestions?(eventId: string): Promise<readonly HostSetupQuestion[]>;
  /** R17：报名成功后留存对申込質問的回答（问题 id → 回答；多选用「 · 」连接）。 */
  saveHostAnswers?(actorId: string, eventId: string, answers: Readonly<Record<string, string>>): Promise<void>;
}

/**
 * 每人每场一条（actor record `eventTentativeSchedules`）。`removed` = 那条日程已删（取消 / 被拒 / 中止 / 用户移除）；
 * `optedOut` = 用户自己不要（点了移除，或在日历里删了）——自动写入与同步都不再重建，直到他再点「添加」。
 * `generation` = 第几次写入（幂等键的一部分：删了再写要换新键）；`language` / `title` / `startsAt` / `endsAt` = 写进去的内容（同步时比较，没变就不写）。
 */
export interface JoinTentativeRecord {
  scheduleItemId: string;
  final: boolean;
  removed?: boolean;
  optedOut?: boolean;
  generation?: number;
  language?: JourneyLanguage;
  title?: string;
  startsAt?: string;
  endsAt?: string;
}

/** 报名成功后自动写日历的幂等键：按账号（日程服务按账号存回执）+ 活动 + 第几次写入固定，并发两次提交只会有一条。 */
export const joinCalendarKey = (eventId: string, generation: number) => `event-join-calendar:${eventId}:${generation}`;

export interface JoinInterviewPlan { skipFields?: readonly string[]; focusFields?: readonly string[]; knownOptions?: Readonly<Record<string, readonly string[]>> }

/** 申込質問的字段前缀（与访谈字段区分；令牌由服务端按公开问题集校验，不需要签名）。 */
export const HOST_QUESTION_FIELD_PREFIX = "host:";
const isHostAnswer = (answer: EventJoinAnswer) => answer.field.startsWith(HOST_QUESTION_FIELD_PREFIX);

/**
 * 只留下属于公开问题集、选项合法的回答（自由回答 ≤200 字）。
 * 题库题按参加者的界面语言显示，所以任一语言版的选项都认；存的是主办方公开的那个写法（按选项位置换回），
 * 主办方的回答一览 / 按选项筛选照旧对得上。
 */
export function validHostAnswers(questions: readonly HostSetupQuestion[], answers: readonly EventJoinAnswer[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const answer of answers.filter(isHostAnswer)) {
    const question = questions.find((item) => `${HOST_QUESTION_FIELD_PREFIX}${item.id}` === answer.field);
    const text = answer.answer.trim();
    if (!question || !text) continue;
    if (question.kind === "free") { out[question.id] = text.slice(0, 200); continue; }
    const aliases = hostQuestionOptionAliases(question);
    // 选项本身含「·」（旧模板的「专业服务 · 支援机构」）时整句就是一个选项，不能按「·」拆开。
    const whole = aliases.get(text);
    const picked = whole !== undefined ? [whole] : [...new Set(text.split(/\s*·\s*/u).flatMap((item) => { const published = aliases.get(item); return published === undefined ? [] : [published]; }))];
    if (picked.length === 0 || (question.kind === "single" && picked.length > 1)) continue;
    out[question.id] = picked.join(" · ");
  }
  return out;
}

/** 主办方的申込質問 → 报名页的一题（按当前语言；主办方自己改写过的保持原文）。 */
function hostJoinQuestion(question: HostSetupQuestion, language: JourneyLanguage): EventJoinQuestion {
  const shown = localizeQuestion(question, language);
  const field = `${HOST_QUESTION_FIELD_PREFIX}${question.id}`;
  return { allowCustom: shown.kind === "free", field, help: null, max: null, multi: shown.kind === "multiple", options: [...shown.options], prompt: shown.prompt, questionToken: field };
}

/** 存的主办方题回答（公开的写法）→ 当前语言的写法；有一项已经不在选项里 = 题被改过，要重新问（null）。 */
function storedHostAnswer(question: HostSetupQuestion, stored: string, language: JourneyLanguage): string | null {
  if (question.kind === "free") return stored;
  const aliases = hostQuestionOptionAliases(question);
  const shown = localizeQuestion(question, language).options;
  const parts = aliases.has(stored) ? [stored] : stored.split(/\s*·\s*/u);
  const picked = parts.map((part) => { const published = aliases.get(part); return published === undefined ? -1 : question.options.indexOf(published); });
  if (picked.some((index) => index < 0 || shown[index] === undefined) || (question.kind === "single" && picked.length > 1)) return null;
  return picked.map((index) => shown[index]!).join(" · ");
}

/** 改资料时的一题：上次的回答排在选项最前并先选上（优先于资料预选），资料里的选项和原来的选项跟在后面。 */
function answeredQuestion(question: EventJoinQuestion, answer: string, fromProfile: readonly string[]): EventJoinQuestion {
  const parts = question.options.includes(answer) || !question.multi ? [answer] : [...new Set(answer.split(/\s+·\s+/u).map((part) => part.trim()).filter(Boolean))];
  const rest = [...fromProfile, ...question.options].filter((option, index, all) => all.indexOf(option) === index && !parts.some((part) => sameOption(part, option)));
  return { ...question, options: [...parts, ...rest].slice(0, OPTIONS_MAX), prefill: parts.slice(0, question.max ?? OPTIONS_MAX) };
}

/** 自己紹介草稿用的回答：访谈回答 + 填了某一项的主办方题（按那一项的访谈字段交给 persona，其余主办方题不给）。 */
function personaAnswers(answers: readonly EventJoinAnswer[]): EventJoinAnswer[] {
  return answers.flatMap((answer) => {
    if (!isHostAnswer(answer)) return [answer];
    const item = itemOfAnswer(answer.field);
    return item ? [{ ...answer, field: FIELD_OF_ITEM[item] }] : [];
  });
}

export function createJoinService(deps: { ports: JoinPorts }) {
  const { ports } = deps;
  const profileTags = async (actorId: string, language: JourneyLanguage) => (await ports.profileTags?.(actorId, language).catch(() => null)) ?? null;
  type JoinEvent = NonNullable<Awaited<ReturnType<JoinPorts["event"]>>>;
  /**
   * 2026-11-27 用户新增：审核制 + 活动开关打开 + 本人自报「已加群」→ 服务端直接通过（不信客户端传来的状态）。
   * 未回答（旧客户端）/「还没有」/ 开关关 = 照旧审核中。自动通过失败（满员、并发改判、库不可用）也照旧审核中，报名本身不受影响。
   */
  const wechatOutcome = async (actorId: string, eventId: string, review: boolean, status: "registered" | "pending_review", answer: EventJoinWechatAnswer | undefined): Promise<"registered" | "pending_review"> => {
    if (!answer || !review || status !== "pending_review" || !ports.wechatAutoAdmit) return status;
    if (!(await ports.wechatAutoAdmit(eventId).catch(() => false))) return status;
    const next = answer === "joined" && ports.autoAdmit ? await ports.autoAdmit(actorId, eventId).catch((error: unknown) => {
      console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_join_wechat_auto_admit_failed" }));
      return "pending_review" as const;
    }) : status;
    await ports.saveWechatReport?.(actorId, eventId, { answer, autoAdmitted: next === "registered" }).catch(() => undefined);
    return next;
  };
  const calendarWindow = (event: JoinEvent) => ({ endsAt: event.endsAt ?? new Date(Date.parse(event.startsAt) + 2 * 3_600_000).toISOString(), startsAt: event.startsAt });
  const live = (record: JoinTentativeRecord | null): boolean => Boolean(record && !record.removed && record.scheduleItemId);
  const exists = async (actorId: string, record: JoinTentativeRecord) => (ports.scheduleExists ? ports.scheduleExists(actorId, record.scheduleItemId) : true);
  /** 写一条新日程（上一条已删 / 没有过）：换下一个 generation 的幂等键。 */
  const writeCalendar = async (actorId: string, eventId: string, event: JoinEvent, final: boolean, language: JourneyLanguage, previous: JoinTentativeRecord | null): Promise<JoinTentativeRecord> => {
    const generation = previous ? (previous.generation ?? 0) + 1 : 0;
    const window = calendarWindow(event);
    const title = tentativeTitle(event.title, language, final);
    const scheduleItemId = await ports.createSchedule(actorId, { ...window, idempotencyKey: joinCalendarKey(eventId, generation), title });
    if (!scheduleItemId) throw new Error("schedule id missing");
    const record: JoinTentativeRecord = { ...window, final, generation, language, scheduleItemId, title };
    await ports.saveTentative(actorId, eventId, record);
    return record;
  };
  const dropCalendar = async (actorId: string, eventId: string, record: JoinTentativeRecord, optedOut = false) => {
    await ports.removeSchedule(actorId, record.scheduleItemId);
    await ports.saveTentative(actorId, eventId, { ...record, removed: true, ...(optedOut || record.optedOut ? { optedOut: true } : {}) });
  };
  /**
   * 让一条日程跟活动现状一致：`status` 给了就按报名状态（通过 → 正式标题；被拒 / 取消 → 删除），null = 只看活动（改期 / 改名）。
   * `force`：旧记录没存时间（改期功能之前写的），主办方改过活动时照样写一次。日程已被用户删掉 → 记成不要，不重建。
   */
  const reconcile = async (actorId: string, eventId: string, record: JoinTentativeRecord, event: JoinEvent | null, status: Awaited<ReturnType<JoinPorts["registrationStatus"]>> | null, fallback: JourneyLanguage, force = false): Promise<JoinTentativeRecord | null> => {
    if (status === "rejected" || status === "cancelled") { await dropCalendar(actorId, eventId, record); return null; }
    if (!event) return record;
    const final = status === "registered" ? true : record.final;
    const language = record.language ?? fallback;
    const title = tentativeTitle(event.title, language, final);
    const window = calendarWindow(event);
    const moved = Boolean(ports.updateSchedule) && (record.startsAt === undefined ? force : record.startsAt !== window.startsAt || record.endsAt !== window.endsAt);
    const renamed = record.title === undefined ? final !== record.final : record.title !== title;
    if (!moved && !renamed) return record;
    const done = moved ? await ports.updateSchedule!(actorId, record.scheduleItemId, { ...window, title }) : await ports.renameSchedule(actorId, record.scheduleItemId, title);
    if (done === false) { await ports.saveTentative(actorId, eventId, { ...record, optedOut: true, removed: true }); return null; }
    const next: JoinTentativeRecord = { ...record, final, language, title, ...(moved ? window : {}) };
    await ports.saveTentative(actorId, eventId, next);
    return next;
  };
  /** 报名成功后自动写日历（编辑资料不走这里）。已有一条就沿用；用户移除过 / 在日历里删过就不写。失败不影响报名。 */
  const autoCalendar = async (actorId: string, eventId: string, event: JoinEvent, status: "registered" | "pending_review", language: JourneyLanguage): Promise<JoinTentativeRecord | null> => {
    const existing = await ports.readTentative(actorId, eventId);
    if (existing?.optedOut) return null;
    if (existing && live(existing)) {
      if (!(await exists(actorId, existing))) { await ports.saveTentative(actorId, eventId, { ...existing, optedOut: true, removed: true }); return null; }
      return reconcile(actorId, eventId, existing, event, status, language);
    }
    return writeCalendar(actorId, eventId, event, status === "registered", language, existing);
  };
  const service = {
    /**
     * 2026-11-27 用户反馈「问了那么多题还缺，再追问观感很差」：新报名一共最多 5 题（含主办方题），出题按覆盖来排——
     * 每题前算「还没覆盖的项」与「剩余题数」，剩余 ≤ 未覆盖时下一题必须针对一个未覆盖项（核心项在前；AI 出题把它当硬约束，
     * 不出 / 偏题 / 出错就用该项的固定题）。资料标签或主办方题已覆盖的项不再问。满 5 题就结束，不再有第 6 题
     * （旧 App 照旧发 `more` 也只回结束）。`focus` = 用户在确认页自己点的「补上 / 编辑」，只问那一项（可选入口）。
     */
    async next(eventId: string, answers: readonly EventJoinAnswer[], language: JourneyLanguage, more = false, actorId: string | null = null, focus: EventJoinProfileItemKey | null = null): Promise<EventJoinStep | null> {
      if (!(await ports.event(eventId))) return null;
      const filled = filledItems(answers);
      // 资料：预选（主办方题库题、访谈题）、告诉访谈哪些选项已有、核心项的兜底（提交时签成固定题）。
      const tags = actorId ? await profileTags(actorId, language) : null;
      const fromProfile = profileCoreAnswers(tags, language);
      // 资料里已有、会单独列出并预选的选项告诉访谈，免得生成同义项（「客户引荐」与「介绍人脉」）。
      const knownOptions = Object.fromEntries(["targetAttendees", "valueOffered", "experienceHighlight", "desiredOutcome"].map((field) => [field, profileOptionsFor(field, tags, language)] as const).filter(([, list]) => list.length));
      const withKnown = (plan: JoinInterviewPlan): JoinInterviewPlan => (Object.keys(knownOptions).length ? { ...plan, knownOptions } : plan);
      const interview = answers.filter((answer) => !isHostAnswer(answer));
      const answeredFields = new Set(interview.map((answer) => answer.field));
      /**
       * 问一题：`target` = 必须针对的项（AI 偏题 / 不出 / 出错 → 该项的固定题）；null = 访谈自由选。
       * `fallback`：自由选时 AI 不出 / 出错 / 重复，还有没覆盖的项就落到它的固定题（不提前结束）。
       */
      const ask = async (plan: JoinInterviewPlan, target: AnswerItem | null, total: number, fallback: AnswerItem | null = target): Promise<EventJoinStep> => {
        let question: Awaited<ReturnType<JoinPorts["next"]>> = null;
        try {
          question = await ports.next(eventId, interview, language, more || Boolean(target), withKnown(plan));
        } catch (error) {
          // 四项都已覆盖时多出来的题只是加分项：访谈出错就直接结束；否则落到固定题（没有固定题端口时照旧报错）。
          if (fallback ? !ports.fixedQuestion || !actorId : target) throw error;
        }
        // 偏题：必须针对的项却问了别的；自由选时问了这次已经答过的字段（重复）。
        if (question && (target ? itemOfAnswer(question.field) !== target : answeredFields.has(question.field))) question = null;
        if (!question && fallback && ports.fixedQuestion && actorId) question = await ports.fixedQuestion(actorId, eventId, FIELD_OF_ITEM[fallback], language);
        const step = joinStep(answers.length, question, language, total);
        return step.question ? { ...step, question: prefillQuestion(step.question, tags, language) } : step;
      };
      // 确认页点「补上 / 编辑」的那一项（focus）：只问这一项，本人的回答代替资料。已经有回答就不问。
      if (focus) {
        const asked = ANSWER_ITEMS.find((item) => item === focus && !filled.has(item));
        return asked ? ask({ focusFields: [FIELD_OF_ITEM[asked]] }, asked, answers.length + 1) : joinStep(answers.length, null, language);
      }
      if (answers.length >= JOIN_TOTAL) return joinStep(answers.length, null, language);
      // R17：主办方的申込質問先问（按顺序），问完再由访谈补足；访谈只看访谈自己的回答。
      // 题库题按当前界面语言显示（主办方自己改写过的题保持原文）；回答在提交时换回公开的写法（validHostAnswers）。
      const hostQuestions = ports.hostQuestions ? await ports.hostQuestions(eventId).catch(() => []) : [];
      const pending = hostQuestions.find((question) => !answers.some((answer) => answer.field === `${HOST_QUESTION_FIELD_PREFIX}${question.id}`));
      if (pending) {
        const shown = localizeQuestion(pending, language);
        // 题库的立場 / 目的 / 话题题：资料对得上的选项先选上（按选项位置，对不上不选）。
        const picked = hostQuestionProfilePrefill(pending, tags ? { goalIds: tags.goalIds, industryId: tags.industryId, secondaryIndustryId: tags.secondaryIndustryId, seniority: tags.seniority, topicKeys: profileTopicKeys(tags.topics) } : null)
          .flatMap((index) => (shown.options[index] === undefined ? [] : [shown.options[index]!]));
        const prefill = shown.kind === "single" ? picked.slice(0, 1) : picked;
        const { max: _max, help: _help, ...hostAsked } = hostJoinQuestion(pending, language);
        const step = joinStep(answers.length, hostAsked, language);
        return prefill.length && step.question ? { ...step, question: { ...step.question, prefill } } : step;
      }
      // 还没覆盖的项（核心在前）；资料标签 / 已答（含主办方题）覆盖的不再问。
      const uncovered = ANSWER_ITEMS.filter((item) => !filled.has(item) && !fromProfile[item]);
      const left = JOIN_TOTAL - answers.length;
      const target = uncovered.length > 0 && left <= uncovered.length ? uncovered[0]! : null;
      if (target) return ask({ focusFields: [FIELD_OF_ITEM[target]] }, target, JOIN_TOTAL);
      // 还有富余：访谈自由挑（核心 → 目的・话题 → 其它，见 remainingFieldsFor），跳过已覆盖的项与资料已有的公司・职位 / 行业。
      const covered = ANSWER_ITEMS.filter((item) => filled.has(item) || fromProfile[item]).map((item) => FIELD_OF_ITEM[item]);
      return ask({ skipFields: [...PROFILE_FIELDS, ...covered] }, null, JOIN_TOTAL, uncovered[0] ?? null);
    },
    /** 进报名页先读：新报名还是改资料、能不能改、上次的回答。改资料不调 AI。 */
    async current(actorId: string, eventId: string, language: JourneyLanguage): Promise<EventJoinCurrent | null> {
      const event = await ports.event(eventId);
      if (!event) return null;
      const mine = (await ports.current?.(actorId, eventId, language)) ?? null;
      const fresh = { answers: [], ask: [], blocked: null, selfIntro: null } as const;
      const nowMs = ports.now?.() ?? Date.now();
      const closesAt = Date.parse(event.registrationClosesAt ?? event.startsAt);
      const closed = Number.isFinite(closesAt) && nowMs >= closesAt;
      // 2026-11-28：已报名的人改资料一直开到活动结束（registration-close.ts）。
      const editCloseAt = Date.parse(profileEditCloseAt(event.endsAt, event.startsAt, event.registrationClosesAt) ?? "");
      const editClosed = Number.isFinite(editCloseAt) && nowMs >= editCloseAt;
      // 没报名 / 已取消：截止了就直接说（不问第一题、不调 AI）；否则新报名。
      if (!mine || mine.status === "none" || mine.status === "cancelled") return { ...fresh, blocked: closed ? "JOIN_CLOSED" : null, status: mine?.status ?? "none" };
      if (mine.status === "rejected") return { ...fresh, blocked: "JOIN_REJECTED", status: mine.status };
      // 已截止 / 主办方已决定：不能改，但照样带回上次的内容，页面只读显示。
      const blocked = editClosed ? "JOIN_CLOSED" as const : mine.status !== "pending_review" && (mine.decided || event.review) ? "JOIN_LOCKED" as const : null;
      const hostQuestions = ports.hostQuestions ? await ports.hostQuestions(eventId).catch(() => []) : [];
      const tags = await profileTags(actorId, language);
      // 主办方题：删掉的丢弃；选项改得对不上的、新增的必答题要补问；其余按当前语言带回。
      const ask: EventJoinCurrent["ask"][number][] = [];
      const host: EventJoinCurrent["answers"][number][] = [];
      for (const question of hostQuestions) {
        const shown = hostJoinQuestion(question, language);
        const stored = mine.hostAnswers[question.id]?.trim();
        const answer = stored ? storedHostAnswer(question, stored, language) : null;
        if (answer) host.push({ answer, field: shown.field, item: itemOfAnswer(shown.field), prompt: shown.prompt, question: question.kind === "free" ? shown : answeredQuestion(shown, answer, []), questionToken: shown.questionToken });
        else if (stored || question.required) ask.push({ ...shown, item: itemOfAnswer(shown.field) });
      }
      const fromProfile = profileCoreAnswers(tags, language);
      const interview = mine.answers.flatMap(({ answer, fixed, question }) => {
        const item = itemOfAnswer(question.field);
        // 公司・职位、行业每次按资料重新补；由主办方题或资料补成的核心项提交时会重新补，不当成本人单独答过的题。
        if (fixed && (PROFILE_FIELDS as readonly string[]).includes(question.field)) return [];
        if (fixed && item && (host.some((entry) => entry.item === item) || fromProfile[item] === answer)) return [];
        return [{ answer, field: question.field, item, prompt: question.prompt, question: answeredQuestion({ ...question, ...questionShape(question.field, language) }, answer, profileOptionsFor(question.field, tags, language)), questionToken: question.questionToken }];
      });
      const answers = [...host, ...interview];
      const asked = [...answers.map((entry) => entry.field), ...ask.map((question) => question.field)].map((field) => itemOfAnswer(field));
      for (const item of blocked ? [] : CORE_ITEMS) {
        if (asked.includes(item) || fromProfile[item]) continue;
        const question = await ports.fixedQuestion?.(actorId, eventId, FIELD_OF_ITEM[item], language);
        if (question) ask.push({ ...prefillQuestion({ ...question, ...questionShape(question.field, language) }, tags, language), item });
      }
      return { answers, ask: blocked ? [] : ask, blocked, selfIntro: mine.selfIntro?.trim() || null, status: mine.status };
    },
    async profile(actorId: string, eventId: string, answers: readonly EventJoinAnswer[], draft: boolean, language: JourneyLanguage, edit = false): Promise<EventJoinProfile | null> {
      const event = await ports.event(eventId);
      if (!event) return null;
      const persona = draft ? await ports.persona(eventId, personaAnswers(answers), language).catch(() => null) : null;
      const intro = persona?.selfIntroDraft ? { source: "ai_draft" as const, text: persona.selfIntroDraft } : draft ? await ports.profileIntro(actorId).then((text) => (text ? { source: "profile" as const, text } : null)) : null;
      const basis = intro?.source === "ai_draft" ? tri(language, "回答（目的・テーマ・会いたい人）とプロフィールから作成。売上などの数値は入れていません。", "根据回答（目的、话题、想见的人）和个人资料写成，没有放入营收等数字。", "Written from your answers (goal, topics, who to meet) and your profile. No revenue or other figures.") : null;
      // Answers stay editable until registration closes (the policy's profile-edit deadline is the close); a day before the
      // start was often already past (「报名后10/25前仍可修改」 on a 10/26 event). Nothing is promised once that time has passed.
      const editableUntilAt = profileEditCloseAt(event.endsAt, event.startsAt, event.registrationClosesAt) ?? event.startsAt;
      const editableUntil = Date.parse(editableUntilAt) > Date.now() ? new Date(Date.parse(editableUntilAt)).toISOString() : null;
      // 资料标签兜底的核心项只在问完（满 5 题）后才算有值：答题中预填的项要用户确认那一题才算（否则一开始就 72 %）。
      const filled = filledItems(answers);
      // `draft`：只在问完时才请求（访谈提前问完、不到 5 答时也算）。
      const exhausted = edit || draft || answers.length >= JOIN_TOTAL;
      const tags = exhausted && CORE_ITEMS.some((item) => !filled.has(item)) ? await profileTags(actorId, language) : null;
      const profileItems = resolveCoreAnswers(answers, tags, language).derived.filter((item) => item.source === "profile").map((item) => (item.field === "targetAttendees" ? "target" : "offer") as EventJoinProfileItemKey);
      // 2026-11-27 用户新增：审核制活动开了「已加群自动通过」→ 确认页必答这道题；改资料不问。
      // 2026-11-27 用户定：审核中的人改资料时也问（选「已加群」可自动通过）；其他已报名状态改资料不问。
      const asksWechat = event.review && Boolean(ports.wechatAutoAdmit) && (!edit || (await ports.registrationStatus(actorId, eventId).catch(() => null)) === "pending_review");
      const wechatCheck = asksWechat ? await ports.wechatAutoAdmit!(eventId).catch(() => false) : false;
      // 问题页「…はプロフィールから入力済み」：新报名第一次读取（还没答）和改资料时读一次资料；之后的读取不再带（页面记住第一次的）。
      const prefilledFrom = !draft && (edit || answers.length === 0) && ports.profileFacts ? prefilledFields(await ports.profileFacts(actorId, language).catch(() => null)) : null;
      return { ...(prefilledFrom ? { prefilledFrom } : {}), ...profileFromAnswers(answers, { editableUntil, profileItems, personaTopics: persona?.topics ?? [], review: event.review, reviewUntil: event.review ? event.registrationClosesAt : null, selfIntro: intro, selfIntroBasis: basis }), ...(wechatCheck ? { hostContact: event.hostContact ?? null, wechatCheck: true } : {}) };
    },
    async submit(actorId: string, eventId: string, answers: readonly EventJoinAnswer[], language: JourneyLanguage, selfIntro?: string, edit = false, wechatJoined?: EventJoinWechatAnswer): Promise<EventJoinResult | null> {
      const event = await ports.event(eventId);
      if (!event) return null;
      // 截止后什么都不改（回答没变时报名接口会照常返回，介绍也不能借机改）。
      // 改资料开到活动结束；新报名按（放宽后的）报名截止。
      const closesAt = Date.parse((edit ? profileEditCloseAt(event.endsAt, event.startsAt, event.registrationClosesAt) : event.registrationClosesAt) ?? event.startsAt);
      if (Number.isFinite(closesAt) && (ports.now?.() ?? Date.now()) >= closesAt) throw new JoinRefusedError("JOIN_CLOSED", "Registration has closed.");
      // 改资料时报名已经取消 / 被拒：不当成重新报名。
      let editStatus: Awaited<ReturnType<JoinPorts["registrationStatus"]>> | null = null;
      if (edit) {
        const status = await ports.registrationStatus(actorId, eventId);
        editStatus = status;
        if (status === "cancelled" || status === "none") throw new JoinRefusedError("JOIN_CANCELLED", "The registration was cancelled.");
        if (status === "rejected") throw new JoinRefusedError("JOIN_REJECTED", "The application was not accepted.");
      }
      const before = edit || selfIntro?.trim() ? null : await ports.registrationStatus(actorId, eventId).catch(() => "registered" as const);
      const hostQuestions = ports.hostQuestions ? await ports.hostQuestions(eventId).catch(() => []) : [];
      // 访谈没问到的核心项：用主办方题 / 资料标签补成签名固定题（否则报名接口与审核申请都会因缺核心项拒绝）。
      const filled = filledItems(answers.filter((answer) => !isHostAnswer(answer)));
      const tags = CORE_ITEMS.some((item) => !filled.has(item)) ? await profileTags(actorId, language) : null;
      const { derived } = resolveCoreAnswers(answers, tags, language);
      const submitted = await ports.submit(eventId, answers.filter((answer) => !isHostAnswer(answer)), { actorId, language, ...(derived.length ? { derived } : {}) });
      // 2026-11-27 用户定：审核中的人改资料时也答这道题，选「已加群」同样自动通过；已通过 / 候补等其他状态改资料不动审核状态。
      const asksWechat = !edit || editStatus === "pending_review";
      const outcome = asksWechat ? { ...submitted, status: await wechatOutcome(actorId, eventId, event.review, submitted.status, wechatJoined) } : submitted;
      // 改资料时被自动通过：日历跟着去掉「暂定」（与主办方承認后的同步同一条）。
      if (edit && editStatus === "pending_review" && outcome.status === "registered") await service.syncTentative(actorId, eventId, language).catch(() => undefined);
      const hostAnswers = validHostAnswers(hostQuestions, answers);
      if (ports.saveHostAnswers && Object.keys(hostAnswers).length > 0) await ports.saveHostAnswers(actorId, eventId, hostAnswers);
      // 这次报名的介绍覆盖上一次的；没带介绍就清掉旧的（取消后再报名时，旧介绍不能借着新报名重新显示给别人）。
      if (selfIntro?.trim()) await ports.saveIntro(actorId, eventId, selfIntro);
      // 改资料时清空了介绍才清掉；旧版 App 不带 edit、没改过的介绍也不发，已报名的人再次提交不能把上次确认的介绍弄没。
      else if (edit || !["registered", "pending_review"].includes(before ?? "none")) await ports.removeIntro?.(actorId, eventId);
      const { endsAt } = calendarWindow(event);
      // 2026-11-27：报名成功（不是改资料）就自动加入日历；日历写不进去不影响报名（完成页给「添加」）。
      const calendar = edit ? null : await autoCalendar(actorId, eventId, event, outcome.status, language).catch((error: unknown) => {
        console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_join_calendar_auto_failed" }));
        return null;
      });
      return {
        ...(edit ? {} : { calendar: calendar ? { final: calendar.final, scheduleItemId: calendar.scheduleItemId, title: calendar.title ?? tentativeTitle(event.title, language, calendar.final) } : null }),
        endsAt: event.endsAt,
        eventId,
        reviewUntil: outcome.status === "pending_review" ? event.registrationClosesAt : null,
        startsAt: event.startsAt,
        status: outcome.status,
        submittedAt: outcome.submittedAt,
        tentative: { endsAt, startsAt: event.startsAt, title: tentativeTitle(event.title, language, outcome.status === "registered") },
        // 刚报名成功（審査中 / 確定）= 能看主催者の連絡先；完成页有 ID 就弹窗。
        hostContact: event.hostContact ?? null,
      };
    },
    /**
     * 用户主动「添加」（完成页 / 详情页 ⋯ / 旧客户端的确认卡）。已有一条且还在 → 原样返回（旧客户端报名后再调用不会多建）；
     * 用户移除过、或在日历里删了 → 这是他再次主动添加，写一条新的（幂等键换下一个 generation，并发点两次也只有一条）。
     * `_idempotencyKey`：旧客户端照发；键由服务端按账号 + 活动定。
     */
    async tentative(actorId: string, eventId: string, _idempotencyKey: string, language: JourneyLanguage): Promise<EventJoinTentativeResult | null> {
      const event = await ports.event(eventId);
      if (!event) return null;
      const existing = await ports.readTentative(actorId, eventId);
      const status = await ports.registrationStatus(actorId, eventId);
      const final = status === "registered";
      // A record saved with an empty id (before the schedule id fix) is treated as missing, so a retry can succeed.
      if (existing && live(existing) && (await exists(actorId, existing))) return { eventId, scheduleItemId: existing.scheduleItemId, title: existing.title ?? tentativeTitle(event.title, existing.language ?? language, final) };
      const record = await writeCalendar(actorId, eventId, event, final, language, existing);
      return { eventId, scheduleItemId: record.scheduleItemId, title: record.title ?? "" };
    },
    /** 完成页「移除」：删掉这条日程，记下不要（之后的自动写入 / 同步都不再重建，除非再点添加）。不看活动还在不在。 */
    async removeCalendar(actorId: string, eventId: string): Promise<EventJoinCalendarRemoveResult> {
      const existing = await ports.readTentative(actorId, eventId);
      const record: JoinTentativeRecord = existing ?? { final: false, scheduleItemId: "" };
      if (live(record)) await dropCalendar(actorId, eventId, record, true);
      else await ports.saveTentative(actorId, eventId, { ...record, optedOut: true, removed: true });
      return { eventId, removed: true };
    },
    async cancel(actorId: string, eventId: string, language: JourneyLanguage): Promise<EventJoinCancelResult | null> {
      if (!(await ports.event(eventId))) return null;
      // 幂等：已经取消的报名再取消一次照样成功（重复点击、网络重试），不再走报名接口。
      if ((await ports.registrationStatus(actorId, eventId).catch(() => null)) !== "cancelled") await ports.cancel(eventId);
      // 取消后介绍已不显示（只认 rsvped）；文字也清掉，不留着等下次报名。
      await ports.removeIntro?.(actorId, eventId).catch(() => undefined);
      await service.syncTentative(actorId, eventId, language).catch(() => undefined);
      return { eventId, status: "cancelled" };
    },
    /**
     * 一个人的这条日程跟报名状态对齐：通过 → 去掉「仮：」（final）；被拒 / 取消 → 删除（removed，确定参加后再取消也删）；活动改期 → 改时间。
     * 读详情时、用户取消后、主办方审批后调用，失败不影响页面 / 审批。
     */
    async syncTentative(actorId: string, eventId: string, language: JourneyLanguage): Promise<void> {
      const record = await ports.readTentative(actorId, eventId);
      if (!record || !live(record)) return;
      const status = await ports.registrationStatus(actorId, eventId);
      const event = status === "rejected" || status === "cancelled" ? null : await ports.event(eventId);
      await reconcile(actorId, eventId, record, event, status, language);
    },
    /**
     * 主办方中止 / 改了活动之后：这场活动所有人的日程一次读出（一条查询），中止 → 全部删除（不需要还能读到活动）；
     * 改动 → 读一次活动，时间 / 标题变了的才写。不逐人查报名状态。返回改动了几条。
     */
    async syncEvent(eventId: string, change: "cancelled" | "updated"): Promise<number> {
      if (!ports.eventTentatives) return 0;
      const rows = (await ports.eventTentatives(eventId)).filter((row) => live(row.record));
      if (!rows.length) return 0;
      const event = change === "updated" ? await ports.event(eventId) : null;
      if (change === "updated" && !event) return 0;
      let changed = 0;
      for (const { actorId, record } of rows) {
        try {
          if (change === "cancelled") { await dropCalendar(actorId, eventId, record); changed += 1; continue; }
          const next = await reconcile(actorId, eventId, record, event, null, record.language ?? "ja", true);
          if (next !== record) changed += 1;
        } catch (error) {
          console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "event_join_calendar_event_sync_failed" }));
        }
      }
      return changed;
    },
  };
  return service;
}
export type JoinService = ReturnType<typeof createJoinService>;
