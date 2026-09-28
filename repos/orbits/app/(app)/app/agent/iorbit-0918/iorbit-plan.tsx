/**
 * 「我的计划」（`/app/agent/plan`，RW-10，Sprint W0009）。整体重写，取代 Orbit_0918 的
 * 「执行计划」屏（本周重点 = 跟进 + 账本、「4 周推进节奏」等 W4 占位）。
 *
 * 版式取自已确认原型 iorbit-plan 的「我的计划」页，沿用首页的报刊式语言：
 *   面包屑   iOrbit / 我的计划
 *   报头     目标原文（衬线大标题）+「计划 vN · M/D 生成 · …」+「目标分析 ▾」（默认折叠）
 *            +「重新分析 · 本月剩 1 次」（占位，禁用）+ 周进度刻度（阶段区间、本周高亮）
 *   左栏     本周 · 第 n 周（可打勾的行动，逾期的标「已延后 N 周」）+ 可折叠的阶段（当前展开）
 *   右栏     人脉需求（已建立联系 / 已关联计数、人员按添加倒序）+ 计划里的活动
 *   底部     进展记录（手动记一笔 + 时间线）
 *
 * 数据：服务端页面以本人身份读当前生效计划（`PlanService.getCurrent()`）作为首帧；
 * 视图全部由 `plan-route-view-model.ts` 从快照推导。写操作只走 W0007 的接口
 * （`iorbit-plan-client.ts`）：打勾乐观更新，失败把这一条回滚并提示；手动记录成功后插到最前。
 *
 * 不做（后续 Sprint）：重新分析（W0012，按钮先禁用）、「待确认 N」匹配确认（W0010，
 * 角标位置保留、计数恒为 0 不显示）、进展记录里的 @ 联系人解析与周一小结（W0012）。
 */
"use client";

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { PlanSnapshot } from "../../../../../features/plans/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import {
  buildMyPlanViewModel,
  type MyPlanContactName,
  type MyPlanPhase,
  type MyPlanView,
} from "../plan/plan-route-view-model";
import {
  newPlanIdempotencyKey,
  patchPlanActionDone,
  postPlanNote,
  withActionDone,
  withLogEntry,
  withServerItem,
} from "./iorbit-plan-client";
import { IOrbitScreenFrame } from "./iorbit-screen-frame";

export interface IOrbitPlanProps {
  /** 服务端读到的当前生效计划：null = 还没有；"unavailable" = 计划服务读不到。 */
  initialSnapshot: PlanSnapshot | null | "unavailable";
  /** 引导开关（`ORBIT_GUIDE_DEMO`）：打开时无计划引导去 `/app/start` 第 3 步。 */
  guideEnabled: boolean;
  /** 生成快照以外的联系人名字（id → 名字），可选。 */
  contactNames?: Readonly<Record<string, MyPlanContactName>>;
  /** 覆盖点，仅测试使用：可注入的时钟。 */
  now?: Date;
}

