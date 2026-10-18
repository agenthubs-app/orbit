"use client";

import { useState, type ReactNode } from "react";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import { Avatar, Button, Card, Chip, EmptyState, IconButton, ListRow, MacTile, RetryCard, SampleTag, Skeleton, WhyDisclosure, useScopeLanguage, type RowAction } from "../ui";
import type { DecisionAction, TodoPageView, TodoSectionView } from "./todo-view-model";
import styles from "./todo.module.css";

export const todoSourceCopy = {
  task_suggestion: taskCopy.sourceSuggestion, agent_action: taskCopy.sourceAgentAction, plan_pending: taskCopy.sourcePlanPending,
  entity_draft: taskCopy.sourceEntityDraft, contact_draft: taskCopy.sourceContactDraft, completion_question: taskCopy.sourceQuestion,
  agent_signal: taskCopy.sourceSignal, plan_today_chance: taskCopy.sourcePlanChance, relationship_task: taskCopy.sourceLifecycle, task: taskCopy.sourceTask,
};

export function TodoPresenter({ state, view, onRetry, onDecision, onDraft, onFollowup, onMore }: {
  state: "idle" | "loading" | "ready" | "failed" | "not_implemented";
  view: TodoPageView | null;
  onRetry: () => void;
  onDecision: (key: string, action: DecisionAction) => void;
  onDraft?: (key: string) => void;
  onFollowup?: (key: string) => void;
  onMore: (section: "decisions" | "nextMoves" | "followups") => void;
}) {
  const language = useScopeLanguage();
  const t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const [nextIndex, setNextIndex] = useState(0);
  if (state === "idle" || state === "not_implemented") return null;
  if (state === "failed") return <RetryCard title={t(taskCopy.todoReadFailed)} onRetry={onRetry} />;
  if (!view || state === "loading") return <div className={styles.grid}><Card className={styles.decisions}><Skeleton lines={3} onRetry={onRetry} /></Card><Card className={styles.nextMoves}><Skeleton lines={3} onRetry={onRetry} /></Card><Card className={styles.followups}><Skeleton lines={4} onRetry={onRetry} /></Card></div>;
  const item = view.nextMoves.items[nextIndex % Math.max(1, view.nextMoves.items.length)];
  const count = (section: TodoSectionView<unknown>) => section.count.value === null ? "—" : `${section.count.value}${section.count.partial || section.count.capped ? "+" : ""}`;
  const issues = (section: TodoSectionView<unknown>) => <>
    {section.count.partial ? <p className={styles.note} role="status">{t(taskCopy.todoPartial)}</p> : null}
    {section.issues.filter(issue => issue.status === "unavailable").map(issue => <RetryCard key={issue.source} title={t(todoSourceCopy[issue.source])} message={t(taskCopy.todoUnavailable)} onRetry={onRetry} />)}
  </>;
  const header = (title: string, section: TodoSectionView<unknown>, sectionKey: "decisions" | "nextMoves" | "followups", trailing?: ReactNode) => <header className={styles.header}>
    <h3 className={styles.heading}>{title}{sectionKey === "decisions" ? <Chip label={count(section)} tone="coral" /> : null}</h3>
    {trailing ?? (section.more.length || (sectionKey === "decisions" && section.items.length > 2) ? <Button label={t(taskCopy.todoAll)} variant="ghost" size="sm" onClick={() => onMore(sectionKey)} /> : null)}
  </header>;
  return <div className={styles.grid}>
    {view.decisions.state !== "hidden" ? <Card className={styles.decisions} aria-label={t(taskCopy.todoDecisions)}>
      {header(t(taskCopy.todoDecisions), view.decisions, "decisions")}
      {issues(view.decisions)}
      {view.decisions.state === "empty" ? <EmptyState title={t(taskCopy.todoDecisionsEmpty)} /> : view.decisions.items.slice(0, 2).map(row => {
        const actions: RowAction[] = row.actions.map(action => ({ key: action,
          label: t(action === "accept" ? taskCopy.todoDone : action === "dismiss" ? taskCopy.todoDismiss : row.source === "task_suggestion" ? taskCopy.todoTomorrow : taskCopy.todoLater),
          icon: action === "accept" ? "check" : action === "dismiss" ? "x" : "clock", tone: action === "accept" ? "ok" : action === "dismiss" ? "coral" : "lav",
          onSelect: () => onDecision(row.key, action),
        }));
        return <div key={row.key}>
          <ListRow title={row.title} subtitle={row.subtitle} href={row.href} leading={row.contactName ? <Avatar name={row.contactName} size="sm" /> : undefined} trailing={row.sample ? <SampleTag /> : undefined} hoverActions={actions} />
          {row.unverifiedConversation || row.question ? <p className={styles.note}>{t(row.question ? taskCopy.todoQuestionSeparate : taskCopy.todoUnverifiedConversation)}</p> : null}
        </div>;
      })}
    </Card> : null}
    {view.nextMoves.state !== "hidden" ? <div className={styles.nextMoves}>
      <Card>
        {header(t(taskCopy.todoNextMoves), view.nextMoves, "nextMoves", item ? <div className={styles.row}><span className={styles.note}>{nextIndex % view.nextMoves.items.length + 1}/{view.nextMoves.items.length}</span>{view.nextMoves.items.length > 1 ? <IconButton icon="right" label={t(taskCopy.todoNextCard)} size={34} onClick={() => setNextIndex(index => index + 1)} /> : null}</div> : undefined)}
        {issues(view.nextMoves)}
        {view.nextMoves.state === "empty" ? <EmptyState title={t(taskCopy.todoNextMovesEmpty)} /> : item ? <>
          <div className={styles.moveTitle}><MacTile emoji="💌" tone="pink" /><h4>{item.title}</h4>{item.sample ? <SampleTag /> : null}</div>
          {item.subtitle ? <p className={styles.reason}>{item.subtitle}</p> : null}
          <div className={styles.moveFoot}><Button label={t(taskCopy.todoOpenDraft)} variant="primary" size="sm" disabled={item.sample || !onDraft} onClick={() => { if (!item.sample) onDraft?.(item.key); }} />{item.subtitle ? <WhyDisclosure reason={item.subtitle} /> : null}</div>
          <p className={styles.note}>{t(taskCopy.todoDraftOnly)}</p>
        </> : null}
      </Card>
    </div> : null}
    {view.followups.state !== "hidden" ? <Card className={styles.followups} aria-label={t(taskCopy.todoFollowups)}>
      {header(t(taskCopy.todoFollowups), view.followups, "followups", <span className={styles.note}>{t(taskCopy.todoDueOrder)}</span>)}
      {issues(view.followups)}
      {view.followups.state === "empty" ? <EmptyState title={t(taskCopy.todoFollowupsEmpty)} /> : view.followups.items.map(row => <div key={row.key}><ListRow title={row.title} subtitle={row.contactName} href={row.sample || (row.kind === "lifecycle" && onFollowup) ? undefined : row.href} onSelect={row.kind === "lifecycle" && !row.sample && onFollowup ? () => onFollowup(row.key) : undefined} trailing={<>{row.sample ? <SampleTag /> : null}{row.overdue ? <Chip label={t(taskCopy.todoOverdue)} tone="coral" /> : row.dueAt ? <Chip label={new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB", { month: "numeric", day: "numeric", timeZone: view.timeZone }).format(new Date(row.dueAt))} /> : null}</>} />{row.detailUnavailable && !onFollowup ? <p className={styles.note}>{t(taskCopy.todoLifecycleDetailPending)}</p> : null}</div>)}
      {view.followups.more.length ? <Button label={t(taskCopy.todoAll)} variant="ghost" size="sm" onClick={() => onMore("followups")} /> : null}
    </Card> : null}
  </div>;
}
