"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AccountDesignSuggestion } from "../../../../../shared/mock/demo-world/account";
import type { ProfilePayload } from "../../../../../features/profile/contract";
import type { ProfileDocumentExtractionKind } from "../../../../../features/profile/extraction-contract";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Button, Card, Chip } from "../ui";
import { AccountLayout } from "./AccountLayout";
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

function dateText(value: string, language: OrbitLanguage): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString(language);
}

function SuggestionsRail({ cards, samples, language }: { cards: readonly SuggestionCard[]; samples?: readonly AccountDesignSuggestion[]; language: OrbitLanguage }) {
  const t = suggestionsCopy(language);
  const counts: Partial<Record<SuggestionSource, number>> = samples
    ? samples.reduce((next, card) => { const source = sampleSource(card.source); next[source] = (next[source] ?? 0) + 1; return next; }, {} as Partial<Record<SuggestionSource, number>>)
    : filterCounts(cards);
  return <div className={styles.rail}>
    <Card title={t("ruleTitle")}><p className={styles.subtle}>{t("ruleBody")}</p></Card>
    {Object.keys(counts).length ? <Card title={t("sources")}><div className={styles.railList}>
      {(Object.keys(counts) as SuggestionSource[]).map((source) => <div className={styles.railRow} key={source}><span>{suggestionSourceLabel(source, language)}</span><b>{counts[source]}</b></div>)}
    </div></Card> : null}
  </div>;
}

function ReviewCard({ card, language, disabled, onDecision, onSelectAll }: {
  card: SuggestionCard;
  language: OrbitLanguage;
  disabled: boolean;
  onDecision: (rowId: string, decision: SuggestionDecision) => void;
  onSelectAll: () => void;
}) {
  const t = suggestionsCopy(language);
  return <Card>
    <div className={styles.cardHeader}>
      <div><h2 className={styles.cardTitle}>{t("self")}<Chip label={suggestionSourceLabel(card.source, language)} tone="lav" /></h2><span className={styles.meta}>{dateText(card.createdAt, language)}</span></div>
      <Button label={t("selectAllCard")} size="sm" variant="ghost" onClick={onSelectAll} disabled={disabled} />
    </div>
    <div className={styles.rows}>{card.rows.map((row) => <div className={styles.row} key={row.id}>
      <span className={styles.label}>{suggestionFieldLabel(row.field, language)}</span>
      <s className={styles.old} title={t("current")}>{format(row.currentValue, t("unknown"))}</s>
      <span className={styles.arrow} aria-hidden>→</span>
      <b className={styles.new} title={t("proposed")}>{format(row.suggestedValue, t("unknown"))}</b>
      <span className={styles.decisions} role="group" aria-label={suggestionFieldLabel(row.field, language)}>
        <button type="button" className={`btn ${styles.decision}`} aria-label={`${t("skip")} · ${suggestionFieldLabel(row.field, language)}`} aria-pressed={row.decision === "no"} disabled={disabled} onClick={() => onDecision(row.id, row.decision === "no" ? "pending" : "no")}>✕</button>
        <button type="button" className={`btn ${styles.decision}`} aria-label={`${t("accept")} · ${suggestionFieldLabel(row.field, language)}`} aria-pressed={row.decision === "yes"} disabled={disabled} onClick={() => onDecision(row.id, row.decision === "yes" ? "pending" : "yes")}>✓</button>
      </span>
      {row.rationale ? <details className={styles.why}><summary>{t("evidence")}</summary><p>{row.rationale}</p></details> : null}
    </div>)}</div>
  </Card>;
}

