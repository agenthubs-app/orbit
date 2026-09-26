/**
 * 引导里的 iOrbit 首日 / Network 空状态预览（设计 322–503 行）。
 * 这是「完成设置后会看到什么」的展示：示例活动与示例人物都标注「示例」，
 * 不是真实推荐。整块可点击——点任何位置都跳回对应的填写步骤（带 data-ob-goto 的元素
 * 跳到指定步骤，其余跳到第一个未完成的步骤）。
 */
"use client";

import type { MouseEvent, ReactNode } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import type { Copy, OnboardingStep } from "./onboarding-model";

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
  const { t } = useOrbitLanguage();
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
            ? t({ zh: "预览 · 这里会随你的资料和人脉变成真实内容。点击任意位置可继续完善设置。", en: "Preview · this fills with real content as your profile and network grow. Click anywhere to keep setting up." })
            : t({ zh: "预览 · 这是完成设置后的样子。点击任意位置，继续完成设置。", en: "Preview · this is what you get after setup. Click anywhere to continue setting up." })}
        </span>
        <span className="ob-banner-actions">
          <button className="btn ob-btn-soft" type="button">{t({ zh: "继续设置 →", en: "Continue setup →" })}</button>
          {props.complete ? <button className="btn ob-btn-soft" type="button" {...{ "data-ob-goto": "enter" }}>{t({ zh: "进入 Orbit", en: "Enter Orbit" })}</button> : null}
        </span>
      </div>
      {children}
    </div>
  );
}

function SectionHead({ icon, title, note, sample, right }: { icon: string; title: string; note?: string; sample?: boolean; right?: ReactNode }) {
  const { t } = useOrbitLanguage();
  return (
    <div className="ob-sec-head">
      <span className="ob-sec-title">
        <span className="ob-sec-icon" aria-hidden>{icon}</span>
        <strong>{title}</strong>
        {note ? <span className="ob-note">{note}</span> : null}
        {sample ? <span className="ob-sample">{t({ zh: "示例", en: "Sample" })}</span> : null}
      </span>
      {right}
    </div>
  );
}

// 示例活动（设计 EVENTS），只作展示，点击跳到目标步骤。
const SAMPLE_EVENTS: readonly { month: Copy; day: string; title: Copy; meta: Copy; people: Copy; reason: Copy }[] = [
  {
    month: { zh: "9月", en: "Sep" }, day: "30",
    title: { zh: "东京 AI 创业者交流会", en: "Tokyo AI Founders Mixer" },
    meta: { zh: "周三 18:30 · 东京国际论坛", en: "Wed 18:30 · Tokyo International Forum" },
    people: { zh: "480 人报名 · 62 人公开画像", en: "480 registered · 62 public profiles" },
    reason: { zh: "聚焦 AI 出海，适合第一次来东京拓展人脉。", en: "Focused on AI going global — a good first event for building a Tokyo network." },
  },
  {
    month: { zh: "10月", en: "Oct" }, day: "4",
    title: { zh: "日本–亚洲创业峰会", en: "Japan–Asia Startup Summit" },
    meta: { zh: "周日 10:00 · 虎之门之丘", en: "Sun 10:00 · Toranomon Hills" },
    people: { zh: "1,200 人报名 · 38 位投资人", en: "1,200 registered · 38 investors" },
    reason: { zh: "中日创业者与投资人集中，适合快速建立第一批联系。", en: "Founders and investors from China and Japan — quick way to make first connections." },
  },
  {
    month: { zh: "10月", en: "Oct" }, day: "8",
    title: { zh: "产品经理 Meetup（东京）", en: "Product Managers Meetup (Tokyo)" },
    meta: { zh: "周四 19:00 · WeWork 东京", en: "Thu 19:00 · WeWork Tokyo" },
    people: { zh: "90 人 · 小规模深聊", en: "90 people · small, in-depth" },
    reason: { zh: "规模小，适合真正聊透——新用户第一场活动的稳妥选择。", en: "Small enough for real conversations — a safe first event." },
  },
];

