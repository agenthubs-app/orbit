/**
 * iOrbit 对话里的计划回答卡片（W0008，RW-08；版式取自已确认原型 iorbit-plan 的 chatHtml「结论在前」）。
 *
 * 顺序：一句话回答 → 3 个关键数字 → 阶段 → 这周就能做的 3 件事 → 你现在的人脉能帮上什么
 * （人物卡 + 虚线「还缺，要去认识」）→ 最大风险 → 30 秒自我介绍 → 每个阶段的细节（折叠）
 * → 「已保存为你的计划 v1」+「查看和跟踪 →」。
 *
 * 「生成中 → 已完成」：`reveal` 为 true 时按确定的顺序揭示（见 `iorbit-plan-card-model.ts`）。
 * 刷新或以 `?plan=<id>` 打开时 `reveal` 为 false，直接是已完成的卡片。
 * 只吃页面视图模型，不读 feature DTO、不发请求。
 */
"use client";

import { Fragment, useEffect, useState } from "react";

import { useOrbitLanguage } from "../../orbit-language-context";
import {
  PLAN_REVEAL_STEP_MS,
  planRevealDoneStage,
  type IOrbitPlanCardPhase,
  type IOrbitPlanCardView,
} from "./iorbit-plan-card-model";

export const PLAN_CARD_HREF = "/app/agent/plan";

type Translate = (copy: { en: string; zh: string }) => string;

const ZH_COUNTS = ["零", "一", "两", "三", "四", "五", "六"];

function weeksLabel(phase: Pick<IOrbitPlanCardPhase, "startWeek" | "endWeek" | "granularity" | "n">, t: Translate): string {
  if (phase.granularity === "quarter") return t({ en: `Quarter ${phase.n}`, zh: `第 ${phase.n} 季度` });
  return phase.startWeek === phase.endWeek
    ? t({ en: `Week ${phase.startWeek}`, zh: `第 ${phase.startWeek} 周` })
    : t({ en: `Weeks ${phase.startWeek}–${phase.endWeek}`, zh: `第 ${phase.startWeek}–${phase.endWeek} 周` });
}

function horizonLabel(view: IOrbitPlanCardView, t: Translate): string {
  if (view.horizon === "year") return t({ en: "Within a year · 4 quarters", zh: "一年内 · 4 个季度" });
  if (view.horizon === "month") return t({ en: `Within a month · ${view.totalWeeks} weeks`, zh: `一个月内 · ${view.totalWeeks} 周` });
  return t({ en: `Within 3 months · ${view.totalWeeks} weeks`, zh: `3 个月内 · ${view.totalWeeks} 周` });
}

function phaseCounts(phase: IOrbitPlanCardPhase, t: Translate): string {
  const parts: string[] = [];
  if (phase.actions.length) parts.push(t({ en: `${phase.actions.length} to-dos`, zh: `${phase.actions.length} 件事` }));
  if (phase.infos.length) parts.push(t({ en: `${phase.infos.length} questions`, zh: `${phase.infos.length} 个问题` }));
  if (phase.events.length) parts.push(t({ en: `${phase.events.length} events`, zh: `${phase.events.length} 场活动` }));
  return parts.join(" · ");
}

function actionLine(action: IOrbitPlanCardPhase["actions"][number], t: Translate): string {
  return action.week === null ? action.title : `${t({ en: `Week ${action.week}: `, zh: `第 ${action.week} 周：` })}${action.title}`;
}

