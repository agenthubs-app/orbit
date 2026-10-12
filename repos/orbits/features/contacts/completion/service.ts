/**
 * R16「あとで補完 · 每天一问」（DESIGN add-and-invite §2.8、§3.3、§4.3、§9 #24）。R08 契约 3 的 live 实现。
 * Owner: 甲 (R16). Used by: `GET /api/contacts/completion-question`、`POST …/[id]/answer`、`POST …/[id]/skip`（经 `handlers.ts`）。
 *
 * - 每人每东京日最多 1 题：问题记录的 id 由「人 + 东京日」决定（`repository.ts`）。同一天再请求返回同一题；答过或跳过后
 *   当天返回 null（任一端答了，另一端刷新后就没有了——状态在服务端）。当天没有可问的人也记一条，当天不再读人脈。
 * - 规则出题、不调 AI（`shared/compute/completion-question-rules.ts`）：挑 ●○○、最近 30 个东京日内加入的人；两种题型；
 *   选项只来自真实数据（我参加过的活动、我人脈里的同公司 / 同邮箱域名的人）或固定项。
 * - 「我参加过的活动」= 我的联系人里记着 `metEventId` 的活动（有人证明我在场），时间取那场活动最早一位联系人的加入时间；
 *   R26 的参加记录接口出来后可以换掉这个来源（`events` 依赖）。※ 复核 M3（改用参加记录与活动开始时间）等用户拍板，未改。
 * - 读库按需（复核 M4，`CompletionContactSource`）：只读近 30 天加入的人（不读备注全文）、选定目标后再查同公司 / 同域名的人
 *   与目标前后的活动；读多少与人脈规模无关。
 * - 题目生成后会再核对（复核 m1）：显示前与回答前按联系人当前的值判断这一题还缺不缺，已经有了（别处补上了、或前一天的同一题
 *   先答了）就当作解决：当天不再显示，回答 → CONFLICT，不覆盖后来的值。
 * - 当天记了「没有可问的人」之后又新加了人（导入完成等）：下次取题时再出一次（仍然一天最多一题，复核 m6）。
 * - 回答写到哪里：活动 → `metEventId`（只补空，与名片同一字段）；紹介 / 前職の同僚 → 备注一行「出会い：…」；公司 →
 *   `organization`（`applyContactFieldValues`，旧值进 `fieldHistory`，来源 `completion`）；覚えていない → 只记在问题上。
 *   回答后按 D-10 重算浓度（`densityAfter`）：没有邮箱 / 电话的人答了「どこで」仍是 ●○○。
 * - 跳过（「明日」）：`skipCount + 1`，当天不再出题；同一个人的 `skipCount` 跨天累计（新的一天再问他时带上之前的次数），
 *   连续 3 次后不再问他；答过一次就归零。
 * - 幂等：回答 / 跳过带 `idempotencyKey`，同一个键重放返回第一次的结果；已经答过 / 跳过的题换键再来 → CONFLICT。
 * - 写操作在 `storage.write(actorId, …)` 里执行（live：一个 PostgreSQL 事务 + 按人的 advisory 锁）。
 */
import type { ContactCompletionQuestion, ContactCompletionResult } from "../../../shared/contract/contact-completion";
import {
  buildCompletionOptions,
  COMPLETION_EVENT_WINDOW_DAYS,
  COMPLETION_RECENT_DAYS,
  completionDensityFacts,
  completionOrganizationKey,
  completionQuestionText,
  pickCompletionTarget,
  resolveCompletionAnswer,
  tokyoDayOf,
  type CompletionContactFacts,
  type CompletionContactHistory,
} from "../../../shared/compute/completion-question-rules";
import { emailDomain, isFreeMailDomain } from "../../../shared/compute/work-contact-likelihood";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import { applyContactFieldValues, ContactFieldWriteError } from "../contact-field-write";
import {
  completionQuestionRecordId,
  getCompletionContact,
  createStoreCompletionContactSource,
  getCompletionQuestion,
  insertCompletionQuestion,
  listCompletionQuestions,
  listInteractedContactIds,
  saveCompletionQuestion,
  type CompletionContactRow,
  type CompletionContactSource,
  type CompletionQuestionRecord,
} from "./repository";

export type ContactCompletionErrorCode = "NOT_FOUND" | "INVALID" | "CONFLICT";

export class ContactCompletionError extends Error {
  readonly code: ContactCompletionErrorCode;

  constructor(code: ContactCompletionErrorCode, message: string) {
    super(message);
    this.name = "ContactCompletionError";
    this.code = code;
  }
}

type Store = LiveRecordStoreLike<Record<string, unknown>>;

