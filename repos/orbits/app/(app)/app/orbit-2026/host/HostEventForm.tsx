"use client";

// R17 建活动 `/app/events/center/new`（b12 #396）· 基本情報を編集 `/app/events/[id]/edit`（b12 #398）；host DESIGN §2.2。
// 写：POST /api/host/events（下書き）→ 申込設定；「公開へ進む」= 存下書き后弹公開確認（b12 #400）→ POST …/publish。
// 编辑：PATCH …/[id]（expectedVersion）；已公开且改了日時 / 会場 → 服务端回 changePreview，弹 b12 #404 后带 notify 再提交；
// 409 → 提示重读。编辑页只有「下書き保存 / 変更を保存」（决定表 §44-3）：中止 / 参加コード再発行 / アーカイブ 走运营台页头「⋯」菜单（HostConsole），
// 下書きの「公開する」在运营台横幅（b12 #440）。
// b12 #396–#475 待用户过目（§38），照画板实现但不进门禁。
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { hostNoteText } from "../../../../../shared/api-schema/host-events";
import type { HostEventChangePreview, HostEventFeeKind, HostEventInput, HostEventUpdateInput, HostEventView } from "../../../../../shared/contract/host-events";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { OrganizerProfile } from "../../../../../shared/contract/organizer-profile";
import { ShellPage } from "../shell/slots";
import { Icon, Modal, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { failureOf, hostEventApi } from "./host-api";
import { consoleHref, hostDateLong, hostTranslator, tokyoParts, type HostT } from "./host-model";
import f from "./form.module.css";
import s from "./host.module.css";
import m from "./tabs.module.css";

export const DESC_MAX = 200;
export const NOTE_MAX = 140;
const TEMPLATES = [["mixer", "🥂", "tplMixer", "m_lav"], ["study", "📚", "tplStudy", "m_blue"], ["roundtable", "💬", "tplRound", "m_pink"]] as const;
type TemplateId = (typeof TEMPLATES)[number][0];

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
  templateId: TemplateId | null;
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
    return { capacity: "", date: "", description: "", end: "21:30", feeAmount: "", feeKind: "free", feeUrl: "", online: false, organizerProfileId: profiles[0]?.profileId ?? "", start: "19:00", templateId: null, title: "", venueName: "" };
  }
  const start = tokyoInputs(event.startsAt);
  const end = tokyoInputs(event.endsAt);
  return {
    capacity: event.capacity == null ? "" : String(event.capacity), date: start.date, description: event.description ?? "", end: end.time, feeAmount: event.feeAmountYen == null ? "" : String(event.feeAmountYen),
    feeKind: event.feeKind, feeUrl: event.feeUrl ?? "", online: event.online, organizerProfileId: event.organizerProfileId ?? profiles[0]?.profileId ?? "", start: start.time, templateId: null, title: event.title, venueName: event.venueName ?? "",
  };
}

export type DraftProblem = "evInvalidName" | "evInvalidTime" | "evInvalidVenue" | "evInvalidFee" | "evInvalidProfile";