export function IOrbitPlan({ contactNames, guideEnabled, initialSnapshot, now }: IOrbitPlanProps) {
  const { language, t } = useOrbitLanguage();
  const lang = language === "zh" ? "zh" : "en";
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  // 本次打开页面后打过勾（或取消）的行动：已完成也暂留在本周列表里方便撤销，刷新后消失。
  const [sticky, setSticky] = useState<readonly string[]>([]);
  const clock = useMemo(() => now ?? new Date(), [now]);
  const model = buildMyPlanViewModel({
    contactNames,
    guideEnabled,
    language: lang,
    now: clock,
    snapshot,
    stickyActionIds: sticky,
  });
  const screenTitle = t({ en: "My plan", zh: "我的计划" });

  return (
    <IOrbitScreenFrame ready screenTitle={screenTitle}>
      <div className="ir-screen" data-orbit-iorbit-screen="plan">
        <span className="ir-crumb">
          <a href="/app/agent">iOrbit</a> / {screenTitle}
        </span>
        {model.state === "ready" && snapshot && snapshot !== "unavailable" ? (
          <PlanBody
            items={snapshot.items}
            onTicked={(itemId) => setSticky((current) => (current.includes(itemId) ? current : [...current, itemId]))}
            onSnapshot={(update) =>
              setSnapshot((current) => (current && current !== "unavailable" ? update(current) : current))
            }
            view={model.view}
          />
        ) : model.state === "none" ? (
          <section className="ir-p-empty" data-orbit-plan-empty>
            <h2>{t({ en: "No plan yet", zh: "还没有计划" })}</h2>
            <p>
              {guideEnabled
                ? t({
                    en: "In step 3 of the guide, ask “How do I reach my goal?” and iOrbit builds your first plan from your goal and contacts.",
                    zh: "在引导第 3 步问一句「我该如何实现目标？」，iOrbit 会按你的目标和人脉生成第一份计划。",
                  })
                : t({
                    en: "Your first plan will show up here once it has been generated.",
                    zh: "生成第一份计划后，会显示在这里。",
                  })}
            </p>
            <a className="ir-p-empty-link" href={model.startHref}>
              {guideEnabled
                ? t({ en: "Go to step 3 →", zh: "去第 3 步生成计划 →" })
                : t({ en: "Back to iOrbit →", zh: "回到 iOrbit →" })}
            </a>
          </section>
        ) : (
          <section className="ir-p-empty" data-orbit-plan-unavailable>
            <h2>{t({ en: "Your plan can't be read right now", zh: "计划暂时读不到" })}</h2>
            <p>{t({ en: "Please refresh in a moment.", zh: "请稍后刷新再试。" })}</p>
          </section>
        )}
      </div>
    </IOrbitScreenFrame>
  );
}

