"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AccountDesignSuggestion } from "../../../../../shared/mock/demo-world/account";
import type { ProfilePayload } from "../../../../../features/profile/contract";
import type { ProfileDocumentExtractionKind } from "../../../../../features/profile/extraction-contract";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Avatar, Button, Chip, Icon, MacTile, Orbit2026Scope, SampleTag, ToastProvider, WhyDisclosure } from "../ui";
import { ShellPage } from "../shell/slots";
import { applyConfirmedSelection, extractProfileText, readSuggestionProfile, readSuggestions } from "./SuggestionsApi";
import { suggestionFieldLabel, suggestionSourceLabel, suggestionsCopy } from "./SuggestionsCopy";
import {
  buildExtractionCard, buildLiveCards, filterCounts, selectCard, setDecision,
  type SuggestionCard, type SuggestionDecision, type SuggestionSource, type SuggestionValue,
} from "./SuggestionsModel";
import styles from "./SuggestionsPage.module.css";

type Filter = "all" | SuggestionSource;

function sampleSource(source: AccountDesignSuggestion["source"]): SuggestionSource {
  return source === "conversation" ? "chat" : source;
}

function format(value: SuggestionValue, empty: string): string {
  const text = Array.isArray(value) ? value.join(" · ") : String(value);
  return text.trim() || empty;
}

const SOURCE_TILE: Record<SuggestionSource, { emoji: string; tone: "apricot" | "blue" | "lav" | "teal" | "pink" }> = {
  "business-card": { emoji: "📇", tone: "apricot" }, resume: { emoji: "📄", tone: "blue" }, chat: { emoji: "✨", tone: "lav" },
  contact: { emoji: "👤", tone: "teal" }, activity: { emoji: "🗓️", tone: "pink" },
};
const SOURCE_WHEN: Record<SuggestionSource, "scanned" | "uploaded" | "talked" | "noted"> = { "business-card": "scanned", resume: "uploaded", chat: "talked", contact: "noted", activity: "noted" };

type RowView = { id: string; label: string; old: string; next: string; decision: SuggestionDecision; rationale?: string };
type CardView = { id: string; who: string; sub: string; avatar: string; source: SuggestionSource; sourceLabel: string; createdAt: string; rows: RowView[] };

function monthDay(value: string, language: OrbitLanguage): string {
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB", { month: "long", day: "numeric", timeZone: "Asia/Tokyo" }).format(parsed);
}

/** b12 W-R18a-04 rail: 🔄 反映のルール, 提案の出どころ rows, the conversation note. */
function SuggestionsRail({ counts, language }: { counts: Partial<Record<SuggestionSource, number>>; language: OrbitLanguage }) {
  const t = suggestionsCopy(language);
  const sources = Object.keys(counts) as SuggestionSource[];
  return <div className={styles.rail}>
    <h2 className={styles.railHead}><MacTile emoji="🔄" tone="teal" size="sm" />{t("ruleTitle")}</h2>
    <div className={styles.railCard}>{t("ruleLine1")}<br />{t("ruleLine2")}</div>
    {sources.length ? <><div className={styles.lbl}>{t("sources")}</div>
      {sources.map((source) => <div className={styles.railRow} key={source}><MacTile emoji={SOURCE_TILE[source].emoji} tone={SOURCE_TILE[source].tone} size="sm" /><b>{suggestionSourceLabel(source, language)}</b><span>{counts[source]}</span></div>)}</> : null}
    <div className={styles.railNote}>{t("chatNote")}</div>
  </div>;
}