/** 入力 → 契約（建 / 改共用）。問題があれば最初の 1 つ。 */
export function draftToInput(draft: EventDraft): { input: Omit<HostEventInput, "organizerProfileId"> & { organizerProfileId: string }; problem: null } | { input: null; problem: DraftProblem } {
  const title = draft.title.trim();
  if (!title) return { input: null, problem: "evInvalidName" };
  const startsAt = tokyoIso(draft.date, draft.start);
  let endsAt = tokyoIso(draft.date, draft.end);
  // 終了が開始より前 = 日をまたぐ（23:00–01:00）。
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) endsAt = new Date(Date.parse(endsAt) + 86_400_000).toISOString();
  if (!startsAt || !endsAt || Date.parse(endsAt) - Date.parse(startsAt) > 86_400_000) return { input: null, problem: "evInvalidTime" };
  const venueName = draft.venueName.trim();
  if (!venueName && !draft.online) return { input: null, problem: "evInvalidVenue" };
  const amount = draft.feeAmount.trim() ? Number(draft.feeAmount.replace(/[,，¥￥\s]/gu, "")) : null;
  if ((draft.feeKind === "amount" && (amount == null || !Number.isInteger(amount) || amount <= 0)) || (amount != null && (!Number.isInteger(amount) || amount < 0))) return { input: null, problem: "evInvalidFee" };
  if (draft.feeKind === "external_link" && !/^https:\/\/\S+$/u.test(draft.feeUrl.trim())) return { input: null, problem: "evInvalidFee" };
  if (!draft.organizerProfileId) return { input: null, problem: "evInvalidProfile" };
  const capacity = draft.capacity.trim() ? Number(draft.capacity) : null;
  if (capacity != null && (!Number.isInteger(capacity) || capacity <= 0)) return { input: null, problem: "evInvalidFee" };
  return {
    input: {
      capacity, description: draft.description.trim() || null, endsAt, feeAmountYen: draft.feeKind === "free" || draft.feeKind === "external_link" ? null : amount, feeKind: draft.feeKind,
      feeUrl: draft.feeKind === "external_link" ? draft.feeUrl.trim() : null, online: draft.online, organizerProfileId: draft.organizerProfileId, startsAt, timezone: "Asia/Tokyo", title,
      venueName: venueName || null, ...(draft.templateId ? { templateId: draft.templateId } : {}),
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
};

export function HostEventFormView({ mode, draft, profiles, language, event = null, busy = false, readOnly = false, showTemplates = false, onChange, onSaveDraft, onPrimary }: HostEventFormViewProps) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => onChange?.({ ...draft, [key]: value });
  const profile = profiles.find((item) => item.profileId === draft.organizerProfileId) ?? null;
  const length = chars(draft.description);
  const startsAt = tokyoIso(draft.date, draft.start);
  const back = <a className={`btn ${s.btn} ${s.backBtn}`} href={event ? consoleHref(event.eventId) : "/app/events/center"} aria-label={t("back")}><Icon name="left" size={20} /></a>;
  const isDraft = mode === "create" || event?.lifecycle === "draft";
  const right = (
    <div className={s.headRight}>
      {isDraft ? <button type="button" className={`btn ${s.btn}`} disabled={busy || readOnly} onClick={onSaveDraft} data-host-save-draft="">{t("evSaveDraft")}</button> : null}
      <button type="button" className={`btn ${s.btn} ${s.accent}`} disabled={busy || readOnly} onClick={onPrimary} data-host-form-primary="">{t(mode === "create" ? "evToPublish" : "evSaveChanges")}</button>
    </div>
  );
  const meta = [startsAt ? hostDateShortLong(startsAt, language, t) : "", draft.online && !draft.venueName.trim() ? t("evOnline") : draft.venueName.trim().split(/\s+/u)[0] ?? "", feeText(draft, t)].filter(Boolean).join(" · ");
  const field = (label: string, control: React.ReactNode, narrow = false) => (
    <div className={m.setrow}><span className={`${s.lbl} ${f.fl}`}>{label}</span><div className={`${f.input} ${narrow ? f.narrow : ""}`}>{control}</div></div>
  );
  return (
    <>
      <ShellPage title={t(mode === "create" ? "evCreateTitle" : "evEditTitle")} subtitle={mode === "create" ? t("evCreateCrumb") : t("evEditCrumb", { title: event?.title ?? "" })} left={back} right={right} rightRail={false} />
      <div className={s.wgrid} data-host-event-form={mode}>
        <div className={`${f.col} ${f.span7}`}>
          {showTemplates ? (
            <div className={`${s.card} ${f.blk}`} data-host-templates="">
              <div className={s.cardH}><h3>{t("evTemplates")}</h3><span className={s.lbl}>{t("evTemplatesSub")}</span></div>
              <div className={f.tpls}>
                {TEMPLATES.map(([id, emoji, label, tone]) => (
                  <button key={id} type="button" className={`btn ${f.tpl} ${f[tone]} ${draft.templateId === id ? f.tplOn : ""}`} aria-pressed={draft.templateId === id} onClick={() => set("templateId", draft.templateId === id ? null : id)}>
                    <span className={f.tplEmoji} aria-hidden>{emoji}</span><b>{t(label)}</b>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className={`${s.card} ${f.blk}`} data-host-evform="">
            <div className={s.cardH}><h3>{t("evBasics")}</h3><span className={s.lbl}>{t("evRequired")}</span></div>
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
              <span className={`${f.counter} ${length > 180 ? f.counterBad : ""}`} aria-live="polite">{t("evCounter", { n: length })}</span>
            </label>
          </div>
        </div>
        <div className={`${f.col} ${f.span5}`}>
          <div className={`${s.card} ${f.blk}`} data-host-evprev="">
            <div className={s.cardH}><h3>{t("evPreview")}</h3><span className={s.lbl}>{t("evPreviewSub")}</span></div>
            <div className={f.pv}>
              <div className={f.pvCover} />
              <div className={f.pvBody}>
                <div className={s.lbl}>{profile ? `${profile.emoji ?? "🎪"} ${profile.displayName}` : ""}</div>
                <b className={f.pvTitle}>{draft.title.trim() || t("evUntitled")}</b>
                <div className={`${s.lbl} ${f.pvMeta}`}>{meta}</div>
                {draft.description.trim() ? <div className={`${s.sub} ${f.pvDesc}`}>{draft.description.trim()}</div> : null}
                <span className={`btn ${s.btn} ${s.primary} ${f.pvBtn}`} aria-hidden>{t("evRegister")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
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

  const load = useCallback(async () => {
    setConflict(false);
    const [profileRes, eventRes] = await Promise.all([hostEventApi.profiles(), eventId ? hostEventApi.event(eventId) : Promise.resolve(null)]);
    const list = profileRes.ok ? profileRes.data.profiles : [];
    setProfiles(list);
    if (eventRes && !eventRes.ok) { setFailure(failureOf(eventRes)); return; }
    const view = eventRes && eventRes.ok ? eventRes.data : null;
    setEvent(view);
    setDraft(draftFromEvent(view, list));
    setFailure(null);
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);

  const problemOf = (): ReturnType<typeof draftToInput> | null => {
    if (!draft) return null;
    const result = draftToInput(draft);
    if (result.problem) toast.error(t(result.problem));
    return result;
  };

  const create = async (thenPublish: boolean) => {
    const result = problemOf();
    if (!result?.input) return;
    setBusy(true);
    const res = await hostEventApi.create(result.input);
    setBusy(false);
    if (!res.ok) { toast.error(failureOf(res) === "sample" ? t("evSample") : t("saveError")); return; }
    if (thenPublish) { setEvent(res.data.event); setPublishFor(res.data.event); return; }
    toast.success(t("evDraftSaved"));
    router.push(consoleHref(res.data.event.eventId, "setup"));
  };

  const patch = async (fields: Omit<HostEventUpdateInput, "expectedVersion">, notify?: boolean) => {
    if (!event) return;
    setBusy(true);
    const res = await hostEventApi.update(event.eventId, { ...fields, expectedVersion: event.version, ...(notify === undefined ? {} : { notify }) });
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
    toast.success(res.data.notified > 0 ? t("evSavedNotified", { n: res.data.notified }) : event.lifecycle === "draft" && notify === undefined ? t("evDraftSaved") : t("evSaved"));
  };

  const save = () => {
    const result = problemOf();
    if (!result?.input || !event) return;
    const fields = changedFields(event, result.input);
    if (!Object.keys(fields).length) { toast.success(t("evSaved")); return; }
    void patch(fields);
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
      <HostEventFormView mode={mode} draft={draft} profiles={profiles} language={language} event={event} busy={busy} readOnly={readOnly}
        showTemplates={mode === "create" && params.get("from") === "template"} onChange={setDraft}
        onSaveDraft={() => (mode === "create" ? void create(false) : save())} onPrimary={() => (mode === "create" ? void create(true) : save())} />
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
