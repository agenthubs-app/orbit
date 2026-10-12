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
import { standardCopyFor } from "../copy/standard";
import { Button, Icon, Modal, Orbit2026Scope, ToastProvider } from "../ui";
import { typeTileClass } from "./DraftCard";
import { DegradeRow, DialogActs, ErrCard, FlowDialog, FlowHead, RailHead } from "./FlowParts";
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
import k from "./FlowKit.module.css";

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
  const [editingStep, setEditingStep] = useState<string | null>(null);
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
    map.set(PLAN_EVENT_SLOT, { emoji: "🎟️", letter: "", roleSituation: t(planFlowCopy.eventRole), shortLabel: planCopy(PLAN_EVENT_COPY, language) });
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

  const totalNow = totalOf(slots);
  const stepsValidNow = steps.length >= 1 && steps.length <= PLAN_STEP_LIMIT && steps.every((step) => step.title.trim());
  const canStartNow = isFullTotal(slots) && stepsValidNow && !busy;
  const rail = useMemo(() => (
    // b10 editRail: 「変更点」 list, the 合計 card with 「このプランで始める」, the note.
    <div className={k.rail} data-plan-rail="changes">
      <RailHead icon="edit">{t(planFlowCopy.changesTitle)}</RailHead>
      {changes.length === 0 ? <p className={k.lbl}>{t(planFlowCopy.noChanges)}</p> : (
        <ul className={k.chgl}>
          {changes.map((change, index) => (
            <li key={`${change.kind}:${change.anchor}:${index}`}>
              <button type="button" className={`btn ${k.chgBtn}`} onClick={() => { const target = document.getElementById(change.anchor); target?.scrollIntoView({ behavior: "smooth", block: "center" }); target?.querySelector<HTMLElement>("input, button")?.focus(); }}>
                <span className={k.chgtag}>{t(CHANGE_KIND[change.kind])}</span>
                <span>{changeText(change, t)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={`${k.card} ${k.totalCard}`} data-plan-totalbar="">
        <div className={`${k.row} ${k.between}`}><b className={k.totalLabel}>{t(planFlowCopy.total)}</b><span className={`${k.big2} ${totalNow === 100 ? "" : k.totalOff}`} data-plan-total={totalNow}>{totalNow}</span></div>
        <div className={`${k.lbl} ${k.totalNote}`} aria-label={t(planFlowCopy.totalBar, { count: changes.length, total: totalNow })}>{t(planFlowCopy.totalNote, { count: changes.length })}</div>
        <button type="button" className={`btn ${k.btn} ${k.primary} ${k.block} ${k.startBtn}`} disabled={!canStartNow} aria-busy={busy || undefined} onClick={() => void startRef.current()}>{t(planFlowCopy.startPlan)}</button>
      </div>
      <div className={`${k.card} ${k.flat} ${k.railNote}`}>{t(planFlowCopy.editRailNote)}</div>
    </div>
    // t follows language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [changes, language, totalNow, canStartNow, busy]);
  const startRef = useRef<() => Promise<void>>(async () => undefined);

  const closeHref = draft ? (draft.kind === "review" && draft.planId ? planTaskSegmentHref("web", draft.planId) : draft.intakeId ? planFlowHref("web", draft.intakeId) : null) : null;
  const shell = (
    <FlowHead title={t(planFlowCopy.editTitle)} subtitle={draft ? t(planFlowCopy.editSubWeb, { name: draft.purposeText ?? draft.goal }) : t(planFlowCopy.editSub)} rail={draft ? rail : false}
      left={closeHref ? <button type="button" className={`btn ${k.rbtn}`} aria-label={t(planFlowCopy.closeEdit)} onClick={() => router.push(closeHref)} data-plan-edit-back=""><Icon name="x" size={20} /></button> : null}
      right={draft ? <button type="button" className={`btn ${k.headBtn} ${k.headGhost}`} onClick={() => reset(draft)} data-plan-reset="">{t(planFlowCopy.backToAi)}</button> : null} />
  );

  if (loadFailed) return <Orbit2026Scope language={language} className={k.page}>{shell}<ErrCard title={t(planFlowCopy.draftLoadFailed)} sub={t(planFlowCopy.draftLoadFailedBody)} retryLabel={t(planFlowCopy.retry)} onRetry={() => void load()} data={{ "data-plan-failure": "other" }} /></Orbit2026Scope>;
  if (!draft) return <Orbit2026Scope language={language} className={k.page}>{shell}<div aria-busy /></Orbit2026Scope>;

  if (!draft.manualEditAvailable || draft.status !== "open") {
    return (
      <Orbit2026Scope language={language} className={k.page}>
        {shell}
        <DegradeRow title={t(planFlowCopy.manualUsed)} icon="info" data={{ "data-plan-notice": "used" }}
          action={draft.kind === "review" && draft.planId
            ? <button type="button" className={`btn ${k.btn} ${k.sm} ${k.onSurface}`} onClick={() => router.push(planTaskSegmentHref("web", draft.planId))} data-plan-edit-back="">{t(planReviewCopy.later)}</button>
            : draft.intakeId ? <button type="button" className={`btn ${k.btn} ${k.sm} ${k.onSurface}`} onClick={() => router.push(planFlowHref("web", draft.intakeId!))}>{t(planFlowCopy.backToFlow)}</button> : null} />
      </Orbit2026Scope>
    );
  }

  const total = totalNow;
  const canStart = canStartNow;

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
    if (result.ok === false) { busyRef.current = false; setBusy(false); setFailed(planErrorView(result.error, "other")); return; }
    // Saved: stay busy while the page navigates away, so a second click cannot send again.
    // R25: saving a review draft confirms it in place → back to the overview with 「方案を更新しました」.
    if (draft.kind === "review") setPlanFlash("updated");
    router.push(result.data.href);
  };

  const unused = unusedTemplateSlots(draft.goalKind, slots.map((slot) => slot.key));
  const typeSlots = slots.filter((slot) => slot.key !== PLAN_EVENT_SLOT);

  startRef.current = start;
  const before = (key: string) => (key === PLAN_EVENT_SLOT ? draft.content.event : draft.content.personTypes.find((type) => type.key === key));
  const changedKeys = new Set(slots.filter((slot) => { const old = before(slot.key); return !old || old.allocation !== slot.allocation || old.targetCount !== slot.targetCount; }).map((slot) => slot.key));
  const originIndex = new Map(draft.content.steps.map((step, index) => [step.key, index]));

  return (
    <Orbit2026Scope language={language} className={k.page}>
      <ToastProvider>
        {shell}
        <div className={k.wgrid} data-plan-edit="">
          <span className={k.srOnly}>{draft.purposeText ?? draft.goal}</span>
          <div className={`${k.card} ${k.span5}`} id="plan-edit-steps">
            <div className={k.cardH}><h3>{t(planFlowCopy.editSteps)}</h3><span className={k.lbl}>{t(planFlowCopy.editStepsHint)}</span></div>
            <ol className={k.libl}>
              {steps.map((step, index) => {
                const origin = step.key ? draft.content.steps.find((item) => item.key === step.key) : null;
                const renamed = Boolean(origin && origin.title !== step.title.trim());
                const from = step.key ? originIndex.get(step.key) : undefined;
                const movedNow = from !== undefined && from !== index && moved.has(step.uid);
                const open = editingStep === step.uid || !step.key || renamed;
                return (
                  <li key={step.uid} id={`plan-edit-step-${step.uid}`} className={`${k.erow} ${dragging === step.uid ? k.erowLift : ""}`} draggable data-step-uid={step.uid}
                    onDragStart={(event) => { setDragging(step.uid); event.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => { event.preventDefault(); if (dragging && dragging !== step.uid) moveStep(dragging, index); setDragging(null); }}
                    onKeyDown={(event) => {
                      if (!event.altKey) return;
                      if (event.key === "ArrowUp" && index > 0) { event.preventDefault(); moveStep(step.uid, index - 1); }
                      if (event.key === "ArrowDown" && index < steps.length - 1) { event.preventDefault(); moveStep(step.uid, index + 1); }
                    }}>
                    <button type="button" className={`btn ${k.grip}`} aria-label={t(planFlowCopy.moveHint, { n: index + 1 })} />
                    <span className={k.v2snum}>{index + 1}</span>
                    <div className={k.em}>
                      {open ? (
                        <>
                          <input className={k.ein} aria-label={t(planFlowCopy.stepTitleLabel)} value={step.title} placeholder={t(planFlowCopy.stepTitleLabel)} maxLength={120} autoFocus={editingStep === step.uid}
                            onChange={(event) => updateStep(step.uid, { title: event.target.value })} />
                          {renamed ? <span className={`${k.lbl} ${k.einSub}`}>{t(planFlowCopy.origin, { title: origin!.title })}</span> : null}
                          {editingStep === step.uid || !step.key ? (
                            <input className={`${k.emDone} ${k.einSub}`} aria-label={t(planFlowCopy.stepDoneLabel)} value={step.doneCriteria} placeholder={t(planFlowCopy.stepDoneLabel)} maxLength={300}
                              onChange={(event) => updateStep(step.uid, { doneCriteria: event.target.value })} onBlur={() => setEditingStep(null)} />
                          ) : null}
                        </>
                      ) : (
                        <button type="button" className={`btn ${k.emText}`} aria-label={`${t(planFlowCopy.stepTitleLabel)} · ${step.title}`} onClick={() => setEditingStep(step.uid)}>
                          <b>{step.title}</b><span className={k.lbl}>{t(planFlowCopy.doneCriteria, { text: step.doneCriteria })}</span>
                        </button>
                      )}
                      {!step.key ? (
                        <div className={k.chips} role="group" aria-label={t(planFlowCopy.stepTypesLabel)}>
                          {typeSlots.map((slot) => {
                            const on = step.personTypeKeys.includes(slot.key);
                            return <button key={slot.key} type="button" aria-pressed={on} className={`btn ${k.fopt} ${on ? k.on : ""}`} onClick={() => updateStep(step.uid, { personTypeKeys: on ? step.personTypeKeys.filter((key) => key !== slot.key) : [...step.personTypeKeys, slot.key] })}>{typeName(slot.key)}</button>;
                          })}
                        </div>
                      ) : null}
                    </div>
                    {movedNow ? <span className={k.mv}>{from! + 1} → {index + 1}</span> : null}
                    <button type="button" className={`btn ${k.del}`} aria-label={t(planFlowCopy.removeStep)} disabled={steps.length <= 1} onClick={() => setSteps((current) => current.filter((item) => item.uid !== step.uid))}><Icon name="x" size={16} /></button>
                  </li>
                );
              })}
            </ol>
            <button type="button" className={`btn ${k.ghostRow}`} disabled={steps.length >= PLAN_STEP_LIMIT} onClick={addStep}><Icon name="plus" size={16} />{t(planFlowCopy.addStep)}</button>
            <div className={`${k.push} ${k.lockWrap}`}><div className={k.lock}><Icon name="pen" size={16} /><span>{t(planFlowCopy.savedNote)}</span></div></div>
          </div>
          <div className={`${k.card} ${k.span7}`} id="plan-edit-types">
            <div className={k.cardH}><h3>{t(planFlowCopy.editTypes)}</h3><span className={k.lbl}>{t(planFlowCopy.editTypesHint)}</span></div>
            <table className={k.etab} data-plan-allocation="">
              <thead>
                <tr><th scope="col">{t(planFlowCopy.colType)}</th><th scope="col">{t(planFlowCopy.colTarget)}</th><th scope="col">{t(planFlowCopy.colPoints)}</th><th scope="col">{t(planFlowCopy.colCompare)}</th><th scope="col" /></tr>
              </thead>
              <tbody>
                {slots.map((slot) => {
                  const item = info.get(slot.key);
                  const isEvent = slot.key === PLAN_EVENT_SLOT;
                  const old = before(slot.key);
                  const name = typeName(slot.key);
                  const typeIndex = typeSlots.findIndex((entry) => entry.key === slot.key);
                  return (
                    <tr key={slot.key} id={`plan-edit-type-${slot.key}`} data-slot={slot.key} data-changed={changedKeys.has(slot.key) ? "" : undefined}>
                      <td className={k.typeCell}>
                        <div className={k.row}>
                          <span className={isEvent ? `${k.emo} ${k.emoApricot}` : typeTileClass(typeIndex)} aria-hidden>{item?.emoji}</span>
                          <div className={k.grow}><b>{name}</b>{item?.roleSituation && item.roleSituation !== item.shortLabel ? <span className={k.tnm}>{item.roleSituation}</span> : null}</div>
                        </div>
                      </td>
                      <td>
                        <span className={`${k.stp} ${old && old.targetCount !== slot.targetCount ? k.stpChg : ""}`}>
                          <button type="button" className={`btn ${k.stpBtn}`} aria-label={t(planFlowCopy.decrease, { type: name })} disabled={slot.targetCount <= Math.max(1, slot.metCount)} onClick={() => stepCount(slot.key, -1)}>−</button>
                          <b data-count="">{slot.targetCount}<small>{t(isEvent ? planFlowCopy.timesUnit : planFlowCopy.peopleUnit)}</small></b>
                          <button type="button" className={`btn ${k.stpBtn}`} aria-label={t(planFlowCopy.increase, { type: name })} disabled={slot.targetCount >= (isEvent ? PLAN_EVENT_TARGET_MAX : PLAN_TYPE_TARGET_MAX)} onClick={() => stepCount(slot.key, 1)}>＋</button>
                        </span>
                      </td>
                      <td>
                        {slot.skipped ? <span className={k.chip}>{t(planFlowCopy.skippedType)}</span> : null}
                        <input className={k.ptin} inputMode="numeric" aria-label={t(planFlowCopy.pointsOf, { type: name })} disabled={slot.skipped} data-slot-skipped={slot.skipped ? "" : undefined}
                          aria-invalid={allocError?.key === slot.key ? true : undefined} value={inputs[slot.key] ?? String(slot.allocation)}
                          onChange={(event) => setInputs((current) => ({ ...current, [slot.key]: event.target.value }))}
                          onBlur={() => commitAllocation(slot.key)} onKeyDown={(event) => { if (event.key === "Enter") commitAllocation(slot.key); }} />
                        {allocError?.key === slot.key ? <div className={k.errText} role="alert">{t(allocError.text)}</div> : null}
                      </td>
                      <td data-compare="">
                        {old && old.allocation !== slot.allocation
                          ? <span className={`${k.ba} ${slot.allocation > old.allocation ? k.baUp : k.baDn}`}><s>{old.allocation}</s> → <b>{slot.allocation}</b></span>
                          : <span className={k.ba}>{slot.allocation}</span>}
                        {old && old.targetCount !== slot.targetCount ? (
                          <div className={`${k.ba} ${k.baDn} ${k.baSub}`}><s>{t(isEvent ? planFlowCopy.timesCount : planFlowCopy.peopleCount, { count: old.targetCount })}</s> → <b>{t(isEvent ? planFlowCopy.timesCount : planFlowCopy.peopleCount, { count: slot.targetCount })}</b></div>
                        ) : null}
                      </td>
                      <td>{isEvent ? null : <button type="button" className={`btn ${k.lbtn} ${k.lbtn28}`} aria-label={t(planFlowCopy.removeType, { type: name })} disabled={typeSlots.length <= 1} onClick={() => askRemove(slot.key)}><Icon name="x" size={16} /></button>}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td><b>{t(planFlowCopy.total)}</b></td>
                  <td />
                  <td><b className={k.sumTotal}>{total}</b></td>
                  <td className={k.lbl}>{lastMoves.map((move) => `${typeName(move.key)} ${move.from} → ${move.to}`).join(" · ")}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            {unused.length ? <button type="button" className={`btn ${k.ghostRow}`} onClick={() => setAdding(true)}><Icon name="plus" size={16} />{t(planFlowCopy.addType)}</button> : null}
            <div className={`${k.push} ${k.sum100}`}>
              <span className={k.big2}>{total}<small> / 100</small></span>
              <div className={k.sumbar} aria-hidden>{slots.map((slot) => <i key={slot.key} className={slot.key === PLAN_EVENT_SLOT ? k.ev : changedKeys.has(slot.key) ? k.e : undefined} style={{ flex: slot.allocation }} />)}</div>
              <span className={k.lbl}>{t(planFlowCopy.darkNote)}</span>
            </div>
          </div>
        </div>
        {failed ? <div className={k.failRow}><PlanErrorNotice view={failed} t={t} onRetry={() => void start()}
          // R25 复核: a review draft voided by a plan change answers STALE — the latest is the plan itself.
          onReload={() => (draft.kind === "review" && draft.planId ? router.push(planTaskSegmentHref("web", draft.planId)) : void load())} /></div> : null}
        <FlowDialog open={Boolean(removing)} onClose={() => setRemoving(null)} label={removing ? t(planFlowCopy.removeTitle, { type: typeName(removing.key) }) : ""} data={{ "data-plan-remove": "" }}>
          {removing ? (() => {
            const item = info.get(removing.key);
            const index = typeSlots.findIndex((entry) => entry.key === removing.key);
            const inSteps = steps.flatMap((step, position) => (step.personTypeKeys.includes(removing.key) ? [position + 1] : []));
            const moves = new Map(removing.moves.map((move) => [move.key, move]));
            return (
              <>
                <div className={`${k.row} ${k.delHead}`}>
                  <span className={typeTileClass(index)} aria-hidden>{item?.emoji}</span>
                  <div className={k.grow}><b className={k.dialogTitle}>{t(planFlowCopy.removeTitleWeb, { letter: item?.letter ?? "" })}</b><div className={k.lbl}>{t(planFlowCopy.removeSub, { name: item?.shortLabel ?? "", points: removing.points })}</div></div>
                </div>
                <div className={`${k.lbl} ${k.removeLead}`}>{t(planFlowCopy.removeBody, { points: removing.points })}</div>
                <div className={`${k.card} ${k.flat} ${k.delList}`}>
                  {removing.slots.map((slot) => {
                    const move = moves.get(slot.key);
                    const other = info.get(slot.key);
                    const otherIndex = typeSlots.findIndex((entry) => entry.key === slot.key);
                    return (
                      <div key={slot.key} className={k.trow} data-move={move ? slot.key : undefined}>
                        <span className={slot.key === PLAN_EVENT_SLOT ? `${k.emo} ${k.emoApricot}` : typeTileClass(otherIndex)} aria-hidden>{other?.emoji}</span>
                        <div className={k.tm}><b>{typeName(slot.key)}</b></div>
                        {move ? <span className={`${k.ba} ${move.to > move.from ? k.baUp : k.baDn}`}><s>{move.from}</s> → <b>{move.to}</b></span> : <span className={k.ba}>{slot.allocation}</span>}
                      </div>
                    );
                  })}
                  <div className={k.trow}><div className={k.tm}><b>{t(planFlowCopy.total)}</b></div><span className={k.ba}><b>{totalOf(removing.slots)}</b></span></div>
                </div>
                <div className={`${k.lbl} ${k.delNote}`}>{inSteps.length ? t(planFlowCopy.removeNote, { letter: item?.letter ?? "", steps: inSteps.join("・") }) : t(planFlowCopy.removeNoteNoStep, { letter: item?.letter ?? "" })}</div>
                <DialogActs hint={std.action.cancel}>
                  <button type="button" className={`btn ${k.btn} ${k.btnFocus}`} data-autofocus="" onClick={() => setRemoving(null)}>{std.action.cancel}</button>
                  <button type="button" className={`btn ${k.btn} ${k.primary} ${k.btnRose}`} onClick={confirmRemove}>{t(planFlowCopy.removeConfirm)}</button>
                </DialogActs>
              </>
            );
          })() : null}
        </FlowDialog>
        <Modal open={adding} onClose={() => setAdding(false)} title={t(planFlowCopy.addTypeTitle)}>
          <div className={k.modalBody}>
            {unused.length === 0 ? <p className={k.lbl}>{t(planFlowCopy.noMoreTypes)}</p> : unused.map((slot) => (
              <button key={slot.slot} type="button" className={`btn ${k.slotOption}`} onClick={() => addType(slot.slot)}>
                <span className={`${k.emo} ${k.emoLav}`} aria-hidden>{slot.emoji}</span>
                <span>{PLAN_SHORT_NAME_COPY[slot.slot] ? planCopy(PLAN_SHORT_NAME_COPY[slot.slot]!, language) : slot.slot}</span>
              </button>
            ))}
          </div>
        </Modal>
      </ToastProvider>
    </Orbit2026Scope>
  );
}
