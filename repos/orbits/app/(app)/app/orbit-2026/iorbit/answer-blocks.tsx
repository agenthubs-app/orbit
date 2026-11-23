"use client";

/**
 * agent-design AG19（获批视觉稿 2026-11-19，D1–D6）：回答按块渲染。
 *
 * 结论加粗、短段、要点、记录卡片（整张可点，进那条记录的页面）、灰底的「这次没做的部分」。字和顺序都是结果文档里
 * 服务端写好的，这里只负责摆：卡片先显示几张、点「还有 N 条」原地展开（不重新请求），已不在的记录显示成虚线卡、不可点。
 */
import { useState, type ReactNode } from "react";

import { answerRecordKey, answerTileOf, recordsShown, type AnswerBlock, type AnswerRecordsBlock } from "../../../../../shared/compute/agent-answer-blocks";
import { referenceKindLabel } from "../../../../../shared/compute/agent-references";
import type { AgentAnswerRecordContract, AgentAnswerRecordKind } from "../../../../../shared/contract/agent-v1";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { standardCopyFor } from "../copy/standard";
import { agentRecordHref, memorySettingsHref } from "./action-preview-client";
import styles from "./answer-blocks.module.css";

const KIND_CLASS: Record<AgentAnswerRecordKind, string> = { attendance: styles.kWent, contact: styles.kContact, event: styles.kEvent, memo: styles.kMemo, schedule: styles.kSchedule, todo: styles.kTodo };
const TONE_CLASS = { apricot: styles.tApricot, blue: styles.tBlue, lav: styles.tLav, pink: styles.tPink, plum: styles.tPlum, teal: styles.tTeal } as const;

const ICONS: Record<"todo" | "memo" | "schedule" | "attendance", ReactNode> = {
  attendance: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5.5 12.5 4.2 4.2 8.8-9.4" /></svg>,
  memo: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6.5 4h8.2L18 7.3V20H6.5z" /><path d="M9.5 11h5.5M9.5 15h5.5" /></svg>,
  schedule: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="3.5" /><path d="M8 3.5v4M16 3.5v4M4 10.5h16" /></svg>,
  todo: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></svg>,
};

function Tile({ record, index }: { record: AgentAnswerRecordContract; index: number }) {
  const tile = answerTileOf(record, index);
  if (tile.shape === "emoji") return <span className={`${styles.tile} ${TONE_CLASS[tile.tone]}`} aria-hidden="true">{tile.emoji}</span>;
  if (tile.shape === "avatar") return <span className={`${styles.tile} ${styles.avatar} ${TONE_CLASS[tile.tone]}`} aria-hidden="true">{tile.letter}</span>;
  return <span className={`${styles.tile} ${TONE_CLASS[tile.tone]}`} aria-hidden="true">{ICONS[tile.icon]}</span>;
}

function RecordCard({ record, index, mini, gone, language, navigate }: { record: AgentAnswerRecordContract; index: number; mini: boolean; gone: boolean; language: OrbitLanguage; navigate(href: string): void }) {
  const ui = standardCopyFor(language).aiCard;
  const href = gone ? null : agentRecordHref(record);
  const kind = referenceKindLabel(record.kind, language);
  const body = (
    <>
      <Tile record={record} index={index} />
      <span className={styles.meta}>
        {mini ? null : (
          <span className={styles.top}>
            <span className={`${styles.kind} ${KIND_CLASS[record.kind]}`}>{kind}</span>
            {gone ? <span className={styles.goneWord}>{ui.recordGone}</span> : record.top ? <span className={styles.topText}>{record.top}</span> : null}
          </span>
        )}
        <b className={styles.title}>{record.title}</b>
        {gone ? (mini ? <span className={`${styles.sub} ${styles.goneWord}`}>{ui.recordGone}</span> : null) : mini ? ((record.top ?? record.sub) ? <span className={styles.sub}>{record.top ?? record.sub}</span> : null) : record.sub ? <span className={`${styles.sub} ${record.subTone === "late" ? styles.late : ""}`}>{record.sub}</span> : null}
        {!mini && !gone && record.why ? <span className={styles.why}>{record.why}</span> : null}
      </span>
    </>
  );
  const className = `${styles.card} ${mini ? styles.mini : ""} ${gone || !href ? styles.gone : ""}`;
  const label = mini ? `${kind} ${record.title}` : undefined;
  if (!href) return <div className={className} data-orbit-answer-card={answerRecordKey(record)} data-orbit-answer-card-state={gone ? "gone" : "plain"} aria-label={label}>{body}</div>;
  return <a className={className} href={href} data-orbit-answer-card={answerRecordKey(record)} data-orbit-answer-card-state="open" aria-label={label} onClick={(event) => { event.preventDefault(); navigate(href); }}>{body}</a>;
}

