/**
 * agent-design AG12 `prepare` for contacts (设计稿附录 B「联系人」四行, §5.1, §5.2; PLANNER 易错边界 1–7): read only. An
 * intent and the contact as it is now become one frozen card item — what it changes from what to what, the records it
 * names, the version it was read at — with every word of it written here, in the card's language (no model writes
 * any of it). Also: the intent a frozen item came from (a new revision keeps it), and what the click checks again.
 *
 * - create: the fields the user gave; "another person" was chosen already (duplicates are a question before the card).
 * - update: only the fields that change, their values now (the before), the version read; at the click the values
 *   shown, the name and the record existing are checked again (another field changing is no conflict).
 * - delete: the notes and to-dos linked to the person are listed as kept, and the 30-day restore said.
 * - restore: the original contact (same id) deleted within 30 days; "restore", never "add".
 * - import: the rows worked out in memory (import-preview.ts); a duplicate is never merged.
 */
import type { AgentCardOperationDisplayContract } from "../../../../shared/contract/agent-v1";
import type { AgentActionOperationPayload } from "../../../agent/runtime/contract";
import type { CardLocale } from "../../../agent/runtime/todo-operations";
import { dayText } from "../../../agent/runtime/todo-operations";
import { CONTACT_RESTORE_WINDOW_DAYS } from "../../../contacts/delete/service";
import { previewImport, type ImportPreview, type ImportPreviewRow } from "./import-preview";
import {
  CONTACT_CREATE,
  CONTACT_DELETE,
  CONTACT_IMPORT,
  CONTACT_RESTORE,
  CONTACT_UPDATE,
  CONTACT_FIELDS,
  isContactCapability,
  type ContactCardReader,
  type ContactEffect,
  type ContactFieldName,
  type ContactOperationIntent,
  type ContactSnapshot,
  type ImportRowOverride,
} from "./types";

export const CONTACT_OPERATION_TYPES = {
  [CONTACT_CREATE]: "create_contact",
  [CONTACT_DELETE]: "delete_contact",
  [CONTACT_IMPORT]: "import_contacts",
  [CONTACT_RESTORE]: "restore_contact",
  [CONTACT_UPDATE]: "update_contact",
} as const;

const DAY_MS = 86_400_000;

interface Words {
  contact: (name: string) => string;
  label: Record<ContactFieldName, string>;
  empty: string;
  sep: string;
  join: string;
  quote: (title: string) => string;
  create: (name: string, facts: string) => string;
  update: (name: string, changes: string) => string;
  change: (label: string, before: string, after: string) => string;
  delete: (name: string, facts: string, kept: string) => string;
  keptNotes: string;
  keptTodos: string;
  keptNone: string;
  keptLabel: string;
  kept: (titles: string, more: number) => string;
  keptLine: (notes: string | null, todos: string | null) => string;
  deleteNote: string;
  restore: (name: string, facts: string) => string;
  deletedOn: string;
  restoreNote: string;
  importRecord: (counts: ImportPreview["counts"]) => string;
  importLine: (counts: ImportPreview["counts"]) => string;
  row: (row: number, name: string) => string;
  rowCreate: (facts: string) => string;
  rowDuplicate: (match: string) => string;
  rowSkip: Record<"missing_name" | "unreadable_row" | "in_file_duplicate" | "user_skip", (repeats?: number) => string>;
  noName: string;
}

