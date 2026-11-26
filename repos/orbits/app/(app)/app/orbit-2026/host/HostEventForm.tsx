"use client";

// R17 建活动 `/app/events/center/new`（b12 #396）· 基本情報を編集 `/app/events/[id]/edit`（b12 #398）；host DESIGN §2.2。
// 写：POST /api/host/events（下書き）→ 申込設定；「公開へ進む」= 存下書き后弹公開確認（b12 #400）→ POST …/publish。
// 编辑：PATCH …/[id]（expectedVersion）；已公开且改了日時 / 会場 → 服务端回 changePreview，弹 b12 #404 后带 notify 再提交；
// 409 → 提示重读。编辑页只有「下書き保存 / 変更を保存」（决定表 §44-3）：中止 / 参加コード再発行 / アーカイブ 走运营台页头「⋯」菜单（HostConsole），
// 下書きの「公開する」在运营台横幅（b12 #440）。
// b12 #396–#475 待用户过目（§38），照画板实现但不进门禁。
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HOST_CONTACT_ID_MAX, HOST_CONTACT_NOTE_MAX, hostEventContactInputObject, hostNoteText } from "../../../../../shared/api-schema/host-events";
import { agendaDraftToItems, agendaItemsToDraft, blankAgendaRow, type AgendaDraftRow } from "../../../../../shared/compute/host-agenda";
import { normalizeHostContact } from "../../../../../shared/compute/host-contact";
import type { HostSetupQuestion } from "../../../../../shared/contract/host-console";
import type { HostEventChangePreview, HostEventContact, HostEventFeeKind, HostEventInput, HostEventUpdateInput, HostEventView } from "../../../../../shared/contract/host-events";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { OrganizerProfile } from "../../../../../shared/contract/organizer-profile";
import { ShellPage } from "../shell/slots";
import { Icon, Modal, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { failureOf, hostEventApi } from "./host-api";
import { CoverField } from "./CoverField";
import { coverApi, coverError, prepareCover } from "./cover-upload";
import { EventCard, journeyTranslator } from "../events/DiscoverTab";
import r from "../events/record.module.css";
import { AgendaEditor, AgendaPreview, agendaMissing, focusAgendaMissing } from "./AgendaEditor";
import { QuestionsEditor } from "./HostSetup";
import { templateKeyOf, templateQuestions } from "./setup-model";
import { consoleHref, hostDateLong, hostTranslator, tokyoParts, type HostT } from "./host-model";
import f from "./form.module.css";
import s from "./host.module.css";
import m from "./tabs.module.css";

export const DESC_MAX = 2000;
export const NOTE_MAX = 140;
const TEMPLATES = [["mixer", "🥂", "tplMixer", "m_lav"], ["study", "📚", "tplStudy", "m_blue"], ["roundtable", "💬", "tplRound", "m_pink"]] as const;
type TemplateId = (typeof TEMPLATES)[number][0];

/** カバー画像の未保存の変更：keep = 変更なし；new = 選んだ画像（保存時に focusY で 2:1 に裁つ）；remove = 削除。 */
export type CoverChange = { kind: "keep" } | { kind: "new"; blob: Blob; name: string; url: string; focusY: number } | { kind: "remove" };
/** 表单上显示哪张图（null = 拖放框）。 */
export function coverShown(change: CoverChange, saved: string | null | undefined): string | null {
  return change.kind === "new" ? change.url : change.kind === "remove" ? null : saved ?? null;
}

export type EventDraft = {
  title: string;
  date: string;
  start: string;
  end: string;
  venueName: string;
  online: boolean;
  capacity: string;
  feeKind: HostEventFeeKind;
  feeAmount: string;
  feeUrl: string;
  organizerProfileId: string;
  description: string;
  /** 申込フォームの初期質問（新規作成のみ；テンプレートから入る）。 */
  questions: HostSetupQuestion[];
  templateId: TemplateId | null;
  /** 主催者の連絡先（任意；申込んだ人だけに表示）。旧い一時保存には無いことがある。 */
  wechatId: string;
  lineId: string;
  contactNote: string;
  /** 议程（2026-11-15：必填，公开前至少 1 行完整的）。新建时 1 行空行；旧い一時保存には無いことがある。 */
  agenda: AgendaDraftRow[];
};

const chars = (value: string) => [...value].length;
const pad = (value: number) => String(value).padStart(2, "0");

/** ISO → 東京の date / time 入力値。 */
export function tokyoInputs(iso: string | null | undefined): { date: string; time: string } {
  const p = tokyoParts(iso);
  return p ? { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` } : { date: "", time: "" };
}

/** 東京の date + time → ISO（会場はすべて Asia/Tokyo）。不正なら null。 */
export function tokyoIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !/^\d{2}:\d{2}$/u.test(time)) return null;
  const ms = Date.parse(`${date}T${time}:00+09:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function draftFromEvent(event: HostEventView | null, profiles: readonly OrganizerProfile[]): EventDraft {
  if (!event) {
    return { agenda: [blankAgendaRow()], capacity: "", contactNote: "", date: "", description: "", questions: [], end: "21:30", feeAmount: "", feeKind: "free", feeUrl: "", lineId: "", online: false, organizerProfileId: profiles[0]?.profileId ?? "", start: "19:00", templateId: null, title: "", venueName: "", wechatId: "" };
  }
  const start = tokyoInputs(event.startsAt);
  const end = tokyoInputs(event.endsAt);
  return {
    capacity: event.capacity == null ? "" : String(event.capacity), date: start.date, description: event.description ?? "", questions: [], end: end.time, feeAmount: event.feeAmountYen == null ? "" : String(event.feeAmountYen),
    feeKind: event.feeKind, feeUrl: event.feeUrl ?? "", online: event.online, organizerProfileId: event.organizerProfileId ?? profiles[0]?.profileId ?? "", start: start.time, templateId: null, title: event.title, venueName: event.venueName ?? "",
    contactNote: event.contact?.note ?? "", lineId: event.contact?.lineId ?? "", wechatId: event.contact?.wechatId ?? "",
    agenda: event.agenda?.length ? agendaItemsToDraft(event.agenda) : [blankAgendaRow()],
  };
}

export type DraftProblem = "evInvalidName" | "evInvalidDate" | "evInvalidTime" | "evInvalidQuestion" | "evInvalidVenue" | "evInvalidFee" | "evInvalidProfile" | "evInvalidContact" | "evInvalidAgenda";

/** 入力欄の連絡先 → 契約（全部空 = null）。ID ≤60 字、ひとこと ≤200 字・リンク不可に違反していれば problem。 */
export function draftContact(draft: Pick<EventDraft, "wechatId" | "lineId" | "contactNote">): { contact: HostEventContact | null; problem: boolean } {
  const raw = { lineId: (draft.lineId ?? "").trim() || null, note: (draft.contactNote ?? "").trim() || null, wechatId: (draft.wechatId ?? "").trim() || null };
  if (!hostEventContactInputObject.safeParse(raw).success) return { contact: null, problem: true };
  return { contact: normalizeHostContact(raw), problem: false };
}

/**
 * 入力 → 契約（建 / 改共用）。問題があれば最初の 1 つ。
 * 议程：全空的行丢掉；有一行缺时间 / 标题就是问题（服务端也不收）。`forPublish`（「前往公开」）时还要至少 1 行完整的。
 */
export function draftToInput(draft: EventDraft, options: { forPublish?: boolean } = {}): { input: Omit<HostEventInput, "organizerProfileId"> & { organizerProfileId: string }; problem: null } | { input: null; problem: DraftProblem } {
  const title = draft.title.trim();
  if (!title) return { input: null, problem: "evInvalidName" };
  const startsAt = tokyoIso(draft.date, draft.start);
  let endsAt = tokyoIso(draft.date, draft.end);
  // 終了が開始より前 = 日をまたぐ（23:00–01:00）。
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = new Date(Date.parse(endsAt) + 86_400_000).toISOString();
  if (!draft.date) return { input: null, problem: "evInvalidDate" };
  if (!startsAt || !endsAt || Date.parse(endsAt) - Date.parse(startsAt) > 86_400_000) return { input: null, problem: "evInvalidTime" };
  const venueName = draft.venueName.trim();
  if (!venueName && !draft.online) return { input: null, problem: "evInvalidVenue" };
  const amount = draft.feeAmount.trim() ? Number(draft.feeAmount.replace(/[,，¥￥\s]/gu, "")) : null;
  if ((draft.feeKind === "amount" && (amount == null || !Number.isInteger(amount) || amount <= 0)) || (amount != null && (!Number.isInteger(amount) || amount < 0))) return { input: null, problem: "evInvalidFee" };
  if (draft.feeKind === "external_link" && !/^https:\/\/\S+$/u.test(draft.feeUrl.trim())) return { input: null, problem: "evInvalidFee" };
  if (!draft.organizerProfileId) return { input: null, problem: "evInvalidProfile" };
  // 質問：空の質問文・選択肢 2 つ未満の選択式は保存できない（申込設定と同じ規則）。
  const questions = draft.questions.map((question) => ({ ...question, options: question.kind === "free" ? [] : question.options.map((option) => option.trim()).filter(Boolean), prompt: question.prompt.trim() }));
  if (questions.some((question) => !question.prompt || (question.kind !== "free" && question.options.length < 2))) return { input: null, problem: "evInvalidQuestion" };
  const capacity = draft.capacity.trim() ? Number(draft.capacity) : null;
  if (capacity != null && (!Number.isInteger(capacity) || capacity <= 0)) return { input: null, problem: "evInvalidFee" };
  const contact = draftContact(draft);
  if (contact.problem) return { input: null, problem: "evInvalidContact" };
  const agendaRows = draft.agenda ?? [];
  const agenda = agendaDraftToItems(agendaRows);
  if (agendaMissing(agendaRows).some(Boolean) && (options.forPublish || agenda.length > 0)) return { input: null, problem: "evInvalidAgenda" };
  return {
    input: {
      capacity, description: draft.description.trim() || null, endsAt, feeAmountYen: draft.feeKind === "free" || draft.feeKind === "external_link" ? null : amount, feeKind: draft.feeKind,
      feeUrl: draft.feeKind === "external_link" ? draft.feeUrl.trim() : null, online: draft.online, organizerProfileId: draft.organizerProfileId, startsAt, timezone: "Asia/Tokyo", title,
      venueName: venueName || null, ...(draft.templateId ? { templateId: draft.templateId } : {}), ...(questions.length ? { questions } : {}),
      ...(contact.contact ? { contact: contact.contact } : {}),
      ...(agenda.length ? { agenda } : {}),
    },
    problem: null,
  };
}

/** 编辑：只送变化了的字段（日時 / 会場の変更通知を正しく判定させる）。 */
export function changedFields(event: HostEventView, input: Omit<HostEventInput, "organizerProfileId"> & { organizerProfileId: string }): Omit<HostEventUpdateInput, "expectedVersion"> {
  const out: Record<string, unknown> = {};
  const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
  if (!same(input.title, event.title)) out.title = input.title;
  if (!same(input.startsAt, event.startsAt)) out.startsAt = input.startsAt;
  if (!same(input.endsAt, event.endsAt)) out.endsAt = input.endsAt;
  if (!same(input.venueName, event.venueName)) out.venueName = input.venueName;
  if (!same(input.online, event.online)) out.online = input.online;
  if (!same(input.capacity, event.capacity)) out.capacity = input.capacity;
  if (!same(input.feeKind, event.feeKind)) out.feeKind = input.feeKind;
  if (!same(input.feeAmountYen, event.feeAmountYen)) out.feeAmountYen = input.feeAmountYen;
  if (!same(input.feeUrl, event.feeUrl)) out.feeUrl = input.feeUrl;
  if (!same(input.description, event.description)) out.description = input.description;
  if (!same(input.organizerProfileId, event.organizerProfileId)) out.organizerProfileId = input.organizerProfileId;
  // 連絡先は丸ごと置き換え（消したときは null を送る）。日時・会場ではないので通知の判定には入らない。
  const contact = normalizeHostContact(input.contact ?? null);
  const before = normalizeHostContact(event.contact ?? null);
  if (JSON.stringify(contact) !== JSON.stringify(before)) out.contact = contact;
  // 议程整体替换；同样不进通知判定。
  const agenda = (input.agenda ?? []).map((item) => ({ at: item.at, title: item.title, ...(item.detail ? { detail: item.detail } : {}) }));
  const agendaBefore = (event.agenda ?? []).map((item) => ({ at: item.at, title: item.title, ...(item.detail ? { detail: item.detail } : {}) }));
  if (JSON.stringify(agenda) !== JSON.stringify(agendaBefore)) out.agenda = agenda;
  return out as Omit<HostEventUpdateInput, "expectedVersion">;
}

function feeText(draft: EventDraft, t: HostT): string {
  const amount = draft.feeAmount.trim() ? `¥${Number(draft.feeAmount.replace(/[,，¥￥\s]/gu, "") || 0).toLocaleString("ja-JP")}` : "";
  switch (draft.feeKind) {
    case "free": return t("evFeeFree");
    case "amount": return amount;
    case "pay_at_door": return amount ? `${t("evFeeDoor")} ${amount}` : t("evFeeDoor");
    case "external_link": return t("evFeeLink");
  }
}

const publicHost = () => (typeof window === "undefined" ? "orbit.app" : window.location.host);

// ─── 確認（b12 #400 / #402 / #404） ─────────────────────

export function PublishEventConfirm({ event, t, language, busy, onCancel, onPublish }: { event: HostEventView; t: HostT; language: OrbitLanguage; busy: boolean; onCancel: () => void; onPublish: () => void }) {
  const title = t("cfPubTitle");
  const cap = event.capacity == null ? t("cfCapNone") : t(event.admissionMode === "review" ? "cfCapReview" : "cfCapFirst", { n: event.capacity });
  const rows: Array<[string, string]> = [[t("cfWhen"), hostDateLong(event.startsAt, language, t)], [t("cfCapacity"), cap], [t("cfDeadline"), event.registrationClosesAt ? hostDateLong(event.registrationClosesAt, language, t) : t("cfDeadlineNone")]];
  return (
    <Modal open onClose={onCancel} title={title} size={480} header={<span className={`${s.emo} ${s.e_lav}`} aria-hidden>📣</span>}>
      <div className={m.pubTitle}>{title}</div>
      <div className={`${s.sub} ${m.pubSub}`}>{event.organizerName ? t("cfPubSub", { n: event.followerCount, org: event.organizerName }) : t("cfPubSubNoOrg")}</div>
      <div className={m.pubList} data-host-publish-confirm={event.eventId}>
        {rows.map(([label, value]) => <div key={label} className={m.setrow}><span className={`${s.chip} ${s.c_teal}`}><Icon name="check" size={16} /></span><b>{label}</b><span className={`${s.lbl} ${m.pubStat}`}>{value}</span></div>)}
      </div>
      <div className={`${s.row} ${m.pubActs}`}>
        <button type="button" className={`btn ${s.btn}`} onClick={onCancel}>{t("cancel")}</button>
        <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy} onClick={onPublish}>{t("aPublish")}</button>
      </div>
    </Modal>
  );
}

export function noteProblem(note: string): boolean {
  return note.trim() ? !hostNoteText.safeParse(note).success : false;
}

export function CancelEventConfirm({ event, t, busy, onKeep, onCancelEvent }: { event: HostEventView; t: HostT; busy: boolean; onKeep: () => void; onCancelEvent: (hostNote: string | null) => void }) {
  const [note, setNote] = useState("");
  const invalid = noteProblem(note);
  const title = t("cfCancelTitle", { title: event.title });
  return (
    <Modal open onClose={onKeep} title={title} size={480} header={
      <div className={f.dlgHead}><div className={f.dic}><Icon name="alert" size={20} /></div><div><div className={f.dlgTitle}>{title}</div><div className={`${s.sub} ${f.dlgSub}`}>{t("cfCancelSub", { n: event.appliedCount })}</div></div></div>
    }>
      <div className={f.conseq} data-host-cancel-confirm={event.eventId}>
        <div className={s.row}><Icon name="bell" size={16} /><span>{t("cfCancelNotify", { n: event.appliedCount, w: event.waitlistedCount })}</span></div>
        <div className={s.row}><Icon name="ticket" size={16} /><span>{t("cfCancelCode")}</span></div>
        <div className={s.row}><Icon name="alert" size={16} /><span>{t("cfCancelRefund")}</span></div>
        {event.cohostCount > 0 ? <div className={s.row}><Icon name="users" size={16} /><span>{t("cfCancelCohosts", { n: event.cohostCount })}</span></div> : null}
      </div>
      <label className={f.noteBlock}>
        <span className={`${s.lbl} ${f.noteLbl}`}>{t("cfNoteLabel")}</span>
        <span className={`${f.ta} ${invalid ? f.taBad : ""}`}>
          <textarea value={note} maxLength={NOTE_MAX + 20} placeholder={t("cfNotePh")} onChange={(ev) => setNote(ev.target.value)} aria-invalid={invalid || undefined} />
          <span className={`${f.counter} ${invalid ? f.counterBad : ""}`}>{t("cfNoteCounter", { n: chars(note) })}</span>
        </span>
        {invalid ? <span className={`${s.lbl} ${f.bad}`} role="alert">{t("cfNoteInvalid")}</span> : null}
      </label>
      <div className={`${s.row} ${m.pubActs}`}>
        <button type="button" className={`btn ${s.btn}`} onClick={onKeep}>{t("cfKeep")}</button>
        <button type="button" className={`btn ${s.btn} ${f.danger}`} disabled={busy || invalid} onClick={() => onCancelEvent(note.trim() || null)}>{t("cfDoCancel")}</button>
      </div>
    </Modal>
  );
}

export function ChangeNotifyConfirm({ preview, t, language, busy, onSilent, onNotify, onClose }: { preview: HostEventChangePreview; t: HostT; language: OrbitLanguage; busy: boolean; onSilent: () => void; onNotify: () => void; onClose: () => void }) {
  const title = t(preview.timeChanged && preview.venueChanged ? "cfChangeTitle" : preview.timeChanged ? "cfChangeTimeTitle" : "cfChangeVenueTitle");
  return (
    <Modal open onClose={onClose} title={title} size={480} header={<span className={`${s.emo} ${s.e_blue}`} aria-hidden>🗓️</span>}>
      <div className={m.pubTitle}>{title}</div>
      <div className={m.pubList} data-host-change-confirm="">
        {preview.timeChanged ? <div className={m.setrow}><b className={f.chgLbl}>{t("cfWhen")}</b><span className={`${s.lbl} ${f.strike}`}>{hostDateLong(preview.beforeStartsAt, language, t)}</span><Icon name="right" size={16} /><b>{hostDateLong(preview.afterStartsAt, language, t)}</b></div> : null}
        {preview.venueChanged ? <div className={m.setrow}><b className={f.chgLbl}>{t("evVenue").replace(" *", "")}</b><span className={`${s.lbl} ${f.strike}`}>{preview.beforeVenue ?? "—"}</span><Icon name="right" size={16} /><b>{preview.afterVenue ?? "—"}</b></div> : null}
      </div>
      <div className={`${m.mac} ${m.macApricot} ${m.pubNote}`}>{t("cfChangeWho", { n: preview.approvedCount, w: preview.waitlistedCount })}</div>
      <div className={`${s.row} ${m.pubActs}`}>
        <button type="button" className={`btn ${s.btn}`} disabled={busy} onClick={onSilent}>{t("cfSilent")}</button>
        <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy} onClick={onNotify}>{t("cfNotify")}</button>
      </div>
    </Modal>
  );
}

// ─── フォーム（純粋な描画） ─────────────────────────────

export type HostEventFormViewProps = {
  mode: "create" | "edit";
  draft: EventDraft;
  profiles: readonly OrganizerProfile[];
  language: OrbitLanguage;
  event?: HostEventView | null;
  busy?: boolean;
  readOnly?: boolean;
  showTemplates?: boolean;
  onChange?: (next: EventDraft) => void;
  onSaveDraft?: () => void;
  onPrimary?: () => void;
  /** 新規作成：いま開いている質問カード（-1 = なし）と、テンプレートを選び直したとき。 */
  editingQuestion?: number;
  onEditQuestion?: (index: number) => void;
  onTemplate?: (templateId: EventDraft["templateId"]) => void;
  /** 按过「前往公开 / 保存」被议程挡住：缺时间 / 标题的行出红字。 */
  agendaShowMissing?: boolean;
  /** カバー画像（2026-11-20）：未保存の変更と、選んだ / 動かした / 消したとき。 */
  cover?: CoverChange;
  onCoverPick?: (file: File) => void;
  onCoverFocus?: (focusY: number) => void;
  onCoverRemove?: () => void;
};

export function HostEventFormView({ mode, draft, profiles, language, event = null, busy = false, readOnly = false, showTemplates = false, onChange, onSaveDraft, onPrimary, editingQuestion = -1, onEditQuestion, onTemplate, agendaShowMissing = false, cover = { kind: "keep" }, onCoverPick, onCoverFocus, onCoverRemove }: HostEventFormViewProps) {
  const coverUrl = coverShown(cover, event?.coverUrl);
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => onChange?.({ ...draft, [key]: value });
  const profile = profiles.find((item) => item.profileId === draft.organizerProfileId) ?? null;
  const length = chars(draft.description);
  const startsAt = tokyoIso(draft.date, draft.start);
  const back = <a className={`btn ${s.btn} ${s.backBtn}`} href={event ? consoleHref(event.eventId) : "/app/events/center"} aria-label={t("back")}><Icon name="left" size={20} /></a>;
  const isDraft = mode === "create" || event?.lifecycle === "draft";
  const right = (
    <div className={s.headRight}>
      {isDraft ? <button type="button" className={`btn ${s.btn}`} disabled={busy || readOnly} onClick={onSaveDraft} data-host-save-draft="">{t(mode === "create" ? "evSaveTemp" : "evSaveDraft")}</button> : null}
      <button type="button" className={`btn ${s.btn} ${s.accent}`} disabled={busy || readOnly} onClick={onPrimary} data-host-form-primary="">{t(mode === "create" ? "evToPublish" : "evSaveChanges")}</button>
    </div>
  );
  const meta = [startsAt ? hostDateShortLong(startsAt, language, t) : "", draft.online && !draft.venueName.trim() ? t("evOnline") : draft.venueName.trim().split(/\s+/u)[0] ?? "", feeText(draft, t)].filter(Boolean).join(" · ");
  const field = (label: string, control: React.ReactNode, narrow = false) => (
    <div className={m.setrow}><span className={`${s.lbl} ${f.fl}`}>{label}</span><div className={`${f.input} ${narrow ? f.narrow : ""}`}>{control}</div></div>
  );
  return (
    <>
      <ShellPage title={t(mode === "create" ? "evCreateTitle" : "evEditTitle")} subtitle={mode === "create" ? t("evCreateCrumb") : t("evEditCrumb", { title: event?.title ?? "" })} phoneSubtitle={mode === "create" ? t("centerTitle") : undefined} left={back} right={right} rightRail={false} />
      <div className={s.wgrid} data-host-event-form={mode}>
        <div className={`${f.col} ${f.span7}`}>
          {showTemplates ? (
            <div className={`${s.card} ${f.blk}`} data-host-templates="">
              <div className={s.cardH}><h3>{t("evTemplates")}</h3><span className={s.lbl}>{t("evTemplatesSub")}</span></div>
              <div className={f.tpls}>
                {TEMPLATES.map(([id, emoji, label, tone]) => (
                  <button key={id} type="button" className={`btn ${f.tpl} ${f[tone]} ${draft.templateId === id ? f.tplOn : ""}`} aria-pressed={draft.templateId === id} onClick={() => (onTemplate ? onTemplate(draft.templateId === id ? null : id) : set("templateId", draft.templateId === id ? null : id))}>
                    <span className={f.tplEmoji} aria-hidden>{emoji}</span><b>{t(label)}</b>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className={`${s.card} ${f.blk}`} data-host-evform="">
            <div className={s.cardH}><h3>{t("evBasics")}</h3><span className={s.lbl}>{t("evRequired")}</span></div>
            <CoverField t={t} url={coverUrl} adjustable={cover.kind === "new"} focusY={cover.kind === "new" ? cover.focusY : 0.5} disabled={readOnly || busy}
              onPick={(file) => onCoverPick?.(file)} onFocus={(focusY) => onCoverFocus?.(focusY)} onRemove={() => onCoverRemove?.()} />
            <fieldset className={f.fs} disabled={readOnly}>
              {field(t("evName"), <input value={draft.title} maxLength={120} placeholder={t("evNamePh")} aria-label={t("evName")} onChange={(ev) => set("title", ev.target.value)} />)}
              {field(t("evWhen"), <>
                <input type="date" className={f.date} value={draft.date} aria-label={t("evDate")} onChange={(ev) => set("date", ev.target.value)} />
                <input type="time" className={f.time} value={draft.start} aria-label={t("evStart")} onChange={(ev) => set("start", ev.target.value)} />
                <span className={s.muted}>–</span>
                <input type="time" className={f.time} value={draft.end} aria-label={t("evEnd")} onChange={(ev) => set("end", ev.target.value)} />
              </>)}
              {field(t("evVenue"), <>
                <input value={draft.venueName} maxLength={120} placeholder={t("evVenuePh")} aria-label={t("evVenue")} onChange={(ev) => set("venueName", ev.target.value)} />
                <label className={f.inline}><input type="checkbox" checked={draft.online} onChange={(ev) => set("online", ev.target.checked)} />{t("evOnline")}</label>
              </>)}
              {field(t("evCapacity"), <><input inputMode="numeric" value={draft.capacity} aria-label={t("evCapacity")} onChange={(ev) => set("capacity", ev.target.value.replace(/[^\d]/gu, ""))} /><span className={s.muted}>{t("evCapacityUnit")}</span></>, true)}
              <div className={m.setrow}>
                <span className={`${s.lbl} ${f.fl}`}>{t("evFee")}</span>
                <div className={`${f.input} ${f.feeKind}`}>
                  <select value={draft.feeKind} aria-label={t("evFee")} onChange={(ev) => set("feeKind", ev.target.value as HostEventFeeKind)}>
                    <option value="free">{t("evFeeFree")}</option><option value="amount">{t("evFeeAmount")}</option><option value="pay_at_door">{t("evFeeDoor")}</option><option value="external_link">{t("evFeeLink")}</option>
                  </select>
                </div>
                {draft.feeKind === "amount" || draft.feeKind === "pay_at_door" ? <div className={`${f.input} ${f.narrow}`}><span className={s.muted}>¥</span><input inputMode="numeric" value={draft.feeAmount} aria-label={t("evFeeAmount")} onChange={(ev) => set("feeAmount", ev.target.value.replace(/[^\d]/gu, ""))} /></div> : null}
                {draft.feeKind === "external_link" ? <div className={f.input}><input type="url" value={draft.feeUrl} placeholder={t("evFeeUrlPh")} aria-label={t("evFeeLink")} onChange={(ev) => set("feeUrl", ev.target.value)} /></div> : null}
              </div>
              {draft.feeKind === "free" ? null : <div className={`${s.lbl} ${f.hint}`}>{t("evFeeNote")}</div>}
              <div className={m.setrow}>
                <span className={`${s.lbl} ${f.fl}`}>{t("evProfile")}</span>
                <div className={`${f.input} ${f.org}`} data-host-evorg="">
                  {profiles.length ? (
                    <select value={draft.organizerProfileId} aria-label={t("evProfile")} onChange={(ev) => set("organizerProfileId", ev.target.value)}>
                      {profiles.map((item) => <option key={item.profileId} value={item.profileId}>{`${item.emoji ?? "🎪"} ${item.displayName}`}</option>)}
                    </select>
                  ) : <span className={s.muted}>{t("evProfileNone")}</span>}
                  <Icon name="down" size={16} />
                </div>
              </div>
            </fieldset>
            <div className={`${s.lbl} ${f.hint}`}>{profile ? t("evProfileHint", { url: `${publicHost()}/o/${profile.slug}` }) : null} <a className={f.link} href="/app/events/center/profiles">{t("evProfileManage")}</a></div>
          </div>
          <div className={`${s.card} ${f.blk}`}>
            <div className={s.cardH}><h3>{t("evDesc")}</h3><span className={s.lbl}>{t("evDescMax")}</span></div>
            <label className={f.ta}>
              <textarea value={draft.description} disabled={readOnly} maxLength={DESC_MAX} placeholder={t("evDescPh")} aria-label={t("evDesc")} onChange={(ev) => set("description", ev.target.value)} />
              <span className={`${f.counter} ${length > DESC_MAX - 100 ? f.counterBad : ""}`} aria-live="polite">{t("evCounter", { n: length })}</span>
            </label>
          </div>
          <AgendaEditor rows={draft.agenda ?? []} t={t} start={draft.start || null} end={draft.end || null} required showMissing={agendaShowMissing}
            readOnly={event?.status === "ended"} disabled={readOnly} onChange={(agenda) => set("agenda", agenda)} />
          <HostContactCard draft={draft} t={t} disabled={readOnly || event?.status === "ended"} onChange={(next) => onChange?.({ ...draft, ...next })} />
          {mode === "create" ? (
            <div className={`${s.card} ${f.blk}`} data-host-evquestions={draft.questions.length}>
              <div className={s.cardH}><h3>{t("evQuestions")}</h3><span className={s.lbl}>{t("suQHint", { n: draft.questions.length })}</span></div>
              <div className={`${s.lbl} ${f.qNote}`}>{t("evQuestionsNote")}</div>
              <QuestionsEditor questions={draft.questions} t={t} language={language} editing={editingQuestion} onEdit={(index) => onEditQuestion?.(index)} onChange={(questions) => set("questions", questions)}
                onLimit={() => toast.info(t("suQLimit"))} onAdded={(n) => toast.success(t("suAdded", { n }))} />
            </div>
          ) : null}
          {/* < 768（b12 W-R17-01-390）：顶栏放不下文字按钮，「公開へ進む」整宽放在表单末尾，下書き保存 在它上面。 */}
          <div className={f.phoneActs} data-host-form-phone-actions="">
            {isDraft ? <button type="button" className={`btn ${s.btn}`} disabled={busy || readOnly} onClick={onSaveDraft}>{t(mode === "create" ? "evSaveTemp" : "evSaveDraft")}</button> : null}
            <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy || readOnly} onClick={onPrimary}>{t(mode === "create" ? "evToPublish" : "evSaveChanges")}</button>
          </div>
        </div>
        <div className={`${f.col} ${f.span5} ${f.previewCol}`}>
          <div className={`${s.card} ${f.blk}`} data-host-evcard-preview="">
            <div className={`${s.lbl} ${r.pvHead}`}>{t("evPreviewCard")}</div>
            <div className={r.pvWrap}>
              <EventCard index={0} language={language} t={journeyTranslator(language)} onOpen={() => undefined}
                metaOverride={meta.split(" · ").slice(0, 2).join(" · ")}
                coverPosition={cover.kind === "new" ? `50% ${Math.round(cover.focusY * 100)}%` : undefined}
                row={{ coverUrl, emoji: profile?.emoji ?? "🎪", eventId: event?.eventId ?? "preview", href: "#", priceYen: draft.feeKind === "free" ? 0 : draft.feeAmount.trim() ? Number(draft.feeAmount) : null, registrationCount: event?.appliedCount ?? null, startsAt: startsAt ?? "", title: draft.title.trim() || t("evUntitled") }} />
            </div>
            {coverUrl ? <div className={`${s.lbl} ${r.pvNote}`}>{t("evPreviewCardNote")}</div> : null}
          </div>
          <div className={`${s.card} ${f.blk}`} data-host-evprev="">
            <div className={s.cardH}><h3>{t("evPreview")}</h3><span className={s.lbl}>{t("evPreviewSub")}</span></div>
            <div className={f.pv}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 本地预览（blob:）或已保存的图 */}
              {coverUrl ? <img className={r.pvCoverImg} src={coverUrl} alt="" style={cover.kind === "new" ? { objectPosition: `50% ${Math.round(cover.focusY * 100)}%` } : undefined} /> : <div className={f.pvCover} />}
              <div className={f.pvBody}>
                <div className={s.lbl}>{profile ? `${profile.emoji ?? "🎪"} ${profile.displayName}` : ""}</div>
                <b className={f.pvTitle}>{draft.title.trim() || t("evUntitled")}</b>
                <div className={`${s.lbl} ${f.pvMeta}`}>{meta}</div>
                {draft.description.trim() ? <div className={`${s.sub} ${f.pvDesc}`}>{draft.description.trim()}</div> : null}
                <AgendaPreview rows={draft.agenda ?? []} t={t} />
                <span className={`btn ${s.btn} ${s.primary} ${f.pvBtn}`} aria-hidden>{t("evRegister")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** 主催者の連絡先（任意）：WeChat ID / LINE ID / 参加者へのひとこと。申込んだ人だけに表示される（説明カードと質問カードの間）。 */
export function HostContactCard({ draft, t, disabled = false, onChange }: { draft: Pick<EventDraft, "wechatId" | "lineId" | "contactNote">; t: HostT; disabled?: boolean; onChange?: (next: Pick<EventDraft, "wechatId" | "lineId" | "contactNote">) => void }) {
  const note = draft.contactNote ?? "";
  const noteLength = chars(note);
  const noteBad = draftContact({ contactNote: note, lineId: "", wechatId: "" }).problem;
  const pick = { contactNote: note, lineId: draft.lineId ?? "", wechatId: draft.wechatId ?? "" };
  const row = (label: string, key: "wechatId" | "lineId") => (
    <div className={m.setrow}><span className={`${s.lbl} ${f.fl}`}>{label}</span><div className={f.input}><input value={pick[key]} maxLength={HOST_CONTACT_ID_MAX} autoComplete="off" spellCheck={false} aria-label={label} onChange={(ev) => onChange?.({ ...pick, [key]: ev.target.value })} /></div></div>
  );
  return (
    <div className={`${s.card} ${f.blk}`} data-host-evcontact="">
      <div className={s.cardH}><h3>{t("evContact")}</h3><span className={s.lbl}>{t("evContactSub")}</span></div>
      <fieldset className={f.fs} disabled={disabled}>
        {row(t("evContactWechat"), "wechatId")}
        {row(t("evContactLine"), "lineId")}
      </fieldset>
      <label className={f.noteBlock}>
        <span className={`${s.lbl} ${f.noteLbl}`}>{t("evContactMessage")}</span>
        <span className={`${f.ta} ${noteBad ? f.taBad : ""}`}>
          <textarea value={note} disabled={disabled} maxLength={HOST_CONTACT_NOTE_MAX + 20} placeholder={t("evContactMessagePh")} aria-label={t("evContactMessage")} aria-invalid={noteBad || undefined} onChange={(ev) => onChange?.({ ...pick, contactNote: ev.target.value })} />
          <span className={`${f.counter} ${noteBad ? f.counterBad : ""}`} aria-live="polite">{t("evContactCounter", { n: noteLength })}</span>
        </span>
        {noteBad ? <span className={`${s.lbl} ${f.bad}`} role="alert">{t("evContactNoteInvalid")}</span> : null}
      </label>
    </div>
  );
}

/** 「11/4（水）19:00」（プレビューの短い日時）。 */
function hostDateShortLong(iso: string, language: OrbitLanguage, t: HostT): string {
  const p = tokyoParts(iso);
  if (!p) return "";
  const long = hostDateLong(iso, language, t);
  if (language === "en") return long;
  const wd = long.match(/（[^）]*）/u)?.[0] ?? "";
  return `${p.month}/${p.day}${wd}${long.slice(long.lastIndexOf("）") + 1)}`;
}

// ─── 一時保存（2026-11-13 用户：新建活动允许暂存） ─────────────────────
// 必須項目がそろっていればサーバーの下書き（本人だけに見える）として保存し、このページに留まる。
// そろっていなければこの端末に保存し、足りない項目を伝える。新規作成ページは入力のたびに端末へ自動保存し、
// 次に開いたとき復元する（下書き作成・作成完了で消える）。端末保存はアカウントごとのキー。

const TEMP_KEY_PREFIX = "orbit:host-event-temp:v1:";
const TEMP_MAX_AGE_MS = 30 * 86_400_000;

export type TempDraft = { savedAt: string; draft: EventDraft };

/** 入力が何かあるか（既定値だけなら保存しない）。 */
export function draftHasInput(draft: EventDraft): boolean {
  return Boolean(draft.title.trim() || draft.description.trim() || draft.venueName.trim() || draft.date || draft.capacity.trim() || draft.feeAmount.trim() || draft.feeUrl.trim() || draft.templateId
    || (draft.wechatId ?? "").trim() || (draft.lineId ?? "").trim() || (draft.contactNote ?? "").trim()
    || (draft.agenda ?? []).some((row) => row.at.trim() || row.title.trim() || row.detail.trim()));
}

export function readTempDraft(storage: Pick<Storage, "getItem" | "removeItem"> | null, userKey: string, now: Date): TempDraft | null {
  if (!storage || !userKey) return null;
  try {
    const raw = storage.getItem(TEMP_KEY_PREFIX + userKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TempDraft;
    if (!parsed?.draft || typeof parsed.savedAt !== "string" || now.getTime() - Date.parse(parsed.savedAt) > TEMP_MAX_AGE_MS) { storage.removeItem(TEMP_KEY_PREFIX + userKey); return null; }
    return parsed;
  } catch {
    return null;
  }
}

export function writeTempDraft(storage: Pick<Storage, "setItem" | "removeItem"> | null, userKey: string, draft: EventDraft, now: Date): boolean {
  if (!storage || !userKey) return false;
  try {
    if (!draftHasInput(draft)) { storage.removeItem(TEMP_KEY_PREFIX + userKey); return true; }
    storage.setItem(TEMP_KEY_PREFIX + userKey, JSON.stringify({ draft, savedAt: now.toISOString() } satisfies TempDraft));
    return true;
  } catch {
    return false;
  }
}

export function clearTempDraft(storage: Pick<Storage, "removeItem"> | null, userKey: string): void {
  if (!storage || !userKey) return;
  try { storage.removeItem(TEMP_KEY_PREFIX + userKey); } catch { /* storage blocked: nothing to clear */ }
}

function browserStorage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

// ─── 容器 ──────────────────────────────────────────────

function FormInner({ mode, eventId, language }: { mode: "create" | "edit"; eventId: string | null; language: OrbitLanguage }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [profiles, setProfiles] = useState<readonly OrganizerProfile[] | null>(null);
  const [event, setEvent] = useState<HostEventView | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [preview, setPreview] = useState<{ change: HostEventChangePreview; patch: Omit<HostEventUpdateInput, "expectedVersion"> } | null>(null);
  const [publishFor, setPublishFor] = useState<HostEventView | null>(null);
  // 端末の一時保存（新規作成のみ）：アカウントごとのキーと、復元したときの案内。
  const [userKey, setUserKey] = useState("");
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState(-1);
  // 「前往公开 / 保存」被议程挡住后：红字 + 聚焦到第一处。
  const [agendaShowMissing, setAgendaShowMissing] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);
  // カバー画像：保存（新規作成は作成）するまで手元に置き、保存時に POST / DELETE …/cover。
  const [cover, setCover] = useState<CoverChange>({ kind: "keep" });
  const replaceCover = (next: CoverChange) => setCover((current) => { if (current.kind === "new" && (next.kind !== "new" || next.url !== current.url)) URL.revokeObjectURL(current.url); return next; });
  const pickCover = async (file: File) => {
    const prepared = await prepareCover(file);
    if (!prepared.ok) { toast.error(t(coverError(prepared) === "tooLarge" ? "evCoverTooLarge" : "evCoverType")); return; }
    const ready = prepared as Extract<typeof prepared, { ok: true }>;
    replaceCover({ blob: ready.blob, focusY: 0.5, kind: "new", name: ready.name, url: ready.url });
  };
  /** 未保存の画像変更をサーバーへ。返り値：変更後の活動（版が進む）/ null = 何もしない / "failed"。 */
  const applyCover = async (eventId: string): Promise<HostEventView | null | "failed"> => {
    if (cover.kind === "keep") return null;
    const res = cover.kind === "new" ? await coverApi.upload(eventId, cover.blob, cover.name, cover.focusY) : await coverApi.remove(eventId);
    if (!res.ok) { toast.error(t(coverError(res) === "tooLarge" ? "evCoverTooLarge" : coverError(res) === "type" ? "evCoverType" : coverError(res) === "sample" ? "evSample" : "evCoverFailed")); return "failed"; }
    replaceCover({ kind: "keep" });
    const fresh = await hostEventApi.event(eventId);
    return fresh.ok ? fresh.data : "failed";
  };
  // テンプレート → 申込フォームの初期質問（質問集から；未選択は「交流会」と同じ。主催者の画面の言語で入れる）。
  const questionsFor = useCallback((templateId: EventDraft["templateId"]) => templateQuestions(templateKeyOf(templateId), language), [language]);

  const load = useCallback(async () => {
    setConflict(false);
    const [profileRes, eventRes] = await Promise.all([hostEventApi.profiles(), eventId ? hostEventApi.event(eventId) : Promise.resolve(null)]);
    const list = profileRes.ok ? profileRes.data.profiles : [];
    setProfiles(list);
    if (eventRes && !eventRes.ok) { setFailure(failureOf(eventRes)); return; }
    const view = eventRes && eventRes.ok ? eventRes.data : null;
    setEvent(view);
    const fresh = draftFromEvent(view, list);
    setFailure(null);
    if (mode === "create") {
      const session = await fetch("/api/auth/session").then((res) => res.json() as Promise<{ user?: { id?: string } } | null>).catch(() => null);
      const key = session?.user?.id ?? "";
      setUserKey(key);
      const temp = readTempDraft(browserStorage(), key, new Date());
      if (temp) { setDraft({ ...fresh, ...temp.draft, agenda: Array.isArray(temp.draft.agenda) && temp.draft.agenda.length ? temp.draft.agenda : fresh.agenda, questions: Array.isArray(temp.draft.questions) && temp.draft.questions.length ? temp.draft.questions : questionsFor(temp.draft.templateId ?? null), organizerProfileId: list.some((item) => item.profileId === temp.draft.organizerProfileId) ? temp.draft.organizerProfileId : fresh.organizerProfileId }); setRestoredAt(temp.savedAt); return; }
    }
    setDraft(mode === "create" ? { ...fresh, questions: questionsFor(fresh.templateId) } : fresh);
  }, [eventId, mode, questionsFor]);
  useEffect(() => { void load(); }, [load]);

  // 新規作成：入力のたびに（0.8 秒まとめて）端末へ自動保存。
  useEffect(() => {
    if (mode !== "create" || !draft || !userKey) return;
    const timer = setTimeout(() => { writeTempDraft(browserStorage(), userKey, draft, new Date()); }, 800);
    return () => clearTimeout(timer);
  }, [draft, mode, userKey]);

  const problemOf = (forPublish = false): ReturnType<typeof draftToInput> | null => {
    if (!draft) return null;
    const result = draftToInput(draft, { forPublish });
    if (result.problem === "evInvalidAgenda") {
      setAgendaShowMissing(true);
      const rows = draft.agenda ?? [];
      requestAnimationFrame(() => focusAgendaMissing(formRef.current, rows));
    }
    if (result.problem) toast.error(t(result.problem));
    return result;
  };

  const create = async (thenPublish: boolean) => {
    const result = problemOf(thenPublish);
    if (!result?.input) return;
    setBusy(true);
    const res = await hostEventApi.create(result.input);
    setBusy(false);
    if (!res.ok) { toast.error(failureOf(res) === "sample" ? t("evSample") : t("saveError")); return; }
    clearTempDraft(browserStorage(), userKey);
    // 画像は活動ができてから送る（作成と同じ操作の続き）；失敗しても活動は作成済み、編集ページで付け直せる。
    const withCover = await applyCover(res.data.event.eventId);
    const created = withCover && withCover !== "failed" ? withCover : res.data.event;
    if (thenPublish) { setEvent(created); setPublishFor(created); return; }
    toast.success(t("evDraftSaved"));
    // 下書きになったら編集ページへ（このまま続けて編集・保存できる）。
    router.replace(`/app/events/${encodeURIComponent(res.data.event.eventId)}/edit`);
  };

  /** 一時保存：そろっていればサーバーの下書き、足りなければ端末に保存して足りない項目を伝える。 */
  const saveTemp = () => {
    if (!draft) return;
    const result = draftToInput(draft);
    if (result.input) { void create(false); return; }
    // 暂存不挡：议程没填完也照原样存在这台设备上（2026-11-15）。
    if (!writeTempDraft(browserStorage(), userKey, draft, new Date())) { toast.error(t("saveError")); return; }
    setRestoredAt(null);
    toast.success(t("evTempSaved", { what: t(result.problem) }));
  };

  const discardTemp = () => {
    clearTempDraft(browserStorage(), userKey);
    setRestoredAt(null);
    setDraft({ ...draftFromEvent(null, profiles ?? []), questions: questionsFor(null) });
  };

  const patch = async (fields: Omit<HostEventUpdateInput, "expectedVersion">, notify?: boolean, base: HostEventView | null = event) => {
    if (!base) return;
    setBusy(true);
    const res = await hostEventApi.update(base.eventId, { ...fields, expectedVersion: base.version, ...(notify === undefined ? {} : { notify }) });
    setBusy(false);
    if (!res.ok) {
      const reason = failureOf(res);
      if (reason === "conflict") { setConflict(true); setPreview(null); return; }
      toast.error(reason === "sample" ? t("evSample") : t("saveError"));
      return;
    }
    if (res.data.changePreview && notify === undefined) { setPreview({ change: res.data.changePreview, patch: fields }); return; }
    setPreview(null);
    setEvent(res.data.event);
    setDraft(draftFromEvent(res.data.event, profiles ?? []));
    toast.success(res.data.notified > 0 ? t("evSavedNotified", { n: res.data.notified }) : base.lifecycle === "draft" && notify === undefined ? t("evDraftSaved") : t("evSaved"));
  };

  const save = async () => {
    const result = problemOf();
    if (!result?.input || !event) return;
    // 画像を先に（版が 1 つ進む）→ 新しい版で残りの項目を PATCH。
    let base = event;
    if (cover.kind !== "keep") {
      setBusy(true);
      const done = await applyCover(event.eventId);
      setBusy(false);
      if (done === "failed") return;
      if (done) { base = done; setEvent(done); }
    }
    const fields = changedFields(base, result.input);
    if (!Object.keys(fields).length) { toast.success(t("evSaved")); return; }
    void patch(fields, undefined, base);
  };

  const publish = async () => {
    if (!publishFor) return;
    setBusy(true);
    const res = await hostEventApi.publish(publishFor.eventId, publishFor.version);
    setBusy(false);
    if (!res.ok) { toast.error(failureOf(res) === "conflict" ? t("conflictError") : t("saveError")); return; }
    toast.success(t("publishedToast"));
    router.push(consoleHref(res.data.event.eventId));
  };

  const back = <a className={`btn ${s.btn} ${s.backBtn}`} href="/app/events/center" aria-label={t("back")}><Icon name="left" size={20} /></a>;
  if (failure) {
    return (
      <>
        <ShellPage title={t(mode === "create" ? "evCreateTitle" : "evEditTitle")} left={back} rightRail={false} />
        <div className={`${s.card} ${s.empty}`} data-host-failure={failure}>{failure === "forbidden" ? t("noAccess") : failure === "not_found" ? t("notFound") : t("loadError")} <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => void load()}>{t("retry")}</button></div>
      </>
    );
  }
  if (!draft || !profiles) return <ShellPage title={t(mode === "create" ? "evCreateTitle" : "evEditTitle")} left={back} rightRail={false} />;
  const readOnly = Boolean(event && (event.lifecycle === "cancelled" || event.lifecycle === "archived" || !(event.myRole === "owner" || event.myRole === "manager" || event.capabilities.includes("event.edit"))));
  return (
    <>
      {conflict ? (
        <div className={`${s.card} ${s.flat} ${f.conflict}`} role="alert" data-host-form-conflict="">
          <span className={s.grow}>{t("evConflict")}</span>
          <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => void load()}>{t("retry")}</button>
        </div>
      ) : null}
      {readOnly ? <div className={`${s.card} ${s.flat} ${f.conflict}`} data-host-form-readonly="">{t("evReadOnly")}</div> : null}
      {restoredAt ? (
        <div className={`${s.card} ${s.flat} ${s.row} ${f.restored}`} role="status" data-host-form-restored="">
          <span className={s.grow}>{t("evRestored", { time: hostDateLong(restoredAt, language, t) })}</span>
          <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={discardTemp}>{t("evDiscardTemp")}</button>
        </div>
      ) : null}
      <div ref={formRef} className={f.contents}>
      <HostEventFormView mode={mode} draft={draft} profiles={profiles} language={language} event={event} busy={busy} readOnly={readOnly} agendaShowMissing={agendaShowMissing}
        showTemplates={mode === "create" && params.get("from") === "template"} onChange={setDraft}
        editingQuestion={editingQuestion} onEditQuestion={setEditingQuestion}
        onTemplate={(templateId) => { setDraft((current) => (current ? { ...current, templateId, questions: questionsFor(templateId) } : current)); setEditingQuestion(-1); }}
        onSaveDraft={() => (mode === "create" ? saveTemp() : void save())} onPrimary={() => (mode === "create" ? void create(true) : void save())}
        cover={cover} onCoverPick={(file) => void pickCover(file)} onCoverFocus={(focusY) => setCover((current) => (current.kind === "new" ? { ...current, focusY } : current))}
        onCoverRemove={() => replaceCover(cover.kind === "new" && !event?.coverUrl ? { kind: "keep" } : { kind: "remove" })} />
      </div>
      {preview ? <ChangeNotifyConfirm preview={preview.change} t={t} language={language} busy={busy} onClose={() => setPreview(null)} onSilent={() => void patch(preview.patch, false)} onNotify={() => void patch(preview.patch, true)} /> : null}
      {publishFor ? <PublishEventConfirm event={publishFor} t={t} language={language} busy={busy} onCancel={() => { setPublishFor(null); router.push(`/app/events/${encodeURIComponent(publishFor.eventId)}/edit`); }} onPublish={() => void publish()} /> : null}
    </>
  );
}

export function HostEventForm({ mode, eventId = null, language }: { mode: "create" | "edit"; eventId?: string | null; language: OrbitLanguage }) {
  return (
    <Orbit2026Scope language={language} className={s.page}>
      <ToastProvider>
        <FormInner mode={mode} eventId={eventId} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
