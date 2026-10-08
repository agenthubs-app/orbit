/**
 * 引导页 `/app/start` 的客户端壳（W0006，RW-04；版式取自已确认原型 iorbit-plan 的 startHtml）。
 *
 * - 顶栏只有 logo 与「引导 · 第 n 步 / 共 3 步」；「← 先回去看看」回 iOrbit，进度随时保留；
 * - 3 格步骤条（手机上缩成 3 段进度线）：已完成 ✓ / 进行中 / 锁定（完成前一步后解锁）。
 *   严格顺序，点锁定的步骤只提示「先完成第 n 步」，不切换（W0035 删去原来的「活动」一步）；
 * - 主体只有当前步骤一张卡片；3 步都完成后显示「✓ 3 步都完成了」完成卡片；
 * - 当前停在第几步写进引导记录 `currentStep`（切换步骤、某一步完成后前进时写），刷新或换设备
 *   停在同一步；W0054（RN-12）起第 1 步只认 3 位已确认联系人，没有跳过入口，「扫名片」旁常驻
 *   「导入人脉」（W54-2）；存量 `step1Skipped = true` 只读兼容（W54-1）；有 `completedAt` 的人进页面
 *   默认显示完成卡片（W54-5）；
 * - 名片批次状态机挂在本页顶层（与 onboarding 在流程内扫名片同一写法），全站 CardBatchHost
 *   在 /app/start 让位，同一批次不会被处理两次。
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  canOpenStartStep,
  deriveStartGuideFlags,
  firstIncompleteStartStep,
  GUIDE_START_STEPS,
  resolveStartEntryView,
  startStepDone,
  startStepStatus,
  viewAfterStepDone,
  type GuideStartStep,
  type StartGuideFlags,
  type StartGuideSnapshot,
  type StartView,
} from "../../../../features/guide/start-steps";
import { CardBatchReminders } from "../contacts/card-batch-0918/card-batch-ui";
import { listActiveBatches } from "../contacts/card-batch-0918/card-batch-store";
import { useCardBatch } from "../contacts/card-batch-0918/use-card-batch";
import { useOrbitLanguage } from "../orbit-language-context";
import { horizonOption, parseRelationshipGoal } from "../profile/goal-editor/goal-editor-model";
import { StepCards } from "./start-step-cards";
import { StepGoal } from "./start-step-goal";
import { StepPlan } from "./start-step-plan";
import { START_GUIDE_STYLES } from "./start-guide-styles";

export const START_GUIDE_STATE_ENDPOINT = "/api/guide/state";

export interface StartGuideProps {
  cardScanAvailable: boolean;
  profileUpdatedAt: string | null;
  relationshipGoal: string;
  /**
   * W0022：`?step=` 请求的步骤（服务端已滤掉非法值）。只在能打开时决定初始显示，锁定时忽略；
   * 不写引导记录。
   */
  requestedStep?: GuideStartStep | null;
  snapshot: StartGuideSnapshot;
}

type T = (copy: { en: string; zh: string }) => string;

