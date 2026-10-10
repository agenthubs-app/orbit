"use client";

import { useId, useRef, useState } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PlanDraftView } from "../../../../../shared/contract/plan-v2";
import { PLAN_EVENT_COPY, planCopy } from "../../../../../shared/compute/plan-template-copy";
import { PLAN_EVENT_SLOT } from "../../../../../shared/compute/plan-templates";
import { planFlowCopy } from "../copy/plan";
import { Button, Card, Chip, Icon } from "../ui";
import { changedStepIndexes, changedTypeKeys, turnPreview, typeLetters } from "./plan-model";
import type { Translate } from "./PlanParts";
import styles from "./plan.module.css";

/** Type chips of a step: letters A/B/C… in the plan's order, 🎟️ for the event block. */
function TypeChips({ keys, letters, emojis }: { keys: readonly string[]; letters: Map<string, string>; emojis: Map<string, string> }) {
  return (
    <span className={styles.letterChips}>
      {keys.map((key) => <Chip key={key} label={key === PLAN_EVENT_SLOT ? "🎟️" : `${emojis.get(key) ?? ""} ${letters.get(key) ?? ""}`.trim()} />)}
    </span>
  );
}

/** 初版 / 方案 card (b10 ④ · Web: left 見立て + 結論 + 業界の現状, right Steps + types). */
export function DraftCard({ draft, t, language }: { draft: PlanDraftView; t: Translate; language: OrbitLanguage }) {
  const [why, setWhy] = useState(false);
  const [allocationWhy, setAllocationWhy] = useState(false);
  // Web opens the citations by default (wide screens have room; UI-SPEC ②).
  const [citationsOpen, setCitationsOpen] = useState(true);
  const citationsId = useId();
  const content = draft.content;
  const letters = typeLetters(content);
  const emojis = new Map(content.personTypes.map((type) => [type.key, type.emoji]));
  const changedSteps = changedStepIndexes(draft);
  const changedTypes = changedTypeKeys(draft);
  return (
    <Card data-plan-draft="">
      <div className={`${styles.row} ${styles.between}`}>
        <span className={styles.row}><span aria-hidden>🧭</span><b className={styles.h3}>{t(planFlowCopy.draftTitle)}</b></span>
        <button type="button" className={`btn ${styles.iconButton}`} aria-expanded={why} aria-label={t(planFlowCopy.draftTitle)} onClick={() => setWhy(!why)}>?</button>
      </div>
      <p className={styles.title}>{draft.purposeText ?? draft.goal}</p>
      {why ? <div className={styles.whyBox}><ul>{content.basis.map((item) => <li key={`${item.kind}:${item.ref}`}>{item.label}</li>)}</ul></div> : null}
      <div className={`${styles.draftGrid} ${styles.field}`}>
        <div className={styles.stack}>
          <section className={styles.section}>
            <b className={styles.h3}>{t(planFlowCopy.diagnosis)}</b>
            <p className={styles.para}>{content.diagnosis}</p>
          </section>
          <section className={styles.section}>
            <b className={styles.h3}>{t(planFlowCopy.conclusion)}</b>
            <p className={styles.conclusion}>{content.conclusion}</p>
            {content.flow?.length ? (
              <div className={styles.flowCells}>
                {content.flow.map((cell) => <div key={`${cell.label}:${cell.note}`} className={styles.flowCell}><span aria-hidden>{cell.emoji}</span><b>{cell.label}</b><span>{cell.note}</span></div>)}
              </div>
            ) : null}
          </section>
          {draft.citations.length ? (
            <section className={styles.section} data-plan-citations={citationsOpen ? "open" : "closed"}>
              <button type="button" className={`btn ${styles.disclosureButton}`} aria-expanded={citationsOpen} aria-controls={citationsId} onClick={() => setCitationsOpen(!citationsOpen)}>
                <span>{t(planFlowCopy.citationsTitle, { count: draft.citations.length })}</span>
                <Icon name={citationsOpen ? "up" : "down"} size={16} />
              </button>
              {citationsOpen ? (
                <div id={citationsId} className={styles.stack}>
                  <ol className={styles.citations}>
                    {draft.citations.map((citation, index) => (
                      <li key={`${citation.id}@${citation.version}`} className={styles.citation}>
                        <span className={styles.num}>{index + 1}</span>
                        <div className={styles.citationBody}>
                          <b>{citation.title}</b>
                          <span>{citation.summary}</span>
                          <span className={styles.citationMeta}>
                            <span>{citation.id}</span>
                            <span>{t(planFlowCopy.citationVersion, { date: citation.updatedOn, version: citation.version })}</span>
                            <a className={styles.link} href={citation.sourceUrl} target="_blank" rel="noopener noreferrer">{t(planFlowCopy.citationSource, { label: citation.sourceLabel })}</a>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <p className={styles.label}>{t(planFlowCopy.citationsNote)}</p>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
        <div className={styles.stack}>
          <section className={styles.section}>
            <b className={styles.h3}>{t(planFlowCopy.stepsTitle)}</b>
            <ol className={styles.citations}>
              {content.steps.map((step, index) => (
                <li key={step.key} className={`${styles.planStep} ${changedSteps.has(index) ? styles.changed : ""}`} data-step={step.key}>
                  <span className={styles.num}>{index + 1}</span>
                  <div className={styles.planStepBody}>
                    <span className={styles.planStepTitle}>{step.title}</span>
                    {step.doneCriteria ? <span className={styles.muted}>{t(planFlowCopy.doneCriteria, { text: step.doneCriteria })}</span> : null}
                    <TypeChips keys={step.personTypeKeys} letters={letters} emojis={emojis} />
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className={styles.section}>
            <div className={`${styles.row} ${styles.between}`}>
              <b className={styles.h3}>{t(planFlowCopy.typesTitle)}</b>
              {content.allocationReasons.length ? <button type="button" className={`btn ${styles.iconButton}`} aria-expanded={allocationWhy} aria-label={t(planFlowCopy.allocationWhy)} onClick={() => setAllocationWhy(!allocationWhy)}>?</button> : null}
            </div>
            {allocationWhy ? <div className={styles.whyBox}><ul>{content.allocationReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
            <div>
              {content.personTypes.map((type) => (
                <div key={type.key} className={`${styles.typeRow} ${changedTypes.has(type.key) ? styles.changed : ""}`} data-type={type.key}>
                  <span className={styles.emoji} aria-hidden>{type.emoji}</span>
                  <div className={styles.typeBody}>
                    <b className={styles.typeName}>{letters.get(type.key)} {type.shortLabel}</b>
                    <span className={styles.muted}>{type.roleSituation}</span>
                  </div>
                  <span className={styles.points}>{t(planFlowCopy.typePoints, { count: type.targetCount, points: type.allocation })}</span>
                </div>
              ))}
              <div className={styles.typeRow} data-type={PLAN_EVENT_SLOT}>
                <span className={styles.emoji} aria-hidden>🎟️</span>
                <div className={styles.typeBody}><b className={styles.typeName}>{planCopy(PLAN_EVENT_COPY, language)}</b></div>
                <span className={styles.points}>{t(planFlowCopy.eventPoints, { count: content.event.targetCount, points: content.event.allocation })}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Card>
  );
}

/** Each AI revision: what the person wrote, then only the changes (b10 ⑤). */
export function DraftTurns({ draft, t }: { draft: PlanDraftView; t: Translate }) {
  if (!draft.turns.length) return null;
  const jump = (n: number) => document.getElementById(`plan-turn-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className={styles.stack} data-plan-turns="">
      {draft.turns.length > 1 ? (
        <nav className={styles.history} aria-label={t(planFlowCopy.historyLabel)}>
          <span className={styles.label}>{t(planFlowCopy.historyLabel)}</span>
          {draft.turns.map((turn) => <button key={turn.n} type="button" className={`btn ${styles.historyChip}`} onClick={() => jump(turn.n)}>{t(planFlowCopy.turnChip, { n: turn.n, text: turnPreview(turn.input) })}</button>)}
        </nav>
      ) : null}
      {draft.turns.map((turn) => (
        <section key={turn.n} id={`plan-turn-${turn.n}`} className={styles.turn} data-turn={turn.n}>
          <p className={styles.bubble} aria-label={t(planFlowCopy.yourMessage)}>{turn.input}</p>
          <Card>
            <div className={styles.row}><span aria-hidden>🧭</span><b className={styles.h3}>{t(planFlowCopy.turnTitle, { limit: draft.aiFixLimit, n: turn.n })}</b></div>
            {turn.changes.length === 0 ? (
              <p className={styles.muted}><b>{t(planFlowCopy.noChange)}</b>{turn.noChangeReason ? ` · ${turn.noChangeReason}` : ""}</p>
            ) : (
              <div>
                {turn.changes.map((change) => (
                  <div key={change.path} className={styles.change} data-change={change.path}>
                    <span className={styles.row}><Chip label={t(planFlowCopy.changedTag)} tone="lav" /><b>{change.label}</b></span>
                    {change.before ? <span className={styles.before}>{change.before}</span> : null}
                    {change.after ? <span><span className={styles.after}>{change.after}</span></span> : null}
                  </div>
                ))}
              </div>
            )}
            {turn.unchanged.length ? <p className={styles.label}>{t(planFlowCopy.unchanged, { list: turn.unchanged.join(" · ") })}</p> : null}
          </Card>
        </section>
      ))}
    </div>
  );
}

/** 「AI 修正 あと N 回」 above the input; used up → input off, only manual edit / confirm (b10 ④⑤). */
export function FixBar({ draft, t, busy, onFix, onManual, onConfirm }: {
  draft: PlanDraftView;
  t: Translate;
  busy: string | null;
  onFix: (text: string) => Promise<boolean>;
  onManual: () => void;
  onConfirm: () => void;
}) {
  const [text, setText] = useState("");
  const sending = useRef(false);
  const inputId = useId();
  const left = Math.max(0, draft.aiFixLimit - draft.aiFixUsed);
  const usedUp = left === 0;
  const send = async () => {
    const value = text.trim();
    if (!value || usedUp || sending.current) return;
    sending.current = true;
    const ok = await onFix(value);
    sending.current = false;
    if (ok) setText("");
  };
  return (
    <section className={styles.fixBar} data-plan-fixbar="" data-left={left}>
      <div className={`${styles.row} ${styles.between}`}>
        <span className={styles.fixCount}>
          <span className={styles.h3}>{t(planFlowCopy.fixLeftBefore)}</span>
          <b className={styles.fixNumber} data-plan-fix-left="">{left}</b>
          <span className={styles.label}>{t(planFlowCopy.fixLeftAfter, { limit: draft.aiFixLimit })}</span>
        </span>
        <span className={styles.label}>{t(planFlowCopy.fixFreeNote)}</span>
      </div>
      {usedUp ? (
        <p className={styles.muted} data-plan-fix-usedup="">{t(planFlowCopy.fixUsedUp)} {t(planFlowCopy.fixCountsNote)}</p>
      ) : (
        <p className={styles.label}>{t(planFlowCopy.fixTip)} {t(planFlowCopy.fixExample)}</p>
      )}
      <label className={styles.label} htmlFor={inputId}>{t(planFlowCopy.fixPlaceholder)}</label>
      <textarea id={inputId} className={styles.textInput} value={text} placeholder={t(planFlowCopy.fixPlaceholder)} maxLength={1000} disabled={usedUp || Boolean(busy)}
        onChange={(event) => setText(event.target.value)} />
      <div className={styles.row}>
        <Button variant="primary" icon="sparkle" label={t(planFlowCopy.fixSend)} loading={busy === "fix"} disabled={usedUp || !text.trim() || Boolean(busy)} onClick={() => void send()} />
        <span className={styles.push} />
        <Button label={t(planFlowCopy.manualEdit)} disabled={!draft.manualEditAvailable || Boolean(busy)} onClick={onManual} />
        <Button variant="accent" label={t(planFlowCopy.confirmPlan)} loading={busy === "confirm"} disabled={Boolean(busy)} onClick={onConfirm} />
      </div>
      {!usedUp ? <p className={styles.label}>{t(planFlowCopy.fixCountsNote)}</p> : null}
    </section>
  );
}