const SAMPLE_PEOPLE: readonly { ch: string; name: string; org: Copy; why: Copy }[] = [
  { ch: "佐", name: "佐藤真理", org: { zh: "企业协作工具 · 增长负责人", en: "Collaboration SaaS · Head of Growth" }, why: { zh: "她的团队在找日英双语会议方案——和你的方向可能重合。", en: "Her team is looking for bilingual meeting tools — possibly aligned with you." } },
  { ch: "陈", name: "陈以宁", org: { zh: "日本市场 · 早期投资人", en: "Japan market · Early-stage investor" }, why: { zh: "只投早期出海项目，峰会有 15 分钟开放交流时段。", en: "Invests only in early cross-border startups; has open office hours at the summit." } },
  { ch: "林", name: "林夏", org: { zh: "创业社区运营 · 东京", en: "Startup community lead · Tokyo" }, why: { zh: "认识大量在东京的中文创业者，适合作为第一位“本地向导”。", en: "Knows many Chinese-speaking founders in Tokyo — a natural first local guide." } },
];

export function OnboardingHomePreview(props: OnboardingPreviewProps) {
  const { t } = useOrbitLanguage();
  const plan: { title: Copy; hint: Copy; done: boolean; cta: Copy; step: OnboardingStep }[] = [
    { title: { zh: "完善个人资料", en: "Complete your profile" }, hint: { zh: "别人在活动中看到的第一眼", en: "The first thing people see at events" }, done: props.progress.profileDone, cta: { zh: "去完善", en: "Complete" }, step: "profile" },
    { title: { zh: "设定当前目标", en: "Set your current goal" }, hint: { zh: "决定 iOrbit 为你推荐什么", en: "Decides what iOrbit recommends" }, done: props.progress.goalsDone, cta: { zh: "去设定", en: "Set goal" }, step: "goals" },
    { title: { zh: "写下能提供与在寻找的", en: "Add what you offer and seek" }, hint: { zh: "决定谁会被推荐给你", en: "Decides who gets recommended to you" }, done: props.progress.personaDone, cta: { zh: "去填写", en: "Fill in" }, step: "persona" },
    { title: { zh: "生成你的自我介绍", en: "Generate your introduction" }, hint: { zh: "iOrbit 帮你写，改几个字就好", en: "iOrbit drafts it; tweak a few words" }, done: props.progress.introDone, cta: { zh: "去生成", en: "Generate" }, step: "intro" },
    { title: { zh: "扫描第一张名片", en: "Scan your first business card" }, hint: { zh: "可选 · 把已有人脉带进来", en: "Optional · bring in people you know" }, done: false, cta: { zh: "去扫描", en: "Scan" }, step: "import" },
  ];
  const done = plan.filter(item => item.done).length;
  const focus = props.focus.trim();
  return (
    <PreviewFrame props={props} screen="home">
      <div className="ob-preview-top">
        <div className="ob-col-tight">
          <h1 className="ob-preview-h1">{props.name ? t({ zh: `欢迎，${props.name}`, en: `Welcome, ${props.name}` }) : t({ zh: "欢迎来到 iOrbit", en: "Welcome to iOrbit" })}</h1>
          <p className="ob-p ob-p-lg">{t({ zh: "你的轨道还是空的——这很正常。我们从你的目标开始。", en: "Your orbit is empty — that's normal. Let's start from your goal." })}</p>
        </div>
        <span className="ob-date">{props.todayLabel}</span>
      </div>

      <div className="ob-col-ask">
        <div className="ob-ask" {...goto("goals")}>
          <span className="ob-spark" aria-hidden>✦</span>
          <span className="ob-ask-text">{focus ? t({ zh: `继续：${focus}`, en: `Continue: ${focus}` }) : t({ zh: "告诉我你想推进什么，我帮你找到该认识的人", en: "Tell me what you want to move forward and I'll find who to meet" })}</span>
          <span className="ob-ask-go" aria-hidden>→</span>
        </div>
        <div className="ob-chips">
          <button className="btn ob-quick" type="button" {...goto("persona")}>{t({ zh: "我应该先认识哪类人？", en: "Who should I meet first?" })}</button>
          <button className="btn ob-quick" type="button" {...goto("goals")}>{t({ zh: "推荐适合我目标的活动", en: "Recommend events for my goal" })}</button>
          <button className="btn ob-quick" type="button" {...goto("intro")}>{t({ zh: "帮我写一段 30 秒自我介绍", en: "Write me a 30-second intro" })}</button>
        </div>
      </div>

      <div className="ob-two">
        <section className="ob-sec">
          <SectionHead icon="◎" title={t({ zh: "第一周计划", en: "First-week plan" })} right={<span className="ob-note">{t({ zh: `${done} / ${plan.length} 完成`, en: `${done} / ${plan.length} done` })}</span>} />
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
            <strong>{t({ zh: "0 位联系人", en: "0 contacts" })}</strong>
            <span>{t({ zh: "扫描名片，或在活动后记录新认识的人——他们会出现在你的轨道上。", en: "Scan business cards or log people you meet at events — they'll appear in your orbit." })}</span>
          </span>
          <button className="btn ob-btn-dark ob-btn-dark-md" type="button">{t({ zh: "扫描名片", en: "Scan business cards" })}</button>
        </section>
      </div>

      <section className="ob-sec" {...goto("goals")}>
        <SectionHead icon="✧" sample title={t({ zh: "认识第一批人的最快方式", en: "The fastest way to meet your first people" })} note={t({ zh: "设定目标后按目标挑选近期活动", en: "Picked from upcoming events once your goal is set" })} />
        <div className="ob-events">
          {SAMPLE_EVENTS.map(event => (
            <div className="ob-event" key={event.day}>
              <span className="ob-event-top">
                <span className="ob-event-date"><small>{t(event.month)}</small><strong>{event.day}</strong></span>
                <span className="ob-event-copy"><strong>{t(event.title)}</strong><span>{t(event.meta)}</span></span>
              </span>
              <span className="ob-reason"><span className="ob-spark" aria-hidden>✦</span><span>{props.firstGoal ? t({ zh: `会按你的目标「${props.firstGoal}」解释为什么推荐。`, en: `Will explain why it fits your goal “${props.firstGoal}”.` }) : t(event.reason)}</span></span>
              <span className="ob-event-foot"><span>{t(event.people)}</span><button className="btn ob-btn-dark ob-btn-dark-sm" type="button">{t({ zh: "报名", en: "Register" })}</button></span>
            </div>
          ))}
        </div>
      </section>

      <div className="ob-two">
        <section className="ob-sec" {...goto("profile")}>
          <SectionHead icon="▦" title={t({ zh: "今日日程", en: "Today" })} />
          <div className="ob-empty-block">
            <span>{t({ zh: "今天还没有日程。", en: "Nothing scheduled today." })}</span>
            <span>{t({ zh: "报名的活动会自动出现在这里，iOrbit 会在活动前告诉你该见谁、聊什么。", en: "Events you register for appear here; iOrbit tells you who to meet and what to talk about beforehand." })}</span>
          </div>
        </section>
        <section className="ob-sec" {...goto("persona")}>
          <SectionHead icon="⚇" title={t({ zh: "联系人机会", en: "Contact opportunities" })} />
          <div className="ob-empty-block">
            <span>{t({ zh: "这里会告诉你谁值得现在联系，以及为什么。", en: "This tells you who is worth contacting now, and why." })}</span>
            <span>{t({ zh: "目前还没有可以判断的关系。填好「能提供 / 在寻找」后，iOrbit 会先从同场参与者中找出与你目标最相关的人。", en: "No relationships to judge yet. Once you fill in what you offer and seek, iOrbit starts with the most relevant attendees at your events." })}</span>
            <button className="btn ob-btn-soft" type="button">{t({ zh: "看看可能值得认识的人 →", en: "See people worth meeting →" })}</button>
          </div>
        </section>
      </div>
    </PreviewFrame>
  );
}

