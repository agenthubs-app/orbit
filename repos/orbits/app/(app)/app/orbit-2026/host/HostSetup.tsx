"use client";

// R17 イベント運営 · 申込設定（b6 #13 空 · 朝会 #3 / #14 少 · CFO18 下書き 2問 / #15 大 · CFO18 公開中 5問 + 未公開の変更 2）。
// 下方折叠区「お知らせの文面」（b12 #406：定型 6 种只显示 +「主催者からのひとこと」≤140 字、不能带链接）。
// 数据：GET /setup；下書き自動保存 PUT /setup（expectedRevision，409 → 提示重读）；公開する / 変更を公開 POST /setup/publish；ひとこと PUT /setup/host-note。
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

import type { HostNoticeTemplateKind, HostQuestionKind, HostSetupQuestion, HostSetupResponse } from "../../../../../shared/contract/host-console";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { ConfirmDialog, Icon, useToast } from "../ui";
import { failureOf, hostApi } from "./host-api";
import { eventTone, hostDateDay, hostDateLong, hostTranslator, tokyoParts, type HostT } from "./host-model";
import {
  DESC_MAX, DESC_WARN, NOTE_MAX, QUESTION_MAX, addSuggested, agoText, applyLinkText, blankQuestion, charCount, clampText, draftInput, draftOf, draftProblems, hasLink, moveItem, sameDraft, switchKind, templateQuestions,
  type SetupDraft, type TemplateKey,
} from "./setup-model";
import s from "./host.module.css";
import m from "./tabs.module.css";
import u from "./setup.module.css";

const KIND_LABEL = { free: "qkFree", multiple: "qkMultiple", single: "qkSingle" } as const;
const KIND_TONE = { free: "c_apricot", multiple: "c_blue", single: "c_lav" } as const;
const KINDS: readonly HostQuestionKind[] = ["single", "multiple", "free"];
const TEMPLATES: ReadonlyArray<{ key: TemplateKey; emoji: string; tone: string; label: "tplMixer" | "tplStudy" | "tplRound" | "tplBlank"; sub: "tplMixerSub" | "tplStudySub" | "tplRoundSub" | "tplBlankSub" }> = [
  { emoji: "🥂", key: "mixer", label: "tplMixer", sub: "tplMixerSub", tone: "m_lav" },
  { emoji: "📚", key: "study", label: "tplStudy", sub: "tplStudySub", tone: "m_blue" },
  { emoji: "🪑", key: "round", label: "tplRound", sub: "tplRoundSub", tone: "m_pink" },
  { emoji: "📄", key: "blank", label: "tplBlank", sub: "tplBlankSub", tone: "m_apricot" },
];
const NOTICE_LABEL: Record<HostNoticeTemplateKind, "ntApproved" | "ntRejected" | "ntWaitlisted" | "ntPromoted" | "ntMatching" | "ntProfile"> = {
  admission_approved: "ntApproved", admission_promoted: "ntPromoted", admission_rejected: "ntRejected", admission_waitlisted: "ntWaitlisted", matching_published: "ntMatching", profile_incomplete: "ntProfile",
};
const NOTICE_TITLE: Record<HostNoticeTemplateKind, "ntTitleApproved" | "ntTitleRejected" | "ntTitleWaitlisted" | "ntTitlePromoted" | "ntTitleMatching" | "ntTitleProfile"> = {
  admission_approved: "ntTitleApproved", admission_promoted: "ntTitlePromoted", admission_rejected: "ntTitleRejected", admission_waitlisted: "ntTitleWaitlisted", matching_published: "ntTitleMatching", profile_incomplete: "ntTitleProfile",
};

export type SetupSaveState = "saved" | "dirty" | "saving" | "conflict" | "invalid";

