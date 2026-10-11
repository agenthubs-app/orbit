"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PlanConfirmResult, PlanDraftView } from "../../../../../shared/contract/plan-v2";
import { changeAllocation, changeTargetCount, removeSlot, PLAN_EVENT_TARGET_MAX, PLAN_TYPE_TARGET_MAX, type PlanAllocationError, type PlanAllocationMove, type PlanAllocationSlot } from "../../../../../shared/compute/plan-allocation";
import { planFlowHref, planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { PLAN_EVENT_COPY, PLAN_SHORT_NAME_COPY, planCopy } from "../../../../../shared/compute/plan-template-copy";
import { PLAN_EVENT_SLOT, PLAN_GOAL_TEMPLATES } from "../../../../../shared/compute/plan-templates";
import { useOrbitLanguage } from "../../orbit-language-context";
import { planFlowCopy, planReviewCopy } from "../copy/plan";
import type { OrbitCopyEntry } from "../copy/types";
import { ShellPage } from "../shell/slots";
import { standardCopyFor } from "../copy/standard";
import { Button, Card, Chip, FilterOption, Icon, Modal, Orbit2026Scope, Skeleton, ToastProvider } from "../ui";
import { newActionKey, planApi } from "./plan-api";
import { setPlanFlash } from "./plan-flash";
import {
  PLAN_STEP_LIMIT,
  allocationSlotsOf,
  editChanges,
  isFullTotal,
  isGoalKind,
  moveItem,
  planErrorView,
  stepsOf,
  totalOf,
  typeLetter,
  unitsOf,
  unusedTemplateSlots,
  type EditChange,
  type EditStep,
  type PlanErrorView,
} from "./plan-model";
import { PlanErrorNotice, translator, type Translate } from "./PlanParts";
import styles from "./plan.module.css";

type TypeInfo = { emoji: string; letter: string; shortLabel: string; roleSituation: string };

const CHANGE_KIND: Record<EditChange["kind"], OrbitCopyEntry> = {
  addStep: planFlowCopy.changeKindAdd,
  addType: planFlowCopy.changeKindAdd,
  count: planFlowCopy.changeKindCount,
  done: planFlowCopy.changeKindDone,
  name: planFlowCopy.changeKindName,
  order: planFlowCopy.changeKindOrder,
  points: planFlowCopy.changeKindPoints,
  removeStep: planFlowCopy.changeKindRemove,
  removeType: planFlowCopy.changeKindRemove,
};

/** R25 复核 S1: why a move was refused, in words (earned points, skips and counted people are kept). */
function allocationErrorCopy(error: PlanAllocationError): OrbitCopyEntry {
  switch (error) {
    case "no_room": return planFlowCopy.noRoom;
    case "below_earned": return planFlowCopy.belowEarned;
    case "skipped_locked": return planFlowCopy.skippedLocked;
    case "target_below_met": return planFlowCopy.targetBelowMet;
    case "cannot_remove_with_points": return planFlowCopy.removeWithPoints;
    default: return planFlowCopy.notMultiple;
  }
}

export function changeText(change: EditChange, t: Translate): string {
  switch (change.kind) {
    case "name": return t(planFlowCopy.changeName, { from: change.from, n: change.n, to: change.to });
    case "done": return t(planFlowCopy.changeDone, { n: change.n });
    case "order": return t(planFlowCopy.changeOrder, { from: change.from, title: change.title, to: change.to });
    case "addStep": return t(planFlowCopy.changeAddStep, { title: change.title });
    case "removeStep": return t(planFlowCopy.changeRemoveStep, { title: change.title });
    case "points": return t(planFlowCopy.changePoints, { from: change.from, to: change.to, type: change.type });
    case "count": {
      const units = unitsOf(change.allocation, change.to);
      const text = units.even === false ? t(planFlowCopy.unitsUneven, { last: units.last, points: units.points }) : t(planFlowCopy.unitsEven, { points: units.points });
      return t(planFlowCopy.changeCount, { from: change.from, to: change.to, type: change.type, units: text });
    }
    case "addType": return t(planFlowCopy.changeAddType, { type: change.type });
    case "removeType": return t(planFlowCopy.changeRemoveType, { type: change.type });
  }
}

/** ③ 手動編集 (`/app/plans/drafts/[draftId]/edit`): once, saving confirms; total stays 100. */
export function PlanManualEditScreen({ draftId }: { draftId: string }) {
  const { language } = useOrbitLanguage();
  const t = translator(language);
  // This component renders its own scope, so read the standard words by language.
  const std = standardCopyFor(language);
  const router = useRouter();
  const [draft, setDraft] = useState<PlanDraftView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [steps, setSteps] = useState<EditStep[]>([]);
  const [slots, setSlots] = useState<PlanAllocationSlot[]>([]);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [allocError, setAllocError] = useState<{ key: string; text: OrbitCopyEntry } | null>(null);
  const [lastMoves, setLastMoves] = useState<PlanAllocationMove[]>([]);
  const [removing, setRemoving] = useState<{ key: string; slots: PlanAllocationSlot[]; moves: PlanAllocationMove[]; points: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failed, setFailed] = useState<PlanErrorView | null>(null);
  const counter = useRef(0);

  const reset = useCallback((source: PlanDraftView) => {
    setSteps(stepsOf(source.content));
    const next = allocationSlotsOf(source.goalKind, source.content, source.slotState ?? []);
    setSlots(next);
    setInputs(Object.fromEntries(next.map((slot) => [slot.key, String(slot.allocation)])));
    setMoved(new Set());
    setAllocError(null);
    setLastMoves([]);
    setFailed(null);
  }, []);

  const load = useCallback(async () => {
    setLoadFailed(false);
    const result = await planApi<PlanDraftView>(`/drafts/${encodeURIComponent(draftId)}`, { language });
    if (!result.ok) { setLoadFailed(true); return; }
    setDraft(result.data);
    reset(result.data);
  }, [draftId, language, reset]);

  useEffect(() => { void load(); }, [load]);

  const info = useMemo(() => {
    const map = new Map<string, TypeInfo>();
    if (!draft) return map;
    const templateSlots = isGoalKind(draft.goalKind) ? PLAN_GOAL_TEMPLATES[draft.goalKind].slots : [];
    let index = 0;
    for (const slot of slots) {
      if (slot.key === PLAN_EVENT_SLOT) continue;
      const type = draft.content.personTypes.find((item) => item.key === slot.key);
      const shortLabel = type?.shortLabel ?? (PLAN_SHORT_NAME_COPY[slot.key] ? planCopy(PLAN_SHORT_NAME_COPY[slot.key]!, language) : slot.key);
      map.set(slot.key, { emoji: type?.emoji ?? templateSlots.find((item) => item.slot === slot.key)?.emoji ?? "👤", letter: typeLetter(index), roleSituation: type?.roleSituation ?? shortLabel, shortLabel });
      index += 1;
    }
    map.set(PLAN_EVENT_SLOT, { emoji: "🎟️", letter: "", roleSituation: "", shortLabel: planCopy(PLAN_EVENT_COPY, language) });
    return map;
  }, [draft, slots, language]);

  const typeName = useCallback((key: string) => {
    const item = info.get(key);
    if (!item) {
      const type = draft?.content.personTypes.find((entry) => entry.key === key);
      return type ? type.shortLabel : key;
    }
    return item.letter ? `${item.letter} ${item.shortLabel}` : item.shortLabel;
  }, [info, draft]);

  const changes = useMemo(() => (draft ? editChanges({ content: draft.content, moved, slots, steps, typeName }) : []), [draft, moved, slots, steps, typeName]);

  const rail = useMemo(() => (
    <div className={styles.rail} data-plan-rail="changes">
      <b className={styles.railHead}>{t(planFlowCopy.changesTitle)}</b>
      {changes.length === 0 ? <p className={styles.label}>{t(planFlowCopy.noChanges)}</p> : (
        <ul className={styles.changesList}>
          {changes.map((change, index) => (
            <li key={`${change.kind}:${change.anchor}:${index}`}>
              <button type="button" className={`btn ${styles.changeItem}`} onClick={() => { const target = document.getElementById(change.anchor); target?.scrollIntoView({ behavior: "smooth", block: "center" }); target?.querySelector<HTMLElement>("input, button")?.focus(); }}>
                <Chip label={t(CHANGE_KIND[change.kind])} tone="lav" />
                <span>{changeText(change, t)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
    // t follows language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [changes, language]);

  const shell = <ShellPage title={t(planFlowCopy.editTitle)} subtitle={t(planFlowCopy.editSub)} rightRail={draft ? rail : false} />;

  if (loadFailed) return <Orbit2026Scope language={language} className={styles.page}>{shell}<PlanErrorNotice view={{ op: "other", tone: "failure" }} t={t} onRetry={() => void load()} /></Orbit2026Scope>;
  if (!draft) return <Orbit2026Scope language={language} className={styles.page}>{shell}<Skeleton lines={6} onRetry={() => void load()} /></Orbit2026Scope>;

  if (!draft.manualEditAvailable || draft.status !== "open") {
    return (
      <Orbit2026Scope language={language} className={styles.page}>
        {shell}
        <PlanErrorNotice view={{ notice: "used", tone: "notice" }} t={t} />
        {draft.intakeId ? <div className={styles.blockActions}><Button label={t(planFlowCopy.backToFlow)} onClick={() => router.push(planFlowHref("web", draft.intakeId!))} /></div> : null}
        {/* R25: a review draft (見直し or 手動で編集 from the overview) goes back to the plan. */}
        {draft.kind === "review" && draft.planId ? <div className={styles.blockActions}><Button label={t(planReviewCopy.later)} onClick={() => router.push(planTaskSegmentHref("web", draft.planId))} data-plan-edit-back="" /></div> : null}
      </Orbit2026Scope>
    );
  }

  const total = totalOf(slots);
  const stepsValid = steps.length >= 1 && steps.length <= PLAN_STEP_LIMIT && steps.every((step) => step.title.trim());
  const canStart = isFullTotal(slots) && stepsValid && !busy;

  const updateStep = (uid: string, patch: Partial<EditStep>) => setSteps((current) => current.map((step) => (step.uid === uid ? { ...step, ...patch } : step)));
  const moveStep = (uid: string, to: number) => {
    setSteps((current) => moveItem(current, current.findIndex((step) => step.uid === uid), to));
    setMoved((current) => new Set(current).add(uid));
  };
  const addStep = () => {
    if (steps.length >= PLAN_STEP_LIMIT) return;
    counter.current += 1;
    const uid = `new-${counter.current}`;
    setSteps((current) => [...current, { doneCriteria: "", key: null, personTypeKeys: [], title: "", uid }]);
    window.setTimeout(() => document.querySelector<HTMLInputElement>(`#plan-edit-step-${uid} input`)?.focus(), 0);
  };

  const applyResult = (result: ReturnType<typeof changeAllocation>, key: string) => {
    if (result.ok === false) {
      setAllocError({ key, text: allocationErrorCopy(result.error) });
      setInputs((current) => ({ ...current, [key]: String(slots.find((slot) => slot.key === key)?.allocation ?? 0) }));
      return;
    }
    setAllocError(null);
    setSlots(result.slots);
    setInputs(Object.fromEntries(result.slots.map((slot) => [slot.key, String(slot.allocation)])));
    if (result.moves.length) setLastMoves(result.moves);
  };
  const commitAllocation = (key: string) => {
    const raw = (inputs[key] ?? "").trim();
    const value = Number(raw);
    const current = slots.find((slot) => slot.key === key);
    if (!current || String(current.allocation) === raw) return;
    if (!raw || !Number.isInteger(value) || value % 5 !== 0 || value < 0 || value > 100) {
      setAllocError({ key, text: planFlowCopy.notMultiple });
      return;
    }
    applyResult(changeAllocation(slots, key, value), key);
  };
  const stepCount = (key: string, delta: number) => {
    const slot = slots.find((item) => item.key === key);
    if (!slot) return;
    const result = changeTargetCount(slots, key, slot.targetCount + delta);
    if (result.ok) setSlots(result.slots);
  };
  const askRemove = (key: string) => {
    const result = removeSlot(slots, key);
    if (result.ok === false) { setAllocError({ key, text: allocationErrorCopy(result.error) }); return; }
    setRemoving({ key, moves: result.moves.filter((move) => move.key !== key), points: slots.find((slot) => slot.key === key)?.allocation ?? 0, slots: result.slots });
  };
  const confirmRemove = () => {
    if (!removing) return;
    setSlots(removing.slots);
    setInputs(Object.fromEntries(removing.slots.map((slot) => [slot.key, String(slot.allocation)])));
    setLastMoves(removing.moves);
    setSteps((current) => current.map((step) => ({ ...step, personTypeKeys: step.personTypeKeys.filter((key) => key !== removing.key) })));
    setRemoving(null);
  };
  const addType = (slotId: string) => {
    const template = isGoalKind(draft.goalKind) ? PLAN_GOAL_TEMPLATES[draft.goalKind].slots.find((slot) => slot.slot === slotId) : null;
    const original = draft.content.personTypes.find((type) => type.key === slotId);
    const eventIndex = slots.findIndex((slot) => slot.key === PLAN_EVENT_SLOT);
    const added: PlanAllocationSlot = { allocation: 0, earnedBase: 0, key: slotId, metCount: 0, skipped: false, targetCount: original?.targetCount ?? template?.targetCount ?? 1, templateIndex: isGoalKind(draft.goalKind) ? PLAN_GOAL_TEMPLATES[draft.goalKind].slots.findIndex((slot) => slot.slot === slotId) : 99 };
    const next = [...slots];
    next.splice(eventIndex === -1 ? next.length : eventIndex, 0, added);
    setSlots(next);
    setInputs((current) => ({ ...current, [slotId]: "0" }));
    setAdding(false);
  };

  const start = async () => {
    if (!canStart || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(null);
    const kept = new Set(slots.map((slot) => slot.key));
    const original = new Set(draft.content.personTypes.map((type) => type.key));
    const event = slots.find((slot) => slot.key === PLAN_EVENT_SLOT)!;
    const result = await planApi<PlanConfirmResult>(`/drafts/${encodeURIComponent(draft.draftId)}/manual-edit`, {
      body: {
        event: { allocation: event.allocation, targetCount: event.targetCount },
        expectedRevision: draft.revision,
        idempotencyKey: newActionKey(),
        personTypes: slots.filter((slot) => slot.key !== PLAN_EVENT_SLOT).map((slot) => (original.has(slot.key)
          ? { allocation: slot.allocation, key: slot.key, targetCount: slot.targetCount }
          : { allocation: slot.allocation, key: null, slot: slot.key, targetCount: slot.targetCount })),
        steps: steps.map((step) => ({ doneCriteria: step.doneCriteria.trim(), key: step.key, personTypeKeys: step.personTypeKeys.filter((key) => kept.has(key)), title: step.title.trim() })),
      },
      language,
    });
    busyRef.current = false;
    setBusy(false);
    if (result.ok === false) { setFailed(planErrorView(result.error, "other")); return; }
    // R25: saving a review draft confirms it in place → back to the overview with 「方案を更新しました」.
    if (draft.kind === "review") setPlanFlash("updated");
    router.push(result.data.href);
  };

  const unused = unusedTemplateSlots(draft.goalKind, slots.map((slot) => slot.key));
  const typeSlots = slots.filter((slot) => slot.key !== PLAN_EVENT_SLOT);

  return (
    <Orbit2026Scope language={language} className={styles.page}>
      <ToastProvider>
        {shell}
        <div className={styles.editHead} data-plan-edit="">
          <div className={styles.grow}>
            <p className={styles.title}>{draft.purposeText ?? draft.goal}</p>
            <p className={styles.label}>{t(planFlowCopy.editSub)}</p>
          </div>
          {draft.kind === "review" && draft.planId ? <Button variant="ghost" label={t(planReviewCopy.later)} onClick={() => router.push(planTaskSegmentHref("web", draft.planId))} data-plan-edit-back="" /> : null}
          <Button icon="undo" label={std.action.undo} onClick={() => reset(draft)} data-plan-reset="" />
        </div>
        <div className={styles.grid}>
          <Card className={styles.span5} id="plan-edit-steps" title={t(planFlowCopy.editSteps)}>
            <p className={styles.label}>{t(planFlowCopy.editStepsHint)}</p>
            <ol className={`${styles.stack} ${styles.field} ${styles.citations}`}>
              {steps.map((step, index) => {
                const origin = step.key ? draft.content.steps.find((item) => item.key === step.key) : null;
                return (
                  <li key={step.uid} id={`plan-edit-step-${step.uid}`} className={styles.editStep} draggable data-dragging={dragging === step.uid ? "" : undefined} data-step-uid={step.uid}
                    onDragStart={(event) => { setDragging(step.uid); event.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => { event.preventDefault(); if (dragging && dragging !== step.uid) moveStep(dragging, index); setDragging(null); }}>
                    <span className={styles.handle} aria-hidden><Icon name="menu" size={16} /></span>
                    <span className={styles.num}>{index + 1}</span>
                    <div className={styles.editStepBody}>
                      <input className={`${styles.inlineText} ${styles.inlineTitle}`} aria-label={t(planFlowCopy.stepTitleLabel)} value={step.title} placeholder={t(planFlowCopy.stepTitleLabel)} maxLength={120}
                        onChange={(event) => updateStep(step.uid, { title: event.target.value })} />
                      {origin && origin.title !== step.title.trim() ? <span className={styles.label}>{t(planFlowCopy.origin, { title: origin.title })}</span> : null}
                      <input className={styles.inlineText} aria-label={t(planFlowCopy.stepDoneLabel)} value={step.doneCriteria} placeholder={t(planFlowCopy.stepDoneLabel)} maxLength={300}
                        onChange={(event) => updateStep(step.uid, { doneCriteria: event.target.value })} />
                      {!step.key ? (
                        <div className={styles.options} role="group" aria-label={t(planFlowCopy.stepTypesLabel)}>
                          {typeSlots.map((slot) => {
                            const on = step.personTypeKeys.includes(slot.key);
                            return <FilterOption key={slot.key} label={typeName(slot.key)} selected={on} onToggle={() => updateStep(step.uid, { personTypeKeys: on ? step.personTypeKeys.filter((key) => key !== slot.key) : [...step.personTypeKeys, slot.key] })} />;
                          })}
                        </div>
                      ) : null}
                    </div>
                    <div className={styles.stepTools}>
                      <button type="button" className={`btn ${styles.stepperButton}`} aria-label={t(planFlowCopy.moveUp)} disabled={index === 0} onClick={() => moveStep(step.uid, index - 1)}><Icon name="up" size={16} /></button>
                      <button type="button" className={`btn ${styles.stepperButton}`} aria-label={t(planFlowCopy.moveDown)} disabled={index === steps.length - 1} onClick={() => moveStep(step.uid, index + 1)}><Icon name="down" size={16} /></button>
                      <button type="button" className={`btn ${styles.stepperButton}`} aria-label={t(planFlowCopy.removeStep)} disabled={steps.length <= 1} onClick={() => setSteps((current) => current.filter((item) => item.uid !== step.uid))}><Icon name="x" size={16} /></button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className={styles.field}>
              <button type="button" className={`btn ${styles.addDashed}`} disabled={steps.length >= PLAN_STEP_LIMIT} onClick={addStep}><Icon name="plus" size={16} />{t(planFlowCopy.addStep)}</button>
              <p className={styles.label}>{t(planFlowCopy.savedNote)}</p>
            </div>
          </Card>
          <Card className={styles.span7} id="plan-edit-types" title={t(planFlowCopy.editTypes)}>
            <p className={styles.label}>{t(planFlowCopy.editTypesHint)}</p>
            <div className={`${styles.tableWrap} ${styles.field}`}>
              <table className={styles.editTable} data-plan-allocation="">
                <thead>
                  <tr><th scope="col">{t(planFlowCopy.colType)}</th><th scope="col">{t(planFlowCopy.colTarget)}</th><th scope="col">{t(planFlowCopy.colPoints)}</th><th scope="col">{t(planFlowCopy.colCompare)}</th><th scope="col" /></tr>
                </thead>
                <tbody>
                  {slots.map((slot) => {
                    const item = info.get(slot.key);
                    const isEvent = slot.key === PLAN_EVENT_SLOT;
                    const before = isEvent ? draft.content.event : draft.content.personTypes.find((type) => type.key === slot.key);
                    const changed = !before || before.allocation !== slot.allocation || before.targetCount !== slot.targetCount;
                    const name = typeName(slot.key);
                    return (
                      <tr key={slot.key} id={`plan-edit-type-${slot.key}`} data-slot={slot.key} data-changed={changed ? "" : undefined}>
                        <td>
                          <span className={styles.row}>
                            <span className={styles.emoji} aria-hidden>{item?.emoji}</span>
                            <span className={styles.typeBody}><b className={styles.typeName}>{name}</b>{item?.roleSituation && item.roleSituation !== item.shortLabel ? <span className={styles.label}>{item.roleSituation}</span> : null}</span>
                          </span>
                        </td>
                        <td>
                          <span className={styles.stepper}>
                            <button type="button" className={`btn ${styles.stepperButton}`} aria-label={t(planFlowCopy.decrease, { type: name })} disabled={slot.targetCount <= Math.max(1, slot.metCount)} onClick={() => stepCount(slot.key, -1)}><Icon name="minus" size={16} /></button>
                            <span data-count="">{t(isEvent ? planFlowCopy.timesCount : planFlowCopy.peopleCount, { count: slot.targetCount })}</span>
                            <button type="button" className={`btn ${styles.stepperButton}`} aria-label={t(planFlowCopy.increase, { type: name })} disabled={slot.targetCount >= (isEvent ? PLAN_EVENT_TARGET_MAX : PLAN_TYPE_TARGET_MAX)} onClick={() => stepCount(slot.key, 1)}><Icon name="plus" size={16} /></button>
                          </span>
                        </td>
                        <td>
                          {slot.skipped ? <Chip label={t(planFlowCopy.skippedType)} /> : null}
                          <input className={styles.pointsInput} inputMode="numeric" step={5} min={slot.earnedBase} max={100} type="number" aria-label={t(planFlowCopy.pointsOf, { type: name })} disabled={slot.skipped} data-slot-skipped={slot.skipped ? "" : undefined}
                            aria-invalid={allocError?.key === slot.key ? true : undefined} value={inputs[slot.key] ?? String(slot.allocation)}
                            onChange={(event) => setInputs((current) => ({ ...current, [slot.key]: event.target.value }))}
                            onBlur={() => commitAllocation(slot.key)} onKeyDown={(event) => { if (event.key === "Enter") commitAllocation(slot.key); }} />
                          {allocError?.key === slot.key ? <div className={styles.errorText} role="alert">{t(allocError.text)}</div> : null}
                        </td>
                        <td data-compare="">
                          <span>{before && before.allocation !== slot.allocation ? `${before.allocation} → ${slot.allocation}` : slot.allocation}</span>
                          {before && before.targetCount !== slot.targetCount ? <div className={styles.label}>{t(isEvent ? planFlowCopy.timesCount : planFlowCopy.peopleCount, { count: before.targetCount })} → {t(isEvent ? planFlowCopy.timesCount : planFlowCopy.peopleCount, { count: slot.targetCount })}</div> : null}
                        </td>
                        <td>{isEvent ? null : <button type="button" className={`btn ${styles.stepperButton}`} aria-label={t(planFlowCopy.removeType, { type: name })} disabled={typeSlots.length <= 1} onClick={() => askRemove(slot.key)}><Icon name="x" size={16} /></button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{t(planFlowCopy.total)}</td>
                    <td />
                    <td data-plan-total={total}>{total}</td>
                    <td colSpan={2} className={styles.label}>{lastMoves.map((move) => `${typeName(move.key)} ${move.from} → ${move.to}`).join(" · ")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className={styles.field}>
              <button type="button" className={`btn ${styles.addDashed}`} onClick={() => setAdding(true)}><Icon name="plus" size={16} />{t(planFlowCopy.addType)}</button>
            </div>
          </Card>
        </div>
        {failed ? <div className={styles.field}><PlanErrorNotice view={failed} t={t} onRetry={() => void start()}
          // R25 复核: a review draft voided by a plan change answers STALE — the latest is the plan itself.
          onReload={() => (draft.kind === "review" && draft.planId ? router.push(planTaskSegmentHref("web", draft.planId)) : void load())} /></div> : null}
        <div className={styles.totalBar} data-plan-totalbar="">
          <span className={total === 100 ? undefined : styles.totalOff} data-plan-total-text="">{t(planFlowCopy.totalBar, { count: changes.length, total })}</span>
          <span className={styles.push} />
          <Button variant="primary" label={t(planFlowCopy.startPlan)} loading={busy} disabled={!canStart} onClick={() => void start()} />
        </div>
        <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title={removing ? t(planFlowCopy.removeTitle, { type: typeName(removing.key) }) : ""}
          actions={<><Button label={std.action.cancel} onClick={() => setRemoving(null)} /><Button variant="danger" label={t(planFlowCopy.removeConfirm)} onClick={confirmRemove} /></>}>
          {removing ? (
            <div data-plan-remove="">
              <p className={styles.muted}>{t(planFlowCopy.removeBody, { points: removing.points })}</p>
              <ul className={styles.moveList}>
                {removing.moves.map((move) => <li key={move.key}>{typeName(move.key)} {move.from} → {move.to}</li>)}
              </ul>
              <p className={styles.h3}>{t(planFlowCopy.total)} {totalOf(removing.slots)}</p>
            </div>
          ) : null}
        </Modal>
        <Modal open={adding} onClose={() => setAdding(false)} title={t(planFlowCopy.addTypeTitle)}>
          <div className={styles.modalBody}>
            {unused.length === 0 ? <p className={styles.label}>{t(planFlowCopy.noMoreTypes)}</p> : unused.map((slot) => (
              <button key={slot.slot} type="button" className={`btn ${styles.slotOption}`} onClick={() => addType(slot.slot)}>
                <span className={styles.emoji} aria-hidden>{slot.emoji}</span>
                <span>{PLAN_SHORT_NAME_COPY[slot.slot] ? planCopy(PLAN_SHORT_NAME_COPY[slot.slot]!, language) : slot.slot}</span>
              </button>
            ))}
          </div>
        </Modal>
      </ToastProvider>
    </Orbit2026Scope>
  );
}
