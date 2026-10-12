"use client";

import { useId, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanDraftView, PlanV2Content } from "../../../../../shared/contract/plan-v2";
import { PLAN_EVENT_COPY, planCopy } from "../../../../../shared/compute/plan-template-copy";
import { PLAN_EVENT_SLOT } from "../../../../../shared/compute/plan-templates";
import { planFlowCopy } from "../copy/plan";
import { Icon } from "../ui";
import { changedStepIndexes, flowTypeTone, typeLetters } from "./plan-model";
import type { Translate } from "./PlanParts";
import k from "./FlowKit.module.css";

const TONE_CLASS: Record<string, string> = { apricot: k.emoApricot!, blue: k.emoBlue!, lav: k.emoLav!, pink: k.emoPink!, teal: k.emoTeal! };

export function typeTileClass(index: number): string {
  return `${k.emo} ${TONE_CLASS[flowTypeTone(index)]}`;
}

/** b10 stepsMini: numbered steps with 目安 (changed ones in lavender) and type chips. */
export function StepsMini({ content, t, chips, highlight }: { content: Pick<PlanV2Content, "steps" | "personTypes">; t: Translate; chips?: boolean; highlight?: ReadonlySet<number> }) {
  const letters = typeLetters(content);
  const emojis = new Map(content.personTypes.map((type) => [type.key, type.emoji]));
  return (
    <ol className={k.libl}>
      {content.steps.map((step, index) => (
        <li key={step.key} className={k.pst} data-step={step.key}>
          <span className={k.v2snum}>{index + 1}</span>
          <div>
            <b>{step.title}</b>
            {step.doneCriteria ? (
              <span className={k.lbl}>{highlight?.has(index)
                ? <>{t(planFlowCopy.doneCriteria, { text: "" })}<span className={k.nw}>{step.doneCriteria}</span></>
                : t(planFlowCopy.doneCriteria, { text: step.doneCriteria })}</span>
            ) : null}
            {chips ? (
              <div className={`${k.chips} ${k.pstChips}`}>
                {step.personTypeKeys.map((key) => <span key={key} className={k.chip}>{key === PLAN_EVENT_SLOT ? "🎟️" : `${emojis.get(key) ?? ""} ${letters.get(key) ?? ""}`.trim()}</span>)}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The draft's name: the purpose the person picked, else the goal. */
export function draftName(draft: Pick<PlanDraftView, "purposeText" | "goal">): string {
  return draft.purposeText ?? draft.goal;
}

function FlowCells({ content }: { content: Pick<PlanV2Content, "flow"> }) {
  if (!content.flow?.length) return null;
  return (
    <div className={k.flow}>
      {content.flow.flatMap((cell, index) => [
        index > 0 ? <div key={`ar${index}`} className={k.ar} aria-hidden><Icon name="right" size={16} /></div> : null,
        <div key={`${cell.label}:${index}`} className={index === 0 ? k.pay : undefined}><span className={k.e} aria-hidden>{cell.emoji}</span><b>{cell.label}</b><span className={k.lbl}>{cell.note}</span></div>,
      ])}
    </div>
  );
}

/**
 * 初版 / 方案 card — `full` = b10 firstWebCard (left 見立て + 結論 + 業界の現状, right Steps +
 * types); `mini` = firstCard({ top, clamp }) (見立て 4 lines + 結論) used once AI 修正 is used up.
 */
export function DraftCard({ draft, t, language, mini }: { draft: PlanDraftView; t: Translate; language: OrbitLanguage; mini?: boolean }) {
  const [why, setWhy] = useState(false);
  const [full, setFull] = useState(false);
  // Web opens the citations by default (wide screens have room; UI-SPEC ②).
  const [citationsOpen, setCitationsOpen] = useState(true);
  const citationsId = useId();
  const whyId = useId();
  const content = draft.content;
  const letters = typeLetters(content);
  const head = (
    <div className={`${k.row} ${k.firstHead}`}>
      <span className={`${k.emo} ${k.emoTeal}`} aria-hidden>🧭</span>
      <div className={k.grow}><div className={k.lbl}>{t(planFlowCopy.draftTitle)}</div><b>{draftName(draft)}</b></div>
      <button type="button" className={`btn ${k.why}`} aria-expanded={why} aria-controls={whyId} aria-label={t(planFlowCopy.draftTitle)} onClick={() => setWhy(!why)}>?</button>
    </div>
  );
  const whyBody = why ? <div id={whyId} className={k.whyBody}>{content.basis.map((item) => item.label).join(" · ")}</div> : null;
  const mitate = (clamp: boolean) => (
    <div className={k.jsec}>
      <span className={k.lbl}>{t(planFlowCopy.diagnosis)}</span>
      {clamp ? <><span className={k.clamp4}>{content.diagnosis}</span><button type="button" className={`btn ${k.v2go} ${k.readMore}`} onClick={() => setFull(true)}>{t(planFlowCopy.readMore)}<Icon name="down" size={16} /></button></> : content.diagnosis}
    </div>
  );
  const ketsu = (
    <div className={`${k.jsec} ${k.ketsu}`}>
      <span className={k.lbl}>{t(planFlowCopy.conclusion)}</span>
      <b>{content.conclusion}</b>
      <FlowCells content={content} />
    </div>
  );
  if (mini) {
    return (
      <div className={`${k.card} ${k.firstMini}`} data-plan-draft="mini">
        {head}
        {mitate(!full)}
        {whyBody}
        {ketsu}
      </div>
    );
  }
  return (
    <div className={`${k.card} ${k.firstCard}`} data-plan-draft="">
      {head}
      {whyBody}
      <div className={k.firstGrid}>
        <div>
          {mitate(false)}
          {ketsu}
          {draft.citations.length ? (
            <div className={`${k.acc} ${citationsOpen ? k.accOpen : ""}`} data-plan-citations={citationsOpen ? "open" : "closed"}>
              <button type="button" className={`btn ${k.accH}`} aria-expanded={citationsOpen} aria-controls={citationsId} onClick={() => setCitationsOpen(!citationsOpen)}>
                <Icon name="book" size={16} /><b>{t(planFlowCopy.citationsHead)}</b><span className={k.chip}>{t(planFlowCopy.citationsCount, { count: draft.citations.length })}</span>
                <span className={k.chev}><Icon name="down" size={16} /></span>
              </button>
              {citationsOpen ? (
                <div id={citationsId}>
                  <ol className={k.libl}>
                    {draft.citations.map((citation, index) => (
                      <li key={`${citation.id}@${citation.version}`} className={k.lib}>
                        <span className={k.ln}>{index + 1}</span>
                        <div className={k.lm}>
                          <b>{citation.title}</b>{citation.summary}
                          <div className={k.meta3}>
                            <span>{citation.id}</span>
                            <span>{t(planFlowCopy.citationVersion, { date: citation.updatedOn.slice(0, 7), version: citation.version })}</span>
                            <a href={citation.sourceUrl} target="_blank" rel="noopener noreferrer">{t(planFlowCopy.citationSource, { label: citation.sourceLabel })}</a>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className={k.fact}><Icon name="book" size={16} />{t(planFlowCopy.citationsNote)}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div>
          <div className={`${k.fsec} ${k.fsecTop}`}><span className={k.lbl}>{t(planFlowCopy.stepsTitle)}</span><StepsMini content={content} t={t} chips /></div>
          <div className={k.fsec}>
            <span className={k.lbl}>{content.allocationReasons.length ? t(planFlowCopy.typesTitleAdjusted, { count: content.allocationReasons.length }) : t(planFlowCopy.typesTitle)}</span>
            {content.personTypes.map((type, index) => (
              <div key={type.key} className={k.trow} data-type={type.key}>
                <span className={typeTileClass(index)} aria-hidden>{type.emoji}</span>
                <div className={k.tm}><b>{letters.get(type.key)} {type.shortLabel}</b><span className={k.lbl}>{type.roleSituation}</span></div>
                <span className={k.pt}>{type.allocation}<small> {t(planFlowCopy.typePoints, { count: type.targetCount, points: "" }).trim()}</small></span>
              </div>
            ))}
            <div className={k.trow} data-type={PLAN_EVENT_SLOT}>
              <span className={`${k.emo} ${k.emoApricot}`} aria-hidden>🎟️</span>
              <div className={k.tm}><b>{planCopy(PLAN_EVENT_COPY, language)}</b><span className={k.lbl}>{t(planFlowCopy.eventRole)}</span></div>
              <span className={k.pt}>{content.event.allocation}<small> {t(planFlowCopy.eventPoints, { count: content.event.targetCount, points: "" }).trim()}</small></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Each AI revision: what the person wrote, then the update card (b10 updCard, ⑤). */
export function DraftTurns({ draft, t, only }: { draft: PlanDraftView; t: Translate; only?: number }) {
  if (!draft.turns.length) return null;
  const turns = only ? draft.turns.filter((turn) => turn.n === only) : draft.turns;
  return (
    <>
      {turns.map((turn) => <TurnBlock key={turn.n} turn={turn} limit={draft.aiFixLimit} t={t} />)}
    </>
  );
}

function TurnBlock({ turn, limit, t }: { turn: PlanDraftView["turns"][number]; limit: number; t: Translate }) {
  const [why, setWhy] = useState(false);
  return (
    <>
      <p id={`plan-turn-${turn.n}`} className={`${k.bubble} ${k.bubbleMe}`} aria-label={t(planFlowCopy.yourMessage)} data-turn-say={turn.n}>{turn.input}</p>
      <div className={`${k.card} ${k.qCard}`} data-turn={turn.n}>
        <div className={k.row} style={{ gap: 8 }}>
          <span className={`${k.emo} ${k.emoTeal}`} aria-hidden>🧭</span>
          <div className={k.grow}><div className={k.lbl}>{t(planFlowCopy.turnKicker, { limit, n: turn.n })}</div><b className={k.turnTitle}>{t(turn.changes.length ? planFlowCopy.turnUpdated : planFlowCopy.noChange)}</b></div>
          <button type="button" className={`btn ${k.why}`} aria-expanded={why} aria-label={t(planFlowCopy.turnKicker, { limit, n: turn.n })} onClick={() => setWhy(!why)}>?</button>
        </div>
        {turn.changes.length ? (
          <>
            <div className={k.diff}>
              {turn.changes.map((change) => (
                <div key={change.path} className={k.dl} data-change={change.path}>
                  <span className={k.chgtag}>{t(planFlowCopy.changedTag)}</span>
                  <span className={k.lbl}>{change.label}</span>
                  {change.before ? <s>{change.before}</s> : null}
                  {change.after ? <span className={k.dlNew}>{change.after}</span> : null}
                </div>
              ))}
            </div>
            {turn.unchanged.length ? <div className={k.sameLine}>{t(planFlowCopy.unchanged, { list: turn.unchanged.join(" · ") })}</div> : null}
          </>
        ) : (
          <div className={`${k.sameLine} ${k.sameLineGap}`}>{turn.noChangeReason ?? t(planFlowCopy.noChange)}</div>
        )}
        {why && turn.changes.some((change) => change.reason) ? <div className={k.whyBody}>{turn.changes.map((change) => change.reason).filter(Boolean).join(" · ")}</div> : null}
      </div>
    </>
  );
}
