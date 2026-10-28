"use client";

import { useState, type ReactNode } from "react";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import { Avatar, Button, Card, CheckCircle, Chip, EmptyState, Icon, ListRow, MacTile, RetryCard, SampleTag, Skeleton, WhyDisclosure, useScopeLanguage, type RowAction } from "../ui";
import type { DecisionAction, TodoPageView, TodoSectionView } from "./todo-view-model";
import styles from "./todo.module.css";

export const todoSourceCopy = {
  task_suggestion: taskCopy.sourceSuggestion, agent_action: taskCopy.sourceAgentAction, plan_pending: taskCopy.sourcePlanPending,
  entity_draft: taskCopy.sourceEntityDraft, contact_draft: taskCopy.sourceContactDraft, completion_question: taskCopy.sourceQuestion,
  agent_signal: taskCopy.sourceSignal, plan_today_chance: taskCopy.sourcePlanChance, relationship_task: taskCopy.sourceLifecycle, task: taskCopy.sourceTask,
};

const MOVE_TILES = [{ emoji: "💌", tone: "pink" }, { emoji: "🙋", tone: "teal" }, { emoji: "🤝", tone: "apricot" }] as const;

/** The To-do board before its first answer: the three cards' own classes with bones, so the footprint matches. */
export function TodoSkeleton({ onRetry }: { onRetry?: () => void }) {
  return <div className={styles.grid}><Card className={styles.decisions}><Skeleton lines={3} onRetry={onRetry} /></Card><Card className={styles.nextMoves}><Skeleton lines={3} onRetry={onRetry} /></Card><Card className={styles.followups}><Skeleton lines={4} onRetry={onRetry} /></Card></div>;
}