export function IOrbitPlanCard({ reveal, view }: { reveal: boolean; view: IOrbitPlanCardView }) {
  const { preserveHref, t } = useOrbitLanguage();
  const doneStage = planRevealDoneStage(view);
  const [stage, setStage] = useState(reveal ? 0 : doneStage);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const done = stage >= doneStage;

  // 确定的揭示顺序：每 PLAN_REVEAL_STEP_MS 前进一步，直到全部完成。
  useEffect(() => {
    if (stage >= doneStage) return;
    const timer = setTimeout(() => setStage((current) => current + 1), PLAN_REVEAL_STEP_MS);
    return () => clearTimeout(timer);
  }, [doneStage, stage]);

  const phaseCountLabel =
    view.phases.length <= 6
      ? t({ en: `${view.phases.length} phases`, zh: `${ZH_COUNTS[view.phases.length]}个阶段` })
      : t({ en: `${view.phases.length} phases`, zh: `${view.phases.length} 个阶段` });
  const pendingPhase = view.phases[stage + 1];

  return (
    <div
      className="ir-pc"
      data-orbit-plan-card
      data-plan-card-stage={String(stage)}
      data-plan-card-state={done ? "done" : "generating"}
    >
      <div className="ir-pc-by">
        <i aria-hidden="true">✦</i>
        {t({
          en: `iOrbit · read your goal, ${view.read.contacts} contacts and ${view.read.events} upcoming events`,
          zh: `iOrbit · 读了你的目标、${view.read.contacts} 位联系人、${view.read.events} 场近期活动`,
        })}
      </div>

      <div className="ir-pc-ans">
        <div className="ir-pc-head" data-plan-card-answer>
          <span className="ir-pc-eyebrow">{t({ en: "The short answer", zh: "一句话回答" })}</span>
          <p>
            {view.answer.map((segment, index) =>
              segment.emphasis ? <em key={index}>{segment.text}</em> : <Fragment key={index}>{segment.text}</Fragment>,
            )}
          </p>
        </div>

        <div className="ir-pc-figs" data-plan-card-figures>
          {view.figures.map((figure) => (
            <div className="ir-pc-fig" key={figure.label}>
              <b>
                {figure.value}
                {figure.unit ? <small>{figure.unit}</small> : null}
              </b>
              <span>{figure.label}</span>
            </div>
          ))}
        </div>

        <div className="ir-pc-blk">
          <div className="ir-pc-blk-h">
            <h3>{phaseCountLabel}</h3>
            <em>{horizonLabel(view, t)}</em>
          </div>
          <div className="ir-pc-stones" data-plan-card-phases>
            {view.phases.map((phase, index) => {
              const filled = index <= stage;
              return (
                <div
                  className={phase.current ? "ir-pc-stone ir-pc-stone-cur" : "ir-pc-stone"}
                  data-plan-card-phase={phase.key}
                  data-plan-card-phase-state={filled ? "filled" : index === stage + 1 ? "skeleton" : "queued"}
                  key={phase.key}
                >
                  <div className="ir-pc-stone-top">
                    <span className="ir-pc-stone-n">{phase.n}</span>
                    <span className="ir-pc-stone-w">{weeksLabel(phase, t)}</span>
                  </div>
                  <h4>{phase.title}</h4>
                  {filled ? (
                    <>
                      {phase.summary ? <p>{phase.summary}</p> : null}
                      {phase.who.length ? (
                        <div className="ir-pc-who">
                          {t({ en: "Meet: ", zh: "要认识：" })}
                          {phase.who.map((who, whoIndex) => (
                            <Fragment key={who}>
                              {whoIndex > 0 ? t({ en: ", ", zh: "、" }) : null}
                              <b>{who}</b>
                            </Fragment>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : index === stage + 1 ? (
                    <div aria-hidden="true" className="ir-pc-skel">
                      <i style={{ width: "90%" }} />
                      <i style={{ width: "60%" }} />
                    </div>
                  ) : (
                    <div className="ir-pc-queued">{t({ en: "Queued…", zh: "排队中…" })}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {done ? (
          <>
            <div className="ir-pc-blk" data-plan-card-this-week>
              <div className="ir-pc-blk-h">
                <h3>{t({ en: "Three things you can do this week", zh: "这周就能做的 3 件事" })}</h3>
                <em>{t({ en: "Week 1", zh: "第 1 周" })}</em>
              </div>
              <ol className="ir-pc-todo3">
                {view.thisWeek.map((action, index) => (
                  <li key={action.title}>
                    <span className="ir-pc-i">{index + 1}</span>
                    <div>
                      <b>{action.title}</b>
                      <span>{action.why}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="ir-pc-blk" data-plan-card-allies>
              <div className="ir-pc-blk-h">
                <h3>{t({ en: "How your network can help now", zh: "你现在的人脉能帮上什么" })}</h3>
                <em>{t({ en: `${view.allies.length} people`, zh: `${view.allies.length} 位` })}</em>
              </div>
              {view.allies.length ? (
                <div className="ir-pc-allies">
                  {view.allies.map((ally) => (
                    <div className="ir-pc-ally" key={ally.name}>
                      <div className="ir-pc-ally-top">
                        <span aria-hidden="true" className="ir-pc-ini">
                          {ally.initial}
                        </span>
                        <div>
                          <b>{ally.name}</b>
                          {ally.subtitle ? <small>{ally.subtitle}</small> : null}
                        </div>
                      </div>
                      <p>{ally.help}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ir-pc-note">
                  {t({
                    en: "You don't have confirmed contacts yet — start with the people below.",
                    zh: "你还没有已确认的联系人，先从下面这些人开始认识。",
                  })}
                </p>
              )}
              <div className="ir-pc-blk-h ir-pc-gaps-h">
                <h3>{t({ en: "Still missing — go meet them", zh: "还缺，要去认识" })}</h3>
              </div>
              <div className="ir-pc-gaps" data-plan-card-gaps>
                {view.gaps.map((gap) => (
                  <span className="ir-pc-gap" key={gap}>
                    {gap}
                  </span>
                ))}
              </div>
            </div>

            <div className="ir-pc-risk" data-plan-card-risk>
              <b>{t({ en: "Biggest risk", zh: "最大风险" })}</b>
              <span>{view.risk}</span>
            </div>

            <figure className="ir-pc-quote" data-plan-card-pitch>
              <small>{view.pitch.setting}</small>
              <p>{view.pitch.text}</p>
            </figure>

            <div className="ir-pc-blk" data-plan-card-details>
              <div className="ir-pc-blk-h">
                <h3>{t({ en: "Details for each phase", zh: "每个阶段的细节" })}</h3>
                <em>{t({ en: "Also in “My plan”", zh: "也可以在「我的计划」里看" })}</em>
              </div>
              <div>
                {view.phases.map((phase) => {
                  const expanded = open[phase.key] === true;
                  return (
                    <div className="ir-pc-acc" key={phase.key}>
                      <button
                        aria-expanded={expanded}
                        className="btn ir-pc-acc-h"
                        data-plan-card-accordion={phase.key}
                        onClick={() => setOpen((current) => ({ ...current, [phase.key]: !expanded }))}
                        type="button"
                      >
                        {t({ en: `Phase ${phase.n} · ${phase.title}`, zh: `第 ${phase.n} 阶段 · ${phase.title}` })}
                        <span>
                          {phaseCounts(phase, t)} {expanded ? "▴" : "▾"}
                        </span>
                      </button>
                      {expanded ? (
                        <div className="ir-pc-acc-b">
                          {phase.actions.length ? (
                            <div>
                              <h5>{t({ en: "To do", zh: "要做的事" })}</h5>
                              <ul>
                                {phase.actions.map((action) => (
                                  <li key={action.title}>{actionLine(action, t)}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {phase.infos.length ? (
                            <div>
                              <h5>{t({ en: "To find out", zh: "要搞清楚" })}</h5>
                              <ul>
                                {phase.infos.map((info) => (
                                  <li key={info}>{info}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {phase.who.length ? (
                            <div>
                              <h5>{t({ en: "People to meet", zh: "要认识的人" })}</h5>
                              <ul>
                                {phase.who.map((who) => (
                                  <li key={who}>{who}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {phase.events.length ? (
                            <div>
                              <h5>{t({ en: "Events to go to", zh: "可以去的活动" })}</h5>
                              <ul>
                                {phase.events.map((event) => (
                                  <li key={event.title}>{event.date ? `${event.date} ${event.title}` : event.title}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {phase.followups.length ? (
                            <div>
                              <h5>{t({ en: "How to follow up", zh: "认识之后怎么跟进" })}</h5>
                              <ul>
                                {phase.followups.map((line) => (
                                  <li key={line}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {!phase.detailed ? (
                            <p className="ir-pc-note">
                              {t({
                                en: "This phase gets its weekly steps when you reach it.",
                                zh: "进入这一阶段时再细化到每周。",
                              })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ir-pc-saved" data-plan-card-saved>
              <div>
                <b>{t({ en: `Saved as your plan v${view.version}`, zh: `已保存为你的计划 v${view.version}` })}</b>
                <span>
                  {t({
                    en: "Tick things off and log progress on the plan page; iOrbit's weekly focus follows along.",
                    zh: "之后在计划页打勾、记录进展，iOrbit 的本周推进会跟着更新。",
                  })}
                </span>
              </div>
              <a className="ir-pc-saved-link" data-plan-card-open href={preserveHref(PLAN_CARD_HREF)}>
                {t({ en: "View and track →", zh: "查看和跟踪 →" })}
              </a>
            </div>
          </>
        ) : (
          <div aria-live="polite" className="ir-pc-gen" data-plan-card-generating role="status">
            <i aria-hidden="true" className="ir-pc-dot" />
            {stage + 1 < view.phases.length
              ? t({
                  en: `Generating… filling in phase ${pendingPhase?.n ?? view.phases.length}`,
                  zh: `生成中 · 正在补齐第 ${pendingPhase?.n ?? view.phases.length} 阶段的细节…`,
                })
              : t({ en: "Generating… putting this week together", zh: "生成中 · 正在整理这周就能做的事…" })}
          </div>
        )}
      </div>
    </div>
  );
}