const WORDS: Record<CardLocale, Words> = {
  en: {
    change: (label, before, after) => `${label} from "${before}" to "${after}"`,
    contact: (name) => `Contact "${name}"`,
    create: (name, facts) => `New contact "${name}"${facts ? `: ${facts}` : ""}`,
    delete: (name, facts, kept) => `Delete contact "${name}"${facts ? ` (${facts})` : ""}; ${kept}; it can be restored within ${CONTACT_RESTORE_WINDOW_DAYS} days`,
    deleteNote: `Can be restored within ${CONTACT_RESTORE_WINDOW_DAYS} days`,
    deletedOn: "Deleted on",
    empty: "(empty)",
    importLine: (counts) => `Import contacts: ${counts.create} new, ${counts.duplicate} possible duplicate${counts.duplicate === 1 ? "" : "s"}, ${counts.skip} skipped`,
    importRecord: (counts) => `Import contacts (${counts.create + counts.duplicate + counts.skip} rows)`,
    join: ", ",
    kept: (titles, more) => `${titles}${more ? ` and ${more} more` : ""} — not deleted`,
    keptLine: (notes, todos) => `the linked ${[notes ? `notes ${notes}` : "", todos ? `to-dos ${todos}` : ""].filter(Boolean).join(" and ")} are not deleted`,
    keptLabel: "Linked records",
    keptNone: "no linked notes or to-dos",
    keptNotes: "Linked notes",
    keptTodos: "Linked to-dos",
    label: { displayName: "Name", email: "Email", organization: "Company", phone: "Phone", role: "Title" },
    noName: "(no name)",
    quote: (title) => `"${title}"`,
    restore: (name, facts) => `Restore contact "${name}"${facts ? ` (${facts})` : ""} — the same contact as before`,
    restoreNote: "The same contact comes back, with the notes and to-dos linked to them",
    row: (row, name) => `Row ${row} ${name}`,
    rowCreate: (facts) => `New${facts ? ` (${facts})` : ""}`,
    rowDuplicate: (match) => `Possible duplicate of ${match}; left out when you confirm — tell me if it should be created`,
    rowSkip: {
      in_file_duplicate: (repeats) => `Skipped: repeats row ${repeats}`,
      missing_name: () => "Skipped: missing name",
      unreadable_row: () => "Skipped: the row could not be read",
      user_skip: () => "Skipped: you asked to leave it out",
    },
    sep: " · ",
    update: (name, changes) => `Change contact "${name}": ${changes}`,
  },
  ja: {
    change: (label, before, after) => `${label}を「${before}」から「${after}」に`,
    contact: (name) => `連絡先「${name}」`,
    create: (name, facts) => `連絡先「${name}」を追加${facts ? `：${facts}` : ""}`,
    delete: (name, facts, kept) => `連絡先「${name}」${facts ? `（${facts}）` : ""}を削除。${kept}。${CONTACT_RESTORE_WINDOW_DAYS}日以内なら元に戻せます`,
    deleteNote: `${CONTACT_RESTORE_WINDOW_DAYS}日以内なら元に戻せます`,
    deletedOn: "削除した日",
    empty: "（空）",
    importLine: (counts) => `連絡先の取り込み：新規 ${counts.create} 行、重複の可能性 ${counts.duplicate} 行、スキップ ${counts.skip} 行`,
    importRecord: (counts) => `連絡先の取り込み（${counts.create + counts.duplicate + counts.skip}行）`,
    join: "、",
    kept: (titles, more) => `${titles}${more ? ` ほか${more}件` : ""}（削除されません）`,
    keptLine: (notes, todos) => `関連する${[notes ? `メモ${notes}` : "", todos ? `タスク${todos}` : ""].filter(Boolean).join("と")}は削除されません`,
    keptLabel: "関連する記録",
    keptNone: "関連するメモ・タスクはありません",
    keptNotes: "関連するメモ",
    keptTodos: "関連するタスク",
    label: { displayName: "氏名", email: "メール", organization: "会社", phone: "電話", role: "役職" },
    noName: "（名前なし）",
    quote: (title) => `「${title}」`,
    restore: (name, facts) => `連絡先「${name}」${facts ? `（${facts}）` : ""}を元に戻す（以前と同じ連絡先）`,
    restoreNote: "元の連絡先がそのまま戻り、関連するメモやタスクも元どおりです",
    row: (row, name) => `${row}行目 ${name}`,
    rowCreate: (facts) => `新規${facts ? `（${facts}）` : ""}`,
    rowDuplicate: (match) => `${match}と重複の可能性。確定時は取り込みません（新規にする場合はお知らせください）`,
    rowSkip: {
      in_file_duplicate: (repeats) => `スキップ：${repeats}行目と重複`,
      missing_name: () => "スキップ：名前がありません",
      unreadable_row: () => "スキップ：行を読み取れません",
      user_skip: () => "スキップ：取り込まない指定",
    },
    sep: " · ",
    update: (name, changes) => `連絡先「${name}」を変更：${changes}`,
  },
  zh: {
    change: (label, before, after) => `${label}从「${before}」改为「${after}」`,
    contact: (name) => `联系人「${name}」`,
    create: (name, facts) => `新增联系人「${name}」${facts ? `：${facts}` : ""}`,
    delete: (name, facts, kept) => `删除联系人「${name}」${facts ? `（${facts}）` : ""}；${kept}；${CONTACT_RESTORE_WINDOW_DAYS}天内可以恢复`,
    deleteNote: `删除后${CONTACT_RESTORE_WINDOW_DAYS}天内可以恢复`,
    deletedOn: "删除于",
    empty: "（空）",
    importLine: (counts) => `导入联系人：新增${counts.create}行、疑似重复${counts.duplicate}行、跳过${counts.skip}行`,
    importRecord: (counts) => `导入联系人（共${counts.create + counts.duplicate + counts.skip}行）`,
    join: "、",
    kept: (titles, more) => `${titles}${more ? `等，另有${more}条` : ""}（不会删除）`,
    keptLine: (notes, todos) => `关联的${[notes ? `笔记${notes}` : "", todos ? `待办${todos}` : ""].filter(Boolean).join("和")}不会删除`,
    keptLabel: "关联记录",
    keptNone: "没有关联的笔记和待办",
    keptNotes: "关联的笔记",
    keptTodos: "关联的待办",
    label: { displayName: "姓名", email: "邮箱", organization: "公司", phone: "电话", role: "职位" },
    noName: "（没有姓名）",
    quote: (title) => `「${title}」`,
    restore: (name, facts) => `恢复联系人「${name}」${facts ? `（${facts}）` : ""}，恢复的是原来这一位`,
    restoreNote: "恢复的是原来这一位，名下的笔记和待办照旧",
    row: (row, name) => `第${row}行 ${name}`,
    rowCreate: (facts) => `新增${facts ? `（${facts}）` : ""}`,
    rowDuplicate: (match) => `可能和已有的${match}重复；确认时跳过，要新建请告诉我`,
    rowSkip: {
      in_file_duplicate: (repeats) => `跳过：和第${repeats}行重复`,
      missing_name: () => "跳过：没有姓名",
      unreadable_row: () => "跳过：这一行读不出来",
      user_skip: () => "跳过：你说不导入",
    },
    sep: " · ",
    update: (name, changes) => `修改联系人「${name}」：${changes}`,
  },
};

