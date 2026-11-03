"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanHomeAction, PlanHomeView, PlanSource, PlanV2Detail } from "../../../../../shared/contract/plan-v2";
import { PLAN_EVENT_COPY, planCopy } from "../../../../../shared/compute/plan-template-copy";
import { PLAN_EVENT_SEGMENT_KEY } from "../../../../../shared/compute/plan-score";
import { LANDSCAPE_ENTRIES } from "../../../../../features/plans/landscape/entries";
import { planFlowCopy, planHomeCopy as hc } from "../copy/plan";
import { Button, Modal, useToast } from "../ui";
import { Evidence, MarkedText, Route } from "./DraftV3Parts";
import { draftMarked, homeHeader, isEventAction, mergeHome, monthDay, prepLines, seatOf, typeToneOf, withDone } from "./home-v3-model";
import { metCountOf } from "./overview-model";
import { newActionKey, planApi } from "./plan-api";
import { enc, v2Path } from "./plan-v2-actions";
import type { Translate } from "./PlanParts";
import d from "./DraftV3.module.css";
import h from "./PlanHomeV3.module.css";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

const EM_TONE = { apricot: d.emApricot, blue: d.emBlue, lav: d.emLav, pink: d.emPink, teal: d.emTeal } as const;
const MK_TONE = { apricot: h.mkApricot, blue: h.mkBlue, lav: h.mkLav, pink: h.mkPink, teal: h.mkTeal } as const;
const POLL_MS = 3000;
const POLL_MAX = 10;
const FACT_MAX = 80;

export interface PlanHomeV3Props {
  detail: PlanV2Detail;
  t: Translate;
  language: OrbitLanguage;
  /** 重新读概要（准备中轮询、补事实后）。 */
  onReload: () => Promise<void> | void;
  /** 「✦ 让 AI 调整」= 見直し入口。 */
  onAiAdjust: () => void;
}

/** 依据区的来源标题：网页来源用抓取的标题；业界现状库按条目 id + 版本查标题与出处。 */
function sourceInfo(language: OrbitLanguage, source: PlanSource) {
  if (source.kind === "web") return { fetchedAt: source.fetchedAt, title: source.title, url: source.url };
  const entry = LANDSCAPE_ENTRIES.find((item) => item.id === source.landscapeId && item.version === source.version) ?? LANDSCAPE_ENTRIES.find((item) => item.id === source.landscapeId);
  return { fetchedAt: null, title: entry?.title[language] ?? source.landscapeId, url: entry?.source.url ?? null };
}

/**
 * 计划主页 v3（`content.schemaVersion === 3`；plan-draft-v5-proposal.html v16「计划主页 · 执行」，原型 `renderHome(g)`）：
 * 头部（目标结果 + 结论 | 阶段在前、分数退后）→ 路线（带完成标志）→ 先做的事（勾选、准备卡展开）→ 要认识的人（空位）→
 * 「为什么这么排」折叠。类名与结构照原型；字段表里「缺了不显示」的一律不画。
 */
