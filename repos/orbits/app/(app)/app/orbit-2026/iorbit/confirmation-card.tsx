"use client";

/**
 * agent-design AG07 (approved visual draft): the confirmation card and the four small changes of a protocol-3 turn on
 * the web — the queued note, the basis line, the options under a question, the progress — rendered from the
 * request's result document. The card is shown through shared/compute/agent-card-view.ts (the rule the App runs
 * too), with the fixed words of the card's own language; nothing is formatted here.
 */
import { useState, type ReactNode } from "react";

import { agentCardView, type AgentCardView } from "../../../../../shared/compute/agent-card-view";
import { cardTurnedReminderOn } from "../../../../../shared/compute/agent-reminder";
import { BrowserReminderLine } from "../account/ScheduledTaskReminder";
import type { AgentActionPreviewContract, AgentAnswerMemoryUseContract, AgentClarificationContract, AgentResultDocument, AgentRunStage } from "../../../../../shared/contract/agent-v1";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { standardCopyFor } from "../copy/standard";
import { agentLinkHref, memorySettingsHref } from "./action-preview-client";
import styles from "./confirmation-card.module.css";

type Decision = "confirm" | "reject" | "retry" | "mark_done" | "abandon";

export interface ConfirmationCardProps {
  card: AgentActionPreviewContract;
  language: OrbitLanguage;
  online: boolean;
  /** Records with an unsynced edit on this device (none on the web). */
  pendingTargets?: readonly string[];
  onDecide(decision: Decision, operationId?: string): Promise<boolean>;
  onRegenerate(): Promise<boolean>;
  onRemove?(operationId: string): Promise<boolean>;
  /** AG15 (D15-6): open the card that replaced this one (the inbox selects its entry). */
  onOpenCard?(actionId: string): void;
}