const facts = (words: Words, ...values: (string | null | undefined)[]) => values.filter((value): value is string => Boolean(value && value.trim())).join(words.sep);

function base(input: { actionId: string; revision: number; index: number; partId?: string }) {
  return {
    compensation: { supported: false },
    dependsOn: [] as string[],
    effects: [] as string[],
    idempotencyKey: `${input.actionId}:r${input.revision}:op${input.index + 1}`,
    operationId: `${input.actionId}:op${input.index + 1}`,
    partId: input.partId ?? "p1",
    payloadVersion: 1,
    riskLevel: "write" as const,
  };
}

const valueOf = (contact: ContactSnapshot, field: ContactFieldName): string | null => (field === "displayName" ? contact.displayName : contact[field]);

function importRows(preview: ImportPreview, words: Words): AgentCardOperationDisplayContract["rows"][number][] {
  return preview.rows.map((row) => ({
    after: row.decision === "create"
      ? words.rowCreate(facts(words, row.organization, row.role))
      : row.decision === "duplicate"
        ? words.rowDuplicate(`${row.match!.name}${facts(words, row.match!.organization, row.match!.role) ? (words === WORDS.en ? ` (${facts(words, row.match!.organization, row.match!.role)})` : `（${facts(words, row.match!.organization, row.match!.role)}）`) : ""}`)
        : words.rowSkip[row.reason ?? "unreadable_row"](row.repeats),
    field: `row.${row.row}`,
    label: words.row(row.row, row.name || words.noName),
  }));
}

