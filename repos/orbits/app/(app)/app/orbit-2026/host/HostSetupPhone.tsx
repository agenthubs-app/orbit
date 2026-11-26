"use client";

// < 768 申込設定（b13 HM-S1–S13，2026-11-26 用户定：手机上也能改完、发布）。
// 主页：状态行 → 受付の設定（承認方式就地切换 · 定員就地改 · 締切底部抽屉 · 申込ページ复制）→ 質問一行一题（点进编辑页）→
// 説明文两行摘要（点开全屏编辑）→ アジェンダ / 主催者の連絡先 / お知らせの文面 子页；底部「プレビュー」+ 唯一主按钮「公開する / 変更を公開」。
// 子页是盖在页面上的全屏层（自带 ‹ 顶栏），数据与保存逻辑和电脑版同一套（HostSetupTab 的 draft / 自动保存 / 公開）。
import { useState } from "react";

import type { HostNoticeTemplateKind, HostQuestionKind, HostSetupQuestion } from "../../../../../shared/contract/host-console";
import { BottomSheet, Icon } from "../ui";
import {
  KIND_LABEL, KINDS, NOTICE_LABEL, NOTICE_TITLE, Preview, QuestionLine, SetupAgendaCard, SetupContactCard, TEMPLATES,
  closeBeforeStart, fromLocalInput, toLocalInput, type HostSetupViewProps,
} from "./HostSetup";
import { ReorderList } from "./ReorderList";
import { SubPage } from "./SubPage";
import { QuestionLibraryDrawer } from "./QuestionLibrary";
import { addLibraryQuestions } from "../../../../../shared/domain/host-question-library";
import { eventTone, hostDateDay, hostDateLong, hostTime, type HostT } from "./host-model";
import { DESC_MAX, NOTE_MAX, QUESTION_MAX, agoText, applyLinkText, blankQuestion, charCount, clampText, hasLink, inertWhen, moveItem, switchKind } from "./setup-model";
import s from "./host.module.css";
import m from "./tabs.module.css";
import sp from "./setup-phone.module.css";

type Sub = { kind: "q"; index: number } | { kind: "reorder" } | { kind: "desc" } | { kind: "agenda" } | { kind: "contact" } | { kind: "notice" } | null;

export { SubPage } from "./SubPage";