/** AG15: this browser's time zone, so a scheduled task's card names its own zone only when it differs. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

const toneClass = (tone: string) => styles[tone] ?? "";

function SyncIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-14.3 4.9" /><path d="M4 12a8 8 0 0 1 14.3-4.9" /><path d="M18 3v4h-4" /><path d="M6 21v-4h4" /></svg>;
}

export function ConfirmationCard({ card, language, online, pendingTargets = [], onDecide, onRegenerate, onRemove, onOpenCard }: ConfirmationCardProps) {
  const words = standardCopyFor(card.locale ?? language).aiCard;
  const ui = standardCopyFor(language).aiCard;
  const [timeZone] = useState(deviceTimeZone);
  const view: AgentCardView = agentCardView(card, { online, pendingTargets, timeZone }, words);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const run = async (action: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      if (!(await action())) setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  if (view.kind === "offline") {
    return <div className={styles.offline} role="status" data-orbit-agent-card="offline" data-orbit-agent-card-id={view.actionId}><b>{view.summary}</b><span>{view.hint}</span></div>;
  }
  const waiting = Boolean(view.buttons);
  // AG16 (draft 16-2): the card is unchanged; once it has turned a task's reminder on, a line under it says whether
  // this browser will show the reminder, with 「允许这个浏览器通知」 when it does not yet.
  const reminderOn = cardTurnedReminderOn(card);
  return (
    <>
    <section className={styles.card} aria-label={view.title} data-orbit-agent-card={view.status} data-orbit-agent-card-id={view.actionId} data-orbit-agent-card-revision={view.revision}>
      <div className={styles.head}><span className={`${styles.chip} ${toneClass(view.chip.tone)}`}>{view.chip.label}</span><span className={styles.title}>{view.title}</span></div>
      {view.banner ? <div className={styles.banner} role="status"><SyncIcon />{view.banner}</div> : null}
      {view.items.map((item) => {
        const changedItem = item.rows.some((row) => row.changed);
        const expanded = open === item.operationId;
        const removable = waiting && onRemove && view.items.length > 1;
        return (
          <div key={item.operationId} className={`${styles.item} ${changedItem ? styles.itemChanged : ""} ${view.dim ? styles.dim : ""}`} data-orbit-agent-card-item={item.operationId}>
            <div className={styles.itemHead}>
              <span className={`${styles.badge} ${item.change === "create" ? styles.badgeCreate : item.change === "delete" ? styles.badgeDelete : styles.badgeUpdate}`} data-orbit-agent-card-badge={item.change}>{item.badge}</span>
              <span className={styles.record}>{item.record}</span>
              {item.status ? <span className={`${styles.itemStatus} ${styles[`status${item.status.tone}`] ?? ""}`}>{item.status.label}</span> : null}
              {removable ? <button type="button" className={`btn ${styles.more}`} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : item.operationId)}>{expanded ? ui.hideDetails : `${ui.details} ›`}</button> : null}
            </div>
            {item.pendingEdit ? <div className={styles.note}><SyncIcon />{item.pendingEdit}</div> : null}
            {item.rows.map((row) => row.sideBySide && row.before !== null ? (
              // AG14 (D1): 原来 and 改成 side by side.
              <div key={row.field} className={`${styles.pair} ${row.changed ? styles.rowChanged : ""}`} data-orbit-agent-card-pair={row.field}>
                <div><span className={styles.pairLabel}>{words.memoryWas}</span><s>{row.before}</s></div>
                <div><span className={styles.pairLabel}>{words.memoryNow}</span><b>{row.after}</b></div>
              </div>
            ) : (
              <div key={row.field} className={`${styles.row} ${row.changed ? styles.rowChanged : ""}`}>
                <span className={styles.label}>{row.label}</span>
                {row.before !== null && row.changed ? <span className={styles.value}><span className={styles.old}>{words.nowIs} </span><b>{row.before}</b><span className={styles.arrow}> → {words.changeTo} </span><b>{row.after}</b></span>
                  : row.before !== null ? <span className={styles.value}><s className={styles.old}>{row.before}</s><span className={styles.arrow}> → </span><b>{row.after}</b></span>
                    : <b className={styles.value}>{row.after}</b>}
              </div>
            ))}
            {item.note ? <span className={styles.hint}>{item.note}</span> : null}
            {expanded && removable ? <div className={styles.buttons}><button type="button" className={`btn ${styles.small}`} disabled={busy || !online} onClick={() => void run(() => onRemove!(item.operationId))}>{ui.removeItem}</button></div> : null}
            {item.review && view.reviewButtons ? (
              <div className={styles.buttons}>
                <button type="button" className={`btn ${styles.small} ${styles.smallPrimary}`} disabled={busy || !online} onClick={() => void run(() => onDecide("retry", item.operationId))}>{view.reviewButtons.retry}</button>
                <button type="button" className={`btn ${styles.small}`} disabled={busy || !online} onClick={() => void run(() => onDecide("mark_done", item.operationId))}>{view.reviewButtons.markDone}</button>
                <button type="button" className={`btn ${styles.small}`} disabled={busy || !online} onClick={() => void run(() => onDecide("abandon", item.operationId))}>{view.reviewButtons.abandon}</button>
              </div>
            ) : null}
          </div>
        );
      })}
      {view.buttons ? (
        <div className={styles.actions}>
          <div className={styles.buttons}>
            <button type="button" className={`btn ${styles.confirm}`} disabled={busy || !view.buttons.confirmEnabled} onClick={() => void run(() => onDecide("confirm"))} data-orbit-agent-card-confirm>{view.buttons.confirm}</button>
            <button type="button" className={`btn ${styles.dismiss}`} disabled={busy || !view.buttons.dismissEnabled} onClick={() => void run(() => onDecide("reject"))} data-orbit-agent-card-dismiss>{view.buttons.dismiss}</button>
          </div>
          {view.blocked ? <span className={styles.blocked}><SyncIcon />{view.blocked}</span> : null}
          {view.hint ? <span className={styles.hint}>{view.hint}</span> : null}
        </div>
      ) : null}
      {view.footer ? <div className={styles.footer}>{view.footer}</div> : null}
      {view.expiredNote ? (
        <div className={styles.expiredNote} data-orbit-agent-card-expired-note>
          <span>{view.expiredNote}</span>
          {view.replacedBy && onOpenCard ? <button type="button" className={`btn ${styles.small}`} onClick={() => onOpenCard(view.replacedBy!)} data-orbit-agent-card-replaced-by={view.replacedBy}>{ui.openNewCard}</button> : null}
        </div>
      ) : null}
      {view.regenerate ? (
        <div className={styles.regen}>
          <span className={styles.regenQuestion}>{view.regenerate.question}</span>
          <div className={styles.buttons}><button type="button" className={`btn ${styles.small} ${styles.smallPrimary}`} disabled={busy || !online} onClick={() => void run(onRegenerate)}>{view.regenerate.label}</button></div>
        </div>
      ) : null}
      {failed ? <span className={styles.error} role="alert">{ui.actionFailed}</span> : null}
    </section>
    {reminderOn ? <div className={styles.afterCard} data-orbit-agent-card-reminder><BrowserReminderLine afterCard language={language} /></div> : null}
    </>
  );
}

/** Small change 2: the basis line at the top of the answer, with the records it rests on. */
/**
 * AG14 (approved draft board 5, D4–D6): the memory chips, right after the basis chip in the same row (they wrap under it
 * on a narrow screen). A used entry or a rule that took results away ends in 「修改 ›」, which opens that entry in the
 * settings page (D5); 「只这一次……」 has none.
 */
export function MemoryChips({ memoryUse, language, navigate }: { memoryUse: readonly AgentAnswerMemoryUseContract[]; language: OrbitLanguage; navigate(href: string): void }) {
  const ui = standardCopyFor(language).aiCard;
  return <>{memoryUse.map((chip) => {
    if (chip.kind === "skipped") return <span key={`${chip.kind}:${chip.memoryId}`} className={styles.basisChip} data-orbit-agent-memory-chip={chip.kind}>{chip.text}</span>;
    const href = memorySettingsHref(chip.memoryId);
    return <a key={`${chip.kind}:${chip.memoryId}`} className={styles.basisChip} href={href} data-orbit-agent-memory-chip={chip.kind} onClick={(event) => { event.preventDefault(); navigate(href); }}>{chip.text}<span className={styles.memoryEdit}>{ui.memoryEdit} ›</span></a>;
  })}</>;
}