/** The item of one revision; null when its record cannot be prepared (gone, not deleted, out of the window). */
export async function prepareContactOperation(input: {
  intent: ContactOperationIntent & { partId?: string };
  actionId: string;
  revision: number;
  index: number;
  reader: ContactCardReader | null | undefined;
  locale: CardLocale;
  now?: () => Date;
}): Promise<AgentActionOperationPayload | null> {
  const { intent } = input;
  const words = WORDS[input.locale];
  const head = { ...base({ ...input, partId: intent.partId }), capability: intent.capability, executorKey: intent.capability, operationType: CONTACT_OPERATION_TYPES[intent.capability] };
  if (intent.capability === CONTACT_CREATE) {
    const set = Object.fromEntries(CONTACT_FIELDS.map((field) => [field, intent.set[field]?.trim()]).filter(([, value]) => value)) as Record<ContactFieldName, string>;
    const rows = CONTACT_FIELDS.filter((field) => field !== "displayName" && set[field]).map((field) => ({ after: set[field], field, label: words.label[field] }));
    return {
      ...head,
      after: { ...set },
      display: { change: "create", record: words.contact(set.displayName), rows },
      payload: { ...set, allowDuplicate: true },
      preconditions: { targetExists: false },
      preview: words.create(set.displayName, facts(words, set.organization, set.role)),
      shown: { displayName: set.displayName },
    };
  }
  if (intent.capability === CONTACT_IMPORT) {
    if (!input.reader) return null;
    const preview = previewImport(intent.text, await input.reader.listActive(), input.reader.actorId, intent.overrides);
    return importOperation(head, intent.text, intent.overrides, preview, words);
  }
  if (!input.reader) return null;
  if (intent.capability === CONTACT_RESTORE) {
    const contact = await input.reader.read(intent.targetId, { includeDeleted: true });
    const now = (input.now ?? (() => new Date()))().getTime();
    if (!contact || contact.active || !contact.deletedAt || Date.parse(contact.deletedAt) <= now - CONTACT_RESTORE_WINDOW_DAYS * DAY_MS) return null;
    const rows = [
      ...(["organization", "role"] as const).filter((field) => contact[field]).map((field) => ({ after: contact[field]!, field, label: words.label[field] })),
      { after: dayText(new Date(Date.parse(contact.deletedAt) + 9 * 3_600_000).toISOString().slice(0, 10), input.locale), field: "deletedAt", label: words.deletedOn },
    ];
    return {
      ...head,
      after: {},
      before: {},
      display: { change: "restore", note: words.restoreNote, record: words.contact(contact.displayName), rows },
      payload: { contactId: contact.id },
      preconditions: { targetExists: true, versionToken: String(contact.version) },
      preview: words.restore(contact.displayName, facts(words, contact.organization, contact.role)),
      shown: { deletedAt: contact.deletedAt, displayName: contact.displayName },
      targetRef: { collection: "contacts", id: contact.id },
    };
  }
  const contact = await input.reader.read(intent.targetId);
  if (!contact) return null;
  if (intent.capability === CONTACT_DELETE) {
    const notes = intent.effects.filter((effect) => effect.kind === "memo");
    const todos = intent.effects.filter((effect) => effect.kind === "todo");
    const titles = (list: ContactEffect[]) => list.map((effect) => words.quote(effect.title)).join(words.join);
    const rows: AgentCardOperationDisplayContract["rows"][number][] = [];
    if (notes.length) rows.push({ after: words.kept(titles(notes), 0), field: "effects.memo", label: words.keptNotes });
    if (todos.length) rows.push({ after: words.kept(titles(todos), 0), field: "effects.todo", label: words.keptTodos });
    if (intent.moreEffects) rows.push({ after: words.kept("", intent.moreEffects).trim(), field: "effects.more", label: words.keptLabel });
    if (!rows.length) rows.push({ after: words.keptNone, field: "effects", label: words.keptLabel });
    const keptLine = notes.length || todos.length ? words.keptLine(notes.length ? titles(notes) : null, todos.length ? titles(todos) : null) : words.keptNone;
    return {
      ...head,
      after: {},
      before: {},
      display: { change: "delete", note: words.deleteNote, record: words.contact(contact.displayName), rows },
      effects: intent.effects.map((effect) => effect.ref),
      payload: { contactId: contact.id, expectedVersion: contact.version },
      preconditions: { targetExists: true, versionToken: String(contact.version) },
      preview: words.delete(contact.displayName, facts(words, contact.organization, contact.role), keptLine),
      shown: { displayName: contact.displayName, effects: intent.effects.map((effect) => ({ ...effect })), ...(intent.moreEffects ? { moreEffects: intent.moreEffects } : {}), organization: contact.organization, role: contact.role },
      targetRef: { collection: "contacts", id: contact.id },
    };
  }
  // update: only the fields that change.
  const before: Partial<Record<ContactFieldName, string | null>> = {};
  const after: Partial<Record<ContactFieldName, string | null>> = {};
  for (const field of CONTACT_FIELDS) {
    if (!(field in intent.set)) continue;
    const next = intent.set[field] === null ? null : intent.set[field]?.trim() || null;
    const now = valueOf(contact, field);
    if ((now ?? null) === next) continue;
    before[field] = now;
    after[field] = next;
  }
  const fields = Object.keys(after) as ContactFieldName[];
  if (!fields.length) return null;
  const rows = fields.map((field) => ({ after: after[field] ?? words.empty, before: before[field] ?? words.empty, field, label: words.label[field] }));
  return {
    ...head,
    after: { ...after },
    before: { ...before },
    display: { change: "update", record: words.contact(contact.displayName), rows },
    payload: { before: { ...before }, contactId: contact.id, expectedVersion: contact.version, shown: { displayName: contact.displayName }, values: { ...after } },
    preconditions: { targetExists: true, versionToken: String(contact.version) },
    preview: words.update(contact.displayName, fields.map((field) => words.change(words.label[field], before[field] ?? words.empty, after[field] ?? words.empty)).join(words.join)),
    shown: { displayName: contact.displayName },
    targetRef: { collection: "contacts", id: contact.id },
  };
}

