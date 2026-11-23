"use client";

// R26 イベント (events DESIGN §2.1): the 評価 / 参加予定 / 探す page in the shell. 評価: the input card, 次の参加予定,
// 調べたイベント (newest first; 2026-11-15 no scores) and the selected one in the rail (1440) / a drawer (1024) / its own screen (390).
// 参加イベント（2026-11-21 由「参加予定」改名）：events/mine upcoming + past，これから / 過去 二选一。 探す: R27 `DiscoverTab`（コミュニティ / プランに効く / すべて，右栏「選択中のイベント」）。
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { eventEmoji } from "../../../../../shared/compute/event-emoji";
import type { EventAssessmentAvailability, EventAssessmentContract, EventAssessmentCreateInput, EventAssessmentFacts } from "../../../../../shared/contract/event-assessment";
import type { EventRelevance } from "../../../../../shared/contract/event-relevance";
import type { MyEventItem } from "../../../../../shared/contract/events-mine";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { FRESH, answerFresh, lastAnswer, rememberAnswer } from "../../orbit-last-answer";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { ShellSearchButton } from "../shell/Orbit2026Shell";
import { ShellPage, useInShell } from "../shell/slots";
import { Drawer, Icon, Kbd, Modal, Orbit2026Scope, SampleTag, Segmented, ToastProvider, useStandardCopy, useToast } from "../ui";
import { Assessing, FillThree, LoginRequired, NotEventPage, PasteText } from "./AssessFlow";
import { AssessmentPage, AssessmentRail, translator, type Translate } from "./AssessmentDetail";
import { DiscoverHelpRail, DiscoverRail, DiscoverTab, type DiscoverRailState } from "./DiscoverTab";
import { EventSidePanel } from "./EventSidePanel";
import { eventsApi, newIdempotencyKey, pollAssessment } from "./events-api";
import { allDayLabelOf, cardLine, eventWhen, isShownInGrid, monthOf, orderAssessed, relativeDay, tabOf } from "./events-model";
import { PrivateEventPanel } from "./PrivateEventPanel";
import { RelevanceChips } from "./Relevance";
import styles from "./events.module.css";
import r from "./record.module.css";

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