export type HostSetupViewProps = {
  data: HostSetupResponse;
  draft: SetupDraft;
  t: HostT;
  language: OrbitLanguage;
  now?: Date;
  /** 展开编辑的质问（-1 = 全部收起）。 */
  editing?: number;
  preview?: "phone" | "pc";
  suggestionOpen?: boolean;
  saveState?: SetupSaveState;
  busy?: boolean;
  /** 申込ページの表示ホスト（「orbit.app」相当；画面では window.location.host）。 */
  host?: string;
  notesOpen?: boolean;
  noticeKind?: HostNoticeTemplateKind;
  noteDraft?: string;
  onChange?: (draft: SetupDraft) => void;
  onEdit?: (index: number) => void;
  onPreview?: (mode: "phone" | "pc") => void;
  onTemplate?: (key: TemplateKey) => void;
  onSuggestion?: (add: boolean) => void;
  onSave?: () => void;
  onPublish?: () => void;
  /** 5 問を超えて足そうとした。 */
  onLimit?: () => void;
  onReload?: () => void;
  onNotesOpen?: (open: boolean) => void;
  onNoticeKind?: (kind: HostNoticeTemplateKind) => void;
  onNoteDraft?: (text: string) => void;
  onNoteSave?: () => void;
};

/** 「10月20日（火）23:59」⇄ datetime-local（東京時間）。 */
const toLocalInput = (iso: string | null) => {
  const p = tokyoParts(iso);
  if (!p) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
};
const fromLocalInput = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h - 9, mi)).toISOString();
};

function Preview({ data, draft, t, language, mode, onMode }: { data: HostSetupResponse; draft: SetupDraft; t: HostT; language: OrbitLanguage; mode: "phone" | "pc"; onMode?: (mode: "phone" | "pc") => void }) {
  const event = data.event;
  const questions = mode === "phone" ? draft.questions.slice(0, 3) : draft.questions;
  const meta = [hostDateLong(event.startsAt, language, t), event.venueName].filter(Boolean).join(" · ");
  return (
    <div className={u.pv} data-host-setup-preview={mode}>
      <div className={`${s.row} ${s.between} ${u.pvHead}`}>
        <b>{t("suPreview")}</b>
        <div className={s.seg} role="tablist" aria-label={t("suPreview")}>
          {(["phone", "pc"] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={mode === key} className={`btn ${s.segBtn} ${mode === key ? s.segOn : ""}`} onClick={() => onMode?.(key)}>{t(key === "phone" ? "pvPhone" : "pvPc")}</button>)}
        </div>
      </div>
      <div className={`${u.pvBody} ${mode === "pc" ? u.pvPc : ""}`}>
        <span className={`${s.emo} ${s[`e_${eventTone(event.emoji, event.eventId)}`]}`}>{event.emoji ?? "📅"}</span>
        <b className={u.pvTitle}>{event.title}</b>
        <div className={s.lbl}>{meta}</div>
        <div className={`${s.sub} ${u.pvDesc}`}>{draft.description.trim() || t("pvDescPh")}</div>
        {questions.map((question, k) => {
          const options = question.kind === "free" ? [] : question.options.filter((option) => option.trim());
          return (
            <div key={question.id} className={u.pq}>
              <b>{question.prompt || t("suPromptPh")}{question.required ? <> <span className={u.pqStar}>*</span></> : null}</b>
              {options.length
                ? (mode === "phone" ? options.slice(0, 3) : options).map((option, j) => <div key={`${option}-${j}`} className={u.pqO}><span className={question.kind === "multiple" ? u.box : `${u.rad} ${j === 0 && k === 0 ? u.radOn : ""}`} />{option}</div>)
                : <div className={u.ghostRow}>{t("pvFree")}</div>}
            </div>
          );
        })}
        <button type="button" tabIndex={-1} aria-hidden className={`btn ${s.btn} ${s.primary} ${u.applyBtn}`}>{t("pvApply")}</button>
      </div>
    </div>
  );
}