function QuestionEditPage({ question, index, count, t, onChange, onDelete, onBack, readOnly = false }: { question: HostSetupQuestion; index: number; count: number; t: HostT; onChange: (question: HostSetupQuestion) => void; onDelete: () => void; onBack: () => void; /** 開催済み：只看不改（b13 HM-S13）。 */ readOnly?: boolean }) {
  const [optReorder, setOptReorder] = useState(false);
  const choice = question.kind !== "free";
  const marker = question.kind === "multiple" ? sp.cbx : sp.rad;
  return (
    <SubPage testId={`q${index}`} title={t(readOnly ? "suViewQ" : "suEditQ", { n: index + 1 })} sub={t("suQEditSub", { i: index + 1, n: count })} onBack={onBack}
      foot={readOnly ? undefined : <button type="button" className={`btn ${s.btn} ${s.primary} ${sp.block}`} onClick={onBack} data-host-q-done="">{t("roDone")}</button>}>
      <div {...inertWhen(readOnly)} data-host-q-readonly={readOnly || undefined}>
      <label className={sp.fld}>
        <span className={sp.fldL}>{t("suFieldPrompt")}</span>
        <span className={sp.in}><input value={question.prompt} maxLength={120} placeholder={t("suPromptPh")} onChange={(event) => onChange({ ...question, prompt: event.target.value })} /></span>
      </label>
      <div className={sp.fld}>
        <span className={sp.fldL}>{t("suFieldKind")}</span>
        <div className={sp.tseg} role="radiogroup" aria-label={t("suFieldKind")}>
          {KINDS.map((kind) => <button key={kind} type="button" role="radio" aria-checked={question.kind === kind} className={`btn ${question.kind === kind ? sp.tsegOn : ""}`} onClick={() => onChange(switchKind(question, kind))}>{t(KIND_LABEL[kind])}</button>)}
        </div>
      </div>
      <div className={`${s.card} ${sp.req}`}>
        <b id={`preq-${question.id}`}>{t("suRequired")}</b>
        <button type="button" role="switch" aria-checked={question.required} aria-labelledby={`preq-${question.id}`} className={`btn ${m.tgl} ${question.required ? m.tglOn : ""}`} onClick={() => onChange({ ...question, required: !question.required })} />
      </div>
      {choice ? (
        <>
          <div className={sp.optHead}>
            <b>{t("suFieldOptions")}</b>
            {question.options.length > 1 ? <button type="button" className={`btn ${s.btn} ${s.sm} ${s.ghost}`} onClick={() => setOptReorder((on) => !on)} data-host-opt-reorder="">{t(optReorder ? "roDone" : "roReorder")}</button> : null}
          </div>
          {optReorder ? (
            <div className={`${s.card} ${sp.roCard}`}>
              <ReorderList items={question.options} t={t} keyOf={(_, j) => `${j}`} labelOf={(option, j) => option || String(j + 1)} onMove={(from, to) => onChange({ ...question, options: moveItem(question.options, from, to) })}
                render={(option) => <><span className={marker} /><b className={sp.optT}>{option || t("suOptionPh")}</b></>} />
            </div>
          ) : (
            <div data-host-opts="">
              {question.options.map((option, j) => (
                <div key={j} className={sp.opt}>
                  <span className={marker} />
                  <input value={option} maxLength={60} placeholder={t("suOptionPh")} aria-label={t("suOptionPh")} onChange={(event) => onChange({ ...question, options: question.options.map((item, k) => (k === j ? event.target.value : item)) })} />
                  <button type="button" className={`btn ${sp.optX}`} aria-label={t("suDeleteOpt", { o: option || String(j + 1) })} onClick={() => onChange({ ...question, options: question.options.filter((_, k) => k !== j) })}><Icon name="x" size={16} /></button>
                </div>
              ))}
              {question.options.length < 12 ? <button type="button" className={`btn ${sp.opt} ${sp.optAdd}`} onClick={() => onChange({ ...question, options: [...question.options, ""] })}><Icon name="plus" size={16} />{t("suAddOption")}</button> : null}
            </div>
          )}
        </>
      ) : question.options.length ? <div className={`${s.lbl} ${sp.kept}`}>{t("suKept")}</div> : null}
      {readOnly ? null : <button type="button" className={`btn ${s.btn} ${s.ghost} ${sp.block} ${sp.del}`} onClick={onDelete} data-host-q-delete="">{t("suDeleteThisQ")}</button>}
      </div>
    </SubPage>
  );
}

