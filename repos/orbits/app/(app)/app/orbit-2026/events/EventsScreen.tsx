"use client";

// R26 イベント (events DESIGN §2.1): the 評価 / 参加予定 / 探す page in the shell. 評価: the input card, 次の参加予定,
// 評価したイベント (score order) and the selected assessment in the rail (1440) / a drawer (1024) / its own screen (390).
// 参加予定: events/mine upcoming + past. 探す: R27 `DiscoverTab`（コミュニティ / プランに効く / すべて，右栏「選択中のイベント」）。
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { eventEmoji } from "../../../../../shared/compute/event-emoji";
import type { EventAssessmentAvailability, EventAssessmentContract, EventAssessmentCreateInput, EventAssessmentFacts } from "../../../../../shared/contract/event-assessment";
import type { MyEventItem } from "../../../../../shared/contract/events-mine";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { ShellSearchButton } from "../shell/Orbit2026Shell";
import { ShellPage, useInShell } from "../shell/slots";
import { Drawer, Icon, Kbd, Modal, Orbit2026Scope, SampleTag, ToastProvider, useStandardCopy, useToast } from "../ui";
import { Assessing, FillThree, LoginRequired, NotEventPage, PasteText } from "./AssessFlow";
import { AssessmentPage, AssessmentRail, ScoreRing, translator, verdictLabel, type Translate } from "./AssessmentDetail";
import { DiscoverHelpRail, DiscoverRail, DiscoverTab, type DiscoverRailState } from "./DiscoverTab";
import { eventsApi, newIdempotencyKey, pollAssessment } from "./events-api";
import { cardLine, eventWhen, isShownInGrid, meetCount, monthOf, orderAssessed, relativeDay, tabOf, verdictTone } from "./events-model";
import styles from "./events.module.css";

type Tab = "assess" | "going" | "discover";
type Tier = "wide" | "medium" | "narrow";
type Flow = { kind: "assessing"; id: string; step: 0 | 1 | 2; sourceLabel?: string } | { kind: "paste" } | { kind: "manual" } | { kind: "fill"; item: EventAssessmentContract } | null;