function Settings({ data, draft, t, language, host, onChange }: { data: HostSetupResponse; draft: SetupDraft; t: HostT; language: OrbitLanguage; host: string; onChange?: (draft: SetupDraft) => void }) {
  const [edit, setEdit] = useState<"cap" | "close" | null>(null);
  const link = applyLinkText(host, data.applyPath);
  return (
    <div className={`${s.card} ${u.blk}`} data-host-setup-settings="">
      <div className={s.cardH}><h3>{t("suSettings")}</h3></div>
      <div className={m.setrow}>
        <span className={`${s.lbl} ${u.setLbl}`}>{t("suCapacity")}</span>
        {edit === "cap"
          ? <input autoFocus className={`${u.setInput} ${u.setCap}`} type="number" min={1} max={10000} aria-label={t("suEditCap")} defaultValue={draft.capacity ?? ""}
            onBlur={(event) => { const n = Number(event.currentTarget.value); onChange?.({ ...draft, capacity: event.currentTarget.value.trim() && Number.isInteger(n) && n > 0 ? Math.min(n, 10000) : null }); setEdit(null); }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setEdit(null); }} />
          : <button type="button" className={`btn ${u.setVal} ${s.clamp1}`} aria-label={t("suEditCap")} onClick={() => setEdit("cap")}>{draft.capacity ? `${draft.capacity}${t("unitPeople")}` : t("suNoCap")}</button>}
      </div>
      <div className={m.setrow}>
        <span className={`${s.lbl} ${u.setLbl}`}>{t("suCloses")}</span>
        {edit === "close"
          ? <input autoFocus className={u.setInput} type="datetime-local" aria-label={t("suEditClose")} defaultValue={toLocalInput(draft.registrationClosesAt)}
            onBlur={(event) => { onChange?.({ ...draft, registrationClosesAt: fromLocalInput(event.currentTarget.value) }); setEdit(null); }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setEdit(null); }} />
          : <button type="button" className={`btn ${u.setVal} ${s.clamp1}`} aria-label={t("suEditClose")} onClick={() => setEdit("close")}>{draft.registrationClosesAt ? hostDateLong(draft.registrationClosesAt, language, t) : t("suNoClose")}</button>}
      </div>
      <div className={m.setrow}>
        <span className={`${s.lbl} ${u.setLbl}`}>{t("suMode")}</span>
        <div className={s.seg} role="radiogroup" aria-label={t("suMode")}>
          {(["first_come", "review"] as const).map((mode) => <button key={mode} type="button" role="radio" aria-checked={draft.admissionMode === mode} className={`btn ${s.segBtn} ${draft.admissionMode === mode ? s.segOn : ""}`} onClick={() => onChange?.({ ...draft, admissionMode: mode })}>{t(mode === "review" ? "modeReview" : "modeFirstCome")}</button>)}
        </div>
      </div>
      <div className={m.setrow}>
        <span className={`${s.lbl} ${u.setLbl}`}>{t("suPage")}</span>
        {link ? <b className={`${u.setVal} ${s.clamp1}`}>{link}</b> : <span className={s.lbl}>{t("suPageNone")}</span>}
      </div>
    </div>
  );
}

type QuestionProps = {
  question: HostSetupQuestion;
  index: number;
  count: number;
  t: HostT;
  editing: boolean;
  onEdit: () => void;
  onChange: (question: HostSetupQuestion) => void;
  onDelete: () => void;
  onMove: (to: number) => void;
  onDropFrom: (from: number) => void;
};

const keyMove = (event: KeyboardEvent, index: number, count: number, move: (to: number) => void) => {
  if (event.key === "ArrowUp" && index > 0) { event.preventDefault(); move(index - 1); }
  if (event.key === "ArrowDown" && index < count - 1) { event.preventDefault(); move(index + 1); }
};

