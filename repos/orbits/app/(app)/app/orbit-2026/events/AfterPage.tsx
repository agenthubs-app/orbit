"use client";

// R27 会後のふりかえり（Web 1440：b2 #40 记录为空 / #41 少 / #42 多）。数据：GET /api/events/[id]/after（E3 AI 下書き可用时
// 带まとめ 3 条与逐人次の一手；不可用时退回规则，界面不出现「AI」字样）；✓ 的行 POST /after/confirm 才生效。
// お礼は下書きだけ：コピー / メールアプリで開く，Orbit 不发送。分数预览用两端共用的 previewAfterScore（确定后以服务端为准）。
import { useEffect, useMemo, useState } from "react";

import type { EventAfterNextStep, EventAfterResponse } from "../../../../../shared/contract/event-after";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { previewAfterScore } from "../../../../../features/events/journey/after-core";
import { ShellPage } from "../shell/slots";
import { Drawer, Icon, Orbit2026Scope, ToastProvider, useToast } from "../ui";
import { translator as assessTranslator } from "./AssessmentDetail";
import { DiscoverHelpRail, journeyTranslator, type JourneyT } from "./DiscoverTab";
import { WEEK, parts, usePhone, useWide } from "./EventDetail";
import { journeyApi } from "./journey-api";
import styles from "./events.module.css";
import d from "./discover.module.css";
import x from "./detail.module.css";
import a from "./after.module.css";

/** b2 #41 / #42：头像按行 c1 / c4 / c3 / c2 / c4 / c5；まとめ的图标 lav / teal / pink。 */
const ROW_TONES = ["c1", "c4", "c3", "c2", "c4", "c5"] as const;
const HL_TONES = ["t_lav", "t_teal", "t_pink"] as const;
const id = (value: string) => encodeURIComponent(value);

/** 「10/9（金）」：YYYY-MM-DD 按东京日期。 */
function dayLabel(date: string, language: OrbitLanguage, t: JourneyT): string {
  const p = parts(`${date}T12:00:00+09:00`);
  return p ? t("dateWeek", { d: p.day, m: p.month, wd: WEEK[language][p.wd] }) : date;
}

function EmptyAfter({ eventId, t }: { eventId: string; t: JourneyT }) {
  return (
    <>
      <div className={`${styles.card} ${styles.span12} ${a.guide}`} data-after-empty="">
        <div className={styles.row} style={{ gap: 24 }}>
          <div className={a.grow}>
            <div className={styles.lbl}>{t("emptyAfterLbl")}</div>
            <div className={a.guideTitle}>{t("emptyAfterTitle")}</div>
            <div className={styles.sub}>{t("emptyAfterSub")}</div>
          </div>
          <a className={`btn ${styles.btn} ${styles.primary} ${a.h48}`} href={`/app/events/${id(eventId)}`}><Icon name="users" size={16} />{t("pickFromAttendees")}</a>
        </div>
        <div className={a.grid3}>
          <a className={`${styles.mac} ${a.apricot} ${styles.row}`} href="/app/contacts/new/scan"><span className={a.tileEmoji}>📇</span><div><b className={a.tileTitle}>{t("scanCards")}</b><div className={styles.lbl}>{t("scanCardsSub")}</div></div></a>
          <a className={`${styles.mac} ${a.apricot} ${styles.row}`} href="/app/contacts/new/scan"><span className={a.tileEmoji}>🗂️</span><div><b className={a.tileTitle}>{t("dropCards")}</b><div className={styles.lbl}>{t("dropCardsSub")}</div></div></a>
          <div className={`${styles.mac} ${a.apricot} ${styles.row}`}><span className={a.tileEmoji}>🎙️</span><div><b className={a.tileTitle}>{t("voiceMemo")}</b><div className={styles.lbl}>{t("voiceMemoSub")}</div></div></div>
        </div>
      </div>
      <div className={`${styles.card} ${styles.span12}`}>
        <div className={styles.cardH}><h3>{t("previewTitle")} <span className={a.sampleTag}>{t("sampleTag")}</span></h3></div>
        <div className={styles.faded}><div className={`${x.ghostRow} ${a.tall}`}><i />{t("ghostAfter1")}</div><div className={`${x.ghostRow} ${a.tall}`}><i />{t("ghostAfter2")}</div></div>
      </div>
    </>
  );
}