export function OnboardingNetworkPreview(props: OnboardingPreviewProps) {
  const { t } = useOrbitLanguage();
  return (
    <PreviewFrame props={props} screen="network">
      <div className="ob-net-top">
        <div className="ob-col-title">
          <h1 className="ob-preview-h1 ob-net-title">{t({ zh: "人脉", en: "Network" })}</h1>
          <p className="ob-p">{t({ zh: "理解你的人脉结构，把重要关系持续向前推进。", en: "Understand your network and keep important relationships moving." })}</p>
        </div>
        <div className="ob-net-head-btns">
          <button className="btn ob-btn-square ob-btn-square-dark" type="button" {...goto("import")}>{t({ zh: "＋ 扫描名片", en: "+ Scan cards" })}</button>
        </div>
      </div>

      <section className="ob-net-hero">
        <div className="ob-net-copy">
          <h2 className="ob-net-h2">{t({ zh: "你的人脉，", en: "Your network" })}<br />{t({ zh: "会在这里成形。", en: "takes shape here." })}</h2>
          <p className="ob-p ob-p-lg ob-net-p">{t({ zh: "每位联系人都会带着“在哪认识、聊了什么、答应了什么”。从下面任意一种方式开始。", en: "Every contact carries where you met, what you talked about and what you promised. Start any of these ways." })}</p>
          <div className="ob-net-ways">
            <button className="btn ob-net-way" type="button" {...goto("import")}>
              <span className="ob-net-way-icon" aria-hidden>▭</span>
              <span className="ob-net-way-body"><strong>{t({ zh: "扫描名片", en: "Scan business cards" })}</strong><span>{t({ zh: "批量拍摄纸质名片，自动识别后由你确认", en: "Photograph paper cards in bulk; you confirm what's recognised" })}</span></span>
              <span className="ob-faint" aria-hidden>›</span>
            </button>
            <button className="btn ob-net-way" type="button" {...goto("goals")}>
              <span className="ob-net-way-icon" aria-hidden>✧</span>
              <span className="ob-net-way-body"><strong>{t({ zh: "去一场活动认识新的人", en: "Meet new people at an event" })}</strong><span>{t({ zh: "现场交换的名片会自动出现在这里", en: "Cards exchanged on site show up here automatically" })}</span></span>
              <span className="ob-faint" aria-hidden>›</span>
            </button>
          </div>
        </div>
        <div className="ob-net-orbit">
          <span className="ob-ring" />
          <span className="ob-ring ob-ring-2" />
          <span className="ob-ring-3" />
          <span className="ob-net-core">{props.initial}</span>
          <span className="ob-net-count">{t({ zh: "0 位联系人", en: "0 contacts" })}</span>
        </div>
      </section>

      <section className="ob-sec" {...goto("persona")}>
        <SectionHead icon="✦" sample title={t({ zh: "可能值得认识的人", en: "People worth meeting" })} note={t({ zh: "来自近期活动中公开画像的参与者", en: "From attendees with public profiles at upcoming events" })} />
        {SAMPLE_PEOPLE.map(person => (
          <div className="ob-person" key={person.name}>
            <span className="ob-person-avatar" aria-hidden>{person.ch}</span>
            <span className="ob-person-main"><strong>{person.name}</strong><span>{t(person.org)}</span></span>
            <span className="ob-person-why">{t(person.why)}</span>
            <button className="btn ob-btn-soft" type="button">{t({ zh: "填好画像后匹配", en: "Match after setup" })}</button>
          </div>
        ))}
        <span className="ob-fine">{t({ zh: "只有对方公开了活动画像才会出现。交换联系方式需双方同意。", en: "Only attendees who made their event profile public appear. Exchanging contact details needs both sides to agree." })}</span>
      </section>
    </PreviewFrame>
  );
}