function useTier(): Tier {
  const [tier, setTier] = useState<Tier>("wide");
  useEffect(() => {
    const update = () => setTier(window.matchMedia("(min-width: 1280px)").matches ? "wide" : window.matchMedia("(min-width: 768px)").matches ? "medium" : "narrow");
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return tier;
}

export interface EventsScreenProps {
  language: OrbitLanguage;
  /** Server-rendered 探す content override (tests); R27 renders `DiscoverTab` by default. */
  discover?: ReactNode;
  /** `/app/events/assessments/[id]`: open this assessment. */
  initialAssessmentId?: string | null;
  /** Server "now" (ISO) so the first render matches the client (SC-R26-12, no hydration warning). */
  nowIso: string;
}

export function EventsScreen(props: EventsScreenProps) {
  return (
    <Orbit2026Scope language={props.language} className={styles.page}>
      <ToastProvider>
        <EventsInner {...props} />
      </ToastProvider>
    </Orbit2026Scope>
  );
}

function EventsInner({ language, discover, initialAssessmentId, nowIso }: EventsScreenProps) {
  const t = translator(language);
  const router = useRouter();
  const params = useSearchParams();
  const tier = useTier();
  const inShell = useInShell();
  const toast = useToast();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [tab, setTab] = useState<Tab>(initialAssessmentId ? "assess" : tabOf(params?.get("tab")));
  useEffect(() => { if (!initialAssessmentId) setTab(tabOf(params?.get("tab"))); }, [params, initialAssessmentId]);
  const [items, setItems] = useState<EventAssessmentContract[] | null>(null);
  const [upcoming, setUpcoming] = useState<MyEventItem[]>([]);
  const [past, setPast] = useState<MyEventItem[]>([]);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [availability, setAvailability] = useState<EventAssessmentAvailability | null>(null);
  const [selected, setSelected] = useState<string | null>(initialAssessmentId ?? null);
  const [flow, setFlow] = useState<Flow>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [discoverRail, setDiscoverRail] = useState<DiscoverRailState>({ row: null, signedOut: false });
  const [discoverSubtitle, setDiscoverSubtitle] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const [list, up, before, avail] = await Promise.all([eventsApi.list(), eventsApi.mine("upcoming", 10), eventsApi.mine("past", 10), eventsApi.availability()]);
    setItems(list.ok ? list.data : []);
    if (up.ok) { setUpcoming([...up.data.items]); setUpcomingCount(up.data.upcomingCount); }
    if (before.ok) setPast([...before.data.items]);
    if (avail.ok) setAvailability(avail.data);
  }, []);
  useEffect(() => { void load(); return () => abort.current?.abort(); }, [load]);

  const ordered = useMemo(() => orderAssessed((items ?? []).filter(isShownInGrid).filter((item) => item.status !== "failed")), [items]);
  const current = useMemo(() => (items ?? []).find((item) => item.id === selected) ?? null, [items, selected]);
  // 1440 rail shows the selected one; with nothing selected, the top-scored ready one (web.html #12 has the first card selected).
  const railItem = current ?? ordered.find((item) => item.status === "ready") ?? null;

  const replace = (next: EventAssessmentContract) => setItems((list) => [next, ...(list ?? []).filter((item) => item.id !== next.id)]);

  const choose = (next: Tab) => {
    setTab(next);
    const search = new URLSearchParams(params?.toString() ?? "");
    if (next === "assess") search.delete("tab"); else search.set("tab", next);
    router.replace(`/app/events${search.toString() ? `?${search.toString()}` : ""}`, { scroll: false });
  };

  const failureToast = (reason: string) => (reason === "rate_limited" ? toast.error(t("rateLimited")) : toast.error(t("genericError")));

  const settle = (value: EventAssessmentContract) => {
    replace(value);
    if (value.status === "failed" && (value.failureReason === "login_required" || value.failureReason === "not_event_page")) { setFlow(null); setSelected(value.id); return; }
    if (value.status === "needs_input") { setFlow({ item: value, kind: "fill" }); return; }
    if (value.status === "failed") { setFlow(null); toast.error(t("genericError")); return; }
    setFlow(null);
    setSelected(value.id);
    if (tier === "narrow") router.push(`/app/events/assessments/${encodeURIComponent(value.id)}`);
  };

  const start = async (input: EventAssessmentCreateInput, sourceLabel?: string) => {
    setBusy(true);
    const created = await eventsApi.create(input);
    setBusy(false);
    if (created.ok === false) { failureToast(created.reason); return; }
    if (created.data.status !== "reading") { settle(created.data); return; }
    replace(created.data);
    setFlow({ id: created.data.id, kind: "assessing", sourceLabel, step: 0 });
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    let step: 0 | 1 | 2 = 0;
    const ticker = setInterval(() => { step = Math.min(2, step + 1) as 0 | 1 | 2; setFlow((value) => (value?.kind === "assessing" ? { ...value, step } : value)); }, 2500);
    const done = await pollAssessment(created.data.id, replace, controller.signal);
    clearInterval(ticker);
    if (!done) { setFlow(null); if (!controller.signal.aborted) toast.info(t("slow")); return; }
    settle(done);
  };

  const submitUrl = () => {
    const value = url.trim();
    if (!/^https?:\/\//.test(value)) return;
    void start({ idempotencyKey: newIdempotencyKey(), sourceKind: "url", url: value }, value.replace(/^https?:\/\//, ""));
  };

  const submitPosters = async (files: FileList | File[]) => {
    const list = [...files].slice(0, 3);
    if (list.length === 0) return;
    setBusy(true);
    const uploads = await Promise.all(list.map((file) => eventsApi.uploadPoster(file)));
    setBusy(false);
    const ids = uploads.flatMap((upload) => (upload.ok ? [upload.data.posterAssetId] : []));
    if (ids.length === 0) { toast.error(t("genericError")); return; }
    void start({ idempotencyKey: newIdempotencyKey(), posterAssetId: ids[0]!, ...(ids.length > 1 ? { posterAssetIds: ids } : {}), sourceKind: "poster" });
  };

  const submitFill = async (facts: EventAssessmentFacts, unknown: ("startsAt" | "venue" | "price")[]) => {
    if (flow?.kind === "fill") {
      setBusy(true);
      const patched = await eventsApi.patch(flow.item.id, { facts, unknownFields: unknown });
      setBusy(false);
      if (patched.ok === false) { failureToast(patched.reason); return; }
      settle(patched.data);
      return;
    }
    void start({ facts, idempotencyKey: newIdempotencyKey(), sourceKind: "manual" });
  };

  const decide = async (item: EventAssessmentContract, decision: "add" | "skip") => {
    setBusy(true);
    const result = decision === "add" ? await eventsApi.addToPlan(item.id) : await eventsApi.dismiss(item.id);
    setBusy(false);
    if (result.ok === false) { failureToast(result.reason); return; }
    replace({ ...item, userDecision: decision === "add" ? "added" : "dismissed" });
    toast.success(decision === "add" ? t("added") : t("skipped"));
    if (decision === "add") void load();
  };

  const assessedCount = (items ?? []).filter((item) => item.status === "ready" || item.status === "needs_input").length;
  const month = monthOf(now);
  const subtitle = tab === "discover" && discoverSubtitle ? discoverSubtitle : tab === "going"
    ? t("subtitleGoing", { going: upcomingCount, month })
    : assessedCount === 0 && upcomingCount === 0 ? t("subtitleEmpty")
      : assessedCount >= 3 ? t("subtitle", { assessed: assessedCount, going: upcomingCount, month }) : t("subtitleGoing", { going: upcomingCount, month });

  const segmentFor = (full: boolean) => (
    <div className={`${styles.seg} ${full ? styles.segFull : ""}`} role="tablist" aria-label={t("tabsLabel")} data-events-tabs="">
      {(["assess", "going", "discover"] as const).map((key) => (
        <button key={key} type="button" role="tab" aria-selected={tab === key} className={`btn ${styles.segBtn} ${tab === key ? styles.segOn : ""}`} onClick={() => choose(key)}>
          {key === "assess" ? t("tabAssess") : key === "going" ? (tier === "wide" || upcomingCount === 0 || (tier === "narrow" && tab === "discover") ? t("tabGoing") : t("tabGoingCount", { n: upcomingCount })) : t("tabDiscover")}
        </button>
      ))}
    </div>
  );
  const segment = segmentFor(false);
  const empty = items !== null && ordered.length === 0 && upcoming.length === 0;
  // 1440: the selected assessment in the rail (web.html #12), the default iOrbit rail otherwise (#10).
  // 1024 / 390 (b8 #0 / #1): no rail button in the header — the result opens as a drawer / its own screen.
  // 参加予定页签（b12 #310）：右栏是下一场（有评估记录的）参加予定的「評価の詳細」。
  const goingRailItem = tab === "going" ? upcoming.map((event) => (items ?? []).find((item) => item.id === event.assessmentId)).find((item) => item?.status === "ready") ?? null : null;
  const shownRailItem = tab === "assess" && !empty ? railItem : goingRailItem;
  const rail = tier !== "wide" ? false : tab === "discover"
    ? (discoverRail.row ? <DiscoverRail row={discoverRail.row} language={language} /> : <DiscoverHelpRail language={language} />)
    : shownRailItem
    ? <AssessmentRail item={shownRailItem} language={language} busy={busy} onAdd={() => void decide(shownRailItem, "add")} onSkip={() => void decide(shownRailItem, "skip")} />
    : true;

  return (
    <>
      <ShellPage title={t("title")} subtitle={subtitle} left={<ShellSearchButton />} right={segment} rightRail={rail} phoneFold={tier === "narrow"} />
      {tier === "narrow" && tab === "discover" ? (
        <>
          {/* b12 #348（探す 390）：App 式 topbar（🔍 · イベント + 件数 · 📅）+ 全宽 seg。 */}
          <div className={styles.ptop} data-events-phone-top="">
            <ShellSearchButton />
            <div className={styles.ptopT}><b>{t("title")}</b>{discoverSubtitle ? <small>{discoverSubtitle}</small> : null}</div>
            <a className={`btn ${styles.ptopBtn}`} href="/app/events?tab=going" aria-label={t("tabGoing")}><Icon name="calendar" size={20} /></a>
          </div>
          {segmentFor(true)}
        </>
      ) : tier === "narrow" ? (
        <>
          <div className={styles.r8ttl}>{t("title")}{assessedCount > 0 ? <span className={styles.lbl}>{t("assessedCount", { n: assessedCount })}</span> : null}</div>
          {segmentFor(true)}
        </>
      ) : !inShell ? <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 12px" }}>{segment}</div> : null}
      {tab === "discover" ? <div data-events-discover="">{discover ?? <DiscoverTab language={language} tier={tier} signedIn onRail={setDiscoverRail} onSubtitle={setDiscoverSubtitle} />}</div> : null}
      {tab === "going" ? <MyEvents language={language} upcoming={upcoming} past={past} now={now} t={t} /> : null}
      {tab === "assess" ? (
        <div className={tier === "narrow" ? styles.stack : styles.wgrid} data-events-assess="">
          {flow?.kind === "assessing" ? <Assessing language={language} step={flow.step} {...(flow.sourceLabel ? { sourceLabel: flow.sourceLabel } : {})} /> : null}
          {flow?.kind === "paste" ? <PasteText language={language} busy={busy} onAssessText={(text) => void start({ idempotencyKey: newIdempotencyKey(), sourceKind: "text", text })} /> : null}
          {flow?.kind === "manual" ? <FillThree item={null} language={language} busy={busy} onSave={(facts, unknown) => void submitFill(facts, unknown)} /> : null}
          {flow?.kind === "fill" ? <FillThree item={flow.item} language={language} busy={busy} onSave={(facts, unknown) => void submitFill(facts, unknown)} /> : null}
          {!flow && current?.failureReason === "login_required" ? <LoginRequired item={current} language={language} onManual={() => setFlow({ kind: "manual" })} onOther={() => { setSelected(null); setUrl(""); }} onPaste={() => setFlow({ kind: "paste" })} onShot={() => fileRef.current?.click()} /> : null}
          {!flow && current?.failureReason === "not_event_page" ? <NotEventPage item={current} language={language} onManual={() => setFlow({ kind: "manual" })} onAssess={(link, title) => (link ? void start({ idempotencyKey: newIdempotencyKey(), sourceKind: "url", url: link }) : setFlow({ kind: "manual" }))} /> : null}
          <AssessCard
            t={t} tier={tier} big={empty} url={url} setUrl={setUrl} onAssessUrl={submitUrl} busy={busy} availability={availability} fileRef={fileRef} dragging={dragging} setDragging={setDragging}
            onFiles={(files) => void submitPosters(files)} onManual={() => setFlow({ kind: "manual" })} goalLabel={null}
          />
          {empty ? <EmptyCards t={t} onCode={() => setCodeOpen(true)} /> : null}
          {!empty && upcoming[0] ? <NextCard t={t} tier={tier} item={upcoming[0]} language={language} now={now} /> : null}
          {!empty && ordered.length ? (
            <>
              <div className={tier === "narrow" ? `${styles.cardH} ${styles.phoneHead}` : `${styles.span12} ${styles.cardH} ${styles.listHead}`}>
                <h3>{t("assessedTitle")}{tier === "medium" ? <span className={styles.lbl} style={{ fontWeight: 600 }}>{t("countItems", { n: ordered.length })}</span> : null}</h3>
                <span className={styles.more}>{t("byScore")} <Icon name="down" size={16} /></span>
              </div>
              {ordered.map((item) => (
                <AssessedCard key={item.id} item={item} t={t} tier={tier} language={language} selected={railItem?.id === item.id && tier === "wide"} onOpen={() => {
                  setSelected(item.id);
                  if (tier === "narrow") router.push(`/app/events/assessments/${encodeURIComponent(item.id)}`);
                }} />
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      {tier === "medium" && current && (current.status === "ready" || current.status === "needs_input") && tab === "assess" && !initialAssessmentId ? (
        <Drawer open onClose={() => setSelected(null)} title={t("detailTitle")} size="lg">
          <div className={styles.row} style={{ justifyContent: "flex-end", marginBottom: 10 }}><a className={`${styles.btn} ${styles.sm}`} href={`/app/events/assessments/${encodeURIComponent(current.id)}`}>{t("fullScreen")}</a></div>
          <AssessmentPage item={current} language={language} busy={busy} phone onAdd={() => void decide(current, "add")} onSkip={() => void decide(current, "skip")} />
        </Drawer>
      ) : null}
      {initialAssessmentId && current && tier !== "wide" && (current.status === "ready" || current.status === "needs_input") ? (
        <div style={{ marginTop: 18 }}><AssessmentPage item={current} language={language} busy={busy} phone={tier === "narrow"} onAdd={() => void decide(current, "add")} onSkip={() => void decide(current, "skip")} /></div>
      ) : null}
      <ParticipationCodeModal open={codeOpen} onClose={() => setCodeOpen(false)} t={t} onCode={(code) => router.push(`/app/register/${encodeURIComponent(code)}`)} />
    </>
  );
}

function AssessCard({ t, tier, big, url, setUrl, onAssessUrl, busy, availability, fileRef, dragging, setDragging, onFiles, onManual, goalLabel }: {
  t: Translate; tier: Tier; big: boolean; url: string; setUrl: (value: string) => void; onAssessUrl: () => void; busy: boolean; availability: EventAssessmentAvailability | null;
  fileRef: React.RefObject<HTMLInputElement | null>; dragging: boolean; setDragging: (value: boolean) => void; onFiles: (files: FileList) => void; onManual: () => void; goalLabel: string | null;
}) {
  // G18: until the paid AI is on and verified, the URL / poster entries are hidden; only 3 items by hand remain.
  const aiOn = availability?.aiReadAvailable !== false;
  const quotaOut = availability && availability.monthlyLeft === 0 && availability.monthlyLimit;
  const fileInput = <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => { if (event.target.files?.length) onFiles(event.target.files); event.target.value = ""; }} />;
  if (tier === "narrow") {
    // b8 #1 / #3: the compact box — 「URL を貼る」+ 判定, then ポスターを撮る / 写真から.
    return (
      <div className={`${styles.card} ${styles.evalBox}`} data-events-assess-card="">
        <b style={{ fontSize: "var(--fs-card-title)" }}>{t("assessTitle")}</b>
        {aiOn ? (
          <>
            <form className={styles.inputRow} style={{ gap: 8, marginTop: 10 }} onSubmit={(event) => { event.preventDefault(); onAssessUrl(); }}>
              <label className={styles.input}><Icon name="link" size={16} /><input type="url" inputMode="url" value={url} placeholder={t("urlPlaceholderShort")} aria-label={t("urlLabel")} onChange={(event) => setUrl(event.target.value)} /></label>
              <button type="submit" className={`btn ${styles.btn} ${styles.primary} ${styles.tall}`} disabled={busy}>{t("judgeShort")}</button>
            </form>
            <div className={styles.row} style={{ gap: 8, marginTop: 8 }}>
              <button type="button" className={`btn ${styles.btn} ${styles.sm}`} style={{ flex: 1 }} onClick={() => fileRef.current?.click()}><Icon name="scan" size={16} />{t("shootPoster")}</button>
              <button type="button" className={`btn ${styles.btn} ${styles.sm}`} style={{ flex: 1 }} onClick={() => fileRef.current?.click()}><Icon name="image" size={16} />{t("fromPhotos")}</button>
            </div>
            {fileInput}
          </>
        ) : <button type="button" className={`btn ${styles.btn} ${styles.primary}`} style={{ marginTop: 10 }} onClick={onManual}>{t("manualEntry")}</button>}
      </div>
    );
  }
  const medium = tier === "medium" && !big;
  return (
    <div className={`${styles.card} ${big ? `${styles.span12} ${styles.guide}` : medium ? styles.span7 : styles.span8}`} data-events-assess-card="">
      <div className={styles.row} style={{ gap: 12, marginBottom: 14 }}>
        <span className={`${styles.emo} ${styles.t_lav}`}>🔍</span>
        <div style={{ minWidth: 0 }}><b className={big ? styles.title22 : styles.title16}>{t("assessTitle")}</b><div className={styles.lbl}>{medium ? t("assessSubShort") : t("assessSub")}</div></div>
      </div>
      {aiOn ? (
        <>
          <form className={styles.inputRow} onSubmit={(event) => { event.preventDefault(); onAssessUrl(); }}>
            <label className={`${styles.input} ${medium ? styles.input46 : ""}`}><Icon name="link" size={16} /><input type="url" inputMode="url" value={url} placeholder={t("urlPlaceholder")} aria-label={t("urlLabel")} onChange={(event) => setUrl(event.target.value)} /></label>
            <button type="submit" className={`btn ${styles.btn} ${styles.primary} ${styles.tall}`} style={medium ? { height: 46 } : undefined} disabled={busy}>{t("judge")}</button>
          </form>
          {/* b8 #0 `.fl`：卡片等高时把拖放区推到底。 */}
          {medium ? <i className={styles.fl} aria-hidden /> : null}
          <label className={`${styles.drop} ${big ? styles.dropBig : ""} ${dragging ? styles.dropOn : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files); }}>
            <Icon name="image" size={16} />{t("drop")}
            {fileInput}
          </label>
          {quotaOut ? <div className={`${styles.lbl} ${styles.quota}`}>{t("quotaReached", { limit: availability.monthlyLimit!, used: availability.monthlyLimit! })}</div> : null}
        </>
      ) : (
        <button type="button" className={`btn ${styles.btn} ${styles.primary}`} onClick={onManual}>{t("manualEntry")}</button>
      )}
      {big ? (
        <div className={styles.grid3}>
          <div className={`${styles.mac} ${styles.macApricot} ${styles.row}`}><span className={styles.guideEmoji}>🎯</span><div><b className={styles.guideName}>{t("guideGoal")}</b><div className={styles.lbl}>{goalLabel ? t("guideGoalSub", { goal: goalLabel }) : t("guideGoalSubNone")}</div></div></div>
          <div className={`${styles.mac} ${styles.macApricot} ${styles.row}`}><span className={styles.guideEmoji}>🤝</span><div><b className={styles.guideName}>{t("guidePeople")}</b><div className={styles.lbl}>{t("guidePeopleSub")}</div></div></div>
          <div className={`${styles.mac} ${styles.macApricot} ${styles.row}`}><span className={styles.guideEmoji}>⏱️</span><div><b className={styles.guideName}>{t("guideTime")}</b><div className={styles.lbl}>{t("guideTimeSub")}</div></div></div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyCards({ t, onCode }: { t: Translate; onCode: () => void }) {
  return (
    <>
      <div className={`${styles.card} ${styles.span6}`} data-events-example="">
        <div className={styles.cardH}><h3>{t("exampleTitle")} <SampleTag /></h3></div>
        <div className={`${styles.row} ${styles.faded}`} style={{ gap: 16 }}>
          <ScoreRing score={82} size={90} stroke={9} label="82"><b className={styles.score} style={{ fontSize: "var(--fs-number)" }}>82</b></ScoreRing>
          <div><b>{t("exampleName")}</b><div className={styles.lbl}>{t("exampleSub")}</div></div>
        </div>
      </div>
      <div className={`${styles.card} ${styles.span6} ${styles.flat}`} style={{ alignItems: "center", flexDirection: "row", gap: 12 }} data-events-code="">
        <span className={`${styles.emo} ${styles.t_teal}`}>🎟️</span>
        <div style={{ flex: 1 }}><b>{t("codeTitle")}</b><div className={styles.lbl}>{t("codeSub")}</div></div>
        <button type="button" className={`btn ${styles.btn}`} onClick={onCode}>{t("codeEnter")}</button>
      </div>
    </>
  );
}

function Avatars({ initials }: { initials: readonly string[] }) {
  return <div className={styles.avs}>{initials.slice(0, 4).map((letter, index) => <div key={`${letter}-${index}`} className={`${styles.av} ${styles[`av_${index % 4}`]}`}>{letter}</div>)}</div>;
}

function dayChip(iso: string, now: Date, t: Translate) {
  const day = relativeDay(iso, now);
  return day ? <span className={`${styles.chip} ${styles.c_apricot}`}>{day === "tonight" ? t("tonight") : day === "today" ? t("today") : t("tomorrow")}</span> : null;
}

function NextCard({ t, tier, item, language, now }: { t: Translate; tier: Tier; item: MyEventItem; language: OrbitLanguage; now: Date }) {
  if (tier === "narrow") {
    return (
      <div className={`${styles.card} ${styles.nextRow}`} data-events-next="">
        <span className={`${styles.emo} ${styles.t_lav}`}>{item.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}><div className={styles.row} style={{ gap: 6 }}><span className={styles.lbl}>{t("nextTitle")}</span>{dayChip(item.startsAt, now, t)}</div><b className={styles.nextRowName}>{item.title}</b></div>
        <a className={`${styles.btn} ${styles.sm} ${styles.primary}`} href={item.href}>{t("prepareShort")}</a>
      </div>
    );
  }
  const medium = tier === "medium";
  return (
    <div className={`${styles.card} ${medium ? styles.span5 : styles.span4} ${styles.nextCard}`} data-events-next="">
      <div className={`${styles.row} ${styles.between}`}><span className={styles.lbl}>{t("nextTitle")}</span>{dayChip(item.startsAt, now, t)}</div>
      <b className={medium ? styles.clamp2 : styles.nextName} style={medium ? { fontSize: "var(--fs-dialog-title)", marginTop: 8 } : undefined}>{item.title}</b>
      <div className={styles.lbl}>{[eventWhen(item.startsAt, language), item.venue].filter(Boolean).join(" · ")}</div>
      {item.meetCount ? <div className={styles.row} style={{ marginTop: medium ? 12 : 14 }}><Avatars initials={item.meetInitials ?? []} /><span className={styles.lbl}>{t("meetCount", { n: item.meetCount })}</span></div> : null}
      <a className={`${styles.btn} ${styles.sm} ${styles.primary} ${styles.nextBtn}`} href={item.href}>{t("prepare")}</a>
    </div>
  );
}

function AssessedCard({ item, t, tier, language, selected, onOpen }: { item: EventAssessmentContract; t: Translate; tier: Tier; language: OrbitLanguage; selected: boolean; onOpen: () => void }) {
  const count = meetCount(item);
  const tone = verdictTone(item.verdict);
  const chips = (
    <>
      {item.userDecision === "dismissed" ? <span className={styles.chip}>{t("dismissed")}</span> : item.status === "reading" ? null : <span className={`${styles.chip} ${tone === "pink" ? "" : styles[`c_${tone}`]}`}>{verdictLabel(item, t)}</span>}
      {count ? <span className={styles.chip}>{t("meetCount", { n: count })}</span> : null}
    </>
  );
  const ring = (size: number) => item.status === "reading" ? <span className={styles.chip}>{t("reading")}</span> : <ScoreRing score={item.total} size={size} stroke={6} label={`${item.total}`}><span className={`${styles.score} ${styles.ringSmall}`}>{item.total}</span></ScoreRing>;
  if (tier === "narrow") {
    return (
      <button type="button" className={`btn ${styles.card} ${styles.evm} ${item.userDecision === "dismissed" ? styles.dimmed : ""}`} onClick={onOpen} data-events-card={item.id}>
        <span className={`${styles.emo} ${styles[`t_${tone}`]}`}>{item.status === "reading" ? "⏳" : emojiOf(item)}</span>
        <div className={styles.meta}>
          <b className={styles.clamp2}>{item.facts.title ?? item.sourceLabel ?? item.facts.url}</b>
          <span className={`${styles.lbl} ${styles.clamp1}`}>{[eventWhen(item.facts.startsAt, language), item.facts.venue ?? item.facts.area].filter(Boolean).join(" · ")}</span>
          <div className={styles.row} style={{ gap: 6, marginTop: 6 }}>{chips}</div>
        </div>
        {ring(50)}
      </button>
    );
  }
  const medium = tier === "medium";
  return (
    <button type="button" className={`btn ${styles.evc} ${styles.span3} ${selected ? styles.sel : ""} ${item.userDecision === "dismissed" ? styles.dimmed : ""}`} onClick={onOpen} data-events-card={item.id}>
      <div className={`${styles.row} ${styles.between}`}>
        <span className={`${styles.emo} ${styles[`t_${tone}`]}`}>{item.status === "reading" ? "⏳" : emojiOf(item)}</span>
        {ring(54)}
      </div>
      <b className={`${styles.evcName} ${medium ? styles.clamp2 : ""}`}>{item.facts.title ?? item.sourceLabel ?? item.facts.url}</b>
      <div className={`${styles.lbl} ${medium ? styles.clamp1 : ""}`}>{cardLine(item, language, t("free"))}</div>
      <div className={styles.chips}>{chips}</div>
    </button>
  );
}

function emojiOf(item: EventAssessmentContract): string {
  return eventEmoji({ title: item.facts.title ?? "" });
}

function MyEvents({ language, upcoming, past, now, t }: { language: OrbitLanguage; upcoming: MyEventItem[]; past: MyEventItem[]; now: Date; t: Translate }) {
  const coming = upcoming.filter((item) => item.status !== "cancelled" && item.status !== "rejected");
  if (coming.length === 0 && past.length === 0) {
    return (
      <div className={styles.wgrid} data-events-going="empty">
        {/* b12 #312 W-R26-30e：大 emoji · 22px 标题 + 副文 · 右侧「探す」主按钮（高 46）。 */}
        <div className={`${styles.card} ${styles.span12} ${styles.guide} ${styles.goingEmpty}`}>
          <div className={styles.goingEmptyEmoji} aria-hidden>🗓️</div>
          <div className={styles.grow}>
            <div className={styles.goingEmptyTitle}>{t("goingEmptyTitle")}</div>
            <div className={styles.sub} style={{ marginTop: 4 }}>{t("goingEmptySub")}</div>
          </div>
          <a className={`${styles.btn} ${styles.primary} ${styles.goingEmptyBtn}`} href="/app/events?tab=discover"><Icon name="search" size={16} />{t("goingEmptyCta")}</a>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.wgrid} data-events-going="">
      <div className={`${styles.span12} ${styles.cardH}`} style={{ margin: "0 0 -6px" }}><h3>{t("upcoming")}</h3><span className={styles.more}>{t("countItems", { n: coming.length })}</span></div>
      {coming.map((item) => (
        <div key={item.eventId} className={`${styles.card} ${styles.span4} ${styles.nextCard}`}>
          <div className={`${styles.row} ${styles.between}`}><span className={styles.lbl}>{eventWhen(item.startsAt, language)}</span>{dayChip(item.startsAt, now, t)}</div>
          <b className={styles.nextName}>{item.title}</b>
          <div className={styles.lbl}>{item.venue ?? ""}</div>
          {item.meetCount ? <div className={`${styles.row} ${styles.nextMeet}`}><Avatars initials={item.meetInitials ?? []} /><span className={styles.lbl}>{t("meetCount", { n: item.meetCount })}</span></div> : null}
          <a className={`${styles.btn} ${styles.sm} ${styles.primary} ${styles.nextBtn}`} href={item.href}>{t("prepare")}</a>
        </div>
      ))}
      {past.length ? (
        <div className={`${styles.card} ${styles.span12} ${styles.pastCard}`}>
          <div className={styles.cardH} style={{ margin: "8px 0 0" }}><h3>{t("past")}</h3><span className={styles.more}>{t("countItems", { n: past.length })}</span></div>
          <div className={styles.list}>
            {past.map((item) => (
              <a key={item.eventId} className={styles.li} href={item.href} style={{ color: "inherit", textDecoration: "none" }}>
                <span className={`${styles.emo} ${styles.emoSm} ${item.status === "attended" ? styles.t_teal : styles.t_lav}`}>{item.emoji}</span>
                <div className={styles.meta}><b>{item.title}</b><span>{[eventWhen(item.startsAt, language), item.venue].filter(Boolean).join(" · ")}</span></div>
                <span className={`${styles.chip} ${item.status === "attended" ? styles.c_teal : ""}`}>{item.status === "attended" ? t("attended") : item.status === "cancelled" ? t("statusCancelled") : t("notCheckedIn")}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ParticipationCodeModal({ open, onClose, t, onCode }: { open: boolean; onClose: () => void; t: Translate; onCode: (code: string) => void }) {
  const [code, setCode] = useState("");
  const valid = /^[A-Z0-9]{8}$/.test(code);
  const std = useStandardCopy();
  // b12 #320 W-R26-31：8 格（32×44）居中 · 「Esc 閉じる」· キャンセル / 開く。
  return (
    <Modal open={open} onClose={onClose} title={t("codeDialogTitle")} description={t("codeDialogSub")} hint={<><Kbd>Esc</Kbd> {std.action.close}</>}
      actions={<><button type="button" className={`btn ${styles.btn}`} onClick={onClose}>{std.action.cancel}</button><button type="button" className={`btn ${styles.btn} ${styles.primary}`} disabled={!valid} onClick={() => onCode(code)}>{t("codeNext")}</button></>}>
      <div className={styles.codeBoxes} data-events-code-input="">
        {Array.from({ length: 9 }, (_, index) => (index === 4
          ? <span key="dash" className={styles.codeDash}>-</span>
          : <input key={index} className={styles.codeBox} maxLength={1} value={code[index > 4 ? index - 1 : index] ?? ""} aria-label={`${t("codeDialogTitle")} ${index > 4 ? index : index + 1}`} onChange={(event) => {
            const char = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-1);
            const position = index > 4 ? index - 1 : index;
            const next = (code.padEnd(8, " ").slice(0, position) + (char || " ") + code.padEnd(8, " ").slice(position + 1)).replace(/\s+$/, "");
            setCode(next.replace(/ /g, ""));
            if (char) (event.target.parentElement?.querySelectorAll("input")[position + 1] as HTMLInputElement | undefined)?.focus();
          }} />))}
      </div>
      {code.length > 0 && !valid ? <div className={styles.lbl}>{t("codeInvalid")}</div> : null}
    </Modal>
  );
}