type EventsOverviewAnswer = { items: EventAssessmentContract[]; upcoming: MyEventItem[]; upcomingCount: number; past: MyEventItem[]; availability: EventAssessmentAvailability };

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
  // Back on the page: the last lists show at once while they are read again (orbit-last-answer).
  useSharedReadAccount();
  const [opening] = useState(() => lastAnswer<EventsOverviewAnswer>("events:overview"));
  const [items, setItems] = useState<EventAssessmentContract[] | null>(opening?.items ?? null);
  // null = not read yet (a skeleton), never an empty list (no-flash rule 1).
  const [upcoming, setUpcoming] = useState<MyEventItem[] | null>(opening?.upcoming ?? null);
  const [past, setPast] = useState<MyEventItem[] | null>(opening?.past ?? null);
  const [upcomingCount, setUpcomingCount] = useState<number | null>(opening?.upcomingCount ?? null);
  // undefined = not read yet; null = the read failed (the card then shows as with the AI on, as before).
  const [availability, setAvailability] = useState<EventAssessmentAvailability | null | undefined>(opening ? opening.availability : undefined);
  const [selected, setSelected] = useState<string | null>(initialAssessmentId ?? null);
  // agent-design AG13 (D4): the private event opened in place — right rail when wide, bottom sheet otherwise; no page of its own.
  const [privateOpen, setPrivateOpen] = useState<string | null>(params?.get("privateEvent") ?? null);
  useEffect(() => { setPrivateOpen(params?.get("privateEvent") ?? null); }, [params]);
  const [flow, setFlow] = useState<Flow>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [discoverRail, setDiscoverRail] = useState<DiscoverRailState>({ loaded: false, row: null, signedOut: false });
  const [discoverSubtitle, setDiscoverSubtitle] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const [list, up, before, avail] = await Promise.all([eventsApi.list(), eventsApi.mine("upcoming", 10), eventsApi.mine("past", 10), eventsApi.availability()]);
    setItems(list.ok ? list.data : []);
    // A failed read keeps the last lists (a reload after 追加) or, on the first read, settles to empty.
    if (up.ok) { setUpcoming([...up.data.items]); setUpcomingCount(up.data.upcomingCount); } else { setUpcoming((value) => value ?? []); setUpcomingCount((value) => value ?? 0); }
    setPast((value) => (before.ok ? [...before.data.items] : value ?? []));
    setAvailability((value) => (avail.ok ? avail.data : value ?? null));
    if (list.ok && up.ok && before.ok && avail.ok) {
      rememberAnswer<EventsOverviewAnswer>("events:overview", { items: list.data, upcoming: [...up.data.items], upcomingCount: up.data.upcomingCount, past: [...before.data.items], availability: avail.data });
    }
  }, []);
  // Mounting with lists younger than FRESH.list (and no write since) reads nothing again (orbit-last-answer).
  useEffect(() => { if (!answerFresh("events:overview", FRESH.list)) void load(); return () => abort.current?.abort(); }, [load]);

  const ordered = useMemo(() => orderAssessed((items ?? []).filter(isShownInGrid).filter((item) => item.status !== "failed")), [items]);
  const current = useMemo(() => (items ?? []).find((item) => item.id === selected) ?? null, [items, selected]);
  // 1440 rail shows the selected one; with nothing selected, the newest ready one (proposal ⑦ has the first card selected).
  const railItem = current ?? ordered.find((item) => item.status === "ready") ?? null;

  const replace = (next: EventAssessmentContract) => setItems((list) => [next, ...(list ?? []).filter((item) => item.id !== next.id)]);

  const choose = (next: Tab) => {
    setTab(next);
    const search = new URLSearchParams(params?.toString() ?? "");
    if (next === "discover") search.delete("tab"); else search.set("tab", next);
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

  const addToPlan = async (item: EventAssessmentContract) => {
    setBusy(true);
    const result = await eventsApi.addToPlan(item.id);
    setBusy(false);
    if (result.ok === false) { failureToast(result.reason); return; }
    replace({ ...item, userDecision: "added" });
    toast.success(t("added"));
    void load();
  };

  const assessedCount = (items ?? []).filter((item) => item.status === "ready" || item.status === "needs_input").length;
  const month = monthOf(now);
  // Every read the page's blocks need (one Promise.all); before it, skeletons only (no-flash rule 2).
  const overviewLoaded = items !== null && upcoming !== null && past !== null && upcomingCount !== null && availability !== undefined;
  // Until the read that decides the line is in, a placeholder line of the shell's size (never subtitleEmpty first).
  const pendingLine = <i className={styles.pendBone} style={{ width: 120 }} aria-hidden />;
  const subtitle = tab === "discover" && !discover ? discoverSubtitle ?? pendingLine
    : tab === "going" ? (upcomingCount === null ? pendingLine : t("subtitleGoing", { going: upcomingCount, month }))
    : !overviewLoaded ? pendingLine
    : assessedCount === 0 && upcomingCount === 0 ? t("subtitleEmpty")
      : assessedCount >= 3 ? t("subtitle", { assessed: assessedCount, going: upcomingCount, month }) : t("subtitleGoing", { going: upcomingCount, month });

  // 768–1279 / 390 show 「参加予定 N」: until N is read the row is held as a skeleton of its own size, so the
  // label never shows first without its number.
  const countless = tier === "wide" || upcomingCount === 0 || (tier === "narrow" && tab === "discover");
  const segmentFor = (full: boolean) => {
    const row = (
      <Segmented<"assess" | "going" | "discover"> variant="seg" wide={full} label={t("tabsLabel")} data-events-tabs="" value={tab} onChange={choose}
        segments={(["assess", "going", "discover"] as const).map((key) => ({ key, label: key === "assess" ? t("tabAssess") : key === "going" ? (countless ? t("tabGoing") : t("tabGoingCount", { n: upcomingCount ?? 0 })) : t("tabDiscover") }))} />
    );
    return countless || upcomingCount !== null ? row : <span className={`${styles.pendSeg} ${full ? styles.pendFull : ""}`} aria-hidden data-events-tabs-pending="">{row}</span>;
  };
  const segment = segmentFor(false);
  const empty = overviewLoaded && ordered.length === 0 && (upcoming ?? []).length === 0;
  // 1440: the selected assessment in the rail (web.html #12), the default iOrbit rail otherwise (#10).
  // 1024 / 390 (b8 #0 / #1): no rail button in the header — the result opens as a drawer / its own screen.
  // 参加予定页签（b12 #310）：右栏是下一场（有评估记录的）参加予定的「評価の詳細」。
  const goingRailItem = tab === "going" ? (upcoming ?? []).map((event) => (items ?? []).find((item) => item.id === event.assessmentId)).find((item) => item?.status === "ready") ?? null : null;
  const shownRailItem = tab === "assess" && !empty ? railItem : goingRailItem;
  const privateItem = tab === "going" && privateOpen ? [...(upcoming ?? []), ...(past ?? [])].find((item) => item.eventId === privateOpen && item.privateEvent) ?? null : null;
  const openPrivate = (id: string | null) => {
    setPrivateOpen(id);
    const search = new URLSearchParams(params?.toString() ?? "");
    if (id) search.set("privateEvent", id); else search.delete("privateEvent");
    router.replace(`/app/events${search.toString() ? `?${search.toString()}` : ""}`, { scroll: false });
  };
  // Until the rail's data is in, undefined: the shell keeps its rail skeleton (no-flash rule 3).
  const rail = tier !== "wide" ? false : tab === "discover"
    ? (!discover && !discoverRail.loaded ? undefined : discoverRail.panel ? <EventSidePanel key={discoverRail.panel.eventId} eventId={discoverRail.panel.eventId} seed={discoverRail.panel.seed} tone={discoverRail.panel.tone} language={language} now={discoverRail.panel.now} mode="rail" onClose={discoverRail.panel.onClose} onSelect={discoverRail.panel.onSelect} /> : discoverRail.row ? <DiscoverRail row={discoverRail.row} language={language} /> : <DiscoverHelpRail language={language} />)
    : !overviewLoaded ? undefined
    : privateItem ? <PrivateEventPanel item={privateItem} language={language} />
    : shownRailItem
    ? <AssessmentRail item={shownRailItem} language={language} busy={busy} onAdd={() => void addToPlan(shownRailItem)} />
    : true;

  return (
    <>
      <ShellPage title={t("title")} subtitle={subtitle} left={segment} right={<ShellSearchButton />} rightRail={rail} phoneFold={tier === "narrow"} />
      {tier === "narrow" && tab === "discover" ? (
        <>
          {/* b12 #348（探す 390）：App 式 topbar（🔍 · イベント + 件数 · 📅）+ 全宽 seg。 */}
          <div className={styles.ptop} data-events-phone-top="">
            <ShellSearchButton />
            <div className={styles.ptopT}><b>{t("title")}</b>{discoverSubtitle ? <small>{discoverSubtitle}</small> : discover ? null : <small>{pendingLine}</small>}</div>
            <Link className={`btn ${styles.ptopBtn}`} href="/app/events?tab=going" aria-label={t("tabGoing")}><Icon name="calendar" size={20} /></Link>
          </div>
          <div className={styles.phoneSeg}>{segmentFor(true)}</div>
        </>
      ) : tier === "narrow" ? (
        <>
          <div className={styles.r8ttl}>{t("title")}{items === null ? <i className={styles.pendBone} style={{ width: 64 }} aria-hidden /> : assessedCount > 0 ? <span className={styles.lbl}>{t("assessedCount", { n: assessedCount })}</span> : null}</div>
          <div className={styles.phoneSeg}>{segmentFor(true)}</div>
        </>
      ) : !inShell ? <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 12px" }}>{segment}</div> : null}
      {tab === "discover" ? <div data-events-discover="">{discover ?? <DiscoverTab language={language} tier={tier} signedIn nowIso={nowIso} onRail={setDiscoverRail} onSubtitle={setDiscoverSubtitle} />}</div> : null}
      {tab === "going" ? (upcoming === null || past === null ? <GoingSkeleton /> : <MyEvents language={language} upcoming={upcoming} past={past} now={now} t={t} selectedPrivate={tier === "wide" ? privateOpen : null} onOpenPrivate={openPrivate} />) : null}
      {privateItem && tier !== "wide" ? (
        <Drawer open onClose={() => openPrivate(null)} title={privateItem.title} size="lg">
          <PrivateEventPanel item={privateItem} language={language} titled />
        </Drawer>
      ) : null}
      {tab === "assess" && !overviewLoaded ? <AssessSkeleton tier={tier} /> : null}
      {tab === "assess" && overviewLoaded ? (
        <div className={tier === "narrow" ? styles.stack : styles.wgrid} data-events-assess="">
          {flow?.kind === "assessing" ? <Assessing language={language} step={flow.step} {...(flow.sourceLabel ? { sourceLabel: flow.sourceLabel } : {})} /> : null}
          {flow?.kind === "paste" ? <PasteText language={language} busy={busy} onAssessText={(text) => void start({ idempotencyKey: newIdempotencyKey(), sourceKind: "text", text })} /> : null}
          {flow?.kind === "manual" ? <FillThree item={null} language={language} busy={busy} onSave={(facts, unknown) => void submitFill(facts, unknown)} /> : null}
          {flow?.kind === "fill" ? <FillThree item={flow.item} language={language} busy={busy} onSave={(facts, unknown) => void submitFill(facts, unknown)} /> : null}
          {!flow && current?.failureReason === "login_required" ? <LoginRequired item={current} language={language} onManual={() => setFlow({ kind: "manual" })} onOther={() => { setSelected(null); setUrl(""); }} onPaste={() => setFlow({ kind: "paste" })} onShot={() => fileRef.current?.click()} /> : null}
          {!flow && current?.failureReason === "not_event_page" ? <NotEventPage item={current} language={language} onManual={() => setFlow({ kind: "manual" })} onAssess={(link, title) => (link ? void start({ idempotencyKey: newIdempotencyKey(), sourceKind: "url", url: link }) : setFlow({ kind: "manual" }))} /> : null}
          <AssessCard
            t={t} tier={tier} big={empty} url={url} setUrl={setUrl} onAssessUrl={submitUrl} busy={busy} availability={availability ?? null} fileRef={fileRef} dragging={dragging} setDragging={setDragging}
            onFiles={(files) => void submitPosters(files)} onManual={() => setFlow({ kind: "manual" })} goalLabel={null}
          />
          {empty ? <EmptyCards t={t} language={language} onCode={() => setCodeOpen(true)} /> : null}
          {!empty && upcoming?.[0] ? <NextCard t={t} tier={tier} item={upcoming[0]} language={language} now={now} /> : null}
          {!empty && ordered.length ? (
            <>
              <div className={tier === "narrow" ? `${styles.cardH} ${styles.phoneHead}` : `${styles.span12} ${styles.cardH} ${styles.listHead}`}>
                <h3>{t("checkedTitle")}{tier === "medium" ? <span className={styles.lbl} style={{ fontWeight: 600 }}>{t("countItems", { n: ordered.length })}</span> : null}</h3>
                <span className={styles.lbl}>{t("byNewest")}</span>
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
          <div className={styles.row} style={{ justifyContent: "flex-end", marginBottom: 10 }}><Link className={`${styles.btn} ${styles.sm}`} href={`/app/events/assessments/${encodeURIComponent(current.id)}`}>{t("fullScreen")}</Link></div>
          <AssessmentPage item={current} language={language} busy={busy} phone onAdd={() => void addToPlan(current)} />
        </Drawer>
      ) : null}
      {initialAssessmentId && current && tier !== "wide" && (current.status === "ready" || current.status === "needs_input") ? (
        <div style={{ marginTop: 18 }}><AssessmentPage item={current} language={language} busy={busy} phone={tier === "narrow"} onAdd={() => void addToPlan(current)} /></div>
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
          <div className={`${styles.mac} ${styles.t_lav} ${styles.row}`} data-events-tile="people"><span className={styles.guideEmoji}>👥</span><div><b className={styles.guideName}>{t("tilePeople")}</b><div className={styles.lbl}>{t("tilePeopleSub")}</div></div></div>
          <div className={`${styles.mac} ${styles.t_teal} ${styles.row}`} data-events-tile="known"><span className={styles.guideEmoji}>🤝</span><div><b className={styles.guideName}>{t("tileKnown")}</b><div className={styles.lbl}>{t("tileKnownSub")}</div></div></div>
          <div className={`${styles.mac} ${styles.macApricot} ${styles.row}`} data-events-tile="budget"><span className={styles.guideEmoji}>⏱️</span><div><b className={styles.guideName}>{t("tileBudget")}</b><div className={styles.lbl}>{t("tileBudgetSub")}</div></div></div>
        </div>
      ) : null}
    </div>
  );
}

// The 評価 tab before its reads are in: the input card and 次の参加予定 in their own columns and classes, then a
// row of assessed cards — the blocks then fill in where they stand (no-flash rule 2).
function AssessSkeleton({ tier }: { tier: Tier }) {
  const label = useStandardCopy().loading.loading;
  const lines = (widths: readonly (number | string)[]) => widths.map((width, index) => <i key={index} className={`${styles.pendBone} ${styles.pendBlock}`} style={{ width, height: index === 0 ? 16 : 12 }} />);
  if (tier === "narrow") {
    return (
      <div className={styles.stack} data-events-assess="" role="progressbar" aria-busy aria-label={label} data-events-assess-pending="">
        <div className={`${styles.card} ${styles.evalBox} ${styles.pendCard}`} style={{ display: "flex", minHeight: 150 }}>{lines(["40%", "100%", "100%"])}</div>
        <div className={`${styles.card} ${styles.nextRow}`} style={{ minHeight: 72 }}>{lines(["60%"])}</div>
      </div>
    );
  }
  const medium = tier === "medium";
  return (
    <div className={styles.wgrid} data-events-assess="" role="progressbar" aria-busy aria-label={label} data-events-assess-pending="">
      <div className={`${styles.card} ${medium ? styles.span7 : styles.span8} ${styles.pendCard}`} style={{ minHeight: 236 }}>{lines(["36%", "60%", "100%", "100%"])}</div>
      <div className={`${styles.card} ${medium ? styles.span5 : styles.span4} ${styles.pendCard}`} style={{ minHeight: 236 }}>{lines(["30%", "80%", "56%"])}</div>
      {[0, 1, 2, 3].map((index) => <div key={index} className={`${styles.card} ${styles.span3} ${styles.pendCard}`} style={{ minHeight: 168 }}>{lines(["24%", "80%", "56%"])}</div>)}
    </div>
  );
}

// The 参加予定 tab before its reads are in: the heading line and the three upcoming cards (span 4).
function GoingSkeleton() {
  const label = useStandardCopy().loading.loading;
  return (
    <div className={styles.wgrid} role="progressbar" aria-busy aria-label={label} data-events-going="pending">
      <div className={`${styles.span12} ${styles.cardH}`} style={{ margin: "0 0 -6px" }}><i className={styles.pendBone} style={{ width: 120, height: 16 }} /></div>
      {[0, 1, 2].map((index) => (
        <div key={index} className={`${styles.card} ${styles.span4} ${styles.pendCard}`} style={{ minHeight: 200 }}>
          {(["40%", "80%", "56%"] as const).map((width, line) => <i key={line} className={`${styles.pendBone} ${styles.pendBlock}`} style={{ width, height: line === 1 ? 16 : 12 }} />)}
        </div>
      ))}
    </div>
  );
}

/** 「結果の例」: the same facts a checked event shows (no score). */
const EXAMPLE_RELEVANCE: EventRelevance = { group: "people", known: { count: 1, names: [] }, people: [{ count: 3, emoji: "💼", label: "VC", source: "speakers", typeKey: "vc" }], topic: null, warnings: [] };

function EmptyCards({ t, language, onCode }: { t: Translate; language: OrbitLanguage; onCode: () => void }) {
  return (
    <>
      <div className={`${styles.card} ${styles.span6}`} data-events-example="">
        <div className={styles.cardH}><h3>{t("exampleTitle")} <SampleTag /></h3></div>
        <div className={`${styles.row} ${styles.faded}`} style={{ gap: 16 }}>
          <span className={`${styles.emo} ${styles.t_lav}`}>🎤</span>
          <div><b>{t("exampleName")}</b><RelevanceChips relevance={EXAMPLE_RELEVANCE} language={language} className={styles.exampleChips} /></div>
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
  const std = useStandardCopy();
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
      {/* 2026-11-20 活动图片：顶部 2:1 出血；没有图保持现样。 */}
      {/* eslint-disable-next-line @next/next/no-img-element -- 主办方上传的图（Blob / 站内路径），服务端已裁成 2:1 */}
      {item.coverUrl ? <div className={r.nextCover} data-events-next-cover=""><img src={item.coverUrl} alt="" /></div> : null}
      <div className={`${styles.row} ${styles.between}`}><span className={styles.lbl}>{t("nextTitle")}</span>{dayChip(item.startsAt, now, t)}</div>
      <b className={medium ? styles.clamp2 : styles.nextName} style={medium ? { fontSize: "var(--fs-dialog-title)", marginTop: 8 } : undefined}>{item.title}</b>
      <div className={styles.lbl}>{[eventWhen(item.startsAt, language, allDayLabelOf(item, std.myEvents.allDay)), item.venue].filter(Boolean).join(" · ")}</div>
      {item.meetCount ? <div className={styles.row} style={{ marginTop: medium ? 12 : 14 }}><Avatars initials={item.meetInitials ?? []} /><span className={styles.lbl}>{t("meetCount", { n: item.meetCount })}</span></div> : null}
      <a className={`${styles.btn} ${styles.sm} ${styles.primary} ${styles.nextBtn}`} href={item.href}>{t("prepare")}</a>
    </div>
  );
}

function AssessedCard({ item, t, tier, language, selected, onOpen }: { item: EventAssessmentContract; t: Translate; tier: Tier; language: OrbitLanguage; selected: boolean; onOpen: () => void }) {
  // 2026-11-15：no ring, no verdict — the same fact chips as 探す (proposal ⑦).
  const chips = (
    <>
      {item.userDecision === "dismissed" ? <span className={styles.chip}>{t("dismissed")}</span> : null}
      {item.status === "reading" ? <span className={styles.chip}>{t("reading")}</span> : <RelevanceChips relevance={item.relevance} language={language} className={styles.inlineChips} />}
    </>
  );
  if (tier === "narrow") {
    return (
      <button type="button" className={`btn ${styles.card} ${styles.evm} ${item.userDecision === "dismissed" ? styles.dimmed : ""}`} onClick={onOpen} data-events-card={item.id}>
        <span className={`${styles.emo} ${styles.t_lav}`}>{item.status === "reading" ? "⏳" : emojiOf(item)}</span>
        <div className={styles.meta}>
          <b className={styles.clamp2}>{item.facts.title ?? item.sourceLabel ?? item.facts.url}</b>
          <span className={`${styles.lbl} ${styles.clamp1}`}>{[eventWhen(item.facts.startsAt, language), item.facts.venue ?? item.facts.area].filter(Boolean).join(" · ")}</span>
          <div className={styles.row} style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>{chips}</div>
        </div>
      </button>
    );
  }
  const medium = tier === "medium";
  return (
    <button type="button" className={`btn ${styles.evc} ${styles.span3} ${selected ? styles.sel : ""} ${item.userDecision === "dismissed" ? styles.dimmed : ""}`} onClick={onOpen} data-events-card={item.id}>
      <span className={`${styles.emo} ${styles.t_lav}`}>{item.status === "reading" ? "⏳" : emojiOf(item)}</span>
      <b className={`${styles.evcName} ${medium ? styles.clamp2 : ""}`}>{item.facts.title ?? item.sourceLabel ?? item.facts.url}</b>
      <div className={`${styles.lbl} ${medium ? styles.clamp1 : ""}`}>{cardLine(item, language, t("free"))}</div>
      <div className={styles.chips}>{chips}</div>
    </button>
  );
}

function emojiOf(item: EventAssessmentContract): string {
  return eventEmoji({ title: item.facts.title ?? "" });
}

/** 过去活动的标记（两端同规则）：参加した / 取り消し / 未受付（报名了没受付）；被拒、候补、只是想去的不标。
 *  AG13 (D2/D1)：私人活动只标「私人」；自己记了「我去过」的不再标未受付（那一行已写在左边）。 */
function pastMark(item: MyEventItem, t: Translate, privateChip: ReactNode) {
  if (item.privateEvent) return privateChip;
  if (item.status === "attended") return <span className={`${styles.chip} ${styles.c_teal}`}>{t("attended")}</span>;
  if (item.status === "cancelled") return <span className={styles.chip}>{t("statusCancelled")}</span>;
  if (item.selfAttendance) return null;
  if (item.status === "registered" || item.status === "pending_review") return <span className={styles.chip}>{t("notCheckedIn")}</span>;
  return null;
}

function MyEvents({ language, upcoming, past, now, t, selectedPrivate, onOpenPrivate }: { language: OrbitLanguage; upcoming: MyEventItem[]; past: MyEventItem[]; now: Date; t: Translate; selectedPrivate: string | null; onOpenPrivate: (id: string) => void }) {
  const std = useStandardCopy();
  const coming = upcoming.filter((item) => item.status !== "cancelled" && item.status !== "rejected");
  // AG13 (D2): a private event's chip; (D1) «我去过（自己记的）» on its own line, the right chip only the organizer's status.
  const privateChip = <span className={`${styles.chip} ${styles.c_lav}`} data-events-private-chip=""><Icon name="lock" size={12} />{std.myEvents.privateChip}</span>;
  const selfLine = (item: MyEventItem) => (item.selfAttendance ? <span className={styles.selfLine} data-events-self-attended=""><Icon name="check" size={13} />{std.myEvents.selfAttended}</span> : null);
  // 2026-11-21 参加イベント：これから / 過去 是同级的二选一（之前「過去」挂在「これから」标题下面，像它的下级）；
  // 默认これから，0 件也停在这边显示空状态。对标 Luma Upcoming / Past、Peatix 今後 / 過去、Meetup Your events。
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const empty = (
    <div className={`${styles.card} ${styles.span12} ${styles.guide} ${styles.goingEmpty}`} data-events-going-empty="">
      {/* b12 #312 W-R26-30e：大 emoji · 22px 标题 + 副文 · 右侧「探す」主按钮（高 46）。 */}
      <div className={styles.goingEmptyEmoji} aria-hidden>🗓️</div>
      <div className={styles.grow}>
        <div className={styles.goingEmptyTitle}>{t("goingEmptyTitle")}</div>
        <div className={styles.sub} style={{ marginTop: 4 }}>{t("goingEmptySub")}</div>
      </div>
      <Link className={`${styles.btn} ${styles.primary} ${styles.goingEmptyBtn}`} href="/app/events?tab=discover"><Icon name="search" size={16} />{t("goingEmptyCta")}</Link>
    </div>
  );
  if (coming.length === 0 && past.length === 0) return <div className={styles.wgrid} data-events-going="empty">{empty}</div>;
  return (
    <div className={styles.wgrid} data-events-going="">
      <div className={styles.span12}>
        <Segmented<"upcoming" | "past"> variant="seg" label={t("goingWhenLabel")} data-events-going-when="" value={when} onChange={setWhen}
          segments={[{ key: "upcoming", label: t("goingUpcomingN", { n: coming.length }) }, { key: "past", label: t("goingPastN", { n: past.length }) }]} />
      </div>
      {when === "upcoming" ? (coming.length === 0 ? empty : coming.map((item) => (
        <div key={item.eventId} className={`${styles.card} ${styles.span4} ${styles.nextCard}`}>
          <div className={`${styles.row} ${styles.between}`}><span className={styles.lbl}>{eventWhen(item.startsAt, language, allDayLabelOf(item, std.myEvents.allDay))}</span><span className={styles.row} style={{ gap: 6 }}>{dayChip(item.startsAt, now, t)}{item.privateEvent ? privateChip : null}</span></div>
          <b className={styles.nextName}>{item.title}</b>
          <div className={styles.lbl}>{item.venue ?? ""}</div>
          {item.meetCount ? <div className={`${styles.row} ${styles.nextMeet}`}><Avatars initials={item.meetInitials ?? []} /><span className={styles.lbl}>{t("meetCount", { n: item.meetCount })}</span></div> : null}
          {item.privateEvent
            ? <button type="button" className={`btn ${styles.btn} ${styles.sm} ${styles.primary} ${styles.nextBtn}`} onClick={() => onOpenPrivate(item.eventId)} data-events-private-open={item.eventId}>{std.myEvents.view}</button>
            : <Link className={`${styles.btn} ${styles.sm} ${styles.primary} ${styles.nextBtn}`} href={item.href}>{t("prepare")}</Link>}
        </div>
      ))) : past.length === 0 ? (
        <div className={`${styles.card} ${styles.span12} ${styles.lbl}`} data-events-going-past-empty="">{t("goingPastEmpty")}</div>
      ) : (
        <div className={`${styles.card} ${styles.span12} ${styles.pastCard}`} data-events-going-past="">
          <div className={styles.list}>
            {past.map((item) => {
              const body = (
                <>
                  <span className={`${styles.emo} ${styles.emoSm} ${item.status === "attended" ? styles.t_teal : styles.t_lav}`}>{item.emoji}</span>
                  <div className={styles.meta}><b>{item.title}</b><span>{[eventWhen(item.startsAt, language, allDayLabelOf(item, std.myEvents.allDay)), item.venue].filter(Boolean).join(" · ")}</span>{selfLine(item)}</div>
                  {pastMark(item, t, privateChip)}
                </>
              );
              return item.privateEvent
                ? <button key={item.eventId} type="button" className={`btn ${styles.li} ${selectedPrivate === item.eventId ? styles.liSel : ""}`} onClick={() => onOpenPrivate(item.eventId)} data-events-private-open={item.eventId}>{body}</button>
                : <Link key={item.eventId} className={styles.li} href={item.href} style={{ color: "inherit", textDecoration: "none" }}>{body}</Link>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ParticipationCodeModal({ open, onClose, t, onCode }: { open: boolean; onClose: () => void; t: Translate; onCode: (code: string) => void }) {
  const [code, setCode] = useState("");
  const valid = /^[A-Z0-9]{8}$/.test(code);
  const std = useStandardCopy();
  // b12 #320 W-R26-31：8 格（32×44）居中 · 「Esc 閉じる」· キャンセル / 開く。
  return (
    <Modal open={open} onClose={onClose} title={t("codeDialogTitle")} subtitle={t("codeDialogSub")} subtitleBelowHead size={380} hint={<><Kbd>Esc</Kbd> {std.action.close}</>}
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