export interface ContactCompletionStorage {
  workspaceId: string;
  /** `source` 缺省时在 `store` 上按内存方式读（测试替身用）；live 传 PostgreSQL 的按需查询。 */
  read<T>(fn: (store: Store, source?: CompletionContactSource) => Promise<T>): Promise<T>;
  /** 同一个人的写操作串行、整体成功或整体失败。 */
  write<T>(actorId: string, fn: (store: Store, source?: CompletionContactSource) => Promise<T>): Promise<T>;
}

export interface ContactCompletionService {
  /** 今天的题（东京日）；没有返回 null。 */
  today(actorId: string): Promise<ContactCompletionQuestion | null>;
  answer(actorId: string, questionId: string, input: { answer: string; idempotencyKey: string }): Promise<ContactCompletionResult>;
  skip(actorId: string, questionId: string, input: { idempotencyKey: string }): Promise<ContactCompletionResult>;
}

export interface ContactCompletionServiceOptions {
  storage: ContactCompletionStorage;
  /** 本人入力（招待コード连接）的联系人（D-10 的 ●●●）；缺省 = 没有。 */
  selfReportedContactIds?: (actorId: string) => Promise<readonly string[]>;
  now?: () => Date;
  log?: (line: string) => void;
}

const NAME_IN_QUESTION_MAX = 60;
const CONTACT_NAME_MAX = 120;
const SUBTITLE_MAX = 300;

function clip(value: string, max: number): string {
  return [...value].slice(0, max).join("");
}

/** 人脈列表的来源 chip（与 `ContactListItemContract.sourceChip` 同一组值）。 */
export function completionSourceChip(row: Pick<CompletionContactRow, "sourceType" | "sourceLabel" | "hasLinkedinNote">, selfReported: boolean): NonNullable<ContactCompletionQuestion["sourceChip"]> {
  if (selfReported) return "self";
  if (row.sourceType === "business_card_ocr" || row.sourceType === "qr_scan") return "meishi";
  if (row.sourceType === "external_contacts") {
    if (/vcard/iu.test(row.sourceLabel)) return "phone";
    if (row.hasLinkedinNote) return "linkedin";
  }
  return "manual";
}

function contactFacts(row: CompletionContactRow, strong: boolean): CompletionContactFacts {
  return {
    // R16 #2：加入时间 = LinkedIn 连接日期与录入时间里较早的（`repository.ts` 的 `completionAddedAt`）。
    addedAt: row.addedAt,
    contactId: row.contactId,
    displayName: row.displayName,
    emails: row.email ? [row.email] : [],
    hasContactPoint: Boolean(row.email || row.phone),
    hasMetContext: Boolean(row.metEventId) || row.hasMeetingNote,
    hasStrongSignal: strong,
    organization: row.organization,
  };
}

/** 这一题现在还缺吗（复核 m1）：公司已经有了 / 相遇场合已经有了 → 不缺。 */
function stillMissing(question: CompletionQuestionRecord, row: CompletionContactRow): boolean {
  return question.kind === "organization" ? !row.organization : !(row.metEventId || row.hasMeetingNote);
}

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

/** 每个人最近的问题记录 → 连续跳过次数与答过的题型。 */
function historyOf(questions: readonly CompletionQuestionRecord[]): Record<string, CompletionContactHistory> {
  const byContact = new Map<string, CompletionQuestionRecord[]>();
  for (const question of questions) {
    if (!question.contactId || question.status === "none") continue;
    byContact.set(question.contactId, [...(byContact.get(question.contactId) ?? []), question]);
  }
  const history: Record<string, CompletionContactHistory> = {};
  for (const [contactId, list] of byContact) {
    list.sort((left, right) => (left.askedOn < right.askedOn ? 1 : left.askedOn > right.askedOn ? -1 : 0));
    const latest = list[0]!;
    const skipStreak = latest.status === "answered" ? 0 : latest.skipCount ?? 0;
    const answeredKinds = [...new Set(list.filter((item) => item.status === "answered" && item.kind).map((item) => item.kind!))];
    history[contactId] = { answeredKinds, skipStreak };
  }
  return history;
}

function toView(question: CompletionQuestionRecord): ContactCompletionQuestion {
  return {
    askedOn: question.askedOn,
    contactId: question.contactId!,
    id: question.id,
    options: (question.options ?? []).map((option) => option.label),
    question: question.question!,
    skipCount: question.skipCount ?? 0,
    ...(question.contactName ? { contactName: question.contactName } : {}),
    ...(question.contactSubtitle ? { contactSubtitle: question.contactSubtitle } : {}),
    ...(question.sourceChip ? { sourceChip: question.sourceChip } : {}),
    ...(question.kind ? { kind: question.kind } : {}),
  };
}

