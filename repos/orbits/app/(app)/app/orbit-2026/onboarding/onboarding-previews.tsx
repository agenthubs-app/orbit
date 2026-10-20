/**
 * 引导里的 iOrbit 首日 / Network 空状态预览（设计 322–503 行）。
 * 这是「完成设置后会看到什么」的展示：示例活动与示例人物都标注「示例」，
 * 不是真实推荐。整块可点击——点任何位置都跳回对应的填写步骤（带 data-ob-goto 的元素
 * 跳到指定步骤，其余跳到第一个未完成的步骤）。
 */
"use client";

import type { MouseEvent, ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import { ONBOARDING_COPY, ONBOARDING_PREVIEW_PEOPLE } from "../copy/onboarding";
import type { Copy, OnboardingStep } from "./onboarding-model";

function usePreviewCopy() {
  const { t } = useOrbitLanguage();
  return (copy: Copy) => t(copy);
}

export interface PreviewProgress {
  profileDone: boolean;
  goalsDone: boolean;
  personaDone: boolean;
  introDone: boolean;
}

export interface OnboardingPreviewProps {
  complete: boolean;
  firstGoal: string;
  focus: string;
  initial: string;
  name: string;
  onEnter: () => void;
  onGo: (step: OnboardingStep) => void;
  progress: PreviewProgress;
  todayLabel: string;
}

function goto(step: OnboardingStep) {
  return { "data-ob-goto": step };
}

function readGoto(event: MouseEvent<HTMLElement>): OnboardingStep | null | "enter" {
  const target = (event.target as HTMLElement | null)?.closest?.("[data-ob-goto]");
  const value = target?.getAttribute("data-ob-goto");
  if (value === "enter") return "enter";
  return value === "profile" || value === "goals" || value === "persona" || value === "intro" || value === "import" ? value : null;
}

export function firstIncompleteStep(progress: PreviewProgress): OnboardingStep {
  if (!progress.profileDone) return "profile";
  if (!progress.goalsDone) return "goals";
  if (!progress.personaDone) return "persona";
  if (!progress.introDone) return "intro";
  return "import";
}

function PreviewFrame({ children, props, screen }: { children: ReactNode; props: OnboardingPreviewProps; screen: "home" | "network" }) {
  const t = usePreviewCopy();
  function onClick(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    const target = readGoto(event);
    if (target === "enter") {
      props.onEnter();
      return;
    }
    props.onGo(target ?? firstIncompleteStep(props.progress));
  }
  return (
    <div className="ob-preview" data-screen={screen} onClick={onClick} role="presentation">
      <div className="ob-preview-banner" role="note">
        <span>
          <span className="ob-spark" aria-hidden>✦ </span>
          {props.complete
            ? t(ONBOARDING_COPY.preview001)
            : t(ONBOARDING_COPY.preview002)}
        </span>
        <span className="ob-banner-actions">
          <button className="btn ob-btn-soft" type="button">{t(ONBOARDING_COPY.preview003)}</button>
          {props.complete ? <button className="btn ob-btn-soft" type="button" {...{ "data-ob-goto": "enter" }}>{t(ONBOARDING_COPY.preview004)}</button> : null}
        </span>
      </div>
      {children}
    </div>
  );
}

function SectionHead({ icon, title, note, sample, right }: { icon: string; title: string; note?: string; sample?: boolean; right?: ReactNode }) {
  const t = usePreviewCopy();
  return (
    <div className="ob-sec-head">
      <span className="ob-sec-title">
        <span className="ob-sec-icon" aria-hidden>{icon}</span>
        <strong>{title}</strong>
        {note ? <span className="ob-note">{note}</span> : null}
        {sample ? <span className="ob-sample">{t(ONBOARDING_COPY.preview005)}</span> : null}
      </span>
      {right}
    </div>
  );
}

// 示例活动（设计 EVENTS），只作展示，点击跳到目标步骤。
const SAMPLE_EVENTS: readonly { month: Copy; day: string; title: Copy; meta: Copy; people: Copy; reason: Copy }[] = [
  {
    month: ONBOARDING_COPY.preview006, day: "30",
    title: ONBOARDING_COPY.preview007,
    meta: ONBOARDING_COPY.preview008,
    people: ONBOARDING_COPY.preview009,
    reason: ONBOARDING_COPY.preview010,
  },
  {
    month: ONBOARDING_COPY.preview011, day: "4",
    title: ONBOARDING_COPY.preview012,
    meta: ONBOARDING_COPY.preview013,
    people: ONBOARDING_COPY.preview014,
    reason: ONBOARDING_COPY.preview015,
  },
  {
    month: ONBOARDING_COPY.preview016, day: "8",
    title: ONBOARDING_COPY.preview017,
    meta: ONBOARDING_COPY.preview018,
    people: ONBOARDING_COPY.preview019,
    reason: ONBOARDING_COPY.preview020,
  },
];

const SAMPLE_PEOPLE: readonly { ch: string; name: string; org: Copy; why: Copy }[] = [
  { ...ONBOARDING_PREVIEW_PEOPLE[0], org: ONBOARDING_COPY.preview021, why: ONBOARDING_COPY.preview022 },
  { ...ONBOARDING_PREVIEW_PEOPLE[1], org: ONBOARDING_COPY.preview023, why: ONBOARDING_COPY.preview024 },
  { ...ONBOARDING_PREVIEW_PEOPLE[2], org: ONBOARDING_COPY.preview025, why: ONBOARDING_COPY.preview026 },
];

export function OnboardingHomePreview(props: OnboardingPreviewProps) {
  const t = usePreviewCopy();
  const plan: { title: Copy; hint: Copy; done: boolean; cta: Copy; step: OnboardingStep }[] = [
    { title: ONBOARDING_COPY.preview027, hint: ONBOARDING_COPY.preview028, done: props.progress.profileDone, cta: ONBOARDING_COPY.preview029, step: "profile" },
    { title: ONBOARDING_COPY.preview030, hint: ONBOARDING_COPY.preview031, done: props.progress.goalsDone, cta: ONBOARDING_COPY.preview032, step: "goals" },
    { title: ONBOARDING_COPY.preview033, hint: ONBOARDING_COPY.preview034, done: props.progress.personaDone, cta: ONBOARDING_COPY.preview035, step: "persona" },
    { title: ONBOARDING_COPY.preview036, hint: ONBOARDING_COPY.preview037, done: props.progress.introDone, cta: ONBOARDING_COPY.preview038, step: "intro" },
    { title: ONBOARDING_COPY.preview039, hint: ONBOARDING_COPY.preview040, done: false, cta: ONBOARDING_COPY.preview041, step: "import" },
  ];
  const done = plan.filter(item => item.done).length;
  const focus = props.focus.trim();
  return (
    <PreviewFrame props={props} screen="home">
      <div className="ob-preview-top">
        <div className="ob-col-tight">
          <h1 className="ob-preview-h1">{props.name ? t({ zh: `欢迎，${props.name}`, en: `Welcome, ${props.name}`, ja: `ようこそ、${props.name}さん` }) : t(ONBOARDING_COPY.preview042)}</h1>
          <p className="ob-p ob-p-lg">{t(ONBOARDING_COPY.preview043)}</p>
        </div>
        <span className="ob-date">{props.todayLabel}</span>
      </div>

      <div className="ob-col-ask">
        <div className="ob-ask" {...goto("goals")}>
          <span className="ob-spark" aria-hidden>✦</span>
          <span className="ob-ask-text">{focus ? t({ zh: `继续：${focus}`, en: `Continue: ${focus}`, ja: `続ける：${focus}` }) : t(ONBOARDING_COPY.preview044)}</span>
          <span className="ob-ask-go" aria-hidden>→</span>
        </div>
        <div className="ob-chips">
          <button className="btn ob-quick" type="button" {...goto("persona")}>{t(ONBOARDING_COPY.preview045)}</button>
          <button className="btn ob-quick" type="button" {...goto("goals")}>{t(ONBOARDING_COPY.preview046)}</button>
          <button className="btn ob-quick" type="button" {...goto("intro")}>{t(ONBOARDING_COPY.preview047)}</button>
        </div>
      </div>

      <div className="ob-two">
        <section className="ob-sec">
          <SectionHead icon="◎" title={t(ONBOARDING_COPY.preview048)} right={<span className="ob-note">{t({ zh: `${done} / ${plan.length} 完成`, en: `${done} / ${plan.length} done`, ja: `${done} / ${plan.length} 完了` })}</span>} />
          <span className="ob-track"><span style={{ width: `${(done / plan.length) * 100}%` }} /></span>
          <div>
            {plan.map(item => (
              <div className={`ob-plan-row${item.done ? " ob-plan-done" : ""}`} key={item.step} {...goto(item.step)}>
                <span className={`ob-dot${item.done ? " ob-dot-on" : ""}`} aria-hidden>{item.done ? "✓" : ""}</span>
                <span className="ob-plan-body"><strong>{t(item.title)}</strong><span>{t(item.hint)}</span></span>
                {item.done ? null : <button className="btn ob-btn-soft ob-btn-soft-sm" type="button">{t(item.cta)}</button>}
              </div>
            ))}
          </div>
        </section>

        <section className="ob-orbit" {...goto("import")}>
          <div className="ob-rings">
            <span className="ob-ring" />
            <span className="ob-ring ob-ring-2" />
            <span className="ob-core">{props.initial}</span>
          </div>
          <span className="ob-orbit-copy">
            <strong>{t(ONBOARDING_COPY.preview049)}</strong>
            <span>{t(ONBOARDING_COPY.preview050)}</span>
          </span>
          <button className="btn ob-btn-dark ob-btn-dark-md" type="button">{t(ONBOARDING_COPY.preview051)}</button>
        </section>
      </div>

      <section className="ob-sec" id="ob-events" {...goto("goals")}>
        <SectionHead icon="✧" sample title={t(ONBOARDING_COPY.preview052)} note={t(ONBOARDING_COPY.preview053)} />
        <div className="ob-events">
          {SAMPLE_EVENTS.map(event => (
            <div className="ob-event" key={event.day}>
              <span className="ob-event-top">
                <span className="ob-event-date"><small>{t(event.month)}</small><strong>{event.day}</strong></span>
                <span className="ob-event-copy"><strong>{t(event.title)}</strong><span>{t(event.meta)}</span></span>
              </span>
              <span className="ob-reason"><span className="ob-spark" aria-hidden>✦</span><span>{props.firstGoal ? t({ zh: `会按你的目标「${props.firstGoal}」解释为什么推荐。`, en: `Will explain why it fits your goal “${props.firstGoal}”.`, ja: `目標「${props.firstGoal}」に合う理由をお伝えします。` }) : t(event.reason)}</span></span>
              <span className="ob-event-foot"><span>{t(event.people)}</span><button className="btn ob-btn-dark ob-btn-dark-sm" type="button">{t(ONBOARDING_COPY.preview054)}</button></span>
            </div>
          ))}
        </div>
      </section>

      <div className="ob-two">
        <section className="ob-sec" {...goto("profile")}>
          <SectionHead icon="▦" title={t(ONBOARDING_COPY.preview055)} />
          <div className="ob-empty-block">
            <span>{t(ONBOARDING_COPY.preview056)}</span>
            <span>{t(ONBOARDING_COPY.preview057)}</span>
          </div>
        </section>
        <section className="ob-sec" {...goto("persona")}>
          <SectionHead icon="⚇" title={t(ONBOARDING_COPY.preview058)} />
          <div className="ob-empty-block">
            <span>{t(ONBOARDING_COPY.preview059)}</span>
            <span>{t(ONBOARDING_COPY.preview060)}</span>
            <button className="btn ob-btn-soft" type="button">{t(ONBOARDING_COPY.preview061)}</button>
          </div>
        </section>
      </div>
    </PreviewFrame>
  );
}

export function OnboardingNetworkPreview(props: OnboardingPreviewProps) {
  const t = usePreviewCopy();
  return (
    <PreviewFrame props={props} screen="network">
      <div className="ob-net-top">
        <div className="ob-col-title">
          <h1 className="ob-preview-h1 ob-net-title">{t(ONBOARDING_COPY.preview062)}</h1>
          <p className="ob-p">{t(ONBOARDING_COPY.preview063)}</p>
        </div>
        <div className="ob-net-head-btns">
          <button className="btn ob-btn-square ob-btn-square-dark" type="button" {...goto("import")}>{t(ONBOARDING_COPY.preview064)}</button>
        </div>
      </div>

      <section className="ob-net-hero">
        <div className="ob-net-copy">
          <h2 className="ob-net-h2">{t(ONBOARDING_COPY.preview065)}<br />{t(ONBOARDING_COPY.preview066)}</h2>
          <p className="ob-p ob-p-lg ob-net-p">{t(ONBOARDING_COPY.preview067)}</p>
          <div className="ob-net-ways">
            <button className="btn ob-net-way" type="button" {...goto("import")}>
              <span className="ob-net-way-icon" aria-hidden>▭</span>
              <span className="ob-net-way-body"><strong>{t(ONBOARDING_COPY.preview068)}</strong><span>{t(ONBOARDING_COPY.preview069)}</span></span>
              <span className="ob-faint" aria-hidden>›</span>
            </button>
            <button className="btn ob-net-way" type="button" {...goto("goals")}>
              <span className="ob-net-way-icon" aria-hidden>✧</span>
              <span className="ob-net-way-body"><strong>{t(ONBOARDING_COPY.preview070)}</strong><span>{t(ONBOARDING_COPY.preview071)}</span></span>
              <span className="ob-faint" aria-hidden>›</span>
            </button>
          </div>
        </div>
        <div className="ob-net-orbit">
          <span className="ob-ring" />
          <span className="ob-ring ob-ring-2" />
          <span className="ob-ring-3" />
          <span className="ob-net-core">{props.initial}</span>
          <span className="ob-net-count">{t(ONBOARDING_COPY.preview072)}</span>
        </div>
      </section>

      <section className="ob-sec" {...goto("persona")}>
        <SectionHead icon="✦" sample title={t(ONBOARDING_COPY.preview073)} note={t(ONBOARDING_COPY.preview074)} />
        {SAMPLE_PEOPLE.map(person => (
          <div className="ob-person" key={person.name}>
            <span className="ob-person-avatar" aria-hidden>{person.ch}</span>
            <span className="ob-person-main"><strong>{person.name}</strong><span>{t(person.org)}</span></span>
            <span className="ob-person-why">{t(person.why)}</span>
            <button className="btn ob-btn-soft" type="button">{t(ONBOARDING_COPY.preview075)}</button>
          </div>
        ))}
        <span className="ob-fine">{t(ONBOARDING_COPY.preview076)}</span>
      </section>
    </PreviewFrame>
  );
}