function importOperation(head: Record<string, unknown>, text: string, overrides: Readonly<Record<string, ImportRowOverride>>, preview: ImportPreview, words: Words): AgentActionOperationPayload {
  const outcomes = Object.fromEntries(preview.rows.map((row) => [String(row.row), row.outcome]));
  return {
    ...(head as Omit<AgentActionOperationPayload, "payload" | "preview">),
    after: {},
    display: { change: "create", record: words.importRecord(preview.counts), rows: importRows(preview, words) },
    payload: { outcomes, text },
    preconditions: { targetExists: false },
    // AG21c (R54): the card's title is already the count line, so the item opens with what it is (not the counts again);
    // each row is "label: what happens" with the session language's own colon.
    preview: [words.importRecord(preview.counts), ...importRows(preview, words).map((row) => `${row.label}${words === WORDS.en ? ": " : "："}${row.after}`)].join("\n"),
    shown: { counts: { ...preview.counts }, overrides: { ...overrides }, rows: preview.rows.map((row: ImportPreviewRow) => ({ decision: row.decision, ...(row.match ? { match: row.match.id } : {}), outcome: row.outcome, ...(row.reason ? { reason: row.reason } : {}), row: row.row })), text },
  };
}

/** The intent a frozen contact item was made from (a new revision is frozen from it and the data then). */
export function contactIntentOf(op: AgentActionOperationPayload): ContactOperationIntent | null {
  if (!isContactCapability(op.capability)) return null;
  const payload = (op.payload ?? {}) as Record<string, unknown>;
  const shown = (op.shown ?? {}) as Record<string, unknown>;
  const target = op.targetRef?.id ?? (typeof payload.contactId === "string" ? payload.contactId : "");
  switch (op.capability) {
    case CONTACT_CREATE: {
      const after = (op.after ?? {}) as Record<string, string>;
      return { capability: CONTACT_CREATE, set: { ...after, displayName: String(after.displayName ?? "") } };
    }
    case CONTACT_UPDATE:
      return target ? { capability: CONTACT_UPDATE, set: { ...((payload.values ?? op.after ?? {}) as Record<string, string | null>) }, targetId: target } : null;
    case CONTACT_DELETE:
      return target ? { capability: CONTACT_DELETE, effects: ((shown.effects ?? []) as ContactEffect[]).map((effect) => ({ ...effect })), ...(typeof shown.moreEffects === "number" ? { moreEffects: shown.moreEffects } : {}), targetId: target } : null;
    case CONTACT_RESTORE:
      return target ? { capability: CONTACT_RESTORE, targetId: target } : null;
    default:
      return { capability: CONTACT_IMPORT, overrides: { ...((shown.overrides ?? {}) as Record<string, ImportRowOverride>) }, text: String(payload.text ?? shown.text ?? "") };
  }
}