function QuestionCard({ question, index, count, t, editing, onEdit, onChange, onDelete, onMove, onDropFrom }: QuestionProps) {
  const [over, setOver] = useState(false);
  const n = index + 1;
  // 拖动排序（HTML5 DnD）；键盘：⋮⋮ 上按 ↑ / ↓。
  const drag = {
    draggable: true,
    onDragStart: (event: DragEvent) => { event.dataTransfer.setData("text/x-host-question", String(index)); event.dataTransfer.effectAllowed = "move"; },
    onDragOver: (event: DragEvent) => { if (event.dataTransfer.types.includes("text/x-host-question")) { event.preventDefault(); setOver(true); } },
    onDragLeave: () => setOver(false),
    onDrop: (event: DragEvent) => { setOver(false); const from = Number(event.dataTransfer.getData("text/x-host-question")); if (Number.isInteger(from) && from !== index) { event.preventDefault(); onDropFrom(from); } },
  };
  const handle = <button type="button" className={`btn ${m.handle}`} aria-label={t("suMoveQ", { n })} onKeyDown={(event) => keyMove(event, index, count, onMove)} onClick={(event) => event.stopPropagation()}>⋮⋮</button>;
  if (!editing) {
    return (
      <div className={`${u.qcard} ${u.qrow} ${over ? u.dragOver : ""}`} data-host-question={question.id} {...drag} onClick={onEdit}>
        {handle}
        <span className={s.chip}>Q{n}</span>
        <b className={s.clamp1}>{question.prompt || t("suPromptPh")}</b>
        <span className={`${s.chip} ${s[KIND_TONE[question.kind]]}`}>{t(KIND_LABEL[question.kind])}</span>
        {question.required ? <span className={`${s.chip} ${s.c_coral}`}>{t("suRequired")}</span> : <span className={s.lbl}>{t("suOptional")}</span>}
        <button type="button" className={`btn ${m.lbtn}`} aria-label={t("suEditQ", { n })} onClick={(event) => { event.stopPropagation(); onEdit(); }}><Icon name="pen" size={16} /></button>
      </div>
    );
  }
  const choice = question.kind !== "free";
  const setOption = (j: number, value: string) => onChange({ ...question, options: question.options.map((option, k) => (k === j ? value : option)) });
  return (
    <div className={`${u.qcard} ${u.qedit} ${over ? u.dragOver : ""}`} data-host-question={question.id} data-editing="" {...drag}>
      <div className={u.qhead}>
        {handle}
        <span className={`${s.chip} ${s.c_lav}`}>Q{n}</span>
        <label className={u.qprompt}><input value={question.prompt} maxLength={120} placeholder={t("suPromptPh")} aria-label={`Q${n}`} onChange={(event) => onChange({ ...question, prompt: event.target.value })} /></label>
        <button type="button" className={`btn ${m.lbtn}`} aria-label={t("suDeleteQ", { n })} onClick={onDelete}><Icon name="x" size={16} /></button>
      </div>
      <div className={u.qkind}>
        <div className={s.seg} role="radiogroup" aria-label={`Q${n}`}>
          {KINDS.map((kind) => <button key={kind} type="button" role="radio" aria-checked={question.kind === kind} className={`btn ${s.segBtn} ${question.kind === kind ? s.segOn : ""}`} onClick={() => onChange(switchKind(question, kind))}>{t(KIND_LABEL[kind])}</button>)}
        </div>
        <span className={`${s.lbl} ${u.reqLbl}`} id={`req-${question.id}`}>{t("suRequired")}</span>
        <button type="button" role="switch" aria-checked={question.required} aria-labelledby={`req-${question.id}`} className={`btn ${m.tgl} ${question.required ? m.tglOn : ""}`} onClick={() => onChange({ ...question, required: !question.required })} />
      </div>
      {question.options.length ? (
        <div className={`${u.qopts} ${choice ? "" : u.kept}`} aria-hidden={!choice || undefined}>
          {question.options.map((option, j) => (
            <div key={j} className={u.qopt}>
              <button type="button" className={`btn ${m.handle}`} disabled={!choice} aria-label={t("suMoveOpt", { o: option || String(j + 1) })} onKeyDown={(event) => keyMove(event, j, question.options.length, (to) => onChange({ ...question, options: moveItem(question.options, j, to) }))}>⋮⋮</button>
              <span className={question.kind === "multiple" ? u.box : u.rad} />
              <input value={option} maxLength={60} disabled={!choice} placeholder={t("suOptionPh")} aria-label={t("suOptionPh")} onChange={(event) => setOption(j, event.target.value)} />
              {choice ? <button type="button" className={`btn ${u.optX}`} aria-label={t("suDeleteOpt", { o: option || String(j + 1) })} onClick={() => onChange({ ...question, options: question.options.filter((_, k) => k !== j) })}><Icon name="x" size={16} /></button> : null}
            </div>
          ))}
          {choice && question.options.length < 12 ? <button type="button" className={`btn ${u.qopt} ${u.addOpt}`} onClick={() => onChange({ ...question, options: [...question.options, ""] })}><Icon name="plus" size={16} />{t("suAddOption")}</button> : null}
        </div>
      ) : choice ? <div className={u.qopts}><button type="button" className={`btn ${u.qopt} ${u.addOpt}`} onClick={() => onChange({ ...question, options: [""] })}><Icon name="plus" size={16} />{t("suAddOption")}</button></div> : null}
      {!choice && question.options.length ? <div className={`${s.lbl} ${u.keptNote}`}>{t("suKept")}</div> : null}
    </div>
  );
}

