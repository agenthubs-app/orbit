/**
 * R27 参加登録 facade（契约 event-join）。Owner: 甲 (R27).
 * - 问题 = 现有 AI 自适应访谈（≤5 问，带签名 token）；多选 / 上限按字段定（会いたい人 多选，話したいテーマ ≤2）。
 * - 资料：カバー率 / 各项 / 話題 是规则；只有 `draft` 时才调用现有 persona（E4 的自己紹介下書き）。
 * - 提交：先走普通报名；活动开了审核（409 admission）就走审核申请。公開範囲按字段由服务端定（registrationFieldVisibility）。
 * - 仮予定：用户确认后才写进日历；审核结果出来后（下次读详情时）改名为正式 / 被拒时删除（syncTentative）。
 */
import type { HostEventContact } from "../../../shared/contract/host-events";
import type { HostSetupQuestion } from "../../../shared/contract/host-console";
import type { EventJoinAnswer, EventJoinCancelResult, EventJoinProfile, EventJoinProfileItemKey, EventJoinQuestion, EventJoinResult, EventJoinStep, EventJoinTentativeResult } from "../../../shared/contract/event-join";
import { OFFER_OPTIONS, SEEK_OPTIONS, TOPIC_OPTIONS } from "../../../shared/compute/profile-tag-options";
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
/** 满 5 题后仍缺项：确认页「追加」只针对缺的那一项再问，缺几项补几项（目的・话题・想见的人・能提供 最多 4 项），不无限追问。 */
export const JOIN_ANSWER_MAX = JOIN_TOTAL + 4;
/** 每题约 20 秒（「残り 約1分」）。 */
const SECONDS_PER_QUESTION = 20;