export interface ContactTargetCheck {
  changed: boolean;
  versionToken?: string;
  rows: { field: string; shownBefore: unknown; now: unknown; to?: unknown }[];
}

/**
 * At the click (设计稿 §5.2): what the card showed — the values being changed, the name naming the person, the record
 * existing (or, for a restore, still deleted) — against now. Other fields changing is no conflict; the version read
 * now is what the item executes against.
 */
export async function checkContactTarget(op: AgentActionOperationPayload, reader: ContactCardReader | null | undefined): Promise<ContactTargetCheck> {
  if (!reader || !op.targetRef || !isContactCapability(op.capability) || op.capability === CONTACT_CREATE || op.capability === CONTACT_IMPORT) return { changed: false, rows: [] };
  const shown = (op.shown ?? {}) as Record<string, unknown>;
  if (op.capability === CONTACT_RESTORE) {
    const current = await reader.read(op.targetRef.id, { includeDeleted: true });
    if (!current || current.active || current.deletedAt !== shown.deletedAt) return { changed: true, rows: [{ field: "record", now: current?.active ? current.displayName : null, shownBefore: shown.displayName ?? null }] };
    return { changed: false, rows: [], versionToken: String(current.version) };
  }
  const current = await reader.read(op.targetRef.id);
  if (!current) return { changed: true, rows: [{ field: "record", now: null, shownBefore: shown.displayName ?? null }] };
  const rows: ContactTargetCheck["rows"] = [];
  if (typeof shown.displayName === "string" && shown.displayName !== current.displayName && !(op.capability === CONTACT_UPDATE && "displayName" in (op.before ?? {}))) rows.push({ field: "displayName", now: current.displayName, shownBefore: shown.displayName });
  for (const [field, value] of Object.entries(op.before ?? {})) {
    const now = valueOf(current, field as ContactFieldName);
    if ((value ?? null) !== (now ?? null)) rows.push({ field, now, shownBefore: value ?? null, to: (op.after as Record<string, unknown> | undefined)?.[field] });
  }
  return { changed: rows.length > 0, rows, versionToken: String(current.version) };
}

/** A card that is one import: its count sentence is the rows' ("导入联系人：新增2行、疑似重复1行、跳过1行"). */
export function importCountTitle(operations: readonly Pick<AgentActionOperationPayload, "capability" | "shown">[], locale: CardLocale): string | null {
  if (operations.length !== 1 || operations[0].capability !== CONTACT_IMPORT) return null;
  const counts = ((operations[0].shown ?? {}) as { counts?: ImportPreview["counts"] }).counts;
  return counts ? WORDS[locale].importLine(counts) : null;
}