/** b12 W-R18a-04 .sgcard: who + すべて採用, the source chip and date, .sgw rows (label · old → new · ✕ ✓). */
function ReviewCard({ card, language, disabled, sample = false, onDecision, onSelectAll }: {
  card: CardView;
  /** Design-only sample: drawn like the board but never actionable, and tagged. */
  sample?: boolean;
  language: OrbitLanguage;
  disabled: boolean;
  onDecision: (rowId: string, decision: SuggestionDecision) => void;
  onSelectAll: () => void;
}) {
  const t = suggestionsCopy(language);
  const tile = SOURCE_TILE[card.source];
  const reasons = card.rows.map((row) => row.rationale).filter(Boolean);
  return <section className={styles.sgcard}>
    <div className={styles.who}><Avatar name={card.avatar} size="sm" /><div><b>{card.who}{sample ? <SampleTag /> : null}</b>{card.sub ? <span>{card.sub}</span> : null}</div>
      {sample ? <span className={styles.ghostButton} aria-hidden>{t("acceptAll")}</span> : <Button label={t("acceptAll")} size="sm" variant="ghost" onClick={onSelectAll} disabled={disabled} />}</div>
    <div className={styles.sourceRow}><Chip label={`${tile.emoji} ${card.sourceLabel}`} tone={tile.tone} /><span className={styles.lbl}>{t(SOURCE_WHEN[card.source]).replace("{date}", monthDay(card.createdAt, language))}</span>
      {reasons.length ? <span className={styles.why}><WhyDisclosure reason={reasons.join(" · ")} /></span> : null}</div>
    <div className={styles.rows}>{card.rows.map((row) => <div className={`${styles.sgw} ${row.decision === "yes" ? styles.yes : row.decision === "no" ? styles.no : ""}`} key={row.id}>
      <span className={styles.lbl}>{row.label}</span>
      <s>{row.old}</s>
      <span className={styles.arrow} aria-hidden><Icon name="right" size={16} /></span>
      <b>{row.next}</b>
      {sample ? <span className={styles.yn} aria-hidden><i className={styles.ynDot}><Icon name="x" size={16} /></i><i className={styles.ynDot}><Icon name="check" size={16} /></i></span> : <span className={styles.yn} role="group" aria-label={row.label}>
        <button type="button" className={`btn ${row.decision === "no" ? styles.on : ""}`} aria-label={`${t("skip")} · ${row.label}`} aria-pressed={row.decision === "no"} disabled={disabled} onClick={() => onDecision(row.id, row.decision === "no" ? "pending" : "no")}><Icon name="x" size={16} /></button>
        <button type="button" className={`btn ${styles.y} ${row.decision === "yes" ? styles.on : ""}`} aria-label={`${t("accept")} · ${row.label}`} aria-pressed={row.decision === "yes"} disabled={disabled} onClick={() => onDecision(row.id, row.decision === "yes" ? "pending" : "yes")}><Icon name="check" size={16} /></button>
      </span>}
    </div>)}</div>
  </section>;
}