export function TodoPresenter({ state, view, onRetry, onDecision, onDraft, onFollowup, onTaskComplete, onMore }: {
  state: "idle" | "loading" | "ready" | "failed" | "not_implemented";
  view: TodoPageView | null;
  onRetry: () => void;
  onDecision: (key: string, action: DecisionAction) => void;
  onDraft?: (key: string) => void;
  onFollowup?: (key: string) => void;
  onTaskComplete?: (key: string) => void;
  onMore: (section: "decisions" | "nextMoves" | "followups") => void;
}) {
  const language = useScopeLanguage();
  const t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const [nextIndex, setNextIndex] = useState(0);
  if (state === "not_implemented") return null;
  if (state === "failed") return <RetryCard title={t(taskCopy.todoReadFailed)} onRetry={onRetry} />;
  // Not read yet (idle: the account is still settling) is the same board skeleton as loading — never blank first.
  if (!view || state === "loading" || state === "idle") return <TodoSkeleton onRetry={onRetry} />;
  const item = view.nextMoves.items[nextIndex % Math.max(1, view.nextMoves.items.length)];
  const count = (section: TodoSectionView<unknown>) => section.count.value === null ? "—" : `${section.count.value}${section.count.partial || section.count.capped ? "+" : ""}`;
  const issues = (section: TodoSectionView<unknown>) => <>
    {section.count.partial ? <p className={styles.note} role="status">{t(taskCopy.todoPartial)}</p> : null}
    {section.issues.filter(issue => issue.status === "unavailable").map(issue => <RetryCard key={issue.source} title={t(todoSourceCopy[issue.source])} message={t(taskCopy.todoUnavailable)} onRetry={onRetry} />)}
  </>;
  const header = (title: string, section: TodoSectionView<unknown>, sectionKey: "decisions" | "nextMoves" | "followups", trailing?: ReactNode) => <header className={styles.header}>
    <h3 className={styles.heading}>{title}{sectionKey === "decisions" ? <Chip label={count(section)} tone="coral" /> : null}</h3>
    {trailing ?? (section.more.length || (sectionKey === "decisions" && section.items.length > 2) ? <button type="button" className={`btn ${styles.more}`} onClick={() => onMore(sectionKey)}>{t(taskCopy.todoAll)}{section.count.value !== null ? ` (${count(section)})` : ""}<Icon name="right" size={16} /></button> : null)}
  </header>;
  return <div className={styles.grid}>
    {view.decisions.state !== "hidden" ? <Card className={styles.decisions} aria-label={t(taskCopy.todoDecisions)}>
      {header(t(taskCopy.todoDecisions), view.decisions, "decisions")}
      {issues(view.decisions)}
      {view.decisions.state === "empty" ? <EmptyState title={t(taskCopy.todoDecisionsEmpty)} /> : view.decisions.items.slice(0, 2).map((row, index) => {
        // web.html #14 .hov-acts: 明日 / あとで, then ✓ 完了. 見送る stays in the 「すべて」 list.
        const actions: RowAction[] = row.actions.map(action => ({ key: action,
          label: t(action === "accept" ? taskCopy.todoDone : action === "dismiss" ? taskCopy.todoDismiss : row.source === "task_suggestion" ? taskCopy.todoTomorrow : taskCopy.todoLater),
          icon: action === "accept" ? "check" : action === "dismiss" ? "x" : "clock", tone: action === "accept" ? "ok" : action === "dismiss" ? "coral" : "lav",
          onSelect: () => onDecision(row.key, action),
        }));
        const shown = actions.filter(action => action.key !== "dismiss").sort((a, b) => (a.key === "accept" ? 1 : 0) - (b.key === "accept" ? 1 : 0));
        const main = <><span className={styles.decisionAvatar}>{row.contactName ? <Avatar name={row.contactName} size="sm" /> : null}</span><span className={styles.decisionMeta}><b className={styles.decisionTitle}>{row.title}</b>{row.subtitle ? <span className={styles.decisionSubtitle}>{row.subtitle}</span> : null}</span></>;
        return <div key={row.key}>
          <div className={styles.decisionRow}>
            {row.href ? <a className={styles.decisionMain} href={row.href}>{main}</a> : <div className={styles.decisionMain}>{main}</div>}
            <span className={styles.decisionTrailing}>{row.sample ? <SampleTag /> : null}{shown.length ? <span className={`${styles.decisionActions} ${index === 0 ? styles.decisionActionsShown : ""}`}>{shown.map(action => <Button key={action.key} label={action.label} aria-label={`${action.label} ${row.title}`} icon={action.icon} variant={action.key === "accept" ? "primary" : "secondary"} size="sm" onClick={action.onSelect} />)}</span> : null}</span>
          </div>
          {row.unverifiedConversation || row.question ? <p className={styles.note}>{t(row.question ? taskCopy.todoQuestionSeparate : taskCopy.todoUnverifiedConversation)}</p> : null}
        </div>;
      })}
    </Card> : null}
    {view.nextMoves.state !== "hidden" ? <div className={styles.nextMoves}>
      {/* web.html #14 .nstack: two cards peeking behind a lav-tinted front card, paged 1 / N. */}
      <span className={`${styles.stackBack} ${styles.stackBack2}`} aria-hidden /><span className={`${styles.stackBack} ${styles.stackBack1}`} aria-hidden />
      <section className={styles.stackFront} aria-label={t(taskCopy.todoNextMoves)}>
        <div className={styles.stackHead}><MacTile emoji={MOVE_TILES[nextIndex % MOVE_TILES.length]!.emoji} tone={MOVE_TILES[nextIndex % MOVE_TILES.length]!.tone} size="sm" /><b>{t(taskCopy.todoNextMoves)}</b>
          {item ? <><span className={styles.stackCount}>{nextIndex % view.nextMoves.items.length + 1} / {view.nextMoves.items.length}</span>{view.nextMoves.items.length > 1 ? <button type="button" className={`btn ${styles.stackNext}`} aria-label={t(taskCopy.todoNextCard)} onClick={() => setNextIndex(index => index + 1)}><Icon name="right" size={16} /></button> : null}</> : null}</div>
        {issues(view.nextMoves)}
        {view.nextMoves.state === "empty" ? <EmptyState title={t(taskCopy.todoNextMovesEmpty)} /> : item ? <>
          <div className={styles.moveTitle}>{item.title}{item.sample ? <SampleTag /> : null}</div>
          {item.subtitle ? <p className={styles.reason}>{item.subtitle}</p> : null}
          <div className={styles.moveFoot}><Button label={t(taskCopy.todoOpenDraft)} icon="mail" variant="primary" size="sm" disabled={item.sample || !onDraft} onClick={() => { if (!item.sample) onDraft?.(item.key); }} />
            {view.nextMoves.items.length > 1 ? <Button label={t(taskCopy.todoLater)} size="sm" onClick={() => setNextIndex(index => index + 1)} /> : null}
            {item.subtitle ? <span className={styles.why}><WhyDisclosure reason={item.subtitle} /></span> : null}</div>
          <p className={styles.note}>{t(taskCopy.todoDraftOnly)}</p>
        </> : null}
      </section>
    </div> : null}
    {view.followups.state !== "hidden" ? <Card className={styles.followups} aria-label={t(taskCopy.todoFollowups)}>
      {/* web.html #14 shows three follow-ups; the rest are in タスク一覧 (like 判断待ち's two rows and すべて). */}
      <header className={styles.header}><h3 className={styles.heading}>{t(taskCopy.todoFollowups)}<span className={styles.headingNote}>{t(taskCopy.todoDueOrder)}</span></h3>
        <a className={`btn ${styles.more}`} href="/app/tasks?tab=todo&view=all">{t(taskCopy.taskListTitle)}<Icon name="right" size={16} /></a></header>
      {issues(view.followups)}
      {view.followups.state === "empty" ? <EmptyState title={t(taskCopy.todoFollowupsEmpty)} /> : view.followups.items.slice(0, 3).map(row => <div key={row.key}><div className={styles.followupRow}>{!row.sample && (row.kind === "lifecycle" ? onFollowup : onTaskComplete) ? <CheckCircle checked={false} label={t(taskCopy.taskListComplete).replace("{title}", row.title)} onChange={() => row.kind === "lifecycle" ? onFollowup?.(row.key) : onTaskComplete?.(row.key)} /> : null}<div className={styles.followupMain}><ListRow title={row.title} subtitle={row.contactName} href={row.sample || (row.kind === "lifecycle" && onFollowup) ? undefined : row.href} onSelect={row.kind === "lifecycle" && !row.sample && onFollowup ? () => onFollowup(row.key) : undefined} trailing={<>{row.sample ? <SampleTag /> : null}{row.dueAt ? <Chip label={new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB", { month: "numeric", day: "numeric", timeZone: view.timeZone }).format(new Date(row.dueAt))} tone={row.overdue ? "coral" : undefined} /> : null}</>} /></div></div>{row.detailUnavailable && !onFollowup ? <p className={styles.note}>{t(taskCopy.todoLifecycleDetailPending)}</p> : null}</div>)}
      {view.followups.more.length ? <Button label={t(taskCopy.todoAll)} variant="ghost" size="sm" onClick={() => onMore("followups")} /> : null}
    </Card> : null}
  </div>;
}