/** PATCH 本人的引导记录；返回是否成功（失败不抛）。 */
export async function patchGuideState(body: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch(START_GUIDE_STATE_ENDPOINT, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 引导记录的写入队列：所有 `currentStep` 的写（点步骤、保存目标后前进、自动前进）都排进同一条
 * 串行队列，同一时刻最多一个请求在路上，服务端按发出的顺序收到。
 *
 * - `write(step)`：记下「想停在哪一步」；轮到它时只在与服务端已确认的值不同时才发，
 *   连点时中间的值会被合并掉，最后一次为准。
 * 写失败即停，界面保留本次的选择，下次切换再写。（W0054 删去跳过第 1 步的 `send`。）
 */
function useGuideStateQueue(initial: GuideStartStep | null) {
  const desiredRef = useRef<GuideStartStep | null>(initial);
  const confirmedRef = useRef<GuideStartStep | null>(initial);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const flushQueuedRef = useRef(false);

  return useMemo(() => {
    function enqueue<TValue>(task: () => Promise<TValue>): Promise<TValue> {
      const run = chainRef.current.then(task, task);
      chainRef.current = run.catch(() => undefined);
      return run;
    }

    async function flushDesired(): Promise<void> {
      flushQueuedRef.current = false;
      const step = desiredRef.current;
      if (step === null || step === confirmedRef.current) return;
      if (await patchGuideState({ currentStep: step })) confirmedRef.current = step;
    }

    return {
      write(step: GuideStartStep) {
        desiredRef.current = step;
        if (flushQueuedRef.current) return;
        flushQueuedRef.current = true;
        void enqueue(flushDesired);
      },
    };
  }, []);
}

const STEP_TITLES: Record<GuideStartStep, { en: string; zh: string }> = {
  1: { en: "Cards", zh: "名片" },
  2: { en: "Goal", zh: "目标" },
  3: { en: "Plan", zh: "计划" },
};

function LockIcon() {
  return (
    <svg aria-hidden="true" height="12" viewBox="0 0 11 12" width="11">
      <rect fill="none" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" width="9" x="1" y="5" />
      <path d="M3 5V3.6a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function stepSubtitle(input: {
  confirmedContacts: number;
  flags: StartGuideFlags;
  goal: string;
  step: GuideStartStep;
  t: T;
}): { lock: boolean; text: string } {
  const { confirmedContacts, flags, step, t } = input;
  const status = startStepStatus(flags, step);
  if (status === "locked") {
    return {
      lock: true,
      text: t({ en: `Unlocks after step ${step - 1}`, zh: `完成第 ${step - 1} 步后解锁` }),
    };
  }
  if (status === "current") {
    return {
      lock: false,
      text:
        step === 1
          ? t({
              en: `${Math.min(confirmedContacts, 3)} / 3 confirmed · in progress`,
              zh: `已确认 ${Math.min(confirmedContacts, 3)} / 3 · 进行中`,
            })
          : t({ en: "In progress", zh: "进行中" }),
    };
  }
  if (step === 1) {
    return { lock: false, text: t({ en: `${confirmedContacts} confirmed`, zh: `已确认 ${confirmedContacts} 位` }) };
  }
  if (step === 2) {
    const horizon = parseRelationshipGoal(input.goal).horizon;
    return {
      lock: false,
      text: horizon
        ? t({ en: `${horizonOption(horizon).label.en} · set`, zh: `${horizonOption(horizon).label.zh} · 已设定` })
        : t({ en: "Set", zh: "已设定" }),
    };
  }
  return { lock: false, text: t({ en: "Plan ready", zh: "计划已生成" }) };
}

export function StartGuide(props: StartGuideProps) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const router = useRouter();
  const { snapshot } = props;

  // 本页内的即时变化；服务端刷新（router.refresh）后以新的 props 为准。
  const [savedGoal, setSavedGoal] = useState<string | null>(null);
  const [savedProfileAt, setSavedProfileAt] = useState<string | null>(null);
  const goal = savedGoal ?? props.relationshipGoal;
  const profileUpdatedAt = savedProfileAt ?? props.profileUpdatedAt;

  const flags = useMemo(
    () =>
      deriveStartGuideFlags({
        confirmedContacts: snapshot.confirmedContacts,
        grandfathered: snapshot.grandfathered,
        hasActivePlan: snapshot.hasActivePlan,
        relationshipGoal: goal,
        // W54-1：存量跳过只读兼容。
        step1Skipped: snapshot.step1Skipped,
      }),
    [goal, snapshot.confirmedContacts, snapshot.grandfathered, snapshot.hasActivePlan, snapshot.step1Skipped],
  );

  const [view, setView] = useState<StartView>(() =>
    resolveStartEntryView(flags, snapshot.currentStep, props.requestedStep ?? null, snapshot.completedAt),
  );
  const [lockedNote, setLockedNote] = useState("");
  const writer = useGuideStateQueue(snapshot.currentStep);

  const openStep = useCallback(
    (step: GuideStartStep) => {
      if (!canOpenStartStep(flags, step)) {
        const first = firstIncompleteStartStep(flags) ?? 1;
        setLockedNote(t({ en: `Finish step ${first} first`, zh: `先完成第 ${first} 步` }));
        return;
      }
      setLockedNote("");
      setView(step);
      writer.write(step);
    },
    [flags, t, writer],
  );

  /** 当前步骤做完后前进：下一个没完成的步骤，或完成卡片（完成时间由服务端写）。 */
  const advance = useCallback(
    (next: StartView) => {
      setLockedNote("");
      setView(next);
      if (next !== "finish") writer.write(next);
    },
    [writer],
  );

  // 当前看的步骤在页面外完成（例如名片确认后刷新出第 3 位联系人）：自动前进一步。
  const previousFlags = useRef(flags);
  useEffect(() => {
    const before = previousFlags.current;
    previousFlags.current = flags;
    if (view === "finish") return;
    if (!startStepDone(before, view) && startStepDone(flags, view)) advance(viewAfterStepDone(flags));
  }, [advance, flags, view]);

  // 名片批次：接上本机正在进行的批次（全站宿主在本页让位），确认数增加后刷新服务端计数。
  const [cardBatchId, setCardBatchId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  useEffect(() => {
    setCardBatchId(listActiveBatches().at(-1) ?? null);
  }, []);
  const cardBatch = useCardBatch(cardBatchId, t);
  const imported = cardBatch.autoCount + cardBatch.userCount;
  const importedRef = useRef(imported);
  useEffect(() => {
    if (imported > importedRef.current) router.refresh();
    importedRef.current = imported;
  }, [imported, router]);

  const onGoalSaved = useCallback(
    (value: string, updatedAt: string | null, options: { advance: boolean }) => {
      setSavedGoal(value);
      if (updatedAt) setSavedProfileAt(updatedAt);
      if (options.advance) advance(viewAfterStepDone({ ...flags, goal: Boolean(value.trim()) || flags.goal }));
      router.refresh();
    },
    [advance, flags, router],
  );

  const viewNumber = view === "finish" ? null : view;

  return (
    <div className="sg" data-start-guide data-start-view={String(view)}>
      <style>{START_GUIDE_STYLES}</style>
      <header className="sg-nav">
        <span className="sg-logo">iOrbit</span>
        <span className="sg-nav-step" data-start-nav-step>
          {viewNumber
            ? t({ en: `Guide · Step ${viewNumber} of 3`, zh: `引导 · 第 ${viewNumber} 步 / 共 3 步` })
            : t({ en: "Guide · All 3 steps done", zh: "引导 · 3 步已完成" })}
        </span>
      </header>
      <main className="sg-wrap">
        <div className="sg-top">
          <a className="sg-lk sg-muted" data-start-back href={preserveHref("/app/agent")}>
            {t({ en: "← Look around first", zh: "← 先回去看看" })}
          </a>
          <span className="sg-hint">{t({ en: "Leave any time — your progress is kept", zh: "可以随时离开，进度会保留" })}</span>
        </div>
        <header className="sg-mast">
          <h1 className="sg-title">{t({ en: "3 steps to put iOrbit to work for you", zh: "3 步，让 iOrbit 开始为你工作" })}</h1>
          <p className="sg-lede">
            {t({
              en: "Finish these 3 steps and iOrbit and your network switch from the demo to your own data.",
              zh: "做完这 3 步，iOrbit 和人脉页就会从示例换成你自己的数据。",
            })}
          </p>
        </header>

        {view === "finish" ? (
          <section className="sg-finish" data-start-finish>
            <h2>{t({ en: "✓ All 3 steps are done", zh: "✓ 3 步都完成了" })}</h2>
            <p>
              {t({
                en: "iOrbit, your network and your plan now show your own data.",
                zh: "iOrbit、人脉和计划已经换成你自己的数据。",
              })}
            </p>
            <div className="sg-acts">
              <a className="btn sg-primary" data-start-go-iorbit href={preserveHref("/app/agent")}>
                {t({ en: "Go to iOrbit →", zh: "去 iOrbit →" })}
              </a>
            </div>
          </section>
        ) : (
          <>
            <ol aria-label={t({ en: "Guide, 3 steps", zh: "引导 3 步" })} className="sg-steps">
              {GUIDE_START_STEPS.map((step) => {
                const status = startStepStatus(flags, step);
                const sub = stepSubtitle({ confirmedContacts: snapshot.confirmedContacts, flags, goal, step, t });
                return (
                  <li key={step}>
                    <button
                      aria-current={view === step ? "step" : undefined}
                      aria-disabled={status === "locked" ? "true" : undefined}
                      className="btn sg-step"
                      data-start-step={step}
                      data-status={status}
                      onClick={() => openStep(step)}
                      type="button"
                    >
                      <span className="sg-step-n">{status === "done" ? "✓" : step}</span>
                      <span className="sg-step-t">{t(STEP_TITLES[step])}</span>
                      <span className="sg-step-s">
                        {sub.lock ? <LockIcon /> : null}
                        {sub.text}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="sg-steps-mini" data-start-steps-mini>
              {GUIDE_START_STEPS.map((step) => (
                <i
                  aria-hidden
                  data-bar={startStepDone(flags, step) ? "done" : view === step ? "current" : ""}
                  key={step}
                />
              ))}
              <span>
                {language === "en" ? (
                  <>
                    Step <b>{viewNumber}</b> of 3
                  </>
                ) : (
                  <>
                    第 <b>{viewNumber}</b> 步 / 共 3 步
                  </>
                )}
              </span>
            </div>
            <p aria-live="polite" className="sg-locked-note" data-start-locked-note role="status">
              {lockedNote}
            </p>

            {view === 1 ? (
              <StepCards
                batch={cardBatch}
                cardScanAvailable={props.cardScanAvailable}
                confirmedContacts={snapshot.confirmedContacts}
                done={flags.contacts}
                onBatchStarted={(batchId) => {
                  setCardBatchId(batchId);
                  setScanOpen(true);
                }}
                onNext={() => advance(viewAfterStepDone(flags))}
                onReset={() => setCardBatchId(null)}
                onScan={() => setScanOpen(true)}
                samples={snapshot.contactSamples}
                scanOpen={scanOpen}
              />
            ) : null}
            {view === 2 ? (
              <StepGoal
                done={flags.goal}
                goal={goal}
                onNext={() => advance(viewAfterStepDone(flags))}
                onSaved={(value, updatedAt) => onGoalSaved(value, updatedAt, { advance: true })}
                profileUpdatedAt={profileUpdatedAt}
              />
            ) : null}
            {view === 3 ? (
              <StepPlan
                confirmedContacts={snapshot.confirmedContacts}
                goal={goal}
                onGoalSaved={(value, updatedAt) => onGoalSaved(value, updatedAt, { advance: false })}
                planDone={flags.plan}
                profileUpdatedAt={profileUpdatedAt}
                samples={snapshot.contactSamples}
              />
            ) : null}
          </>
        )}
      </main>
      <CardBatchReminders
        batch={cardBatch}
        onOpen={() => {
          setScanOpen(true);
          openStep(1);
        }}
        t={t}
        viewingImport={view === 1}
      />
    </div>
  );
}

/** 引导记录或进度读不到时：不猜进度，给一个回 iOrbit 的出口。 */
export function StartGuideUnavailable() {
  const { preserveHref, t } = useOrbitLanguage();
  return (
    <div className="sg" data-start-guide-unavailable>
      <style>{START_GUIDE_STYLES}</style>
      <header className="sg-nav">
        <span className="sg-logo">iOrbit</span>
      </header>
      <main className="sg-wrap">
        <section className="sg-lead" role="alert">
          <h2>{t({ en: "The guide can't load right now", zh: "引导暂时打不开" })}</h2>
          <p className="sg-why">
            {t({
              en: "We couldn't read your progress. Nothing was changed — please try again in a moment.",
              zh: "没有读到你的进度，什么都没有改动。请稍后再试。",
            })}
          </p>
          <div className="sg-acts">
            <a className="btn sg-primary" href={preserveHref("/app/agent")}>
              {t({ en: "Back to iOrbit", zh: "回到 iOrbit" })}
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