export function createContactCompletionService({
  storage,
  selfReportedContactIds = async () => [],
  now = () => new Date(),
  log = (line) => console.warn(line),
}: ContactCompletionServiceOptions): ContactCompletionService {
  const workspaceId = storage.workspaceId;

  async function selfReported(actorId: string): Promise<Set<string>> {
    try {
      return new Set(await selfReportedContactIds(actorId));
    } catch (error) {
      // 招待连接读不到时按「没有本人入力」算（只会让人多被问一题，不会写错数据）。
      log(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "contact_completion_self_reported_failed" }));
      return new Set();
    }
  }

  /** 生成今天的题（写锁内）。只读近 30 天加入的人；选定目标后再按条件查选项需要的人与活动（复核 M4）。 */
  async function generate(store: Store, source: CompletionContactSource, actorId: string, askedOn: string, at: string): Promise<CompletionQuestionRecord> {
    const id = completionQuestionRecordId(actorId, askedOn);
    const rows = await source.recentContacts(actorId, shiftDays(at, -(COMPLETION_RECENT_DAYS + 1)));
    const questions = await listCompletionQuestions(store, workspaceId, actorId);
    const history = historyOf(questions);
    // 先按身份 / 联系方式 / 相遇场合筛出可能的 ●○○，再只为这些人读往来与本人入力。
    const loose = rows.filter((row) => completionDensityFacts(contactFacts(row, false)).level === 1);
    const [interacted, self] = await Promise.all([listInteractedContactIds(store, workspaceId, actorId, loose.map((row) => row.contactId)), selfReported(actorId)]);
    const strong = (contactId: string) => interacted.has(contactId) || self.has(contactId);
    const target = pickCompletionTarget({ contacts: loose.map((row) => contactFacts(row, strong(row.contactId))), history, now: at });
    const base = { actorId, askedOn, createdAt: at, id, updatedAt: at };
    if (!target) return { ...base, checkedAt: at, status: "none" };
    const row = rows.find((item) => item.contactId === target.contactId)!;
    const facts = contactFacts(row, false);
    const domains = [...new Set(facts.emails.map(emailDomain).filter((domain): domain is string => domain !== null && !isFreeMailDomain(domain)))];
    const window = COMPLETION_EVENT_WINDOW_DAYS + 2;
    const [others, events] = await Promise.all([
      source.peers(actorId, { domains, excludeContactId: row.contactId, organizationKey: completionOrganizationKey(row.organization) }),
      // 活动窗口围绕加入时间（R16 #2：LinkedIn 导入的人是连接日期，不是导入那天）。
      target.kind === "met_where" ? source.events(actorId, { from: shiftDays(row.addedAt, -window), to: shiftDays(row.addedAt, window) }) : Promise.resolve([]),
    ]);
    const options = buildCompletionOptions({ contact: facts, events, kind: target.kind, others });
    const name = row.displayName || row.contactId;
    const subtitle = [row.organization, row.role].filter(Boolean).join(" · ");
    return {
      ...base,
      contactId: row.contactId,
      contactName: clip(name, CONTACT_NAME_MAX),
      ...(subtitle ? { contactSubtitle: clip(subtitle, SUBTITLE_MAX) } : {}),
      kind: target.kind,
      options,
      question: completionQuestionText(target.kind, clip(name, NAME_IN_QUESTION_MAX)),
      skipCount: history[row.contactId]?.skipStreak ?? 0,
      sourceChip: completionSourceChip(row, self.has(row.contactId)),
      status: "open",
    };
  }

  async function requireQuestion(store: Store, actorId: string, questionId: string): Promise<CompletionQuestionRecord> {
    const question = questionId.trim() ? await getCompletionQuestion(store, workspaceId, actorId, questionId.trim()) : null;
    // 别人的、不存在的、「当天没有题」的记录一律 NOT_FOUND（不泄露存在与否）。
    if (!question || question.status === "none" || !question.contactId || !question.kind) throw new ContactCompletionError("NOT_FOUND", "The question was not found.");
    return question;
  }

  return {
    async today(actorId) {
      const at = now();
      const iso = at.toISOString();
      const askedOn = tokyoDayOf(iso)!;
      const id = completionQuestionRecordId(actorId, askedOn);
      const sourceOf = (store: Store, source?: CompletionContactSource) => source ?? createStoreCompletionContactSource(store, workspaceId);
      const visible = async (store: Store, question: CompletionQuestionRecord | null) => {
        if (!question || question.status !== "open" || !question.contactId) return null;
        // 这个人被删了（或不再归我），或这一题已经有答案了（复核 m1）：今天不再出题。
        const row = await getCompletionContact(store, workspaceId, actorId, question.contactId);
        return row && stillMissing(question, row) ? toView(question) : null;
      };
      /** 「没有可问的人」之后又新加了人（复核 m6）。 */
      const stale = (store: Store, source: CompletionContactSource | undefined, question: CompletionQuestionRecord) =>
        question.status === "none" ? sourceOf(store, source).addedSince(actorId, question.checkedAt ?? question.createdAt) : Promise.resolve(false);
      const existing = await storage.read((store) => getCompletionQuestion(store, workspaceId, actorId, id));
      if (existing && !(await storage.read((store, source) => stale(store, source, existing)))) return storage.read((store) => visible(store, existing));
      return storage.write(actorId, async (store, source) => {
        const again = await getCompletionQuestion(store, workspaceId, actorId, id);
        if (again && !(await stale(store, source, again))) return visible(store, again);
        const created = await generate(store, sourceOf(store, source), actorId, askedOn, iso);
        if (again) {
          // 当天的「没有可问的人」重算：有了就换成这道题，还是没有就记下这次确认的时间。
          const replaced = { ...created, createdAt: again.createdAt };
          await saveCompletionQuestion(store, workspaceId, replaced);
          return visible(store, replaced);
        }
        const inserted = await insertCompletionQuestion(store, workspaceId, created);
        return visible(store, inserted ? created : await getCompletionQuestion(store, workspaceId, actorId, id));
      });
    },

    async answer(actorId, questionId, input) {
      return storage.write(actorId, async (store) => {
        const question = await requireQuestion(store, actorId, questionId);
        if (question.status === "answered") {
          if (question.answerKey === input.idempotencyKey) return { densityAfter: question.densityAfter, next: null, questionId: question.id, status: "answered" };
          throw new ContactCompletionError("CONFLICT", "This question was already answered.");
        }
        if (question.status === "skipped") throw new ContactCompletionError("CONFLICT", "This question was skipped.");
        const current = await getCompletionContact(store, workspaceId, actorId, question.contactId!);
        if (!current) throw new ContactCompletionError("NOT_FOUND", "The person was not found.");
        if (!stillMissing(question, current)) throw new ContactCompletionError("CONFLICT", "This is already known about the person.");
        const effect = resolveCompletionAnswer({ answer: input.answer, kind: question.kind!, options: question.options ?? [] });
        if (!effect) throw new ContactCompletionError("INVALID", "The answer is not one of the choices.");
        const at = now();
        if (effect.kind !== "forgot") {
          try {
            await applyContactFieldValues({
              actorId,
              appendNoteLines: effect.kind === "note" ? [effect.line] : undefined,
              contactId: question.contactId!,
              fillMetEvent: effect.kind === "event" ? { eventId: effect.eventId, title: effect.title } : null,
              now: () => at,
              source: "completion",
              store,
              values: effect.kind === "organization" ? { organization: effect.value } : {},
              workspaceId,
            });
          } catch (error) {
            if (error instanceof ContactFieldWriteError && error.code === "NOT_FOUND") throw new ContactCompletionError("NOT_FOUND", "The person was not found.");
            if (error instanceof ContactFieldWriteError && error.code === "CONFLICT") throw new ContactCompletionError("CONFLICT", error.message);
            throw error;
          }
        }
        const row = await getCompletionContact(store, workspaceId, actorId, question.contactId!);
        if (!row) throw new ContactCompletionError("NOT_FOUND", "The person was not found.");
        const [interacted, self] = await Promise.all([listInteractedContactIds(store, workspaceId, actorId, [row.contactId]), selfReported(actorId)]);
        const densityAfter = completionDensityFacts(contactFacts(row, interacted.has(row.contactId) || self.has(row.contactId))).level;
        const iso = at.toISOString();
        await saveCompletionQuestion(store, workspaceId, {
          ...question,
          answer: input.answer.trim(),
          answerEffect: effect.kind,
          answerKey: input.idempotencyKey,
          answeredAt: iso,
          densityAfter,
          status: "answered",
          updatedAt: iso,
        });
        return { densityAfter, next: null, questionId: question.id, status: "answered" };
      });
    },

    async skip(actorId, questionId, input) {
      return storage.write(actorId, async (store) => {
        const question = await requireQuestion(store, actorId, questionId);
        if (question.status === "skipped") {
          if (question.skipKey === input.idempotencyKey) return { next: null, questionId: question.id, status: "skipped" };
          throw new ContactCompletionError("CONFLICT", "This question was already skipped.");
        }
        if (question.status === "answered") throw new ContactCompletionError("CONFLICT", "This question was already answered.");
        const iso = now().toISOString();
        await saveCompletionQuestion(store, workspaceId, {
          ...question,
          skipCount: (question.skipCount ?? 0) + 1,
          skipKey: input.idempotencyKey,
          skippedAt: iso,
          status: "skipped",
          updatedAt: iso,
        });
        return { next: null, questionId: question.id, status: "skipped" };
      });
    },
  };
}