function SampleCard({ card, language }: { card: AccountDesignSuggestion; language: OrbitLanguage }) {
  const t = suggestionsCopy(language);
  return <Card className={styles.sample}>
    <div className={styles.cardHeader}><h2 className={styles.cardTitle}>{card.name}<Chip label={t("sample")} tone="neutral" /><Chip label={suggestionSourceLabel(sampleSource(card.source), language)} tone="lav" /></h2><span className={styles.meta}>{card.createdAt}</span></div>
    <p className={styles.subtle}>{t("sampleNote")}</p>
    <div className={styles.sampleRows}>{card.fields.map((field) => <div className={styles.sampleRow} key={`${card.id}:${field.key}`}><span className={styles.label}>{field.label}</span><s className={styles.old}>{field.current}</s><b>{field.proposed}</b></div>)}</div>
  </Card>;
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

  return <AccountLayout active="profile" title={t("title")} subtitle={t("intro")} rightRail={<SuggestionsRail cards={cards} samples={designCards} language={language} />}>
    <div className={styles.page}>
      {status === "loading" ? <p className={styles.subtle} role="status">{t("loading")}</p> : null}
      {status === "failed" ? <div className={styles.top}><p className={styles.error} role="alert">{t("failed")}</p><Button label={t("retry")} onClick={() => void load()} /></div> : null}
      {status === "ready" ? <>
        {!sampleMode && (cards.length > 0 || message) ? <div className={styles.top}><span className={styles.meta}>{cards.length} · {cards.reduce((total, card) => total + card.rows.length, 0)}</span><div className={styles.actions}>{blocked ? <Button label={t("retry")} onClick={() => void load()} /> : null}<Button label={t("apply")} variant="primary" loading={busy} disabled={!decided || blocked} onClick={() => void apply()} /></div></div> : null}
        {message ? <p className={messageError ? styles.error : styles.subtle} role={messageError ? "alert" : "status"}>{message}</p> : null}
        {sources.length > 1 ? <div className={styles.filters} role="group" aria-label={t("sources")}>
          <button type="button" className={`btn ${styles.filter}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{t("all")} {sampleMode ? designCards.length : cards.length}</button>
          {sources.map((source) => <button key={source} type="button" className={`btn ${styles.filter}`} aria-pressed={filter === source} onClick={() => setFilter(source)}>{suggestionSourceLabel(source, language)} {counts[source]}</button>)}
        </div> : null}
        {!cards.length && !visibleSamples.length ? <Card><h2 className={styles.cardTitle}>{t("empty")}</h2><p className={styles.subtle}>{t("emptyDetail")}</p><div className={styles.actions}><a href="/app/contacts/new/scan">{t("scanContact")}</a><a href="/app/agent">{t("talkIorbit")}</a></div></Card> : null}
        <div className={styles.cards}>
          {sampleMode ? visibleSamples.map((card) => <SampleCard key={card.id} card={card} language={language} />) : visibleCards.map((card) => <ReviewCard key={card.id} card={card} language={language} disabled={busy || blocked} onSelectAll={() => setCards((current) => selectCard(current, card.id))} onDecision={(rowId, decision) => setCards((current) => setDecision(current, card.id, rowId, decision))} />)}
          {sampleMode && !designCards.length && sampleExample ? <SampleCard card={sampleExample} language={language} /> : null}
        </div>
        {!sampleMode ? <Card title={t("extractTitle")}><div className={styles.form}>
          <p className={styles.subtle}>{t("extractHint")}</p>
          <div className={styles.formTop}><label className={styles.labelled}>{t("chooseType")}<select className={styles.select} value={kind} onChange={(event) => setKind(event.target.value as ProfileDocumentExtractionKind)}><option value="business-card">{suggestionSourceLabel("business-card", language)}</option><option value="resume">{suggestionSourceLabel("resume", language)}</option></select></label>
            <input className={styles.file} type="file" accept=".txt,.md,text/plain" aria-label={t("textLabel")} onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(setRawText).catch(() => { setMessage(t("failed")); setMessageError(true); }); }} /></div>
          <label className={styles.labelled}>{t("textLabel")}<textarea className={styles.textarea} value={rawText} placeholder={t("textPlaceholder")} onChange={(event) => setRawText(event.target.value)} /></label>
          <div className={styles.actions}><Button label={t("extract")} onClick={() => void extract()} loading={busy} disabled={!rawText.trim() || !profile?.profile} /></div>
        </div></Card> : null}
      </> : null}
    </div>
  </AccountLayout>;
}