export function SuggestionsPage({ designCards, sampleExample }: { designCards?: AccountDesignSuggestion[]; sampleExample?: AccountDesignSuggestion }) {
  const { language } = useOrbitLanguage();
  const t = suggestionsCopy(language);
  const sampleMode = designCards !== undefined;
  const [cards, setCards] = useState<SuggestionCard[]>([]);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(sampleMode ? "ready" : "loading");
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<ProfileDocumentExtractionKind>("resume");
  const [rawText, setRawText] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);

  const load = useCallback(async () => {
    if (sampleMode) return;
    setStatus("loading");
    setBlocked(false);
    try {
      const [suggestions, payload] = await Promise.all([readSuggestions(language), readSuggestionProfile()]);
      setCards(buildLiveCards(suggestions));
      setProfile(payload);
      setStatus("ready");
      setMessage("");
    } catch { setStatus("failed"); }
  }, [language, sampleMode]);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => sampleMode
    ? designCards.reduce((next, card) => { const source = sampleSource(card.source); next[source] = (next[source] ?? 0) + 1; return next; }, {} as Partial<Record<SuggestionSource, number>>)
    : filterCounts(cards), [sampleMode, designCards, cards]);
  const sources = Object.keys(counts) as SuggestionSource[];
  const visibleCards = filter === "all" ? cards : cards.filter((card) => card.source === filter);
  const visibleSamples = designCards?.filter((card) => filter === "all" || sampleSource(card.source) === filter) ?? [];
  const decided = cards.some((card) => card.rows.some((row) => row.decision !== "pending"));

  const extract = async () => {
    if (!profile?.profile || !rawText.trim() || busy) return;
    setBusy(true); setMessage("");
    try {
      const draft = await extractProfileText(kind, rawText.trim());
      const card = draft ? buildExtractionCard(draft, profile.profile) : null;
      if (!card) { setMessage(t("noFields")); setMessageError(true); return; }
      setCards((current) => [card, ...current.filter((item) => item.id !== card.id)]);
      setFilter("all");
      setRawText("");
    } catch { setMessage(t("failed")); setMessageError(true); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!decided || busy || blocked) return;
    setBusy(true); setMessage("");
    try {
      const result = await applyConfirmedSelection(cards);
      if (result.decisionFailures.length) {
        setMessage(t("partial")); setMessageError(true); setBlocked(true);
      } else {
        setCards((current) => current.flatMap((card) => {
          const rows = card.rows.filter((row) => row.decision === "pending");
          return rows.length ? [{ ...card, rows }] : [];
        }));
        setMessage(result.applied ? t("saved") : t("dismissed"));
        setMessageError(false);
      }
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes("Conflicting") ? t("conflict") : t("failed"));
      setMessageError(true);
    } finally { setBusy(false); }
  };

  // Sample (design) cards are previewed with local decisions only; they never reach the server.
  const [sampleDecisions, setSampleDecisions] = useState<Record<string, SuggestionDecision>>({});
  const selfName = profile?.profile?.displayName ?? "";
  const views: CardView[] = sampleMode
    ? visibleSamples.map((card) => ({ id: card.id, who: card.name, sub: card.company, avatar: card.target === "self" ? (selfName || card.company) : card.name,
      source: sampleSource(card.source), sourceLabel: card.sourceLabel, createdAt: card.createdAt,
      rows: card.fields.map((field) => ({ id: `${card.id}:${field.key}`, label: field.label, old: field.current, next: field.proposed, decision: sampleDecisions[`${card.id}:${field.key}`] ?? "pending" })) }))
    : visibleCards.map((card) => ({ id: card.id, who: t("self"), sub: selfName, avatar: selfName || t("self"), source: card.source, sourceLabel: suggestionSourceLabel(card.source, language), createdAt: card.createdAt,
      rows: card.rows.map((row) => ({ id: row.id, label: suggestionFieldLabel(row.field, language), old: format(row.currentValue, t("unknown")), next: format(row.suggestedValue, t("unknown")), decision: row.decision, ...(row.rationale ? { rationale: row.rationale } : {}) })) }));
  const allRows = views.flatMap((card) => card.rows);
  const yes = allRows.filter((row) => row.decision === "yes").length, no = allRows.filter((row) => row.decision === "no").length;
  const totalCards = sampleMode ? (designCards?.length ?? 0) : cards.length;
  const totalRows = sampleMode ? (designCards ?? []).reduce((n, card) => n + card.fields.length, 0) : cards.reduce((n, card) => n + card.rows.length, 0);
  const decide = (cardId: string, rowId: string, decision: SuggestionDecision) => sampleMode
    ? setSampleDecisions((current) => ({ ...current, [rowId]: decision }))
    : setCards((current) => setDecision(current, cardId, rowId, decision));
  const acceptAll = (cardId: string) => sampleMode
    ? setSampleDecisions((current) => ({ ...current, ...Object.fromEntries((views.find((card) => card.id === cardId)?.rows ?? []).map((row) => [row.id, "yes" as const])) }))
    : setCards((current) => selectCard(current, cardId));
  const skipAll = () => sampleMode
    ? setSampleDecisions(Object.fromEntries(allRows.map((row) => [row.id, "no" as const])))
    : setCards((current) => current.map((card) => ({ ...card, rows: card.rows.map((row) => ({ ...row, decision: "no" as const })) })));

  return <Orbit2026Scope language={language} className={styles.scope}><ToastProvider>
    <ShellPage title={t("title")} subtitle={status === "ready" && totalCards ? t("headCount").replace("{cards}", String(totalCards)).replace("{rows}", String(totalRows)) : t("intro")}
      left={<a className={`btn ${styles.back}`} href="/app/profile" aria-label={t("back")}><Icon name="left" size={20} /></a>}
      right={status === "ready" && totalCards ? <>
        <Button label={t("skipAll")} onClick={skipAll} disabled={sampleMode || busy || blocked} />
        <Button label={t("applyCount").replace("{n}", String(yes))} variant="primary" loading={busy} disabled={sampleMode || !decided || blocked} onClick={() => void apply()} />
      </> : undefined}
      rightRail={<SuggestionsRail counts={counts} language={language} />} phoneFold phoneBare />
    <div className={styles.page}>
      {/* b12 W-R18a-25 (390): full screen with the kit .topbar — back + centred title; the bulk actions move into the page. */}
      <div className={styles.phoneTopbar}><a className={`btn ${styles.back}`} href="/app/profile" aria-label={t("back")}><Icon name="left" size={20} /></a><b>{t("title")}</b><span /></div>
      {status === "loading" ? <p className={styles.subtle} role="status">{t("loading")}</p> : null}
      {status === "failed" ? <div className={styles.top}><p className={styles.error} role="alert">{t("failed")}</p><Button label={t("retry")} onClick={() => void load()} /></div> : null}
      {status === "ready" ? <>
        {message ? <p className={messageError ? styles.error : styles.subtle} role={messageError ? "alert" : "status"}>{message}{blocked ? <Button label={t("retry")} size="sm" variant="ghost" onClick={() => void load()} /> : null}</p> : null}
        {totalCards ? <div className={styles.toolbar}>
          <div className={styles.seg} role="group" aria-label={t("sources")}>
            <button type="button" className={`btn ${filter === "all" ? styles.on : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{t("all")} {totalCards}</button>
            {sources.map((source) => <button key={source} type="button" className={`btn ${filter === source ? styles.on : ""}`} aria-pressed={filter === source} onClick={() => setFilter(source)}>{suggestionSourceLabel(source, language)} {counts[source]}</button>)}
          </div>
          <span className={styles.lbl}>{t("tally").replace("{yes}", String(yes)).replace("{no}", String(no)).replace("{pending}", String(allRows.length - yes - no))}</span>
        </div> : null}
        {totalCards ? <div className={styles.phoneActions}>
          <Button label={t("skipAll")} onClick={skipAll} disabled={sampleMode || busy || blocked} />
          <Button label={t("applyCount").replace("{n}", String(yes))} variant="primary" loading={busy} disabled={sampleMode || !decided || blocked} onClick={() => void apply()} />
        </div> : null}
        {!cards.length && !visibleSamples.length ? <section className={styles.sgcard}><h2 className={styles.cardTitle}>{t("empty")}</h2><p className={styles.subtle}>{t("emptyDetail")}</p><div className={styles.actions}><a href="/app/contacts/new/scan">{t("scanContact")}</a><a href="/app/agent">{t("talkIorbit")}</a></div></section> : null}
        <div className={styles.cards}>
          {views.map((card) => <ReviewCard key={card.id} card={card} language={language} sample={sampleMode} disabled={busy || blocked} onSelectAll={() => acceptAll(card.id)} onDecision={(rowId, decision) => decide(card.id, rowId, decision)} />)}
          {sampleMode && !designCards.length && sampleExample ? <section className={`${styles.sgcard} ${styles.sample}`}><p className={styles.subtle}>{t("sampleNote")}</p></section> : null}
        </div>
        {!sampleMode ? <section className={styles.sgcard}><h2 className={styles.cardTitle}>{t("extractTitle")}</h2><div className={styles.form}>
          <p className={styles.subtle}>{t("extractHint")}</p>
          <div className={styles.formTop}><label className={styles.labelled}>{t("chooseType")}<select className={styles.select} value={kind} onChange={(event) => setKind(event.target.value as ProfileDocumentExtractionKind)}><option value="business-card">{suggestionSourceLabel("business-card", language)}</option><option value="resume">{suggestionSourceLabel("resume", language)}</option></select></label>
            <input className={styles.file} type="file" accept=".txt,.md,text/plain" aria-label={t("textLabel")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(setRawText).catch(() => { setMessage(t("failed")); setMessageError(true); }); }} /></div>
          <label className={styles.labelled}>{t("textLabel")}<textarea className={styles.textarea} value={rawText} placeholder={t("textPlaceholder")} onChange={(event) => setRawText(event.target.value)} /></label>
          <div className={styles.actions}><Button label={t("extract")} onClick={() => void extract()} loading={busy} disabled={!rawText.trim() || !profile?.profile} /></div>
        </div></section> : null}
      </> : null}
    </div>
  </ToastProvider></Orbit2026Scope>;
}