/** AG14: the chips row when an answer has memory chips but no basis line. */
export function MemoryChipRow(props: { memoryUse: readonly AgentAnswerMemoryUseContract[]; language: OrbitLanguage; navigate(href: string): void }) {
  return <div className={styles.basis} data-orbit-agent-basis="memory"><MemoryChips {...props} /></div>;
}

export function BasisLine({ basis, language, navigate, cardsBelow = false, children }: { basis: NonNullable<NonNullable<AgentResultDocument["answer"]>["basis"]>; language: OrbitLanguage; navigate(href: string): void; /** AG19: the answer shows these records as cards, so the row of small labels is not repeated. */ cardsBelow?: boolean; /** AG14: the memory chips, in the same row after the basis. */ children?: ReactNode }) {
  const ui = standardCopyFor(language).aiCard;
  const links = cardsBelow && basis.links.length !== 1 ? [] : basis.links.map((link) => ({ href: agentLinkHref(link), link }));
  if (cardsBelow && basis.links.length !== 1) return <div className={styles.basis} data-orbit-agent-basis><span className={styles.basisChip}>{basis.text}</span>{children}</div>;
  const one = links.length === 1 ? links[0] : null;
  return (
    <div className={styles.basis} data-orbit-agent-basis>
      {one ? (
        one.href ? <a className={styles.basisChip} href={one.href} onClick={(event) => { event.preventDefault(); navigate(one.href!); }}>{basis.text}<span className={styles.basisOpen}>{ui.open} ›</span></a> : <span className={styles.basisChip}>{basis.text}</span>
      ) : (
        <>
          <span className={styles.basisChip}>{basis.text}</span>
          {links.map(({ href, link }) => (href ? <a key={`${link.type}:${link.id}`} className={styles.basisChip} href={href} onClick={(event) => { event.preventDefault(); navigate(href); }}>{link.label}<span className={styles.basisOpen}>›</span></a> : null))}
        </>
      )}
      {children}
    </div>
  );
}

/** Small change 3: the options under a question; a click answers it, typing still works. */
export function QuestionOptions({ clarifications, language, disabled, onSelect }: { clarifications: readonly AgentClarificationContract[]; language: OrbitLanguage; disabled: boolean; onSelect(clarification: AgentClarificationContract, optionId: string): void }) {
  const ui = standardCopyFor(language).aiCard;
  const shown = clarifications.filter((item) => item.options.length > 0 && item.kind !== "entry");
  if (!shown.length) return null;
  return (
    <div className={styles.options} data-orbit-agent-options>
      {shown.map((set) => (
        <div key={set.clarificationId} className={styles.optionList}>
          {set.options.map((option) => {
            const picked = set.selectedOptionId === option.optionId;
            return <button key={option.optionId} type="button" className={`btn ${styles.option} ${picked ? styles.optionPicked : ""}`} aria-pressed={picked} disabled={disabled || set.state !== "open"} onClick={() => onSelect(set, option.optionId)}>{option.label}</button>;
          })}
        </div>
      ))}
      {shown.some((set) => set.state === "open") ? <span className={styles.typeHint}>{ui.typeToAnswer}</span> : null}
    </div>
  );
}

/** Small changes 1 and 4: "已收到，等前一条处理完" under a queued message, the step of a running one. */
export function QueuedNote({ language }: { language: OrbitLanguage }) {
  return <span className={styles.queued} role="status"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>{standardCopyFor(language).aiCard.queued}</span>;
}

export function ProgressLine({ language, stage, action }: { language: OrbitLanguage; stage: AgentRunStage | null; action?: ReactNode }) {
  const ui = standardCopyFor(language).aiCard;
  const text = stage === "reading" ? ui.progressReading : stage === "web" ? ui.progressWeb : ui.progressComposing;
  return <div className={styles.progress} role="status" data-orbit-agent-progress={stage ?? "composing"}><div className={styles.progressLine}><span>{text}</span>{action}</div><span className={styles.progressNote}>{ui.progressNote}</span></div>;
}

/** The answer text without the part that stands for the card (the card is shown instead). */
export function answerTextOf(document: AgentResultDocument, showsCard: boolean): string {
  let text = document.answer?.text ?? "";
  // Coordinator note: with the basis line shown, the footnote saying the same is not repeated (documents stored
  // before the server stopped writing it still carry it).
  if (document.answer?.basis) for (const footnote of NOTES_FOOTNOTES) text = text.split(footnote).join("");
  const line = document.answer?.cardLine;
  if (showsCard && line && text.includes(line)) text = text.replace(line, "");
  return text.replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

/** The server's footnote that the answer came from the notes (features/agent-v1/answer/gap-copy.ts fromNotes). */
const NOTES_FOOTNOTES = (["zh", "ja", "en"] as const).map((language) => standardCopyFor(language).aiCard.notesFootnote);