export function PlanHomeV3({ detail, t, language, onReload, onAiAdjust }: PlanHomeV3Props) {
  const toast = useToast();
  const [home, setHome] = useState<PlanHomeView | null>(detail.home ?? null);
  const [openAction, setOpenAction] = useState<string | null>(null);
  const [openSeat, setOpenSeat] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [factFor, setFactFor] = useState<string | null>(null);
  const [factText, setFactText] = useState("");
  const content = detail.content;

  useEffect(() => { setHome((previous) => (detail.home ? mergeHome(previous, detail.home) : null)); }, [detail.home]);

  // 准备中：每 3 秒重读概要，最多 10 次（读概要会在服务端补生成）。
  const pending = home?.state === "pending";
  useEffect(() => {
    if (!pending) return;
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      if (count > POLL_MAX) { clearInterval(timer); return; }
      void onReload();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, onReload]);

  const header = homeHeader({ ...detail, home });
  const stage = content.steps[header.stepIndex];
  const actions = home?.actions ?? [];
  const sources = content.sources ?? [];
  const maxPoints = Math.max(0, ...content.personTypes.map((type) => type.allocation));
  const seatNeed = header.need;
  const seatFound = header.found;
  const eventSegment = detail.score.segments.find((segment) => segment.key === PLAN_EVENT_SEGMENT_KEY);
  const eventsDone = eventSegment ? metCountOf(content.event.allocation, content.event.targetCount, eventSegment.earned) : 0;

  const toggleDone = async (action: PlanHomeAction) => {
    if (!home) return;
    const next = !action.done;
    setHome(withDone(home, action.actionKey, next));
    const result = await planApi<PlanHomeView>(v2Path(detail.planId, `/home/actions/${enc(action.actionKey)}/done`), { body: { done: next, idempotencyKey: newActionKey() }, language });
    if (result.ok) setHome((previous) => mergeHome(previous, result.data));
    else setHome((previous) => (previous ? withDone(previous, action.actionKey, action.done) : previous));
  };

  const regenerate = async (action: PlanHomeAction) => {
    setBusy(`regen:${action.actionKey}`);
    const result = await planApi<PlanHomeView>(v2Path(detail.planId, `/home/actions/${enc(action.actionKey)}/regenerate`), { body: { idempotencyKey: newActionKey() }, language });
    setBusy(null);
    if (result.ok) { setHome((previous) => mergeHome(previous, result.data)); return; }
    const failed = result as Extract<typeof result, { ok: false }>;
    toast.error(t(failed.error.reason === "LIMIT" ? hc.regenerateLimit : hc.regenerateFailed));
  };

  const copyDraft = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(t(hc.copied)); } catch { /* 没有剪贴板权限：不提示 */ }
  };

  const saveFact = async () => {
    const contactId = factFor;
    const text = factText.trim();
    if (!contactId || !text) return;
    setBusy("fact");
    const response = await fetch(`/api/contacts/${enc(contactId)}/facts`, { body: JSON.stringify({ idempotencyKey: newActionKey(), text }), headers: { "content-type": "application/json", "x-orbit-lang": language }, method: "POST" }).catch(() => null);
    setBusy(null);
    if (!response?.ok) { toast.error(t(hc.factFailed)); return; }
    setFactFor(null);
    setFactText("");
    toast.success(t(hc.factSaved));
    await onReload();
  };

  return (
    <div className={d.page} data-plan-home-v3={detail.planId}>
      <div className={d.top}>
        <span className={d.crumb}>{t(hc.crumb)}</span>
        <button type="button" className={d.ai} onClick={onAiAdjust} data-plan-home-ai="">{t(hc.aiAdjust)}</button>
      </div>

      <div className={h.hh} data-plan-home-head="">
        <div className={h.hhMain}>
          {content.outcome ? <div className={h.goal}>{t(planFlowCopy.v3GoalLine, { outcome: content.outcome })}</div> : null}
          <h1>{content.conclusion}</h1>
        </div>
        <div className={h.pg}>
          <b>{t(hc.stageNow, { n: header.stepIndex + 1 })}<small>{t(hc.stageOf, { total: header.stepCount })}</small></b>
          {header.stepTitle ? <span className={h.dn}>{header.stepTitle}</span> : null}
          <div className={h.prog}><i style={{ width: `${header.barPercent}%` }} /></div>
          <span>{t(hc.progressLine, { found: header.found, need: header.need, score: header.score, total: header.total })}</span>
        </div>
      </div>

      <Route steps={content.steps} current={header.stepIndex} done={(step) => (step.doneCriteria ? t(hc.doneFlag, { text: step.doneCriteria }) : null)} />

      <section className={d.section} data-plan-home-todo={home?.state ?? "none"}>
        <div className={d.sh}>
          <h2>{t(hc.todoTitle, { n: actions.length })}</h2>
          {stage ? <span>{t(hc.stageLine, { n: header.stepIndex + 1, title: stage.title })}</span> : null}
        </div>
        {home?.lead ? <p className={d.guide}>{home.lead}</p> : null}
        <div className={h.todo}>
          {pending ? <div className={h.hint} aria-live="polite">{t(hc.preparing)}</div> : null}
          {!pending && actions.length === 0 ? <div className={h.hint}>{t(hc.goMeet)}</div> : null}
          {actions.map((action) => {
            const open = openAction === action.actionKey;
            const prep = action.prep;
            const event = isEventAction(action);
            return (
              <div key={action.actionKey} className={cx(h.td, action.done && h.checked)} data-plan-home-action={action.actionKey} data-done={action.done ? "true" : "false"}>
                <button type="button" role="checkbox" aria-checked={action.done} aria-label={action.title} className={h.box} onClick={() => void toggleDone(action)} data-plan-home-done="" />
                <span className={h.tx}>
                  <span className={h.tt}>{action.title}{action.stepNumber > 1 ? <i className={h.stt}>{t(hc.early, { n: action.stepNumber })}</i> : null}</span>
                  <span className={h.why}><MarkedText value={action.reason} marker={() => null} /></span>
                  <span className={h.acts}>
                    {prep ? <button type="button" className={cx(h.opb, open && h.on)} aria-expanded={open} onClick={() => setOpenAction(open ? null : action.actionKey)} data-plan-home-prep-toggle="">{t(event ? hc.prepEvent : hc.prepContact)} {open ? "▴" : "▾"}</button> : null}
                    {prep ? <span className={h.hk}>{t(hc.hookLabel)} <b>{prep.hook.label}</b></span> : null}
                  </span>
                  {open && prep ? (
                    <div className={h.prep} data-plan-home-prep={action.actionKey} data-fallback={prep.fallback ? "true" : undefined}>
                      {prepLines(prep).map((line, index) => line.kind === "fact" ? (
                        <div key={`f${line.fact.id}`} className={h.pr} data-plan-home-fact={line.fact.id}>
                          <span className={h.k}>{t(hc.rowMemo)}</span>
                          <span>{line.fact.text}</span>
                          {action.contactId ? <Link className={cx(h.sg, h.sgLink)} href={`/app/contacts/${enc(action.contactId)}`}>{t(hc.memoChip, { date: monthDay(line.fact.date) })}</Link> : <i className={h.sg}>{t(hc.memoChip, { date: monthDay(line.fact.date) })}</i>}
                        </div>
                      ) : (
                        <div key={`r${index}`} className={h.pr} data-plan-home-row={line.row.key}>
                          <span className={h.k}>{t(ROW_LABEL[line.row.key])}</span>
                          <span>{line.row.value}</span>
                          {line.row.source !== "—" ? <i className={h.sg}>{line.row.source}</i> : <span />}
                        </div>
                      ))}
                      <div className={h.hook}><b>{t(hc.hookWhy)}</b>{prep.hook.reason}</div>
                      <div className={h.op}>
                        <div className={h.opH}><span>{t(event ? hc.draftHeadEvent : hc.draftHead)}</span><button type="button" className={h.copy} onClick={() => void copyDraft(prep.draft.text)}>{t(hc.copy)}</button></div>
                        <MarkedText value={draftMarked(prep)} marker={() => null} />
                      </div>
                      {prep.staleSince ? (
                        <div className={h.stale} data-plan-home-stale="">
                          <span>{t(hc.stale)}</span>
                          <button type="button" className={h.regen} disabled={busy !== null} aria-busy={busy === `regen:${action.actionKey}` || undefined} onClick={() => void regenerate(action)} data-plan-home-regenerate="">{t(hc.regenerate)}</button>
                        </div>
                      ) : null}
                      {prep.gaps.length && action.contactId ? (
                        <div className={h.gaps} data-plan-home-gaps={prep.gaps.join(",")}>
                          <span>{t(hc.gapsLead)}</span>
                          {prep.gaps.includes("memo") ? <button type="button" className={h.gap} onClick={() => { setFactFor(action.contactId); setFactText(""); }} data-plan-home-gap="memo">{t(hc.gapMemo)}</button> : null}
                          {prep.gaps.includes("interaction") ? <Link className={h.gap} href={`/app/contacts/${enc(action.contactId)}`} data-plan-home-gap="interaction">{t(hc.gapInteraction)}</Link> : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </span>
                <span className={h.meta}><span className={cx(h.mk, MK_TONE[event ? "pink" : typeToneOf(detail, action.typeKey)])}>{action.avatar}</span>{action.meta}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className={d.section} data-plan-home-seats="">
        <div className={d.sh}><h2>{t(hc.seatsTitle)}</h2><span>{t(hc.seatsSub, { found: seatFound, need: seatNeed })}</span></div>
        <div className={d.seats}>
          <div className={h.legend}>
            <span><i className={h.lf} />{t(hc.legendFilled)}</span>
            <span><i className={h.le}>+</i>{t(hc.legendEmpty)}</span>
            <span><i className={h.lp}>{maxPoints}</i>{t(hc.legendPoints, { total: header.total })}</span>
          </div>
          <div className={h.prog}><i style={{ width: `${seatNeed > 0 ? Math.round((seatFound / seatNeed) * 100) : 0}%` }} /></div>
          {content.personTypes.map((type, index) => {
            const seat = seatOf(home, type.key);
            const people = seat?.people ?? [];
            const open = openSeat === type.key;
            const stepNumber = Math.max(1, content.steps.findIndex((step) => step.personTypeKeys.includes(type.key)) + 1);
            return (
              <div key={type.key} className={d.group}>
                <button type="button" className={cx(h.sr, open && h.open)} aria-expanded={open} onClick={() => setOpenSeat(open ? null : type.key)} data-plan-home-seat={type.key}>
                  <span className={cx(d.em, EM_TONE[typeToneOf(detail, type.key) as keyof typeof EM_TONE], h.srEm)} aria-hidden>{type.emoji}</span>
                  <span className={h.srNm}>{type.shortLabel}<small>{t(hc.typeStage, { n: stepNumber })}</small></span>
                  <span className={h.slots}>
                    {Array.from({ length: type.targetCount }, (_, slot) => {
                      const person = people[slot];
                      return person ? <i key={slot} className={h.fill} title={person.name || undefined}>{Array.from(person.name)[0] ?? "✓"}</i> : <i key={slot} className={h.empty}>+</i>;
                    })}
                  </span>
                  <span className={h.pts}>{type.allocation}<small>{t(planFlowCopy.v3PointsUnit)}</small></span>
                </button>
                {open ? (
                  <div className={h.ex} data-plan-home-seat-detail={type.key}>
                    <div>
                      <h4>{t(hc.exWhat)}</h4>
                      <p>{type.roleSituation}</p>
                      {people.length ? (
                        <>
                          <h4 className={h.gap12}>{t(hc.legendFilled)}</h4>
                          {people.map((person, slot) => (
                            <div key={person.contactId ?? `anon${slot}`} className={h.cd}><span className={h.av}>{Array.from(person.name)[0] ?? "?"}</span><span>{person.name || "—"} {person.note ? <small>{person.note}</small> : null}</span></div>
                          ))}
                        </>
                      ) : (
                        <>
                          <h4 className={h.gap12}>{t(hc.exWhere)}</h4>
                          <div className={h.miss}>{seat?.meetAt ? t(hc.exMissAt, { event: seat.meetAt }) : t(hc.exMissNone)}</div>
                        </>
                      )}
                    </div>
                    <div><h4>{t(hc.exAsk)}</h4><ol>{type.questions.map((question, qi) => <li key={qi}>{question}</li>)}</ol></div>
                  </div>
                ) : null}
              </div>
            );
          })}
          <div className={cx(h.sr, h.ev)} data-plan-home-seat="event">
            <span className={cx(d.em, d.emPink, h.srEm)} aria-hidden>🎟️</span>
            <span className={h.srNm}>{planCopy(PLAN_EVENT_COPY, language)}<small>{t(planFlowCopy.eventRole)}</small></span>
            <span className={h.slots}>{Array.from({ length: content.event.targetCount }, (_, slot) => (slot < eventsDone ? <i key={slot} className={cx(h.fill, h.sq)}>✓</i> : <i key={slot} className={cx(h.empty, h.sq)}>+</i>))}</span>
            <span className={h.pts}>{content.event.allocation}<small>{t(planFlowCopy.v3PointsUnit)}</small></span>
          </div>
        </div>
      </section>

      {sources.length || content.orderReasons?.length || content.comparison ? (
        full ? (
          <section className={d.section} data-plan-home-evidence="open">
            <div className={d.sh}><h2>{t(planFlowCopy.v3WhyTitle)}</h2><span>{t(planFlowCopy.v3WhySub, { n: sources.length })}</span></div>
            <Evidence content={content} t={t} language={language} sourceInfo={(source) => sourceInfo(language, source)} marker={(id, key) => { const n = sources.findIndex((source) => source.id === id) + 1; return n > 0 ? <i key={key} className={d.src}>{n}</i> : null; }} />
            <button type="button" className={cx(d.toggle, h.close)} onClick={() => setFull(false)}>{t(hc.evClose)}</button>
          </section>
        ) : (
          <section className={d.section} data-plan-home-evidence="closed">
            <button type="button" className={h.evlink} aria-expanded={false} onClick={() => setFull(true)}><b>{t(planFlowCopy.v3WhyTitle)}</b>{t(hc.evlinkRest, { n: sources.length })}</button>
          </section>
        )
      ) : null}
      <div className={h.bottom} aria-hidden />

      <Modal open={factFor !== null} onClose={() => setFactFor(null)} title={t(hc.factTitle)} form
        actions={<><Button label={t(hc.factCancel)} onClick={() => setFactFor(null)} /><Button variant="primary" label={t(hc.factSave)} loading={busy === "fact"} disabled={!factText.trim() || Array.from(factText.trim()).length > FACT_MAX} onClick={() => void saveFact()} /></>}>
        <div className={h.factForm}>
          <textarea className={h.factInput} value={factText} maxLength={FACT_MAX * 2} placeholder={t(hc.factPlaceholder)} onChange={(event) => setFactText(event.target.value)} data-plan-home-fact-input="" />
          <span className={h.factCount}>{Array.from(factText.trim()).length} / {FACT_MAX}</span>
        </div>
      </Modal>
    </div>
  );
}

const ROW_LABEL = {
  about: hc.rowAbout,
  common: hc.rowCommon,
  last_contact: hc.rowLast,
  met: hc.rowMet,
  plan_fit: hc.rowFit,
  when_where: hc.rowWhen,
  who: hc.rowWho,
} as const;