function PlanBody({
  items,
  onSnapshot,
  onTicked,
  view,
}: {
  items: PlanSnapshot["items"];
  onTicked: (itemId: string) => void;
  onSnapshot: (update: (current: PlanSnapshot) => PlanSnapshot) => void;
  view: MyPlanView;
}) {
  const { language, t } = useOrbitLanguage();
  const zh = language === "zh";
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const currentKey = view.phases.find((phase) => phase.current)?.key ?? null;
  const [openPhases, setOpenPhases] = useState<ReadonlySet<string>>(() => new Set(currentKey ? [currentKey] : []));
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [checkError, setCheckError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  // 一次「记下」的幂等键：失败后重试沿用同一个（服务端可能已经写入、只是响应丢了），
  // 成功或改了文字才换新的。
  const noteKey = useRef<string | null>(null);

  const toggleAction = async (itemId: string, done: boolean) => {
    if (busy.has(itemId)) return;
    setCheckError(null);
    setBusy((current) => new Set(current).add(itemId));
    const previous = items.find((item) => item.id === itemId);
    onTicked(itemId);
    onSnapshot((current) => withActionDone(current, itemId, done, new Date()));
    try {
      const result = await patchPlanActionDone(itemId, done);
      onSnapshot((current) => withServerItem(current, result.item, result.log));
    } catch (error) {
      // 只回滚这一条：期间别的行动可能已经保存成功。
      onSnapshot((current) => ({
        ...current,
        items: current.items.map((item) => (item.id === itemId && previous ? previous : item)),
      }));
      setCheckError(
        t({
          en: `Couldn't save that — it has been put back. (${(error as Error).message})`,
          zh: `没能保存，已恢复原状。（${(error as Error).message}）`,
        }),
      );
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
    }
  };

  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    const body = note.trim();
    if (!body || noteBusy) return;
    setNoteBusy(true);
    setNoteError(null);
    try {
      noteKey.current ??= newPlanIdempotencyKey("plan-note");
      const entry = await postPlanNote(body, noteKey.current);
      onSnapshot((current) => withLogEntry(current, entry));
      noteKey.current = null;
      setNote("");
    } catch (error) {
      setNoteError(
        t({
          en: `Couldn't save the note. (${(error as Error).message})`,
          zh: `没能记下这条进展。（${(error as Error).message}）`,
        }),
      );
    } finally {
      setNoteBusy(false);
    }
  };

  const togglePhase = (key: string) =>
    setOpenPhases((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const weekText = zh
    ? `第 ${view.week.current} 周 / 共 ${view.week.total} 周`
    : `Week ${view.week.current} of ${view.week.total}`;
  const meta = [
    zh ? `计划 v${view.version} · ${view.generatedLabel} 生成` : `Plan v${view.version} · created ${view.generatedLabel}`,
    view.supplement,
    view.week.ended ? t({ en: "past its last week", zh: "已过最后一周" }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <header className="ir-p-mast">
        <h2 className="ir-p-goal" data-orbit-plan-goal>
          {view.goal}
        </h2>
        <div className="ir-p-meta">
          <span>{meta}</span>
          <span className="ir-p-meta-acts">
            {view.analysis ? (
              <button
                aria-controls="ir-p-analysis"
                aria-expanded={analysisOpen}
                className="btn ir-p-link"
                data-orbit-plan-analysis-toggle
                onClick={() => setAnalysisOpen((open) => !open)}
                type="button"
              >
                {analysisOpen
                  ? t({ en: "Hide goal analysis ▴", zh: "收起目标分析 ▴" })
                  : t({ en: "Goal analysis ▾", zh: "目标分析 ▾" })}
              </button>
            ) : null}
            {/* 重新分析（生成新版本）在长期跟踪 Sprint（W0012）开放：先放一个不可点的占位标记，
                不做没有行为的假按钮；title 说明它还没开放。 */}
            <span
              aria-disabled="true"
              className="ir-p-soon"
              data-orbit-plan-reanalyse
              title={t({
                en: "Re-analysis is coming soon: it will create a new version and carry over what you've done.",
                zh: "重新分析即将开放：会生成新版本，已完成的内容会带过去。",
              })}
            >
              {t({ en: "Re-analyse · 1 left this month", zh: "重新分析 · 本月剩 1 次" })}
            </span>
          </span>
        </div>
        {view.analysis && analysisOpen ? (
          <div className="ir-p-analysis" data-orbit-plan-analysis id="ir-p-analysis">
            {view.analysis.answer ? (
              <p>
                <b>{t({ en: "In one line: ", zh: "一句话回答：" })}</b>
                {view.analysis.answer}
              </p>
            ) : null}
            {view.analysis.figures.length > 0 ? (
              <p>
                <b>{t({ en: "Key numbers: ", zh: "关键数字：" })}</b>
                {view.analysis.figures.join(zh ? "；" : "; ")}
              </p>
            ) : null}
            {view.analysis.gaps.length > 0 ? (
              <p>
                <b>{t({ en: "Still missing: ", zh: "还缺的人：" })}</b>
                {view.analysis.gaps.join(zh ? "、" : ", ")}
              </p>
            ) : null}
            {view.analysis.risk ? (
              <p>
                <b>{t({ en: "Biggest risk: ", zh: "最大的风险：" })}</b>
                {view.analysis.risk}
              </p>
            ) : null}
          </div>
        ) : null}
        <div aria-label={t({ en: `Plan progress: ${weekText}`, zh: `计划进度：${weekText}` })} className="ir-p-ruler" data-orbit-plan-ruler role="group">
          <div className="ir-p-ruler-phases" style={{ gridTemplateColumns: `repeat(${view.week.total}, minmax(0, 1fr))` }}>
            {view.ruler.phases.map((phase) => (
              <span
                className={phase.current ? "ir-p-cur" : undefined}
                key={phase.n}
                style={{ gridColumn: `${phase.startWeek} / span ${phase.span}` }}
                title={`${phase.n} · ${phase.title}`}
              >
                {phase.n} · {phase.title}
              </span>
            ))}
          </div>
          <div className="ir-p-ruler-weeks" style={{ gridTemplateColumns: `repeat(${view.week.total}, minmax(0, 1fr))` }}>
            {view.ruler.weeks.map((week) => (
              <i
                className={week.state === "past" ? "ir-p-past" : week.state === "now" ? "ir-p-now" : undefined}
                data-orbit-plan-week={week.no}
                key={week.no}
              >
                {week.state === "now" ? <span>{t({ en: "This week", zh: "本周" })}</span> : null}
              </i>
            ))}
          </div>
          <div className="ir-p-ruler-foot">
            <span>{view.ruler.startLabel}</span>
            <span data-orbit-plan-week-text>{weekText}</span>
            <span>{view.ruler.endLabel}</span>
          </div>
        </div>
      </header>

      <div className="ir-p-spread">
        <section aria-label={t({ en: "Actions", zh: "行动" })} className="ir-p-col">
          <div className="ir-p-label">
            <span>{zh ? `本周 · 第 ${view.week.current} 周` : `This week · week ${view.week.current}`}</span>
            <em>{view.week.rangeLabel}</em>
          </div>
          {checkError ? (
            <p className="ir-p-alert" role="alert">
              {checkError}
            </p>
          ) : null}
          {view.thisWeek.length > 0 ? (
            <div className="ir-p-week-list" data-orbit-plan-this-week>
              {view.thisWeek.map((action) => (
                <div
                  className={action.done ? "ir-p-act ir-p-act-done" : "ir-p-act"}
                  data-orbit-plan-action={action.id}
                  key={action.id}
                >
                  <button
                    aria-checked={action.done}
                    aria-label={action.title}
                    className="btn ir-p-box"
                    disabled={busy.has(action.id)}
                    onClick={() => void toggleAction(action.id, !action.done)}
                    role="checkbox"
                    type="button"
                  />
                  <div className="ir-p-act-t">{action.title}</div>
                  <div className="ir-p-act-m">
                    {action.weeksOverdue > 0 ? (
                      <span className="ir-p-pill ir-p-pill-hot" data-orbit-plan-overdue={action.weeksOverdue}>
                        {zh ? `已延后 ${action.weeksOverdue} 周` : `Pushed back ${action.weeksOverdue} wk`}
                      </span>
                    ) : (
                      <span>{action.weekLabel}</span>
                    )}
                    {action.detail ? <span>{action.detail}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="ir-p-empty-line">
              {t({ en: "Nothing left to do this week.", zh: "这周没有待办的行动。" })}
            </p>
          )}

          <div className="ir-p-label">
            <span>{t({ en: "Phases", zh: "阶段" })}</span>
            {view.week.phaseNo ? (
              <em>{zh ? `当前：第 ${view.week.phaseNo} 阶段` : `Now: phase ${view.week.phaseNo}`}</em>
            ) : null}
          </div>
          <div>
            {view.phases.map((phase) => (
              <PhaseBlock
                key={phase.key}
                onToggle={() => togglePhase(phase.key)}
                open={openPhases.has(phase.key)}
                phase={phase}
              />
            ))}
          </div>
        </section>

        <aside aria-label={t({ en: "Network needs", zh: "人脉需求" })} className="ir-p-col">
          <div className="ir-p-label">
            <span>{t({ en: "Network needs", zh: "人脉需求" })}</span>
            <em>{t({ en: "people newest first", zh: "人员按添加时间倒序" })}</em>
          </div>
          {view.needs.length > 0 ? (
            <div className="ir-p-needs">
              {view.needs.map((need) => (
                <div className="ir-p-need" data-orbit-plan-need={need.id} key={need.id}>
                  <div className="ir-p-need-h">
                    <b>
                      {need.title}
                      {need.industry ? <small>{need.industry}</small> : null}
                    </b>
                    {/* 「待确认 N」角标的位置（W0010 的匹配确认接入后在这里渲染确认入口）；
                        本 Sprint 没有匹配来源，`pendingMatches` 恒为 0，不渲染没有行为的按钮。 */}
                  </div>
                  <div className="ir-p-need-count">
                    <span>
                      <b>{need.established}</b> {t({ en: "connected", zh: "已建立联系" })}
                    </span>
                    <span>
                      <b>{need.linked}</b> {t({ en: "linked", zh: "已关联" })}
                    </span>
                  </div>
                  {need.people.length > 0 ? (
                    <ul className="ir-p-people">
                      {need.people.map((person) => (
                        <li key={person.contactId}>
                          <a
                            className="ir-p-person"
                            data-orbit-plan-person={person.contactId}
                            href={`/app/contacts/${encodeURIComponent(person.contactId)}`}
                          >
                            <span className="ir-p-ini">{person.initial}</span>
                            <span>
                              <b>{person.name}</b>
                              {person.subtitle ? <small>{person.subtitle}</small> : null}
                            </span>
                            <span className={person.state === "established" ? "ir-p-st ir-p-st-est" : "ir-p-st"}>
                              {person.state === "established"
                                ? t({ en: "Connected", zh: "已建立联系" })
                                : t({ en: "Linked", zh: "已关联" })}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="ir-p-need-empty">{t({ en: "Nobody linked yet", zh: "还没有关联的人" })}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="ir-p-empty-line">{t({ en: "This plan has no network needs.", zh: "这份计划没有人脉需求。" })}</p>
          )}

          <div className="ir-p-label">
            <span>{t({ en: "Events in the plan", zh: "计划里的活动" })}</span>
          </div>
          {view.events.length > 0 ? (
            view.events.map((event) => (
              <div className="ir-p-ev" data-orbit-plan-event={event.id} key={event.id}>
                <div className="ir-p-ev-date">{event.dateLabel ?? "—"}</div>
                <div>
                  {event.eventId ? (
                    <a className="ir-p-ev-t" href={`/app/events/${encodeURIComponent(event.eventId)}`}>
                      {event.title}
                    </a>
                  ) : (
                    <span className="ir-p-ev-t">{event.title}</span>
                  )}
                  <span className="ir-p-ev-s">
                    {[
                      eventStatusText(event.status, t),
                      event.need ? (zh ? `对应「${event.need}」` : `for “${event.need}”`) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="ir-p-empty-line">{t({ en: "No events in this plan yet.", zh: "计划里还没有活动。" })}</p>
          )}
        </aside>
      </div>

      <section aria-label={t({ en: "Progress log", zh: "进展记录" })} className="ir-p-log">
        <div className="ir-p-label">
          <span>{t({ en: "Progress log", zh: "进展记录" })}</span>
        </div>
        <form autoComplete="off" className="ir-p-log-in" data-orbit-plan-log-form onSubmit={(event) => void submitNote(event)}>
          <label className="ir-screen-title" htmlFor="ir-p-log-input">
            {t({ en: "Note some progress", zh: "记一笔进展" })}
          </label>
          <input
            className="ir-p-log-input"
            id="ir-p-log-input"
            maxLength={2000}
            onChange={(event) => {
              if (event.target.value.trim() !== note.trim()) noteKey.current = null;
              setNote(event.target.value);
            }}
            placeholder={t({
              en: "Note some progress, e.g. booked a call for next Tuesday",
              zh: "记一笔进展，例如：约好了下周二通电话",
            })}
            type="text"
            value={note}
          />
          <button className="btn ir-p-log-btn" disabled={noteBusy || !note.trim()} type="submit">
            {t({ en: "Save", zh: "记下" })}
          </button>
        </form>
        {noteError ? (
          <p className="ir-p-alert" role="alert">
            {noteError}
          </p>
        ) : null}
        {view.log.length > 0 ? (
          <ul className="ir-p-log-list" data-orbit-plan-log>
            {view.log.map((line) => (
              <li
                className={line.kind === "manual" ? "ir-p-log-item ir-p-log-manual" : "ir-p-log-item"}
                data-orbit-plan-log-entry={line.id}
                key={line.id}
              >
                <time>{line.timeLabel}</time>
                <i className="ir-p-log-k" />
                <span>
                  {line.text}
                  {line.kind === "manual" ? <small>{t({ en: "manual", zh: "手动" })}</small> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ir-p-empty-line">{t({ en: "No progress noted yet.", zh: "还没有进展记录。" })}</p>
        )}
      </section>
    </>
  );
}

type Translate = (copy: { en: string; zh: string }) => string;

function eventStatusText(status: string, t: Translate): string {
  switch (status) {
    case "registered":
      return t({ en: "Registered", zh: "已报名" });
    case "attended":
      return t({ en: "Attended", zh: "已参加" });
    default:
      return t({ en: "Recommended", zh: "推荐" });
  }
}

function PhaseBlock({ onToggle, open, phase }: { onToggle: () => void; open: boolean; phase: MyPlanPhase }) {
  const { language, t } = useOrbitLanguage();
  const zh = language === "zh";
  const bodyId = `ir-p-phase-${phase.key}`;
  const progress = zh
    ? `${phase.actionsDone} / ${phase.actionsTotal} 行动`
    : `${phase.actionsDone} / ${phase.actionsTotal} actions`;
  const rows: Array<{ label: string; body: ReactNode }> = [];
  if (phase.actions.length > 0) {
    rows.push({
      body: (
        <ul>
          {phase.actions.map((action) => (
            <li className={action.done ? "ir-p-done" : undefined} key={action.id}>
              {action.weekLabel ? <span className="ir-p-wk">{action.weekLabel}</span> : null}
              {action.title}
            </li>
          ))}
        </ul>
      ),
      label: t({ en: "To do", zh: "要做的事" }),
    });
  }
  if (phase.who.length > 0) {
    rows.push({
      body: (
        <ul>
          {phase.who.map((who) => (
            <li key={who}>{who}</li>
          ))}
        </ul>
      ),
      label: t({ en: "People to meet", zh: "要认识的人" }),
    });
  }
  if (phase.infos.length > 0) {
    rows.push({
      body: (
        <ul>
          {phase.infos.map((info) => (
            <li data-orbit-plan-info={info.id} key={info.id}>
              {info.title}
              {info.answer ? (
                <div className="ir-p-info-a">✓ {info.answer}</div>
              ) : (
                <div className="ir-p-info-none">{t({ en: "No answer yet", zh: "还没有答案" })}</div>
              )}
            </li>
          ))}
        </ul>
      ),
      label: t({ en: "To find out", zh: "要搞清楚" }),
    });
  }
  if (phase.events.length > 0) {
    rows.push({
      body: (
        <ul>
          {phase.events.map((event) => (
            <li key={event.id}>
              {event.dateLabel ? `${event.dateLabel} ` : ""}
              {event.title}{" "}
              <span
                className={
                  event.status === "recommended" ? "ir-p-pill ir-p-pill-line" : "ir-p-pill ir-p-pill-good"
                }
              >
                {eventStatusText(event.status, t)}
              </span>
            </li>
          ))}
        </ul>
      ),
      label: t({ en: "Events", zh: "可以去的活动" }),
    });
  }
  if (phase.pitch) {
    rows.push({
      body: (
        <div className="ir-p-script">
          <small>{phase.pitch.setting}</small>
          {phase.pitch.text}
        </div>
      ),
      label: t({ en: "Intro", zh: "自我介绍" }),
    });
  }
  if (phase.followups.length > 0) {
    rows.push({
      body: (
        <ul>
          {phase.followups.map((followup) => (
            <li key={followup}>{followup}</li>
          ))}
        </ul>
      ),
      label: t({ en: "Follow-up", zh: "之后怎么跟进" }),
    });
  }

  return (
    <div className={phase.current ? "ir-p-phase ir-p-phase-cur" : "ir-p-phase"} data-orbit-plan-phase={phase.key}>
      <button
        aria-controls={bodyId}
        aria-expanded={open}
        className="btn ir-p-phase-h"
        onClick={onToggle}
        type="button"
      >
        <span className="ir-p-pn">{phase.n}</span>
        <b className="ir-p-phase-name">{phase.title}</b>
        <span className="ir-p-phase-sub">
          {phase.weeksLabel} · {progress}
        </span>
        <i className="ir-p-phase-toggle">
          {open ? t({ en: "Collapse ▴", zh: "收起 ▴" }) : t({ en: "Expand ▾", zh: "展开 ▾" })}
        </i>
      </button>
      {open ? (
        <div className="ir-p-phase-body" id={bodyId}>
          {rows.length > 0 ? (
            <div className="ir-p-pd">
              {phase.summary ? (
                <div className="ir-p-pd-row">
                  <span>{t({ en: "Goal", zh: "这一段" })}</span>
                  <div>{phase.summary}</div>
                </div>
              ) : null}
              {rows.map((row) => (
                <div className="ir-p-pd-row" key={row.label}>
                  <span>{row.label}</span>
                  {row.body}
                </div>
              ))}
            </div>
          ) : (
            <p className="ir-p-empty-line">{phase.summary ?? t({ en: "No details yet.", zh: "还没有细节。" })}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