function AfterInner({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  const t = useMemo(() => journeyTranslator(language), [language]);
  const at = useMemo(() => assessTranslator(language), [language]);
  const toast = useToast();
  const [data, setData] = useState<EventAfterResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [unlinked, setUnlinked] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [why, setWhy] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // 1024：右栏收起（b12 #366 没有右栏），点「下書きを作成」在抽屉里看お礼。
  const wide = useWide();
  const phone = usePhone();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => { void journeyApi.after(eventId).then((res) => { if (res.ok) setData(res.data); else setMissing(true); }); }, [eventId]);

  const steps = data?.nextSteps ?? [];
  const checked = steps.filter((step) => !excluded.has(step.attendeeId));
  const preview = useMemo(() => {
    if (!data?.score) return null;
    if (!data.scoreSlots?.length) return { after: data.score.after, before: data.score.before };
    const counted = checked.map((step) => (unlinked.has(step.attendeeId) ? { alreadyCounted: step.alreadyCounted ?? false, planType: null } : step));
    return { after: data.score.before + previewAfterScore(counted, data.scoreSlots).total, before: data.score.before };
  }, [data, checked, unlinked]);
  const selected = steps.find((step) => step.attendeeId === selectedId) ?? steps.find((step) => step.thanksDraft) ?? null;
  const draft = selected ? drafts[selected.attendeeId] ?? selected.thanksDraft ?? null : null;
  useEffect(() => { setEditing(false); }, [selected?.attendeeId]);

  const toggleRow = (step: EventAfterNextStep, include: boolean) => setExcluded((current) => { const next = new Set(current); if (include) next.delete(step.attendeeId); else next.add(step.attendeeId); return next; });
  const togglePlan = (step: EventAfterNextStep) => setUnlinked((current) => { const next = new Set(current); if (next.has(step.attendeeId)) next.delete(step.attendeeId); else next.add(step.attendeeId); return next; });
  const confirm = async () => {
    if (!checked.length) return;
    setBusy(true);
    const res = await journeyApi.confirmAfter(eventId, checked.map((step) => ({ attendeeId: step.attendeeId, followupDate: dates[step.attendeeId] ?? step.followupDate, planTypeKey: unlinked.has(step.attendeeId) ? null : step.planType?.key ?? null })));
    setBusy(false);
    if (!res.ok) { toast.error(at("genericError")); return; }
    setData((current) => (current ? { ...current, confirmedAt: res.data.confirmedAt, score: current.score && res.data.scoreAfter != null ? { ...current.score, after: res.data.scoreAfter } : current.score } : current));
    toast.success(t("confirmedToast"));
  };
  const copyDraft = async () => {
    if (!draft) return;
    try { await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`); toast.success(t("draftCopied")); } catch { toast.error(at("genericError")); }
  };
  const shareRecap = async () => {
    if (!data) return;
    const lines = [`${t("afterTitle")} · ${data.title}`, ...(data.highlights ?? []).map((item) => `${item.emoji} ${item.title} — ${item.detail}`), ...(data.summary && !data.highlights?.length ? [data.summary] : [])];
    try { await navigator.clipboard.writeText(lines.join("\n")); toast.success(t("recapCopied")); } catch { toast.error(at("genericError")); }
  };

  const back = <a className={`btn ${x.rbtn}`} href={`/app/events/${id(eventId)}`} aria-label={t("back")}><Icon name="left" size={20} /></a>;
  if (missing) return <><ShellPage title={t("afterTitle")} left={back} rightRail={false} /><div className={`${styles.card} ${x.missing}`}>{t("notFound")}</div></>;
  if (!data) return <ShellPage title={t("afterTitle")} left={back} rightRail={false} />;
  const dateP = parts(`${data.date}T12:00:00+09:00`);
  const subtitle = `${data.title} · ${dateP ? t("dateWeek", { d: dateP.day, m: dateP.month, wd: WEEK[language][dateP.wd] }) : data.date}`;
  const empty = data.met.count === 0 && steps.length === 0;

  const draftPanel = selected && draft ? (
    <div className={`${styles.rail} ${d.rail}`} data-after-draft={selected.attendeeId}>
      {wide ? <h4 className={`${styles.railH} ${d.railH}`}><Icon name="mail" size={16} />{t("thanksTitle", { name: selected.name.split(/\s+/)[0] ?? selected.name })}</h4> : null}
      <div className={`${styles.card} ${a.draftCard}`}>
        <div className={styles.lbl}>{t("subjectLbl")}</div>
        {editing ? <input className={a.input} value={draft.subject} aria-label={t("subjectLbl")} onChange={(ev) => setDrafts((all) => ({ ...all, [selected.attendeeId]: { ...draft, subject: ev.target.value } }))} />
          : <b className={a.subject}>{draft.subject}</b>}
        {editing ? <textarea className={a.textarea} value={draft.body} aria-label={t("colThanks")} onChange={(ev) => setDrafts((all) => ({ ...all, [selected.attendeeId]: { ...draft, body: ev.target.value } }))} />
          : <div className={`${styles.sub} ${a.body}`}>{draft.body}</div>}
      </div>
      <div className={a.draftActs}>
        <button type="button" className={`btn ${styles.btn} ${styles.primary}`} aria-pressed={editing} onClick={() => setEditing((value) => !value)}><Icon name="pen" size={16} />{t("makeThanks")}</button>
        <div className={a.grid2}>
          <button type="button" className={`btn ${styles.btn}`} onClick={() => void copyDraft()}>{t("copyText")}</button>
          <a className={`btn ${styles.btn}`} href={`mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}><Icon name="out" size={16} />{t("openMail")}</a>
        </div>
      </div>
      <div className={`${styles.lbl} ${a.note}`}><Icon name="mail" size={16} /> {t("noSendNote")}</div>
    </div>
  ) : null;
  const rail = empty ? <DiscoverHelpRail language={language} /> : wide && draftPanel ? draftPanel : false;
  const drawerEl = !wide && selected ? <Drawer open={drawer} onClose={() => setDrawer(false)} title={t("thanksTitle", { name: selected.name.split(/\s+/)[0] ?? selected.name })} size="sm">{draftPanel}</Drawer> : null;
  const scoreCard = data.score && preview ? (
    <div className={`${styles.card} ${phone ? a.pCard : a.fill}`} data-after-score="">
      <div className={`${styles.row} ${styles.between}`} style={{ alignItems: "flex-start" }}>
        <div>
          <div className={styles.lbl}>{t("scoreLbl", { goal: data.score.goal })}</div>
          <div className={`${styles.row} ${a.scoreRow}`}><span className={`${a.mid} ${styles.muted}`}>{preview.before}</span><span className={styles.muted}><Icon name="right" size={16} /></span><span className={a.big36}>{preview.after}</span></div>
        </div>
        {preview.after > preview.before ? <span className={a.delta}>+{preview.after - preview.before}</span> : null}
      </div>
      <div className={a.bar2}><i className={a.base} style={{ width: `${Math.min(100, preview.before)}%` }} /><i className={a.add} style={{ left: `${Math.min(100, preview.before)}%`, width: `${Math.max(0, Math.min(100, preview.after) - Math.min(100, preview.before))}%` }} /></div>
      <div className={`${styles.row} ${styles.between}`}><span className={styles.lbl}>{data.confirmedAt ? t("confirmedState", { date: (parts(data.confirmedAt) ? `${parts(data.confirmedAt)!.month}/${parts(data.confirmedAt)!.day}` : "") }) : t("scoreHint")}</span>{data.score.detail ? <button type="button" className={`btn ${d.why}`} aria-expanded={Boolean(why.__score)} aria-label={t("whyLabel")} onClick={() => setWhy((all) => ({ ...all, __score: !all.__score }))}>?</button> : null}</div>
      {why.__score && data.score.detail ? <div className={d.whyBody}>{data.score.detail}</div> : null}
    </div>
  ) : null;
  const summaryBody = data.highlights?.length ? data.highlights.map((item, index) => (
    <div key={item.title} className={a.sumi}>
      <div className={styles.row} style={{ gap: 10, alignItems: "flex-start" }}>
        <span className={`${styles.emo} ${styles[HL_TONES[index % HL_TONES.length]!]} ${a.emoSm}`}>{item.emoji}</span>
        <div className={a.grow} contentEditable={data.aiDraft} suppressContentEditableWarning><b className={a.hlTitle}>{item.title}</b><div className={styles.lbl}>{item.detail}</div></div>
        {item.evidence ? <button type="button" className={`btn ${d.why}`} aria-expanded={Boolean(why[item.title])} aria-label={t("whyLabel")} onClick={() => setWhy((all) => ({ ...all, [item.title]: !all[item.title] }))}>?</button> : null}
      </div>
      {why[item.title] ? <div className={d.whyBody}>{t("evidenceLbl", { text: item.evidence })}</div> : null}
    </div>
  )) : data.summary ? <div className={`${styles.sub} ${a.sumi}`}>{data.summary}</div> : null;

  // 390（b12 #368）：App 式——会った人 hero（头像叠）· mini3 · まとめ · 次の一手卡片（✓ / ✕ + 三个动作 chip）· プラン スコア。
  if (phone && !empty) {
    return (
      <>
        <ShellPage title={t("afterTitle")} subtitle={`${data.title} · ${dateP ? `${dateP.month}/${dateP.day}` : data.date}`} left={back} right={<button type="button" className={`btn ${x.rbtn}`} aria-label={t("share")} onClick={() => void shareRecap()}><Icon name="share" size={20} /></button>} rightRail={false} phoneBare />
        <div className={a.phone} data-after={eventId} data-after-phone="">
          <div className={`${styles.card} ${a.pCard}`} data-after-met="">
            <div className={a.heroRow}>
              <div><div className={styles.lbl}>{t("metToday")}</div><div className={a.pBig}>{data.met.count}<small>{t("metUnit")}</small></div></div>
              <div className={x.avs}>{data.met.initials.slice(0, 5).map((initial, index) => <div key={`${initial}-${index}`} className={`${x.av} ${a.avSm} ${x[ROW_TONES[[0, 2, 1, 3, 4][index % 5]!]!]}`}>{initial}</div>)}</div>
            </div>
            <div className={x.mini3}>
              <div><span className={styles.lbl}>{t("statExchanged")}</span><b>{data.met.exchanged}</b></div>
              <div><span className={styles.lbl}>{t("itemTarget")}</span><b>{data.met.wantedMet}<small className={styles.lbl}>/{data.met.wantedTotal}</small></b></div>
              <div><span className={styles.lbl}>{t("meetingsSet")}</span><b>{data.met.meetings}</b></div>
            </div>
          </div>
          <div className={`${styles.card} ${a.pCard}`} data-after-summary="">
            <div className={styles.cardH}><h3>{t("summaryTitle")}</h3>{data.aiDraft ? <span className={styles.lbl}>{t("aiDraftEditable")}</span> : null}</div>
            {summaryBody}
          </div>
          {steps.length ? (
            <div className={`${styles.card} ${a.pBatch}`} data-after-steps="">
              <div className={styles.cardH}><h3>{t("nextStepsTitle", { n: steps.length })}</h3><span className={styles.lbl}>{data.aiDraft ? t("nextStepsHintPhone") : t("nextStepsHintPhoneRule")}</span></div>
              {steps.map((step, index) => {
                const on = !excluded.has(step.attendeeId);
                const date = dates[step.attendeeId] ?? step.followupDate;
                return (
                  <div key={step.attendeeId} className={`${a.nx} ${on ? "" : a.nxOff}`} data-after-step={step.attendeeId}>
                    <div className={styles.row} style={{ gap: 10 }}>
                      <div className={`${x.av} ${a.avSm} ${x[ROW_TONES[index % ROW_TONES.length]!]}`}>{step.initial}</div>
                      <div className={a.grow}><b className={a.nxName}>{step.name}</b>{step.org ? <div className={`${styles.lbl} ${d.ell}`}>{step.org}</div> : null}</div>
                      <button type="button" className={`btn ${a.yn} ${on ? a.ynOn : ""}`} aria-pressed={on} aria-label="✓" onClick={() => toggleRow(step, true)}>✓</button>
                      <button type="button" className={`btn ${a.yn} ${on ? "" : a.ynOn}`} aria-pressed={!on} aria-label="✕" onClick={() => toggleRow(step, false)}>✕</button>
                    </div>
                    <div className={a.nxActs}>
                      {step.thanksDraft ? <button type="button" className={`btn ${a.act} ${a.actOn} ${a.actPlain}`} onClick={() => { setSelectedId(step.attendeeId); setDrawer(true); }}>{t("actThanks")}</button> : null}
                      <label className={`${a.act} ${a.actOn} ${a.actPlain} ${a.dateAct}`}>
                        {t("actFollow", { date: dayLabel(date, language, t) })}
                        <input type="date" className={a.dateInput} value={date} aria-label={t("colFollow")} onChange={(ev) => { const value = ev.target.value; if (value) setDates((all) => ({ ...all, [step.attendeeId]: value })); }} />
                      </label>
                      {step.planType ? <button type="button" className={`btn ${a.act} ${a.actPlain} ${unlinked.has(step.attendeeId) ? "" : a.actOn}`} aria-pressed={!unlinked.has(step.attendeeId)} onClick={() => togglePlan(step)}>{`🎯 ${step.planType.label}`}</button> : null}
                    </div>
                  </div>
                );
              })}
              <div className={`${styles.row} ${a.pFoot}`}>
                <button type="button" className={`btn ${styles.btn} ${styles.primary} ${a.grow}`} disabled={busy || !checked.length || Boolean(data.confirmedAt)} onClick={() => void confirm()}>{t("confirmN", { n: checked.length })}</button>
                <a className={`btn ${styles.btn} ${a.ghost}`} href={`/app/events/${id(eventId)}`}>{t("later")}</a>
              </div>
              <div className={`${styles.lbl} ${a.pNote}`}><Icon name="mail" size={16} /> {t("noSendNote")}</div>
            </div>
          ) : null}
          {scoreCard}
        </div>
        {drawerEl}
      </>
    );
  }

  return (
    <>
      <ShellPage title={t("afterTitle")} subtitle={subtitle} left={back} right={<button type="button" className={`btn ${x.rbtn}`} aria-label={t("share")} onClick={() => void shareRecap()}><Icon name="share" size={20} /></button>} rightRail={rail} />
      <div className={styles.wgrid} data-after={eventId}>
        {empty ? <EmptyAfter eventId={eventId} t={t} /> : (
          <>
            <div className={`${styles.card} ${styles.span3} ${a.span3}`} data-after-met="">
              <div className={styles.lbl}>{t("metToday")}</div>
              <div className={a.big}>{data.met.count}<small>{t("metUnit")}</small></div>
              <div className={`${x.mini3} ${a.mini2}`}>
                <div><span className={styles.lbl}>{t("itemTarget")}</span><b>{data.met.wantedMet}<small className={styles.lbl}>/{data.met.wantedTotal}</small></b></div>
                <div><span className={styles.lbl}>{t("meetingsLbl")}</span><b>{data.met.meetings}</b></div>
              </div>
            </div>
            <div className={`${x.span5} ${a.flexCell}`}>
              <div className={`${styles.card} ${a.fill}`} data-after-summary="">
                <div className={styles.cardH}><h3>{t("summaryTitle")}</h3>{data.aiDraft ? <span className={styles.lbl}>{t("aiDraftEditable")}</span> : null}</div>
                {data.highlights?.length ? data.highlights.map((item, index) => (
                  <div key={item.title} className={a.sumi}>
                    <div className={styles.row} style={{ gap: 10, alignItems: "flex-start" }}>
                      <span className={`${styles.emo} ${styles[HL_TONES[index % HL_TONES.length]!]} ${a.emoSm}`}>{item.emoji}</span>
                      <div className={a.grow} contentEditable={data.aiDraft} suppressContentEditableWarning><b className={a.hlTitle}>{item.title}</b><div className={styles.lbl}>{item.detail}</div></div>
                      {item.evidence ? <button type="button" className={`btn ${d.why}`} aria-expanded={Boolean(why[item.title])} aria-label={t("whyLabel")} onClick={() => setWhy((all) => ({ ...all, [item.title]: !all[item.title] }))}>?</button> : null}
                    </div>
                    {why[item.title] ? <div className={d.whyBody}>{t("evidenceLbl", { text: item.evidence })}</div> : null}
                  </div>
                )) : data.summary ? <div className={`${styles.sub} ${a.sumi}`}>{data.summary}</div> : null}
              </div>
            </div>
            {data.score && preview ? (
              <div className={`${styles.span4} ${a.flexCell}`}>
                <div className={`${styles.card} ${a.fill}`} data-after-score="">
                  <div className={`${styles.row} ${styles.between}`} style={{ alignItems: "flex-start" }}>
                    <div>
                      <div className={styles.lbl}>{t("scoreLbl", { goal: data.score.goal })}</div>
                      <div className={`${styles.row} ${a.scoreRow}`}><span className={`${a.mid} ${styles.muted}`}>{preview.before}</span><span className={styles.muted}><Icon name="right" size={16} /></span><span className={a.big36}>{preview.after}</span></div>
                    </div>
                    {preview.after > preview.before ? <span className={a.delta}>+{preview.after - preview.before}</span> : null}
                  </div>
                  <div className={a.bar2}><i className={a.base} style={{ width: `${Math.min(100, preview.before)}%` }} /><i className={a.add} style={{ left: `${Math.min(100, preview.before)}%`, width: `${Math.max(0, Math.min(100, preview.after) - Math.min(100, preview.before))}%` }} /></div>
                  <div className={`${styles.row} ${styles.between}`}><span className={styles.lbl}>{data.confirmedAt ? t("confirmedState", { date: (parts(data.confirmedAt) ? `${parts(data.confirmedAt)!.month}/${parts(data.confirmedAt)!.day}` : "") }) : t("scoreHint")}</span>{data.score.detail ? <button type="button" className={`btn ${d.why}`} aria-expanded={Boolean(why.__score)} aria-label={t("whyLabel")} onClick={() => setWhy((all) => ({ ...all, __score: !all.__score }))}>?</button> : null}</div>
                  {why.__score && data.score.detail ? <div className={d.whyBody}>{data.score.detail}</div> : null}
                </div>
              </div>
            ) : null}
            {steps.length ? (
              <div className={`${styles.card} ${styles.span12}`} data-after-steps="">
                <div className={styles.cardH}><h3>{t("nextStepsTitle", { n: steps.length })}</h3><span className={styles.lbl}>{data.aiDraft ? t("nextStepsHint") : t("nextStepsHintRule")}</span></div>
                <table className={a.table}>
                  <thead><tr><th>{t("colPerson")}</th><th>{t("colThanks")}</th><th>{t("colFollow")}</th><th>{t("colPlan")}</th><th className={a.right}>{t("colConfirm")}</th></tr></thead>
                  <tbody>
                    {steps.map((step, index) => {
                      const on = !excluded.has(step.attendeeId);
                      const date = dates[step.attendeeId] ?? step.followupDate;
                      return (
                        <tr key={step.attendeeId} className={`${selected?.attendeeId === step.attendeeId ? a.sel : ""} ${on ? "" : a.off}`} data-after-step={step.attendeeId} onClick={() => setSelectedId(step.attendeeId)}>
                          <td><div className={styles.row} style={{ gap: 8 }}><div className={`${x.av} ${x[ROW_TONES[index % ROW_TONES.length]!]} ${a.avSm}`}>{step.initial}</div><div><b className={a.name}>{step.name}</b>{step.org ? <div className={styles.lbl}>{step.org}</div> : null}</div></div></td>
                          <td>{step.thanksDraft ? <button type="button" className={`btn ${a.act} ${a.actOn}`} onClick={(ev) => { ev.stopPropagation(); setSelectedId(step.attendeeId); if (!wide) setDrawer(true); }}>{t("makeThanks")}</button> : <span className={styles.lbl}>—</span>}</td>
                          <td>
                            <label className={`${a.act} ${a.actOn} ${a.dateAct}`} onClick={(ev) => ev.stopPropagation()}>
                              {dayLabel(date, language, t)}
                              <input type="date" className={a.dateInput} value={date} aria-label={t("colFollow")} onChange={(ev) => { const value = ev.target.value; if (value) setDates((all) => ({ ...all, [step.attendeeId]: value })); }} />
                            </label>
                          </td>
                          <td>{step.planType ? <button type="button" className={`btn ${a.act} ${unlinked.has(step.attendeeId) ? "" : a.actOn}`} aria-pressed={!unlinked.has(step.attendeeId)} onClick={(ev) => { ev.stopPropagation(); togglePlan(step); }}>{step.planType.label}</button> : <span className={styles.lbl}>—</span>}</td>
                          <td><div className={`${styles.row} ${a.yns}`}>
                            <button type="button" className={`btn ${a.yn} ${on ? a.ynOn : ""}`} aria-pressed={on} aria-label="✓" onClick={(ev) => { ev.stopPropagation(); toggleRow(step, true); }}>✓</button>
                            <button type="button" className={`btn ${a.yn} ${on ? "" : a.ynOn}`} aria-pressed={!on} aria-label="✕" onClick={(ev) => { ev.stopPropagation(); toggleRow(step, false); }}>✕</button>
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className={`${styles.row} ${a.foot}`}>
                  <span className={styles.lbl}><Icon name="mail" size={16} /> {t("noSendNote")}</span>
                  <a className={`btn ${styles.btn} ${a.ghost}`} href={`/app/events/${id(eventId)}`}>{t("later")}</a>
                  <button type="button" className={`btn ${styles.btn} ${styles.primary}`} disabled={busy || !checked.length || Boolean(data.confirmedAt)} onClick={() => void confirm()}>{t("confirmN", { n: checked.length })}</button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
      {!wide && selected ? <Drawer open={drawer} onClose={() => setDrawer(false)} title={t("thanksTitle", { name: selected.name.split(/\s+/)[0] ?? selected.name })} size="sm">{draftPanel}</Drawer> : null}
    </>
  );
}

export function AfterPage({ eventId, language }: { eventId: string; language: OrbitLanguage }) {
  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        <AfterInner eventId={eventId} language={language} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}
