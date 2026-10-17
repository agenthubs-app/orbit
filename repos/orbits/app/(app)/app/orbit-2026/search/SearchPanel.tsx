"use client";

import { Fragment, type ReactNode, type RefObject } from "react";

import { splitByHighlights } from "../../../../../shared/compute/search-highlight";
import type { GlobalSearchResponse, GlobalSearchType, SearchHighlight } from "../../../../../shared/contract/global-search";
import type { OrbitLanguage } from "../../orbit-language-context";
import { pickCopy } from "../copy/types";
import { searchCopy } from "../copy/search";
import { Icon, avatarTone, fillCopy } from "../ui";
import type { SearchFilter, SearchStatus } from "./use-global-search";
import styles from "./search.module.css";

// R30 ⌘K 面板本体（b5 #57 / #58 / #59 / #71；search/DESIGN.md §2.1）。只画：行的数据、键盘与取数在 CommandPalette / use-global-search。

/** One keyboard-reachable row, in screen order. */
export type PanelRow =
  | { id: string; kind: "person" | "event" | "conversation" | "suggestion" | "alternative"; href: string; alternative?: "ask_iorbit" | "events" }
  | { id: string; kind: "recent" | "example"; text: string }
  | { id: string; kind: "ask" };

export interface PanelState {
  query: string;
  filter: SearchFilter;
  result: GlobalSearchResponse | null;
  capability: GlobalSearchResponse | null;
  status: SearchStatus;
  recent: readonly string[];
}

/** The empty state: the query found no people (and no conversations) — the board's 「一致する人はいません」. */
export function isEmptyResult(result: GlobalSearchResponse | null): boolean {
  return !!result && result.query.trim().length > 0 && result.people.items.length === 0 && !(result.conversations?.items.length);
}

export function panelRows(state: PanelState): PanelRow[] {
  const rows: PanelRow[] = [];
  const { result } = state;
  if (!state.query.trim()) {
    for (const text of state.recent) rows.push({ id: `recent:${text}`, kind: "recent", text });
    for (const text of state.capability?.examples ?? []) rows.push({ id: `example:${text}`, kind: "example", text });
    return rows;
  }
  if (!result) return rows;
  if (isEmptyResult(result)) {
    result.suggestions.forEach((item, index) => rows.push({ href: item.href, id: `suggestion:${index}`, kind: "suggestion" }));
    result.alternatives.forEach((item, index) => rows.push({ alternative: item.kind, href: item.href, id: `alternative:${index}`, kind: "alternative" }));
    return rows;
  }
  for (const hit of result.people.items) rows.push({ href: hit.href, id: `person:${hit.contactId}`, kind: "person" });
  for (const hit of result.events.items) rows.push({ href: hit.href, id: `event:${hit.eventId}`, kind: "event" });
  for (const hit of result.conversations?.items ?? []) rows.push({ href: hit.href, id: `conversation:${hit.id}`, kind: "conversation" });
  rows.push({ id: "ask", kind: "ask" });
  return rows;
}

export function filtersFor(types: readonly GlobalSearchType[] | undefined): SearchFilter[] {
  const base: SearchFilter[] = ["all", "people", "events"];
  return types?.includes("conversations") ? [...base, "conversations"] : base;
}

function Marked({ text, ranges, field }: { text: string; ranges: readonly SearchHighlight[]; field: "title" | "subtitle" }) {
  const pieces = splitByHighlights(text, ranges.filter((range) => range.field === field));
  return <>{pieces.map((piece, index) => (piece.marked ? <mark key={index}>{piece.text}</mark> : <Fragment key={index}>{piece.text}</Fragment>))}</>;
}

const EMO_TONE: Record<string, string> = { apricot: styles.av_apricot, blue: styles.av_blue, lav: styles.av_lav, pink: styles.av_pink, teal: styles.av_teal };