/** < 768 お知らせの文面（b13 HM-S8 / S8b）：6 种定型文（点开一种），一条共用的「ひとこと」，下面是申込者收到的通知预览。 */
export function NoticesPhone({ data, t, kind, note, readOnly, onKind, onNote }: { data: HostSetupViewProps["data"]; t: HostT; kind: HostNoticeTemplateKind; note: string; readOnly: boolean; onKind?: (kind: HostNoticeTemplateKind) => void; onNote?: (text: string) => void }) {
  const selected = data.notices.find((item) => item.kind === kind) ?? data.notices[0];
  const link = hasLink(note);
  return (
    <>
      <div className={`${s.card} ${sp.ntList}`} data-host-notices="">
        {data.notices.map((item) => {
          const on = item.kind === selected?.kind;
          return (
            <button key={item.kind} type="button" className={`btn ${sp.ntr} ${on ? sp.ntrOn : ""}`} aria-pressed={on} onClick={() => onKind?.(item.kind)}>
              <span className={sp.grow}><b>{t(NOTICE_LABEL[item.kind])}</b><span>{item.text}</span></span>
              <Icon name={on ? "down" : "right"} size={16} />
            </button>
          );
        })}
      </div>
      <label className={`${sp.fld} ${link ? sp.fldErr : ""}`}>
        <span className={sp.fldL}>{t("ntNoteLbl")}</span>
        <span className={`${sp.in} ${sp.noteIn}`}>
          <textarea value={note} readOnly={readOnly} maxLength={NOTE_MAX} rows={2} placeholder={t("ntNotePh")} onChange={(event) => onNote?.(clampText(event.target.value, NOTE_MAX))} data-host-note="" />
          <span className={s.lbl}>{t("ntCounter", { n: charCount(note) })}</span>
        </span>
        <span className={sp.msg}>{link ? t("ntNoLink") : t("ntNoteHint")}</span>
      </label>
      {selected ? (
        <div className={sp.nprev} data-host-notice-preview={selected.kind}>
          <div className={`${s.lbl} ${sp.nprevL}`}>{t("ntPreviewTo")}</div>
          <div className={sp.nprevHead}>
            <span className={`${s.emo} ${s.emoSm} ${s[`e_${eventTone(data.event.emoji, data.event.eventId)}`]}`}>{data.event.emoji ?? "📅"}</span>
            <div className={sp.grow}><b className={sp.nprevT}>{t(NOTICE_TITLE[selected.kind])}</b><div className={s.lbl}>{t("ntNow", { who: data.event.organizerName ?? data.event.title })}</div></div>
          </div>
          <div className={`${s.sub} ${sp.nprevText}`}>{selected.text}</div>
          {note.trim() && !link ? <div className={sp.nn}><b>{t("ntFrom")}</b>{note.trim()}</div> : null}
        </div>
      ) : null}
    </>
  );
}