function NoticesSection({ data, t, open, kind, note, busy, onOpen, onKind, onNote, onSave }: { data: HostSetupResponse; t: HostT; open: boolean; kind: HostNoticeTemplateKind; note: string; busy: boolean; onOpen?: (open: boolean) => void; onKind?: (kind: HostNoticeTemplateKind) => void; onNote?: (text: string) => void; onSave?: () => void }) {
  const selected = data.notices.find((item) => item.kind === kind) ?? data.notices[0];
  const link = hasLink(note);
  const changed = (note.trim() || null) !== (data.hostNote?.trim() || null);
  return (
    <>
      <button type="button" className={`btn ${u.notesToggle}`} aria-expanded={open} onClick={() => onOpen?.(!open)} data-host-notices-toggle="">
        <h3>{t("ntToggle")}</h3><span className={s.lbl}>{t("ntSub")}</span><Icon name="down" size={16} className={open ? u.chevOpen : undefined} />
      </button>
      {open ? (
        <>
          <div className={`${s.card} ${u.span7} ${u.blk}`} data-host-notices="">
            <div className={s.cardH}><h3>{t("ntToggle")}</h3><span className={s.lbl}>{t("ntSub")}</span></div>
            {data.notices.map((item) => (
              <div key={item.kind}>
                <button type="button" className={`btn ${u.nrow} ${item.kind === selected?.kind ? u.nrowOn : ""}`} aria-pressed={item.kind === selected?.kind} onClick={() => onKind?.(item.kind)}>
                  <b>{t(NOTICE_LABEL[item.kind])}</b><span className={`${s.lbl} ${s.clamp1}`}>{item.text}</span><Icon name="lock" size={16} color="var(--ink-4)" />
                </button>
                {item.kind === selected?.kind ? (
                  <div className={u.nnote}>
                    <label className={`${s.lbl} ${u.nnoteLbl}`} htmlFor="host-note">{t("ntNoteLbl")}</label>
                    <div className={`${u.ta} ${u.nta}`}>
                      <textarea id="host-note" value={note} maxLength={NOTE_MAX} placeholder={t("ntNotePh")} onChange={(event) => onNote?.(clampText(event.target.value, NOTE_MAX))} />
                      <span className={u.counter}>{t("ntCounter", { n: charCount(note) })}</span>
                    </div>
                    <div className={`${s.lbl} ${u.nnoteHint} ${link ? u.saveWarn : ""}`}>{link ? t("ntNoLink") : t("ntNoteHint")}</div>
                    {changed ? <div className={`${s.row} ${u.nnoteActs}`}><button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary}`} disabled={busy || link} onClick={onSave}>{t("ntSave")}</button></div> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {selected ? (
            <div className={`${s.card} ${u.span5} ${u.blk}`} data-host-notice-preview={selected.kind}>
              <div className={s.cardH}><h3>{t("ntPreview")}</h3><span className={s.lbl}>{t("ntPreviewSub")}</span></div>
              <div className={u.nprevBox}>
                <div className={s.row}>
                  <span className={`${s.emo} ${s.emoSm} ${s[`e_${eventTone(data.event.emoji, data.event.eventId)}`]}`}>{data.event.emoji ?? "📅"}</span>
                  <div className={s.grow}><b>{t(NOTICE_TITLE[selected.kind])}</b><div className={s.lbl}>{t("ntNow", { who: data.event.organizerName ?? data.event.title })}</div></div>
                </div>
                <div className={`${s.sub} ${u.nprevText}`}>{selected.text}</div>
                {note.trim() && !link ? <div className={u.nprevNote}><b>{t("ntFrom")}</b>{note.trim()}</div> : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** 純粋な描画（b6 #13–#15）。 */
export function HostSetupView(props: HostSetupViewProps) {
  const { data, draft, t, language, now = new Date(), editing = 0, preview = "phone", suggestionOpen = true, saveState = "saved", busy = false, host = "", notesOpen = false, noteDraft = data.hostNote ?? "" } = props;
  const change = (next: SetupDraft) => props.onChange?.(next);
  const empty = draft.questions.length === 0;
  const length = charCount(draft.description);
  const setQuestion = (index: number, question: HostSetupQuestion) => change({ ...draft, questions: draft.questions.map((item, k) => (k === index ? question : item)) });
  const removeQuestion = (index: number) => { change({ ...draft, questions: draft.questions.filter((_, k) => k !== index) }); props.onEdit?.(-1); };
  const moveQuestion = (from: number, to: number) => { change({ ...draft, questions: moveItem(draft.questions, from, to) }); if (editing === from) props.onEdit?.(to); };
  const addQuestion = (kind: HostQuestionKind) => { if (draft.questions.length >= QUESTION_MAX) { props.onLimit?.(); return; } change({ ...draft, questions: [...draft.questions, blankQuestion(kind)] }); props.onEdit?.(draft.questions.length); };
  const suggestion = data.suggestion && suggestionOpen ? data.suggestion : null;
  const ago = agoText(data.savedAt, now, t, (iso) => hostDateDay(iso, t, language));
  const status = saveState === "saving" ? t("suSaving") : saveState === "dirty" ? t("suUnsaved") : saveState === "invalid" ? t("suInvalid") : ago ? t("suSavedAgo", { ago }) : "";
  return (
    <>
      <div className={`${u.col} ${u.span7}`} data-host-setup={empty ? "empty" : data.formPublished ? "published" : "draft"}>
        <div className={`${s.card} ${u.blk}`}>
          <div className={s.cardH}><h3>{t("suDesc")}</h3><span className={s.lbl}>{t("suDescMax")}</span></div>
          <label className={u.ta}>
            <textarea value={draft.description} maxLength={DESC_MAX} placeholder={t("suDescPh")} aria-label={t("suDesc")} onChange={(event) => change({ ...draft, description: clampText(event.target.value, DESC_MAX) })} />
            <span className={`${u.counter} ${length >= DESC_WARN ? u.counterWarn : ""}`} aria-live="polite">{t("suCounter", { n: length })}</span>
          </label>
        </div>
        {empty ? (
          <>
            <div className={`${s.card} ${u.blk}`}>
              <div className={s.cardH}><h3>{t("suTpl")}</h3></div>
              <div className={u.grid2}>
                {TEMPLATES.map((item) => (
                  <button key={item.key} type="button" className={`btn ${u.tpl} ${u[item.tone]}`} onClick={() => props.onTemplate?.(item.key)} data-host-template={item.key}>
                    <span className={u.tplEmoji}>{item.emoji}</span>
                    <div><b>{t(item.label)}</b><div className={s.lbl}>{t(item.sub)}</div></div>
                  </button>
                ))}
              </div>
            </div>
            {suggestion && suggestion.questions.length ? (
              <div className={`${s.card} ${u.blk} ${u.suggest}`} data-host-suggestion={suggestion.count}>
                <div className={s.row}>
                  <span className={`${s.emo} ${s.emoSm} ${s.e_lav}`}>📝</span>
                  <div className={s.grow}><b>{t("suSuggestTitle", { n: suggestion.count })}</b><div className={s.lbl}>{suggestion.basisTitle ? t("suSuggestBasis", { n: suggestion.basisCount, title: suggestion.basisTitle }) : t("suSuggestNoBasis")}</div></div>
                  <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => props.onSuggestion?.(false)}>{t("suDismiss")}</button>
                  <button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary}`} onClick={() => props.onSuggestion?.(true)}>{t("suAdd")}</button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className={`${s.card} ${u.blk}`}>
              <div className={s.cardH}>
                <h3>{t("suQuestions")} <span className={`${s.lbl} ${u.qHint}`}>{t("suQHint", { n: draft.questions.length })}</span></h3>
                <span className={s.lbl}>{t("suQUse")}</span>
              </div>
              {draft.questions.map((question, index) => (
                <QuestionCard key={question.id} question={question} index={index} count={draft.questions.length} t={t} editing={editing === index}
                  onEdit={() => props.onEdit?.(index)} onChange={(next) => setQuestion(index, next)} onDelete={() => removeQuestion(index)}
                  onMove={(to) => moveQuestion(index, to)} onDropFrom={(from) => moveQuestion(from, index)} />
              ))}
              <div className={u.addRow} data-host-qadd={draft.questions.length >= QUESTION_MAX ? "full" : ""}>
                <span className={s.lbl}>{t("suAddQ")}</span>
                {KINDS.map((kind) => <button key={kind} type="button" className={`btn ${s.btn} ${s.sm} ${draft.questions.length >= QUESTION_MAX ? u.addFull : ""}`} disabled={draft.questions.length >= QUESTION_MAX} onClick={() => addQuestion(kind)}><Icon name="plus" size={16} />{t(KIND_LABEL[kind])}</button>)}
                {draft.questions.length >= QUESTION_MAX ? <span className={`${s.lbl} ${u.addMax}`}>{t("suAddMax")}</span> : null}
              </div>
            </div>
            <div className={`${s.card} ${u.saveBar}`} data-host-setup-save={saveState}>
              <span className={`${s.chip} ${data.formPublished ? s.c_teal : s.c_apricot}`}>{t(data.formPublished ? "suLiveChip" : "suDraftChip")}</span>
              <span className={`${s.lbl} ${saveState === "invalid" ? u.saveWarn : ""}`}>{data.formPublished && data.unpublishedChanges > 0 ? t("suUnpub", { n: data.unpublishedChanges }) : ""}{status}</span>
              <button type="button" className={`btn ${s.btn} ${u.saveFirst}`} disabled={busy || saveState === "saving"} onClick={props.onSave}>{t("suSaveDraft")}</button>
              <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={busy || saveState === "invalid" || (data.formPublished && data.unpublishedChanges === 0 && saveState === "saved")} onClick={props.onPublish}>{t(data.formPublished ? "suPublishChanges" : "suPublish")}</button>
            </div>
            {saveState === "conflict" ? (
              <div className={`${s.card} ${u.saveBar} ${s.flat}`} role="alert" data-host-setup-conflict="">
                <span className={s.grow}>{t("suConflict")}</span>
                <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={props.onReload}>{t("retry")}</button>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div className={`${u.col} ${u.span5}`}>
        <Preview data={data} draft={draft} t={t} language={language} mode={preview} onMode={props.onPreview} />
        <Settings data={data} draft={draft} t={t} language={language} host={host} onChange={change} />
      </div>
      <NoticesSection data={data} t={t} open={notesOpen} kind={props.noticeKind ?? "admission_approved"} note={noteDraft} busy={busy}
        onOpen={props.onNotesOpen} onKind={props.onNoticeKind} onNote={props.onNoteDraft} onSave={props.onNoteSave} />
    </>
  );
}

const AUTOSAVE_MS = 1500;

/** 申込設定页签（读写；`onHeader` 把「申込フォーム公開中 / 未公開」交给页头）。 */
export function HostSetupTab({ eventId, language, onChanged, onHeader }: { eventId: string; language: OrbitLanguage; onChanged?: () => void; onHeader?: (formPublished: boolean) => void }) {
  const t = useMemo(() => hostTranslator(language), [language]);
  const toast = useToast();
  const [data, setData] = useState<HostSetupResponse | null>(null);
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [failed, setFailed] = useState(false);
  const [saveState, setSaveState] = useState<SetupSaveState>("saved");
  const [editing, setEditing] = useState(0);
  const [preview, setPreview] = useState<"phone" | "pc">("phone");
  const [suggestionOpen, setSuggestionOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noticeKind, setNoticeKind] = useState<HostNoticeTemplateKind>("admission_approved");
  const [noteDraft, setNoteDraft] = useState("");
  const [host, setHost] = useState("");
  const saved = useRef<SetupDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);

  useEffect(() => { setHost(window.location.host); }, []);

  const accept = useCallback((next: HostSetupResponse, resetDraft: boolean) => {
    setData(next);
    saved.current = draftOf(next);
    if (resetDraft) { setDraft(draftOf(next)); setNoteDraft(next.hostNote ?? ""); }
    onHeader?.(next.formPublished);
  }, [onHeader]);

  const load = useCallback(async () => {
    const res = await hostApi.setup(eventId);
    if (res.ok) { accept(res.data, true); setFailed(false); setSaveState("saved"); } else setFailed(true);
  }, [eventId, accept]);
  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (manual: boolean): Promise<HostSetupResponse | null> => {
    if (!data || !draft || inflight.current) return null;
    if (draftProblems(draft) > 0) { setSaveState("invalid"); return null; }
    if (saved.current && sameDraft(draft, saved.current)) { setSaveState("saved"); return data; }
    inflight.current = true;
    setSaveState("saving");
    const sent = draft;
    const res = await hostApi.saveSetup(eventId, draftInput(sent, data.revision));
    inflight.current = false;
    if (!res.ok) {
      if (failureOf(res) === "conflict") { setSaveState("conflict"); return null; }
      setSaveState("dirty");
      if (manual) toast.error(t("saveError"));
      return null;
    }
    accept(res.data, false);
    setSaveState((current) => (current === "saving" ? "saved" : current));
    if (manual) toast.success(t("suSavedToast"));
    return res.data;
  }, [data, draft, eventId, accept, toast, t]);

  // 下書き自動保存：最后一次修改 1.5 秒后 PUT（带 revision）。
  const change = (next: SetupDraft) => {
    setDraft(next);
    setSaveState(draftProblems(next) > 0 ? "invalid" : "dirty");
  };
  useEffect(() => {
    if (saveState !== "dirty") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(false); }, AUTOSAVE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [draft, saveState, save]);

  const publish = async () => {
    setConfirm(false);
    if (!draft) return;
    setBusy(true);
    const current = await save(false);
    if (!current) { setBusy(false); if (draftProblems(draft) === 0) toast.error(t("saveError")); return; }
    const wasPublished = current.formPublished;
    const res = await hostApi.publishSetup(eventId, current.revision);
    setBusy(false);
    if (!res.ok) { if (failureOf(res) === "conflict") setSaveState("conflict"); else toast.error(t("saveError")); return; }
    accept(res.data, false);
    setSaveState("saved");
    toast.success(t(wasPublished ? "suChangesToast" : "suPublishedToast"));
    onChanged?.();
  };

  const saveNote = async () => {
    if (hasLink(noteDraft)) return;
    setBusy(true);
    const res = await hostApi.saveHostNote(eventId, noteDraft.trim() || null);
    setBusy(false);
    if (!res.ok) { toast.error(t("saveError")); return; }
    setData((current) => (current ? { ...current, hostNote: res.data.hostNote } : current));
    setNoteDraft(res.data.hostNote ?? "");
    toast.success(t("ntSaved"));
  };

  if (failed && !data) return <div className={`${s.card} ${s.span12} ${s.empty}`} data-host-failure="setup">{t("loadError")} <button type="button" className={`btn ${s.btn} ${s.sm}`} onClick={() => void load()}>{t("retry")}</button></div>;
  if (!data || !draft) return null;
  return (
    <>
      <HostSetupView data={data} draft={draft} t={t} language={language} editing={editing} preview={preview} suggestionOpen={suggestionOpen} saveState={saveState} busy={busy} host={host}
        notesOpen={notesOpen} noticeKind={noticeKind} noteDraft={noteDraft}
        onChange={change} onEdit={setEditing} onPreview={setPreview}
        onTemplate={(key) => { change({ ...draft, questions: templateQuestions(key, t) }); setEditing(0); }}
        onSuggestion={(add) => {
          setSuggestionOpen(false);
          if (add && data.suggestion) { const questions = addSuggested(draft.questions, data.suggestion.questions); change({ ...draft, questions }); setEditing(0); toast.success(t("suAdded", { n: questions.length - draft.questions.length })); }
        }}
        onSave={() => { if (saveState === "saved") toast.success(t("suSavedToast")); else void save(true); }}
        onLimit={() => toast.info(t("suQLimit"))}
        onPublish={() => { if (data.formPublished && data.event.appliedCount > 0) setConfirm(true); else void publish(); }}
        onReload={() => void load()}
        onNotesOpen={setNotesOpen} onNoticeKind={setNoticeKind} onNoteDraft={setNoteDraft} onNoteSave={() => void saveNote()} />
      <ConfirmDialog open={confirm} title={t("suPubChangesTitle")} message={t("suPubChangesBody")} confirmLabel={t("suPublishChanges")} cancelLabel={t("cancel")} onCancel={() => setConfirm(false)} onConfirm={() => void publish()} />
    </>
  );
}