function Records({ block, gone, language, navigate }: { block: AnswerRecordsBlock; gone: ReadonlySet<string>; language: OrbitLanguage; navigate(href: string): void }) {
  // D2: the rest unfolds in place; nothing is requested again.
  const [expanded, setExpanded] = useState(false);
  const mini = block.size === "mini";
  const view = recordsShown(block, expanded);
  return (
    <div className={`${styles.cards} ${mini ? styles.cardsMini : ""}`} data-orbit-answer-records={mini ? "mini" : "full"}>
      {block.caption ? <span className={styles.caption}>{block.caption}</span> : null}
      <div className={mini ? styles.miniGrid : styles.cardList}>
        {view.items.map((record, index) => <RecordCard key={answerRecordKey(record)} record={record} index={index} mini={mini} gone={Boolean(record.gone) || gone.has(answerRecordKey(record))} language={language} navigate={navigate} />)}
      </div>
      {view.foldable ? <button type="button" className={`btn ${styles.more} ${expanded ? styles.moreUp : ""}`} aria-expanded={expanded} data-orbit-answer-more onClick={() => setExpanded((value) => !value)}>{expanded ? block.lessLabel ?? "" : block.moreLabel}</button> : null}
    </div>
  );
}

function Note({ block, navigate }: { block: Extract<AnswerBlock, { type: "note" }>; navigate(href: string): void }) {
  // AG14 (board 4, D3): a memory note ends in 「去设置 ›」 to the memory part of the settings page.
  const go = block.go ? memorySettingsHref(block.go.memoryId) : null;
  return (
    <div className={styles.note} data-orbit-answer-note={block.go ? "memory" : ""}>
      <div className={styles.noteHead}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6v.2" /></svg>{block.title}</div>
      {block.items.map((item, index) => (
        <div key={index} className={styles.noteItem}>
          {item.quote ? <b>「{item.quote}」</b> : null}
          {item.text}{item.action ? <span className={styles.noteDo}>{item.action}</span> : null}
        </div>
      ))}
      {go && block.go ? <a className={styles.noteGo} href={go} data-orbit-answer-note-go onClick={(event) => { event.preventDefault(); navigate(go); }}>{block.go.label} ›</a> : null}
    </div>
  );
}

/** The answer's blocks. Text blocks that follow each other are one group (10 apart); cards and the note stand 18 away. */
export function AnswerBlocks({ blocks, gone, language, navigate }: { blocks: readonly AnswerBlock[]; gone: ReadonlySet<string>; language: OrbitLanguage; navigate(href: string): void }) {
  const groups: ({ kind: "text"; blocks: AnswerBlock[] } | { kind: "other"; block: AnswerBlock })[] = [];
  for (const block of blocks) {
    if (block.type === "conclusion" || block.type === "paragraph" || block.type === "points") {
      const last = groups[groups.length - 1];
      if (last?.kind === "text") last.blocks.push(block);
      else groups.push({ blocks: [block], kind: "text" });
    } else groups.push({ block, kind: "other" });
  }
  return (
    <div className={styles.answer} data-orbit-answer-blocks>
      {groups.map((group, at) => {
        if (group.kind === "text") {
          return (
            <div key={at} className={styles.text}>
              {group.blocks.map((block, index) => {
                if (block.type === "conclusion") return <p key={index} className={styles.conclusion} data-orbit-answer-conclusion>{block.text}</p>;
                if (block.type === "paragraph") return <p key={index} className={styles.paragraph}>{block.text}</p>;
                if (block.type === "points") return <ul key={index} className={styles.points}>{block.items.map((item, n) => <li key={n}><span>{item.head ? <b>{item.head}</b> : null}{item.head ? "　" : ""}{item.text}</span></li>)}</ul>;
                return null;
              })}
            </div>
          );
        }
        if (group.block.type === "records") return <Records key={at} block={group.block} gone={gone} language={language} navigate={navigate} />;
        if (group.block.type === "note") return <Note key={at} block={group.block} navigate={navigate} />;
        return null;
      })}
    </div>
  );
}