export function HostSetupPhone(props: HostSetupViewProps & { ended: boolean; event: HostSetupViewProps["data"]["event"]; onEventSaved: (event: HostSetupViewProps["data"]["event"]) => void }) {
  const { data, draft, t, language, now = new Date(), saveState = "saved", busy = false, host = "", noteDraft = data.hostNote ?? "", ended, event, onEventSaved } = props;
  const [sub, setSub] = useState<Sub>(null);
  const [editCap, setEditCap] = useState(false);
  const [closeSheet, setCloseSheet] = useState(false);
  const [addSheet, setAddSheet] = useState(false);
  const [preview, setPreview] = useState(false);
  const change = (next: typeof draft) => props.onChange?.(next);
  const questions = draft.questions;
  const setQuestions = (next: HostSetupQuestion[]) => change({ ...draft, questions: next });
  const full = questions.length >= QUESTION_MAX;
  const link = applyLinkText(host, data.applyPath);
  const ago = agoText(data.savedAt, now, t, (iso) => hostDateDay(iso, t, language));
  const status = saveState === "saving" ? t("suSaving") : saveState === "dirty" ? t("suUnsaved") : saveState === "invalid" ? t("suInvalid") : ago ? t("suSavedAgo", { ago }) : "";
  const contact = event.contact;
  const contactSummary = [contact?.wechatId ? "WeChat" : null, contact?.lineId ? "LINE" : null].filter(Boolean).join(" · ") || (contact?.note ? t("evContactMessage") : t("suNotSet"));
  const agendaCount = event.agenda?.length ?? 0;
  const empty = questions.length === 0;
  const pubDisabled = busy || saveState === "invalid" || saveState === "conflict" || (data.formPublished && data.unpublishedChanges === 0 && saveState === "saved");
  const [closeDate, setCloseDate] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const openClose = () => {
    const local = toLocalInput(draft.registrationClosesAt) || toLocalInput(data.event.startsAt);
    setCloseDate(local.slice(0, 10));
    setCloseTime(local.slice(11, 16) || "23:59");
    setCloseSheet(true);
  };
  const addBlank = (kind: HostQuestionKind) => { setAddSheet(false); if (full) { props.onLimit?.(); return; } setQuestions([...questions, blankQuestion(kind)]); setSub({ index: questions.length, kind: "q" }); };

  if (sub?.kind === "q" && questions[sub.index]) {
    const index = sub.index;
    return <QuestionEditPage question={questions[index]!} index={index} count={questions.length} t={t} readOnly={ended} onBack={() => setSub(null)}
      onChange={(next) => setQuestions(questions.map((item, k) => (k === index ? next : item)))}
      onDelete={() => { setQuestions(questions.filter((_, k) => k !== index)); setSub(null); }} />;
  }
  if (sub?.kind === "reorder") {
    return (
      <SubPage testId="reorder" title={t("roTitleQ")} sub={t("tSetup")} right={<button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary}`} onClick={() => setSub(null)} data-host-reorder-done="">{t("roDone")}</button>}>
        <div className={`${s.card} ${sp.roCard}`}>
          <ReorderList items={questions} t={t} keyOf={(question) => question.id} labelOf={(_, index) => `Q${index + 1}`} onMove={(from, to) => setQuestions(moveItem(questions, from, to))} render={(question, index) => <QuestionLine question={question} index={index} t={t} />} />
        </div>
        <div className={sp.note}>{t("roNoteQ")}</div>
      </SubPage>
    );
  }
  if (sub?.kind === "desc") {
    const length = charCount(draft.description);
    return (
      <SubPage testId="desc" title={t("suDesc")} sub={t("tSetup")} right={<button type="button" className={`btn ${s.btn} ${s.sm} ${s.primary}`} onClick={() => setSub(null)} data-host-desc-done="">{t("roDone")}</button>}>
        <div className={sp.descBox}>
          <textarea className={sp.descTa} value={draft.description} maxLength={DESC_MAX} placeholder={t("suDescPh")} aria-label={t("suDesc")} readOnly={ended} onChange={(event) => change({ ...draft, description: clampText(event.target.value, DESC_MAX) })} />
          <span className={sp.descCnt}>{t("suCounter", { n: length })}</span>
        </div>
        {ended ? null : <div className={`${s.lbl} ${sp.descNote}`}>{t("suDescNote")}</div>}
      </SubPage>
    );
  }
  if (sub?.kind === "agenda") {
    return <SetupAgendaCard key={`${event.eventId}:agenda`} event={event} t={t} ended={ended} onSaved={onEventSaved} onBack={() => setSub(null)} />;
  }
  if (sub?.kind === "contact") {
    return (
      <SubPage testId="contact" title={t("suContactShort")} sub={t("evContactSub")} onBack={() => setSub(null)}>
        <div className={sp.embed}><SetupContactCard key={`${data.event.eventId}:${data.event.version}`} event={event} t={t} disabled={ended} onSaved={onEventSaved} /></div>
      </SubPage>
    );
  }
  if (sub?.kind === "notice") {
    return (
      <SubPage testId="notice" title={t("ntToggle")} sub={t("ntSub")} onBack={() => setSub(null)}
        foot={ended ? undefined : <button type="button" className={`btn ${s.btn} ${s.primary} ${sp.block}`} disabled={busy || hasLink(noteDraft) || (noteDraft.trim() || null) === (data.hostNote?.trim() || null)} onClick={props.onNoteSave} data-host-note-save="">{t("ntSave")}</button>}>
        <NoticesPhone data={data} t={t} kind={props.noticeKind ?? "admission_approved"} note={noteDraft} readOnly={ended} onKind={props.onNoticeKind} onNote={props.onNoteDraft} />
      </SubPage>
    );
  }

  return (
    <div className={sp.col} data-host-setup={ended ? "ended" : empty ? "empty" : data.formPublished ? "published" : "draft"} data-host-setup-phone="">
      {ended ? (
        <div className={sp.banner} role="status" data-host-setup-ended="">
          <span className={sp.bEmo} aria-hidden>🔒</span>
          <div className={sp.grow}><b>{t("suEndedTitle")}</b><span className={sp.bBody}>{t("suEndedSub")}</span></div>
        </div>
      ) : saveState === "conflict" ? (
        <div className={`${sp.banner} ${sp.bCoral}`} role="alert" data-host-setup-conflict="">
          <Icon name="flag" size={16} />
          <div className={sp.grow}><b>{t("conflictFirst")}</b><span className={sp.bBody}>{t("suReloadHint")}</span></div>
          <button type="button" className={`btn ${s.btn} ${s.sm} ${sp.bBtn}`} onClick={props.onReload}>{t("suReload")}</button>
        </div>
      ) : (
        <div className={sp.strip} data-host-setup-save={saveState}>
          <span className={`${s.chip} ${data.formPublished ? s.c_teal : s.c_apricot}`}>{t(data.formPublished ? "suLiveChip" : "suDraftChip")}</span>
          <span className={`${s.lbl} ${sp.ell} ${saveState === "invalid" ? sp.warn : ""}`}>{data.formPublished && data.unpublishedChanges > 0 ? t("suUnpub", { n: data.unpublishedChanges }) : ""}{status}</span>
        </div>
      )}

      <div>
        <div className={`${s.card} ${sp.card} ${ended ? sp.ro : ""}`} data-host-setup-settings="">
          <h3 className={sp.cardH}>{t("suSettings")}</h3>
          <div className={`${sp.srow} ${sp.first}`}>
            <span className={sp.k}>{t("suMode")}</span>
            <div className={`${s.seg} ${sp.right}`} role="radiogroup" aria-label={t("suMode")} {...inertWhen(ended)}>
              {(["first_come", "review"] as const).map((mode) => <button key={mode} type="button" role="radio" aria-checked={draft.admissionMode === mode} className={`btn ${s.segBtn} ${draft.admissionMode === mode ? s.segOn : ""}`} onClick={() => change({ ...draft, admissionMode: mode })}>{t(mode === "review" ? "modeReview" : "modeFirstCome")}</button>)}
            </div>
          </div>
          <div className={sp.srow}>
            <span className={sp.k}>{t("suCapacity")}</span>
            {ended ? <span className={sp.v}>{draft.capacity ? `${draft.capacity}${t("unitPeople")}` : t("suNoCap")}</span> : editCap ? (
              <span className={`${sp.v} ${sp.capEdit}`}>
                <input autoFocus className={sp.capIn} type="number" inputMode="numeric" min={1} max={10000} aria-label={t("suEditCap")} defaultValue={draft.capacity ?? ""}
                  onBlur={(event) => { const n = Number(event.currentTarget.value); change({ ...draft, capacity: event.currentTarget.value.trim() && Number.isInteger(n) && n > 0 ? Math.min(n, 10000) : null }); setEditCap(false); }}
                  onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> {t("unitPeople")}
              </span>
            ) : (
              <button type="button" className={`btn ${sp.vBtn}`} aria-label={t("suEditCap")} onClick={() => setEditCap(true)}><span>{draft.capacity ? `${draft.capacity}${t("unitPeople")}` : t("suNoCap")}</span><Icon name="right" size={16} /></button>
            )}
          </div>
          <div className={sp.srow}>
            <span className={sp.k}>{t("suCloses")}</span>
            {ended ? <span className={sp.v}>{draft.registrationClosesAt ? hostDateLong(draft.registrationClosesAt, language, t) : t("suNoClose")}</span> : <button type="button" className={`btn ${sp.vBtn}`} aria-label={t("suEditClose")} onClick={openClose}><span>{draft.registrationClosesAt ? hostDateLong(draft.registrationClosesAt, language, t) : t("suNoClose")}</span><Icon name="right" size={16} /></button>}
          </div>
          <div className={sp.srow}>
            <span className={sp.k}>{t("suPage")}</span>
            {link ? <span className={sp.v}>{link}</span> : <span className={`${sp.v} ${s.lbl}`}>{t("suPageNone")}</span>}
            {link ? <button type="button" className={`btn ${sp.copy}`} aria-label={t("copyLink")} onClick={() => { void navigator.clipboard?.writeText(`${window.location.protocol}//${link}`); }}><Icon name="link" size={16} /></button> : null}
          </div>
        </div>

        {empty && !ended ? (
          <div className={`${s.card} ${sp.card}`} data-host-setup-templates="">
            <h3 className={sp.cardH}>{t("suTpl")}</h3>
            <div className={sp.tpl2}>
              {TEMPLATES.map((item) => (
                <button key={item.key} type="button" className={`btn ${sp.tpl}`} onClick={() => props.onTemplate?.(item.key)} data-host-template={item.key}>
                  <span className={`${s.emo} ${s.emoSm}`} aria-hidden>{item.emoji}</span><b>{t(item.label)}</b><span className={s.lbl}>{t(item.sub)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className={`${s.card} ${sp.card}`} data-host-questions={questions.length}>
          <div className={sp.cardHRow}><h3 className={sp.cardH}>{t("suQuestions")} <span className={s.lbl}>{t("suQCountOf", { n: questions.length })}</span></h3><span className={s.lbl}>{t("suQUse")}</span></div>
          {questions.map((question, index) => (
            <button key={question.id} type="button" className={`btn ${sp.qr} ${!question.prompt.trim() ? sp.qrErr : ""}`} onClick={() => setSub({ index, kind: "q" })} aria-label={question.prompt.trim() ? `${t(ended ? "suViewQ" : "suEditQ", { n: index + 1 })} · ${question.prompt}` : t(ended ? "suViewQ" : "suEditQ", { n: index + 1 })} data-host-question={question.id}>
              <QuestionLine question={question} index={index} t={t} />
              <Icon name="right" size={16} />
            </button>
          ))}
          {ended ? null : <div className={sp.qacts}>
            <button type="button" className={`btn ${s.btn} ${s.sm}`} disabled={full} onClick={() => props.onLibrary?.(true)} data-host-qlib-open=""><Icon name="book" size={16} />{t("qlOpen")}</button>
            <button type="button" className={`btn ${s.btn} ${s.sm}`} disabled={full} onClick={() => setAddSheet(true)} data-host-qadd-open=""><Icon name="plus" size={16} />{t("suAddQ")}</button>
            {questions.length > 1 ? <button type="button" className={`btn ${s.btn} ${s.sm} ${s.ghost} ${sp.push}`} onClick={() => setSub({ kind: "reorder" })} data-host-reorder="">{t("roReorder")}</button> : null}
          </div>}
          {full ? <div className={`${s.lbl} ${sp.maxNote}`}>{t("suAddMax")}</div> : null}
        </div>

        <button type="button" className={`btn ${s.card} ${sp.card} ${sp.descCard}`} onClick={() => setSub({ kind: "desc" })} data-host-setup-desc="">
          <span className={sp.cardHRow}><b className={sp.cardH}>{t("suDesc")}</b><span className={s.lbl}>{t("suCounter", { n: charCount(draft.description) })}</span></span>
          <span className={`${sp.desc2} ${draft.description.trim() ? "" : s.lbl}`}>{draft.description.trim() || t("suDescPh")}</span>
        </button>
      </div>

      <div className={`${s.card} ${sp.card} ${sp.subs}`}>
        <button type="button" className={`btn ${sp.srow} ${sp.first} ${sp.rowBtn}`} onClick={() => setSub({ kind: "agenda" })} data-host-setup-open="agenda"><span className={sp.k}>{t("evAgenda")}</span><span className={sp.v}>{t("suItems", { n: agendaCount })}</span><Icon name="right" size={16} /></button>
        <button type="button" className={`btn ${sp.srow} ${sp.rowBtn}`} onClick={() => setSub({ kind: "contact" })} data-host-setup-open="contact"><span className={sp.k}>{t("suContactShort")}</span><span className={sp.v}>{contactSummary}</span><Icon name="right" size={16} /></button>
        <button type="button" className={`btn ${sp.srow} ${sp.rowBtn}`} onClick={() => setSub({ kind: "notice" })} data-host-setup-open="notice"><span className={sp.k}>{t("ntToggle")}</span><span className={sp.v}>{t((data.hostNote ?? "").trim() ? "suNoticeWithNote" : "suNoticeNoNote")}</span><Icon name="right" size={16} /></button>
      </div>

      {ended ? null : (
        <div className={sp.foot}>
          <button type="button" className={`btn ${s.btn} ${sp.xl}`} onClick={() => setPreview(true)} data-host-setup-preview-open="">{t("pvTitle")}</button>
          <button type="button" className={`btn ${s.btn} ${s.primary} ${sp.xl}`} disabled={pubDisabled} onClick={props.onPublish} data-host-setup-publish="">{t(data.formPublished ? "suPublishChanges" : "suPublish")}</button>
        </div>
      )}

      <QuestionLibraryDrawer open={props.libraryOpen ?? false} questions={questions} t={t} language={language} onClose={() => props.onLibrary?.(false)}
        onAdd={(ids) => {
          const result = addLibraryQuestions(questions, ids, language, QUESTION_MAX);
          props.onLibrary?.(false);
          if (result.added.length) { setQuestions(result.questions); props.onAdded?.(result.added.length); }
          if (result.skipped.length) props.onLimit?.();
        }} />

      <BottomSheet open={closeSheet} onClose={() => setCloseSheet(false)} label={t("suCloses")}>
        <div className={sp.closeHead}>
          <b className={sp.sheetT}>{t("suCloses")}</b>
          <span className={s.lbl}>{t("suCloseHint", { t: `${hostDateDay(data.event.startsAt, t, language)} ${hostTime(data.event.startsAt)}` })}</span>
        </div>
        <div className={`${sp.grid2} ${sp.closeFlds}`}>
          <label className={sp.fld}><span className={sp.fldL}>{t("suDate")}</span><span className={`${sp.in} ${sp.inGrey} ${sp.pick}`}><input type="date" value={closeDate} max={toLocalInput(data.event.startsAt).slice(0, 10)} onChange={(event) => setCloseDate(event.target.value)} /><Icon name="calendar" size={16} /></span></label>
          <label className={sp.fld}><span className={sp.fldL}>{t("suTime")}</span><span className={`${sp.in} ${sp.inGrey} ${sp.pick}`}><input type="time" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} /><Icon name="clock" size={16} /></span></label>
        </div>
        <div className={`${sp.grid2} ${sp.sheetActs}`}>
          <button type="button" className={`btn ${s.btn} ${s.ghost}`} onClick={() => { change({ ...draft, registrationClosesAt: null }); setCloseSheet(false); }}>{t("suNoClose")}</button>
          <button type="button" className={`btn ${s.btn} ${s.primary}`} disabled={!closeDate} onClick={() => { change({ ...draft, registrationClosesAt: closeBeforeStart(fromLocalInput(`${closeDate}T${closeTime || "23:59"}`), data.event.startsAt) }); setCloseSheet(false); }}>{t("suDecide")}</button>
        </div>
      </BottomSheet>

      <BottomSheet open={addSheet} onClose={() => setAddSheet(false)} label={t("suChooseKind")}>
        <b className={sp.sheetT}>{t("suChooseKind")}</b>
        {KINDS.map((kind) => <button key={kind} type="button" className={`btn ${sp.mi}`} onClick={() => addBlank(kind)}><Icon name="plus" size={16} />{t(KIND_LABEL[kind])}</button>)}
        <button type="button" className={`btn ${s.btn} ${sp.block}`} onClick={() => setAddSheet(false)}>{t("close")}</button>
      </BottomSheet>

      <BottomSheet open={preview} onClose={() => setPreview(false)} label={t("suPreview")} className={sp.pvSheet}>
        <div className={sp.pvBody}><Preview data={data} draft={draft} t={t} language={language} mode="phone" /></div>
        <button type="button" className={`btn ${s.btn} ${sp.block}`} onClick={() => setPreview(false)}>{t("close")}</button>
      </BottomSheet>
    </div>
  );
}