/** 字段 → 资料项（カバー率：会社・役職 44 + 其余各 14；画板 72 % / 86 % / 100 %）。 */
const ITEM_OF_FIELD: Readonly<Record<string, EventJoinProfileItemKey>> = { desiredOutcome: "purpose", experienceHighlight: "topics", targetAttendees: "target", valueOffered: "offer" };
const ITEM_WEIGHT: Readonly<Record<EventJoinProfileItemKey, number>> = { company: 44, offer: 14, purpose: 14, target: 14, topics: 14 };
const ITEMS: readonly EventJoinProfileItemKey[] = ["company", "purpose", "topics", "target", "offer"];
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
  const coverage = ITEMS.reduce((sum, key) => sum + (filled.has(key) ? ITEM_WEIGHT[key] : 0), 0);
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
  /**
   * `from`：谁、用什么语言报名——问答没问到的公司・职位、行业由资料补上。
   * `from.derived`：访谈没问到的核心项（主办方题或资料标签提供），提交端签成固定题一起交。
   */
  submit(eventId: string, answers: readonly EventJoinAnswer[], from?: { actorId: string; language: JourneyLanguage; derived?: readonly JoinDerivedAnswer[] }): Promise<{ status: "registered" | "pending_review"; submittedAt: string }>;
  /** 确认页上的自己紹介，跟这次报名一起留存（显示给这场活动的其他参会者）。 */
  saveIntro(actorId: string, eventId: string, text: string): Promise<void>;
  /** 清掉这场活动的自己紹介（取消报名、或这次报名没带介绍时；文字一并抹掉，不只是隐藏）。 */
  removeIntro?(actorId: string, eventId: string): Promise<void>;
  /** 取消报名（现有取消路由）；之后由 syncTentative 删掉仮予定。 */
  cancel(eventId: string): Promise<void>;
  createSchedule(actorId: string, input: { title: string; startsAt: string; endsAt: string; idempotencyKey: string }): Promise<string>;
  readTentative(actorId: string, eventId: string): Promise<{ scheduleItemId: string; final: boolean; removed?: boolean } | null>;
  saveTentative(actorId: string, eventId: string, record: { scheduleItemId: string; final: boolean; removed?: boolean }): Promise<void>;
  renameSchedule(actorId: string, scheduleItemId: string, title: string): Promise<void>;
  removeSchedule(actorId: string, scheduleItemId: string): Promise<void>;
  now?(): number;
  registrationStatus(actorId: string, eventId: string): Promise<"registered" | "pending_review" | "rejected" | "cancelled" | "none">;
  /** R17（host/DESIGN.md §2.7）：主办方公开的申込質問（先问，再由访谈补足到 5 问）。没有就不问。 */
  hostQuestions?(eventId: string): Promise<readonly HostSetupQuestion[]>;
  /** R17：报名成功后留存对申込質問的回答（问题 id → 回答；多选用「 · 」连接）。 */
  saveHostAnswers?(actorId: string, eventId: string, answers: Readonly<Record<string, string>>): Promise<void>;
}

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
  const service = {
    async next(eventId: string, answers: readonly EventJoinAnswer[], language: JourneyLanguage, more = false, actorId: string | null = null, focus: EventJoinProfileItemKey | null = null): Promise<EventJoinStep | null> {
      if (!(await ports.event(eventId))) return null;
      const filled = filledItems(answers);
      // 资料：预选（主办方题库题、访谈题）、告诉访谈哪些选项已有、核心项的兜底（提交时签成固定题）。
      const tags = actorId ? await profileTags(actorId, language) : null;
      const fromProfile = profileCoreAnswers(tags, language);
      // 确认页点「编辑」资料补上的那一项（focus）：只问这一项，本人的回答代替资料。
      const asked = ANSWER_ITEMS.find((item) => item === focus && !filled.has(item));
      const missing = asked ? [asked] : ANSWER_ITEMS.filter((item) => !filled.has(item) && !fromProfile[item]);
      // 满 5 题后：四项都有值就结束；还有缺项（主办方题占了名额）就只针对缺的项继续问，不受 5 题限制（上限 JOIN_ANSWER_MAX）。
      // 核心项缺了报名接口会拒绝，所以不能停在这里；目的・话题也补齐，确认资料四项都有值。
      const extra = Boolean(asked) || answers.length >= JOIN_TOTAL;
      if (extra && (missing.length === 0 || answers.length >= JOIN_ANSWER_MAX)) return joinStep(answers.length, null, language);
      if (!extra) {
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
          const step = joinStep(answers.length, { allowCustom: shown.kind === "free", field: `${HOST_QUESTION_FIELD_PREFIX}${pending.id}`, multi: shown.kind === "multiple", options: [...shown.options], prompt: shown.prompt, questionToken: `${HOST_QUESTION_FIELD_PREFIX}${pending.id}` }, language);
          return prefill.length && step.question ? { ...step, question: { ...step.question, prefill } } : step;
        }
      }
      // 访谈不再问：资料已有的公司・职位 / 行业，和已被回答（含主办方题）覆盖的项。满 5 题后的追问只问缺的项。
      const covered = ANSWER_ITEMS.filter((item) => filled.has(item)).map((item) => FIELD_OF_ITEM[item]);
      // 资料里已有、会单独列出并预选的选项告诉访谈，免得生成同义项（「客户引荐」与「介绍人脉」）。
      const knownOptions = Object.fromEntries(["targetAttendees", "valueOffered", "experienceHighlight", "desiredOutcome"].map((field) => [field, profileOptionsFor(field, tags, language)] as const).filter(([, list]) => list.length));
      const plan: JoinInterviewPlan = { ...(extra ? { focusFields: missing.map((item) => FIELD_OF_ITEM[item]) } : { skipFields: [...PROFILE_FIELDS, ...covered] }), ...(Object.keys(knownOptions).length ? { knownOptions } : {}) };
      const question = await ports.next(eventId, answers.filter((answer) => !isHostAnswer(answer)), language, more || Boolean(asked), plan);
      const step = joinStep(answers.length, question, language, extra ? answers.length + 1 : JOIN_TOTAL);
      if (!step.question) return step;
      return { ...step, question: prefillQuestion(step.question, tags, language) };
    },
    async profile(actorId: string, eventId: string, answers: readonly EventJoinAnswer[], draft: boolean, language: JourneyLanguage): Promise<EventJoinProfile | null> {
      const event = await ports.event(eventId);
      if (!event) return null;
      const persona = draft ? await ports.persona(eventId, personaAnswers(answers), language).catch(() => null) : null;
      const intro = persona?.selfIntroDraft ? { source: "ai_draft" as const, text: persona.selfIntroDraft } : draft ? await ports.profileIntro(actorId).then((text) => (text ? { source: "profile" as const, text } : null)) : null;
      const basis = intro?.source === "ai_draft" ? tri(language, "回答（目的・テーマ・会いたい人）とプロフィールから作成。売上などの数値は入れていません。", "根据回答（目的、话题、想见的人）和个人资料写成，没有放入营收等数字。", "Written from your answers (goal, topics, who to meet) and your profile. No revenue or other figures.") : null;
      // Answers stay editable until registration closes (the policy's profile-edit deadline is the close); a day before the
      // start was often already past (「报名后10/25前仍可修改」 on a 10/26 event). Nothing is promised once that time has passed.
      const editableUntilAt = event.registrationClosesAt ?? event.startsAt;
      const editableUntil = Date.parse(editableUntilAt) > Date.now() ? new Date(Date.parse(editableUntilAt)).toISOString() : null;
      // 资料标签兜底的核心项只在问完（满 5 题）后才算有值：答题中预填的项要用户确认那一题才算（否则一开始就 72 %）。
      const filled = filledItems(answers);
      const exhausted = answers.length >= JOIN_TOTAL;
      const tags = exhausted && CORE_ITEMS.some((item) => !filled.has(item)) ? await profileTags(actorId, language) : null;
      const profileItems = resolveCoreAnswers(answers, tags, language).derived.filter((item) => item.source === "profile").map((item) => (item.field === "targetAttendees" ? "target" : "offer") as EventJoinProfileItemKey);
      return profileFromAnswers(answers, { editableUntil, profileItems, personaTopics: persona?.topics ?? [], review: event.review, reviewUntil: event.review ? event.registrationClosesAt : null, selfIntro: intro, selfIntroBasis: basis });
    },
    async submit(actorId: string, eventId: string, answers: readonly EventJoinAnswer[], language: JourneyLanguage, selfIntro?: string, edit = false): Promise<EventJoinResult | null> {
      const event = await ports.event(eventId);
      if (!event) return null;
      // 截止后什么都不改（回答没变时报名接口会照常返回，介绍也不能借机改）。
      const closesAt = Date.parse(event.registrationClosesAt ?? event.startsAt);
      if (Number.isFinite(closesAt) && (ports.now?.() ?? Date.now()) >= closesAt) throw new JoinRefusedError("JOIN_CLOSED", "Registration has closed.");
      // 改资料时报名已经取消 / 被拒：不当成重新报名。
      if (edit) {
        const status = await ports.registrationStatus(actorId, eventId);
        if (status === "cancelled" || status === "none") throw new JoinRefusedError("JOIN_CANCELLED", "The registration was cancelled.");
        if (status === "rejected") throw new JoinRefusedError("JOIN_REJECTED", "The application was not accepted.");
      }
      const hostQuestions = ports.hostQuestions ? await ports.hostQuestions(eventId).catch(() => []) : [];
      // 访谈没问到的核心项：用主办方题 / 资料标签补成签名固定题（否则报名接口与审核申请都会因缺核心项拒绝）。
      const filled = filledItems(answers.filter((answer) => !isHostAnswer(answer)));
      const tags = CORE_ITEMS.some((item) => !filled.has(item)) ? await profileTags(actorId, language) : null;
      const { derived } = resolveCoreAnswers(answers, tags, language);
      const outcome = await ports.submit(eventId, answers.filter((answer) => !isHostAnswer(answer)), { actorId, language, ...(derived.length ? { derived } : {}) });
      const hostAnswers = validHostAnswers(hostQuestions, answers);
      if (ports.saveHostAnswers && Object.keys(hostAnswers).length > 0) await ports.saveHostAnswers(actorId, eventId, hostAnswers);
      // 这次报名的介绍覆盖上一次的；没带介绍就清掉旧的（取消后再报名时，旧介绍不能借着新报名重新显示给别人）。
      if (selfIntro?.trim()) await ports.saveIntro(actorId, eventId, selfIntro);
      else await ports.removeIntro?.(actorId, eventId);
      const endsAt = event.endsAt ?? new Date(Date.parse(event.startsAt) + 2 * 3_600_000).toISOString();
      return {
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
    async tentative(actorId: string, eventId: string, idempotencyKey: string, language: JourneyLanguage): Promise<EventJoinTentativeResult | null> {
      const event = await ports.event(eventId);
      if (!event) return null;
      const existing = await ports.readTentative(actorId, eventId);
      const status = await ports.registrationStatus(actorId, eventId);
      const final = status === "registered";
      const title = tentativeTitle(event.title, language, final);
      // A record saved with an empty id (before the schedule id fix) is treated as missing, so a retry can succeed.
      if (existing && !existing.removed && existing.scheduleItemId) return { eventId, scheduleItemId: existing.scheduleItemId, title };
      const endsAt = event.endsAt ?? new Date(Date.parse(event.startsAt) + 2 * 3_600_000).toISOString();
      const scheduleItemId = await ports.createSchedule(actorId, { endsAt, idempotencyKey, startsAt: event.startsAt, title });
      await ports.saveTentative(actorId, eventId, { final, scheduleItemId });
      return { eventId, scheduleItemId, title };
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
    /** 审核结果出来后：通过 → 去掉「仮：」（final = 已改名）；被拒 / 取消 → 删掉这条日程（removed，确定参加后再取消也删）。读详情时顺带调用，失败不影响页面。 */
    async syncTentative(actorId: string, eventId: string, language: JourneyLanguage): Promise<void> {
      const record = await ports.readTentative(actorId, eventId);
      if (!record || record.removed) return;
      const status = await ports.registrationStatus(actorId, eventId);
      const event = await ports.event(eventId);
      if (!event) return;
      if (status === "registered" && !record.final) {
        await ports.renameSchedule(actorId, record.scheduleItemId, tentativeTitle(event.title, language, true));
        await ports.saveTentative(actorId, eventId, { ...record, final: true });
      } else if (status === "rejected" || status === "cancelled") {
        await ports.removeSchedule(actorId, record.scheduleItemId);
        await ports.saveTentative(actorId, eventId, { ...record, removed: true });
      }
    },
  };
  return service;
}
export type JoinService = ReturnType<typeof createJoinService>;