export function SearchPanel({ state, rows, cursor, onHover, onPick, onQueryChange, onFilterChange, onClearRecent, onRemoveRecent, onKeyDown, inputRef, language, listId, optionId }: {
  state: PanelState;
  rows: readonly PanelRow[];
  cursor: number;
  onHover: (index: number) => void;
  onPick: (index: number) => void;
  onQueryChange: (value: string) => void;
  onFilterChange: (filter: SearchFilter) => void;
  onClearRecent: () => void;
  onRemoveRecent: (text: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  language: OrbitLanguage;
  listId: string;
  optionId: (index: number) => string;
}) {
  const t = (entry: (typeof searchCopy)[keyof typeof searchCopy]) => pickCopy(entry, language);
  const fill = (entry: (typeof searchCopy)[keyof typeof searchCopy], values: Record<string, string | number>) => fillCopy(pickCopy(entry, language), values);
  const { query, result, capability, status } = state;
  const trimmed = query.trim();
  const types = capability?.types ?? result?.types;
  const filters = filtersFor(types);
  const filterLabel: Record<SearchFilter, string> = { all: t(searchCopy.typeAll), conversations: t(searchCopy.typeConversations), events: t(searchCopy.typeEvents), people: t(searchCopy.typePeople) };
  const semanticOn = (result?.semantic.available ?? capability?.semantic.available) ?? false;
  const indexOf = (id: string) => rows.findIndex((row) => row.id === id);

  const option = (id: string, children: ReactNode, extraClass = "") => {
    const index = indexOf(id);
    return (
      <div key={id} id={optionId(index)} role="option" aria-selected={cursor === index} className={`${styles.row} ${extraClass} ${cursor === index ? styles.rowOn : ""}`}
        onMouseEnter={() => onHover(index)} onMouseDown={(event) => { event.preventDefault(); onPick(index); }}>
        {children}
      </div>
    );
  };
  const group = (label: string, right?: string) => <div className={styles.group} key={`g:${label}`}><span>{label}</span>{right ? <span>{right}</span> : null}</div>;

  let body: ReactNode;
  if (!trimmed) {
    body = (
      <>
        {state.recent.length ? (
          <>
            <div className={styles.group}><span>{t(searchCopy.recent)}</span><button type="button" className={styles.clear} onClick={onClearRecent}>{t(searchCopy.recentClear)}</button></div>
            {state.recent.map((text) => option(`recent:${text}`, <><Icon name="clock" size={16} /><div className={styles.meta}><b>{text}</b></div><span role="button" aria-label={`${t(searchCopy.recentClear)} ${text}`} className={styles.recentRemove} onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); onRemoveRecent(text); }}><Icon name="x" size={16} /></span></>, styles.recentRow))}
          </>
        ) : null}
        {capability?.examples.length ? (
          <>
            {group(t(searchCopy.examples))}
            <div className={styles.examples}>
              {capability.examples.map((text) => <button type="button" key={text} id={optionId(indexOf(`example:${text}`))} role="option" aria-selected={cursor === indexOf(`example:${text}`)} className={styles.example} onMouseEnter={() => onHover(indexOf(`example:${text}`))} onMouseDown={(event) => { event.preventDefault(); onPick(indexOf(`example:${text}`)); }}>{text}</button>)}
            </div>
            {semanticOn ? <div className={`${styles.lbl} ${styles.hint}`}>{t(searchCopy.semanticHint)}</div> : null}
          </>
        ) : null}
      </>
    );
  } else if (result && isEmptyResult(result)) {
    body = (
      <>
        <div className={styles.empty}>
          <div className={styles.emptyEmoji} aria-hidden>🔎</div>
          <b className={styles.emptyTitle} role="status">{fill(searchCopy.emptyTitle, { q: result.query })}</b>
          <div className={`${styles.lbl} ${styles.emptySub}`}>{fill(searchCopy.emptySearched, { n: result.searchedPeople })}</div>
        </div>
        {result.suggestions.length ? group(t(searchCopy.emptyNear)) : null}
        {result.suggestions.map((item, index) => option(`suggestion:${index}`, <><span className={`${styles.emo} ${index === 0 ? styles.av_blue : styles.av_apricot}`} aria-hidden>{item.emoji}</span><div className={styles.meta}><b>{item.label}</b><span>{fill(searchCopy.suggestionNarrow, { n: item.count })}</span></div><span className={styles.chev}><Icon name="right" size={16} /></span></>))}
        {result.alternatives.length ? group(t(searchCopy.emptyOther)) : null}
        {result.alternatives.map((item, index) => option(`alternative:${index}`, <><span className={`${styles.emo} ${item.kind === "ask_iorbit" ? styles.av_lav : styles.av_teal}`} aria-hidden>{item.emoji}</span><div className={styles.meta}><b>{item.label}</b><span>{item.detail}</span></div></>))}
      </>
    );
  } else if (result) {
    body = (
      <>
        {result.semantic.enabled ? (
          <div className={styles.banner}><Icon name="sparkle" size={16} /><span>{fill(searchCopy.semanticBanner, { count: "\u0000", matched: result.semantic.matched ?? 0, q: result.query, related: result.semantic.related ?? 0 }).split("\u0000").map((part, index) => (index ? <Fragment key={index}><b>{fill(searchCopy.semanticCount, { n: result.people.total })}</b>{part}</Fragment> : part))}</span></div>
        ) : null}
        {result.people.items.length ? group(fill(searchCopy.groupPeople, { n: result.people.total }), result.people.order === "relevance" ? t(searchCopy.orderRelevance) : undefined) : null}
        {result.people.items.map((hit) => option(`person:${hit.contactId}`, (
          <>
            <span className={`${styles.av} ${EMO_TONE[avatarTone(hit.name)] ?? styles.av_lav}`} aria-hidden>{hit.initial}</span>
            <div className={styles.meta}><b><Marked text={hit.name} ranges={hit.highlights} field="title" /></b><span><Marked text={[hit.org, hit.role].filter(Boolean).join(" · ")} ranges={hit.highlights} field="subtitle" /></span></div>
            {hit.reason ? <span className={styles.reason}>{hit.reason}</span> : hit.status ? <span className={`${styles.chip} ${hit.status === "in_progress" ? styles.chip_lav : styles.chip_apricot}`}>{hit.status === "in_progress" ? t(searchCopy.statusInProgress) : t(searchCopy.statusAcquaintance)}</span> : null}
          </>
        )))}
        {result.events.items.length ? group(fill(searchCopy.groupEvents, { n: result.events.total })) : null}
        {result.events.items.map((hit) => option(`event:${hit.eventId}`, (
          <>
            <span className={`${styles.emo} ${hit.via === "attendees" ? styles.av_lav : styles.av_teal}`} aria-hidden>{hit.emoji}</span>
            <div className={styles.meta}><b><Marked text={hit.title} ranges={hit.highlights} field="title" /></b><span><Marked text={hit.note} ranges={hit.highlights} field="subtitle" /></span></div>
            {hit.via === "attendees" ? <span className={styles.reason}>{t(searchCopy.viaAttendees)}</span> : null}
          </>
        )))}
        {result.conversations?.items.length ? group(fill(searchCopy.groupConversations, { n: result.conversations.total })) : null}
        {(result.conversations?.items ?? []).map((hit) => option(`conversation:${hit.id}`, (
          <>
            <span className={`${styles.emo} ${hit.kind === "iorbit" ? styles.av_lav : styles.av_blue}`} aria-hidden>{hit.kind === "iorbit" ? "✨" : "📧"}</span>
            <div className={styles.meta}><b>{hit.kind === "iorbit" ? t(searchCopy.iorbitPrefix) : null}<Marked text={hit.title} ranges={hit.highlights} field="title" /></b><span><Marked text={hit.subtitle} ranges={hit.highlights} field="subtitle" /></span></div>
          </>
        )))}
        {group(t(searchCopy.groupCommands))}
        {option("ask", <><span className={styles.lbtn}><Icon name="sparkle" size={16} /></span><div className={styles.meta}><b>{fill(searchCopy.askIorbit, { q: trimmed })}</b></div><kbd className={styles.kbd}>⌘</kbd><kbd className={styles.kbd}>↵</kbd></>)}
      </>
    );
  } else {
    body = <div className={styles.status} role="status">{status === "rate_limited" ? t(searchCopy.rateLimited) : status === "failed" ? t(searchCopy.failed) : status === "searching" ? t(searchCopy.searching) : null}</div>;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.field}>
        <Icon name="search" size={20} />
        <input
          ref={inputRef}
          className={styles.input}
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls={listId}
          aria-activedescendant={rows.length ? optionId(cursor) : undefined}
          aria-label={t(searchCopy.placeholder)}
          placeholder={t(searchCopy.placeholder)}
          value={query}
          size={Math.max(trimmed.length, 1)}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className={styles.chips} role="tablist" aria-label={t(searchCopy.typesLabel)}>
          {filters.map((filter) => <button type="button" role="tab" key={filter} aria-selected={state.filter === filter} className={`${styles.cat} ${state.filter === filter ? styles.catOn : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={() => onFilterChange(filter)}>{filterLabel[filter]}</button>)}
        </div>
        <kbd className={styles.kbd}>Esc</kbd>
      </div>
      <div id={listId} role="listbox" aria-label={t(searchCopy.resultsLabel)} className={styles.body}>{body}</div>
      <div className={styles.foot}>
        <span className={styles.lbl}><kbd className={styles.kbd}>↑</kbd><kbd className={styles.kbd}>↓</kbd> {t(searchCopy.hintMove)}</span>
        <span className={styles.lbl}><kbd className={styles.kbd}>↵</kbd> {t(searchCopy.hintOpen)}</span>
        <span className={styles.lbl}><kbd className={styles.kbd}>Tab</kbd> {t(searchCopy.hintSwitch)}</span>
        <span className={`${styles.lbl} ${styles.footRight}`}>{semanticOn ? t(searchCopy.semanticOn) : t(searchCopy.semanticOff)}</span>
      </div>
    </div>
  );
}
