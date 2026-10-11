// R12 `contacts/new/scan/[batchId]` (DESIGN §2.2 steps 4–7, b11 A1 ③④⑤, b9 A1 / A2 ④, b1 B6, App):
//   読み取り中 — each card: name / 読み取り中 / 重複 / 推測あり / 読み取れず; 閉じても続きます;
//   自動で人脈へ — when reading is over, every card the shared rule clears goes through the
//     existing confirm endpoint once (identical → merged; W0015 cards with an event
//     candidate, similar / 同名 duplicates and 要確認 stay for the person);
//   まとめて確認 — 重複 / 要確認 / そのまま追加 tiles, one 会った場所 for the batch, 既存 / 今回
//     side by side with 統合する / 別人として追加, 要確認 grouped by issue code with the fields,
//     読み取れず with 撮り直す (replace, camera single shot) / 手入力で補う (manual-entry,
//     pre-filled) / スキップ, 「N人を人脈に追加」 and あとで;
//   完成 — 新しく追加 / 既存と統合 / 読み取れず (never counted as added), the plan line.
// Closing the app keeps reading on the server; the automatic pass runs when this page opens again (§9 #8).
import { type Href, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { PreparedBatchImage } from "../../api/batch-images";
import { planTaskSegmentHref } from "../../api/compute/plan-href";
import type { IngestBatchDetailContract, IngestContactCandidateContract } from "../../api/contract/business-card-batch";
import type { SecondaryIndustryIdCode } from "../../api/contract/industries";
import { industryLabel, isIndustryIdCode, secondaryIndustryLabel } from "../../api/domain/industries";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Chip, FilterOption, MacTile, ProgressBar, RetryCard, Skeleton, TextField, UiText } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import { reconcileBusinessCardReviewCard, type BusinessCardConflictField, type BusinessCardReviewCardDraft, type BusinessCardReviewFields } from "../../view-models/business-card-batch";
import { ingestCards, type IngestCard } from "../../view-models/business-card-ingest";
import { EMPTY_ATTRIBUTION, useAddApi, type BatchAttribution } from "./add-api";
import { EMPTY_LEDGER, readScanLedger, writeScanLedger, type ScanLedger } from "./add-storage";
import { Body, Caption, CountTiles, FadeIn, SectionTitle, useAddStyles } from "./add-ui";
import { newAddKey } from "./manual-model";
import { AfterSteps, CameraPermissionPanel, CardCameraPane } from "./ScanCaptureScreen";
import {
  autoEligible,
  buildScanView,
  cardMatchFields,
  confirmBlock,
  confirmBody,
  confirmSeed,
  confirmTarget,
  initialEnrichment,
  ISSUE_GROUP_ORDER,
  lookupTargets,
  metEventFor,
  replaceTarget,
  retryTarget,
  type EnrichmentDraft,
  type ScanBatchView,
  type ScanCardKind,
  type ScanCardView,
  type ScanIssueGroup,
} from "./scan-batch-model";
import { EMPTY_TRAY } from "./scan-capture-model";
import { pickCardImages, preparedImageBytes, useCameraAccess } from "./scan-media";

const POLL_MS = 3000;
const LOOKUP_DEBOUNCE_MS = 350;

type SettleResult = "created" | "merged" | "duplicate" | "blocked" | "failed" | "skipped";

const KIND_CHIP: Partial<Record<ScanCardKind, { key: MessageKey; tone: "lav" | "apricot" | "coral" | "neutral" | "ok" }>> = {
  added: { key: "add.batch.stateAdded", tone: "ok" },
  duplicate: { key: "add.batch.stateDuplicate", tone: "lav" },
  failed: { key: "add.batch.stateFailed", tone: "coral" },
  guess: { key: "add.batch.stateGuess", tone: "apricot" },
  queued: { key: "add.batch.stateQueued", tone: "neutral" },
  reading: { key: "add.batch.stateReading", tone: "neutral" },
  skipped: { key: "add.batch.stateSkipped", tone: "neutral" },
  uploading: { key: "add.batch.stateUploading", tone: "neutral" },
};

const GROUP_KEY: Record<ScanIssueGroup, MessageKey> = {
  enrichment: "add.batch.groupEnrichment",
  format: "add.batch.groupFormat",
  misread: "add.batch.groupMisread",
  name: "add.batch.groupName",
  orgSuffix: "add.batch.groupOrgSuffix",
  other: "add.batch.groupOther",
  sides: "add.batch.groupSides",
};

const MATCH_KEY: Record<string, MessageKey> = {
  email: "add.batch.matchedEmail",
  name: "add.batch.matchedName",
  name_organization: "add.batch.matchedNameOrg",
  phone: "add.batch.matchedPhone",
};

const FIELD_KEY: Record<"displayName" | "organization" | "role" | "email" | "phone", MessageKey> = {
  displayName: "add.batch.fieldName",
  email: "add.batch.fieldEmail",
  organization: "add.batch.fieldOrganization",
  phone: "add.batch.fieldPhone",
  role: "add.batch.fieldRole",
};
const EDIT_FIELDS = ["displayName", "organization", "role", "email", "phone"] as const;

const activeCard = (card: IngestCard) => card.items.some((item) => ["extracted", "terminal_failed", "queued", "processing"].includes(item.status));

export function ScanBatchScreen({ batchId }: { batchId: string }) {
  const api = useAddApi();
  const router = useRouter();
  const { t, language } = useOrbitLocale();
  const { styles } = useAddStyles();
  const ownerId = useOrbitAuthSession().actorId ?? null;
  const [detail, setDetail] = useState<IngestBatchDetailContract | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, BusinessCardReviewCardDraft>>({});
  const [enrichment, setEnrichment] = useState<Record<string, EnrichmentDraft>>({});
  const edited = useRef(new Set<string>());
  const [matches, setMatches] = useState<Record<string, IngestContactCandidateContract | null>>({});
  const matchKeys = useRef<Record<string, string>>({});
  const [attribution, setAttribution] = useState<BatchAttribution | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null | undefined>(undefined);
  const [ledger, setLedger] = useState<ScanLedger>(EMPTY_LEDGER);
  const ledgerRef = useRef<ScanLedger>(EMPTY_LEDGER);
  const autoAttempted = useRef(new Set<string>());
  const [autoRunning, setAutoRunning] = useState(false);
  const [writtenEvents, setWrittenEvents] = useState<string[]>([]);
  const intents = useRef<Record<string, { seed: string; id: string }>>({});
  const [now, setNow] = useState(() => Date.now());
  const [retake, setRetake] = useState<string | null>(null);
  const [replaceFailed, setReplaceFailed] = useState(false);
  const mounted = useRef(true);
  const loading = useRef(false);
  useEffect(() => () => { mounted.current = false; }, []);

  const again = useRef(false);
  const load = useCallback(async (): Promise<void> => {
    // One read at a time; a read asked for meanwhile runs right after (never dropped).
    if (loading.current) { again.current = true; return; }
    loading.current = true;
    try {
      const result = await api.getBatch(batchId, ownerId);
      if (!mounted.current) return;
      setNow(Date.now());
      if (!result.ok) { setLoadFailed(true); return; }
      setLoadFailed(false);
      const next = result.data;
      setDetail(next);
      const cards = ingestCards(next);
      setDrafts((current) => {
        const out: Record<string, BusinessCardReviewCardDraft> = {};
        for (const card of cards) if (activeCard(card)) out[card.cardId] = reconcileBusinessCardReviewCard(card.items, current[card.cardId]);
        return out;
      });
      setEnrichment((current) => {
        const out: Record<string, EnrichmentDraft> = {};
        for (const card of cards) if (activeCard(card)) out[card.cardId] = edited.current.has(card.cardId) && current[card.cardId] ? current[card.cardId]! : initialEnrichment(card.items);
        return out;
      });
    } finally {
      loading.current = false;
      if (again.current && mounted.current) {
        again.current = false;
        await load();
      }
    }
  }, [api, batchId, ownerId]);

  useEffect(() => {
    void load();
    void readScanLedger(batchId).then((stored) => {
      if (!mounted.current) return;
      ledgerRef.current = stored;
      setLedger(stored);
    });
  }, [batchId, load]);

  const status = detail?.batch.status ?? null;
  useEffect(() => {
    if (status !== "collecting" && status !== "processing") return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load, status]);

  // W0015: the batch's event candidates, read once reading is over. A failure is retried
  // once, then treated as "no candidates" — the automatic pass never waits forever.
  useEffect(() => {
    if (attribution || (status !== "ready_for_review" && status !== "completed")) return;
    let alive = true;
    void (async () => {
      let result = await api.attribution(batchId);
      if (!result.ok && alive) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (alive) result = await api.attribution(batchId);
      }
      if (alive) setAttribution(result.ok ? result.data : EMPTY_ATTRIBUTION);
    })();
    return () => { alive = false; };
  }, [api, attribution, batchId, status]);

  useEffect(() => {
    if (!attribution || selectedEventId !== undefined) return;
    const candidates = new Set(Object.values(attribution.cards).filter(Boolean));
    setSelectedEventId(attribution.events.find((event) => candidates.has(event.eventId))?.eventId ?? null);
  }, [attribution, selectedEventId]);

  // 「可能是同一个人」: looked up for every card still waiting, again when its fields change.
  const cards = useMemo(() => (detail ? ingestCards(detail) : []), [detail]);
  const targets = useMemo(() => (status === "ready_for_review" || status === "processing" ? lookupTargets(cards, drafts) : []), [cards, drafts, status]);
  const keyOf = (draft: BusinessCardReviewCardDraft) => JSON.stringify(cardMatchFields(draft));
  const matchesReady = targets.every((card) => matchKeys.current[card.cardId] === keyOf(drafts[card.cardId]!) && card.cardId in matches);
  useEffect(() => {
    const stale = targets.filter((card) => matchKeys.current[card.cardId] !== keyOf(drafts[card.cardId]!) || !(card.cardId in matches));
    if (!stale.length) return;
    const timer = setTimeout(() => {
      const request = stale.map((card) => ({ cardId: card.cardId, fields: cardMatchFields(drafts[card.cardId]!) }));
      void api.duplicates(batchId, request).then((result) => {
        if (!mounted.current) return;
        for (const entry of request) matchKeys.current[entry.cardId] = JSON.stringify(entry.fields);
        // A failed lookup never blocks: no candidate, and the confirm endpoint still checks.
        setMatches((current) => {
          const next = { ...current };
          for (const entry of request) next[entry.cardId] = result.ok ? result.data[entry.cardId] ?? null : null;
          return next;
        });
      });
    }, LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [api, batchId, drafts, matches, targets]);

  const remember = useCallback((cardId: string, source: "auto" | "user", merged: boolean) => {
    const current = ledgerRef.current;
    const next: ScanLedger = {
      auto: source === "auto" ? [...new Set([...current.auto, cardId])] : current.auto,
      merged: merged ? [...new Set([...current.merged, cardId])] : current.merged.filter((id) => id !== cardId),
      user: source === "user" ? [...new Set([...current.user, cardId])] : current.user,
    };
    ledgerRef.current = next;
    setLedger(next);
    void writeScanLedger(batchId, next);
  }, [batchId]);

  const confirmCard = useCallback(async (card: IngestCard, options: { allowDuplicate?: boolean; mergeInto?: string | null; metEventId?: string | null }, source: "auto" | "user"): Promise<SettleResult> => {
    const draft = drafts[card.cardId];
    const extra = enrichment[card.cardId];
    if (!draft || !extra || confirmBlock(draft, extra)) return "blocked";
    const seed = confirmSeed(card, draft, extra, options);
    const known = intents.current[card.cardId];
    const intentId = known && known.seed === seed ? known.id : newAddKey("confirm");
    intents.current[card.cardId] = { id: intentId, seed };
    const target = confirmTarget(card);
    const result = await api.confirmCard(batchId, target.itemId, target.manual, confirmBody(card, draft, extra, intentId, options));
    if (!mounted.current) return "failed";
    if (!result.ok) return "failed";
    if (result.data.kind === "duplicate") {
      // The server found a candidate this page had not: show it in 重複 (never added twice).
      const candidate = result.data.candidate;
      if (candidate) {
        matchKeys.current[card.cardId] = keyOf(draft);
        setMatches((current) => ({ ...current, [card.cardId]: candidate }));
      }
      return "duplicate";
    }
    const metEventId = result.data.metEventId;
    if (metEventId) setWrittenEvents((current) => [...new Set([...current, metEventId])]);
    remember(card.cardId, source, result.data.kind === "merged");
    return result.data.kind;
  }, [api, batchId, drafts, enrichment, remember]);

  const input = { attribution, autoAttempted: autoAttempted.current, autoRunning, detail, drafts, enrichment, ledger, loadFailed, matches, matchesReady, now, selectedEventId: selectedEventId ?? null };
  const view = buildScanView(input);

  // 自動で人脈へ: when reading is over and the lookups are known, every card waiting at that
  // moment is decided once by the shared rule; the eligible ones go through the same confirm
  // endpoint as a manual confirmation. A card the person then edits is never added behind
  // their back (a card read again after 撮り直す is decided when it comes back).
  const [, setConsidered] = useState(0);
  const autoReady = detail?.batch.status === "ready_for_review" && matchesReady && attribution !== null;
  const waitingKey = targets.map((card) => card.cardId).join(",");
  useEffect(() => {
    if (!autoReady || autoRunning) return;
    const eligible = autoEligible(input);
    for (const card of targets) autoAttempted.current.add(card.cardId);
    if (!eligible.length) { setConsidered((value) => value + 1); return; }
    setAutoRunning(true);
    void (async () => {
      for (const entry of eligible) {
        const card = cards.find((candidate) => candidate.cardId === entry.cardId);
        if (card) await confirmCard(card, { mergeInto: entry.mergeInto }, "auto").catch(() => "failed" as const);
      }
      await load();
      if (mounted.current) setAutoRunning(false);
    })();
    // waitingKey stands for the waiting cards (targets is a new array every render).
  }, [autoReady, autoRunning, waitingKey]);

  const settle = useCallback(async (cardId: string, kind: "confirm" | "merge" | "separate" | "skip"): Promise<SettleResult> => {
    const card = cards.find((candidate) => candidate.cardId === cardId);
    if (!card) return "failed";
    if (kind === "skip") {
      const result = await api.skipCard(batchId, card.front.id);
      return result.ok ? "skipped" : "failed";
    }
    const candidate = matches[cardId] ?? null;
    return confirmCard(card, {
      allowDuplicate: kind === "separate",
      mergeInto: kind === "merge" && candidate ? candidate.contactId : null,
      metEventId: metEventFor(cardId, attribution, selectedEventId ?? null),
    }, "user");
  }, [api, attribution, batchId, cards, confirmCard, matches, selectedEventId]);

  const setDraft = (cardId: string, next: BusinessCardReviewCardDraft) => setDrafts((current) => ({ ...current, [cardId]: next }));
  const setEnrichmentFor = (cardId: string, next: EnrichmentDraft) => {
    edited.current.add(cardId);
    setEnrichment((current) => ({ ...current, [cardId]: next }));
  };

  async function replaceWith(cardId: string, image: PreparedBatchImage): Promise<boolean> {
    const card = cards.find((candidate) => candidate.cardId === cardId);
    const target = card ? replaceTarget(card) : null;
    if (!target) return false;
    try {
      const bytes = await preparedImageBytes(image);
      const result = await api.replaceItem(batchId, target, bytes, image.mimeType);
      await load();
      return result.ok;
    } catch {
      return false;
    }
  }

  if (retake) {
    return <RetakeCamera onClose={() => setRetake(null)} onShot={async (image) => { const cardId = retake; setRetake(null); const ok = await replaceWith(cardId, image); if (mounted.current) setReplaceFailed(!ok); return ok; }} />;
  }

  const title = view.phase === "done" ? t("add.batch.doneTitle", { n: view.counts.created + view.counts.merged }) : t("add.batch.title");
  return (
    <AppScreen title={title}>
      <FadeIn testID={`add-batch-phase-${view.phase}`}>
        {view.phase === "loading" ? <Skeleton lines={6} /> : null}
        {view.phase === "missing" ? <RetryCard title={t("add.batch.loadFailed")} onRetry={() => void load()} /> : null}
        {view.phase === "uploading" || view.phase === "expired" || view.phase === "cancelled" ? (
          <Card>
            <View style={styles.stack}>
              <Body>{t(view.phase === "uploading" ? "add.batch.notUploaded" : view.phase === "expired" ? "add.batch.expired" : "add.batch.cancelled")}</Body>
              <Button variant="primary" icon="scan" label={t("add.batch.scanAgain")} onPress={() => router.replace("/contacts/new/scan" as Href)} />
            </View>
          </Card>
        ) : null}
        {view.phase === "reading" || view.phase === "importing" ? <ReadingPanel view={view} /> : null}
        {view.phase === "review" && replaceFailed ? <Caption tone="error">{t("add.batch.replaceFailed")}</Caption> : null}
        {view.phase === "review" ? (
          <ReviewPanel
            view={view}
            language={language}
            selectedEventId={selectedEventId ?? null}
            onChooseEvent={setSelectedEventId}
            settle={settle}
            reload={load}
            setDraft={setDraft}
            setEnrichment={setEnrichmentFor}
            onRetake={(cardId) => setRetake(cardId)}
            onRetry={async (cardId) => {
              const card = cards.find((candidate) => candidate.cardId === cardId);
              const target = card ? retryTarget(card) : null;
              if (target) await api.retryItem(batchId, target.id);
              await load();
            }}
            onLater={() => router.replace("/contacts" as Href)}
          />
        ) : null}
        {view.phase === "done" ? (
          <DonePanel
            view={view}
            eventTitle={attribution?.events.find((event) => writtenEvents.includes(event.eventId))?.title ?? null}
            dateLabel={view.createdAt ? new Date(view.createdAt).toLocaleDateString(language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP", { day: "numeric", month: "long" }) : ""}
            onPlan={() => router.push(planTaskSegmentHref("app") as Href)}
            onNetwork={() => router.replace("/contacts" as Href)}
            onMore={() => router.replace("/contacts/new/scan" as Href)}
          />
        ) : null}
      </FadeIn>
    </AppScreen>
  );
}

function CardRow({ card }: { card: ScanCardView }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const chip = KIND_CHIP[card.kind];
  const pending = card.kind === "uploading" || card.kind === "queued" || card.kind === "reading";
  const sub = [card.organization, card.role].filter(Boolean).join(" · ") || card.fileName;
  return (
    <View style={[styles.row, styles.rowPad]} testID={`add-card-${card.kind}`}>
      <MacTile emoji={card.kind === "failed" ? "🧩" : "📇"} size="sm" tone={card.kind === "failed" ? "pink" : "lav"} />
      <View style={styles.grow}>
        <UiText numberOfLines={1} style={styles.strong}>{pending ? t("add.batch.readingName") : card.name || t("add.batch.noName")}</UiText>
        <Caption>{sub}</Caption>
      </View>
      {card.twoSided ? <Chip label={t("add.batch.sideBoth")} /> : null}
      {chip ? <Chip label={t(chip.key)} tone={chip.tone} /> : null}
    </View>
  );
}

function ReadingPanel({ view }: { view: ScanBatchView }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const total = view.cards.length;
  const head = view.phase === "importing" ? t("add.batch.importing") : t("add.batch.readingTitle", { n: total });
  const percent = view.phase === "importing" ? 96 : 10 + (total ? view.settled / total : 0) * 86;
  return (
    <View style={styles.stack} testID="add-batch-reading">
      <Card>
        <View style={styles.stack}>
          <UiText accessibilityLiveRegion="polite" style={styles.title}>{head}</UiText>
          {view.phase === "reading" ? <Caption>{t("add.batch.readProgress", { done: view.settled, n: total })}</Caption> : null}
          <ProgressBar value={Math.round(percent)} accessibilityLabel={head} />
          <Body>{t("add.batch.readingLead")}</Body>
          <View>{view.cards.map((card) => <CardRow key={card.cardId} card={card} />)}</View>
        </View>
      </Card>
      <AfterSteps />
    </View>
  );
}

type Choice = "merge" | "separate";

function ReviewPanel({ view, language, selectedEventId, onChooseEvent, settle, reload, setDraft, setEnrichment, onRetake, onRetry, onLater }: {
  view: ScanBatchView;
  language: string;
  selectedEventId: string | null;
  onChooseEvent: (eventId: string | null) => void;
  settle: (cardId: string, kind: "confirm" | "merge" | "separate" | "skip") => Promise<SettleResult>;
  reload: () => Promise<void>;
  setDraft: (cardId: string, draft: BusinessCardReviewCardDraft) => void;
  setEnrichment: (cardId: string, enrichment: EnrichmentDraft) => void;
  onRetake: (cardId: string) => void;
  onRetry: (cardId: string) => Promise<void>;
  onLater: () => void;
}) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, SettleResult>>({});
  const [busy, setBusy] = useState(false);
  // A card the person opened stays where it was while they edit it (fixing the name of a
  // 要確認 card must not make it jump to そのまま追加 under their finger).
  const [sticky, setSticky] = useState<Record<string, Pick<ScanCardView, "section" | "issueGroup">>>({});
  const pending = view.cards.filter((card) => card.section !== null).map((card) => (sticky[card.cardId] && card.section !== "failed" ? { ...card, ...sticky[card.cardId] } : card));
  const dups = pending.filter((card) => card.section === "duplicate");
  const reviews = pending.filter((card) => card.section === "review");
  const ready = pending.filter((card) => card.section === "ready");
  const failed = pending.filter((card) => card.section === "failed");
  const addable = [...dups, ...reviews, ...ready];

  const settleOne = async (card: ScanCardView): Promise<SettleResult> => {
    const kind = card.section === "duplicate" ? ((choices[card.cardId] ?? "merge") === "merge" ? "merge" : "separate") : "confirm";
    const result = await settle(card.cardId, kind);
    setProblems((current) => {
      const next = { ...current };
      if (result === "created" || result === "merged" || result === "skipped") delete next[card.cardId];
      else next[card.cardId] = result;
      return next;
    });
    return result;
  };
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await work(); } finally { await reload(); setBusy(false); }
  };
  const addAll = () => run(async () => { for (const card of addable) await settleOne(card); });
  const confirmOne = (card: ScanCardView) => run(async () => { await settleOne(card); });
  const skipOne = (card: ScanCardView) => run(async () => { await settle(card.cardId, "skip"); });
  const groups = ISSUE_GROUP_ORDER.map((group) => [group, reviews.filter((card) => card.issueGroup === group)] as const).filter(([, cards]) => cards.length);
  const cardProps = (card: ScanCardView) => ({
    busy,
    card,
    language,
    onConfirm: () => void confirmOne(card),
    onSkip: () => void skipOne(card),
    onToggle: () => {
      setSticky((current) => (card.cardId in current ? current : { ...current, [card.cardId]: { issueGroup: card.issueGroup, section: card.section } }));
      setOpen((value) => (value === card.cardId ? null : card.cardId));
    },
    open: open === card.cardId,
    problem: problems[card.cardId] ?? null,
    setDraft,
    setEnrichment,
  });

  return (
    <View style={styles.stack} testID="add-batch-review">
      <Card>
        <View style={styles.stack}>
          <UiText style={styles.title}>{t("add.batch.reviewTitle", { n: view.cards.length })}</UiText>
          <Body>{t("add.batch.reviewLead")}</Body>
          <CountTiles tiles={[
            { key: "duplicate", label: t("add.batch.tileDuplicate"), value: view.counts.duplicate },
            { key: "review", label: t("add.batch.tileReview"), value: view.counts.review },
            { key: "asIs", label: t("add.batch.tileAsIs"), value: view.counts.asIs },
          ]} />
        </View>
      </Card>

      {view.events.length ? (
        <Card>
          <View style={styles.stack} testID="add-batch-met">
            <View style={styles.row}>
              <UiText style={styles.strong}>{t("add.batch.metTitle")}</UiText>
              <Chip label={t("add.batch.metEstimated")} tone="apricot" />
            </View>
            <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t("add.batch.metTitle")}>
              {view.events.map((event) => (
                <FilterOption key={event.eventId} label={`${shortDate(event.startsAt, language)} · ${event.title}`} selected={selectedEventId === event.eventId} onToggle={() => onChooseEvent(event.eventId)} />
              ))}
              <FilterOption label={t("add.batch.metNone")} selected={selectedEventId === null} onToggle={() => onChooseEvent(null)} />
            </View>
            <Caption>{t("add.batch.metLead")}</Caption>
          </View>
        </Card>
      ) : null}

      {dups.length ? (
        <View style={styles.stack} testID="add-section-duplicate">
          <SectionTitle>{t("add.batch.sectionDuplicate")}</SectionTitle>
          {dups.map((card) => <DuplicateCard key={card.cardId} {...cardProps(card)} choice={choices[card.cardId] ?? "merge"} onChoose={(choice) => setChoices((current) => ({ ...current, [card.cardId]: choice }))} />)}
        </View>
      ) : null}

      {groups.length ? (
        <View style={styles.stack} testID="add-section-review">
          <SectionTitle>{t("add.batch.sectionReview")}</SectionTitle>
          {groups.map(([group, list]) => (
            <View key={group} style={styles.stack} testID={`add-group-${group}`}>
              <Caption>{t("add.batch.groupCount", { label: t(GROUP_KEY[group]), n: list.length })}</Caption>
              {list.map((card) => <ReviewCard key={card.cardId} {...cardProps(card)} />)}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.stack} testID="add-section-ready">
        <SectionTitle>{t("add.batch.sectionAsIs")}</SectionTitle>
        {view.counts.autoAdded ? <Body>{t("add.batch.asIsAuto", { n: view.counts.autoAdded })}</Body> : null}
        {ready.length ? (
          <Card>
            <Caption>{t("add.batch.asIsHeld")}</Caption>
            {ready.map((card) => <CardRow key={card.cardId} card={card} />)}
          </Card>
        ) : null}
      </View>

      {failed.length ? (
        <View style={styles.stack} testID="add-section-failed">
          <SectionTitle>{t("add.batch.sectionFailed")}</SectionTitle>
          {failed.map((card) => <FailedCard key={card.cardId} {...cardProps(card)} onRetake={() => onRetake(card.cardId)} onRetry={() => void run(() => onRetry(card.cardId))} />)}
        </View>
      ) : null}

      <View style={styles.stack}>
        <Button variant="primary" block icon="user-plus" label={t("add.batch.addAll", { n: addable.length })} disabled={!addable.length} loading={busy} onPress={() => void addAll()} />
        <Button variant="ghost" label={t("add.batch.later")} onPress={onLater} />
        <Caption>{t("add.batch.laterNote")}</Caption>
      </View>
    </View>
  );
}

function shortDate(iso: string, language: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP", { day: "numeric", month: "numeric" });
}

type CardProps = {
  card: ScanCardView;
  busy: boolean;
  open: boolean;
  problem: SettleResult | null;
  language: string;
  onToggle: () => void;
  onConfirm: () => void;
  onSkip: () => void;
  setDraft: (cardId: string, draft: BusinessCardReviewCardDraft) => void;
  setEnrichment: (cardId: string, enrichment: EnrichmentDraft) => void;
};

function problemKey(card: ScanCardView, problem: SettleResult | null): MessageKey | null {
  if (problem === "blocked") {
    const block = card.draft && card.enrichment ? confirmBlock(card.draft, card.enrichment) : null;
    return block === "name" ? "add.batch.blockedName" : block ? "add.batch.blockedSides" : "add.batch.blockedStale";
  }
  return problem === "failed" ? "add.batch.saveFailed" : null;
}

function Problem({ card, problem }: { card: ScanCardView; problem: SettleResult | null }) {
  const { t } = useOrbitLocale();
  const key = problemKey(card, problem);
  return key ? <Caption tone="error">{t(key)}</Caption> : null;
}

function DuplicateCard({ card, busy, problem, onConfirm, onSkip, choice, onChoose }: CardProps & { choice: Choice; onChoose: (choice: Choice) => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const candidate = card.candidate;
  if (!candidate) return null;
  const rows = EDIT_FIELDS.filter((field) => (candidate[field] ?? "").trim() || (card.draft?.fields[field] ?? "").trim());
  return (
    <Card>
      <View style={styles.stack} testID={`add-duplicate-${card.cardId}`}>
        <View style={styles.row}>
          <UiText style={[styles.strong, styles.grow]}>{card.name || t("add.batch.noName")}</UiText>
          {candidate.matchedOn.map((match) => (MATCH_KEY[match] ? <Chip key={match} label={t(MATCH_KEY[match]!)} tone="lav" /> : null))}
        </View>
        <View style={styles.tightStack}>
          <View style={styles.row}>
            <View style={styles.compareLabel} />
            <Caption>{t("add.batch.existing")}</Caption>
            <View style={styles.grow} />
            <Caption>{t("add.batch.incoming")}</Caption>
          </View>
          {rows.map((field) => {
            const existing = candidate[field] ?? "";
            const incoming = card.draft?.fields[field] ?? "";
            const differs = existing.trim() !== incoming.trim();
            return (
              <View key={field} style={styles.row} testID={differs ? `add-compare-diff-${field}` : `add-compare-same-${field}`}>
                <View style={styles.compareLabel}><Caption>{t(FIELD_KEY[field])}</Caption></View>
                <UiText style={[styles.body, styles.grow]}>{existing || "—"}</UiText>
                <UiText style={[styles.body, styles.grow, differs ? styles.strong : null]}>{incoming || "—"}</UiText>
              </View>
            );
          })}
        </View>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={card.name || t("add.batch.noName")}>
          <FilterOption label={t("add.batch.merge")} selected={choice === "merge"} onToggle={() => onChoose("merge")} />
          <FilterOption label={t("add.batch.separate")} selected={choice === "separate"} onToggle={() => onChoose("separate")} />
        </View>
        <Caption>{t("add.batch.mergeNote")}</Caption>
        <Problem card={card} problem={problem} />
        <View style={styles.row}>
          <Button size="sm" variant="primary" label={choice === "merge" ? t("add.batch.merge") : t("add.batch.separate")} disabled={busy} onPress={onConfirm} />
          <Button size="sm" variant="ghost" label={t("add.batch.skip")} disabled={busy} onPress={onSkip} />
        </View>
      </View>
    </Card>
  );
}

function ReviewCard(props: CardProps) {
  const { card, busy, open, problem, onToggle, onConfirm, onSkip } = props;
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  return (
    <Card>
      <View style={styles.stack} testID={`add-review-${card.cardId}`}>
        <View style={styles.row}>
          <MacTile emoji="📇" size="sm" />
          <View style={styles.grow}>
            <UiText numberOfLines={1} style={styles.strong}>{card.name || t("add.batch.noName")}</UiText>
            <Caption>{[card.organization, card.role].filter(Boolean).join(" · ") || card.fileName}</Caption>
          </View>
          {card.twoSided ? <Chip label={t("add.batch.sideBoth")} /> : null}
        </View>
        <Button size="sm" variant="ghost" label={open ? t("add.batch.closeCard") : t("add.batch.editCard")} onPress={onToggle} />
        {open ? <FieldEditor {...props} /> : null}
        <Problem card={card} problem={problem} />
        <View style={styles.row}>
          <Button size="sm" variant="primary" label={t("add.batch.addThis")} disabled={busy} onPress={onConfirm} />
          <Button size="sm" variant="ghost" label={t("add.batch.skip")} disabled={busy} onPress={onSkip} />
        </View>
      </View>
    </Card>
  );
}

function FailedCard(props: CardProps & { onRetake: () => void; onRetry: () => void }) {
  const { card, busy, open, problem, onToggle, onConfirm, onSkip, onRetake, onRetry } = props;
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const partial = [card.name, card.organization].filter(Boolean).join(" · ");
  return (
    <Card>
      <View style={styles.stack} testID={`add-failed-${card.cardId}`}>
        <View style={styles.row}>
          <MacTile emoji="🧩" size="sm" tone="pink" />
          <View style={styles.grow}>
            <UiText style={styles.strong}>{t(card.failure === "busy" ? "add.batch.failedBusy" : "add.batch.failedImage")}</UiText>
            <Caption>{card.fileName}</Caption>
          </View>
          {partial ? <Chip label={partial} tone="apricot" /> : null}
        </View>
        {open ? (
          <>
            <Caption>{t("add.batch.failedPartial")}</Caption>
            <FieldEditor {...props} />
            <Button size="sm" variant="primary" label={t("add.batch.addThis")} disabled={busy} onPress={onConfirm} />
          </>
        ) : null}
        <Problem card={card} problem={problem} />
        <View style={styles.row}>
          {card.failure === "busy" ? <Button size="sm" variant="primary" icon="refresh" label={t("add.batch.retryRead")} disabled={busy} onPress={onRetry} /> : null}
          <Button size="sm" variant={card.failure === "busy" ? "secondary" : "primary"} icon="camera" label={t("add.batch.retake")} disabled={busy} onPress={onRetake} />
          <Button size="sm" variant="secondary" icon="pen" label={t("add.batch.typeIn")} disabled={busy} onPress={onToggle} />
          <Button size="sm" variant="ghost" label={t("add.batch.skip")} disabled={busy} onPress={onSkip} />
        </View>
      </View>
    </Card>
  );
}

/** 項目を直す / 手入力で補う: the card's fields, the side-by-side picks and 業界 / 職位レベル / 地域. */
function FieldEditor({ card, language, setDraft, setEnrichment }: CardProps) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const draft = card.draft;
  const extra = card.enrichment;
  if (!draft || !extra) return null;
  const sideLabel = (side: "front" | "back") => t(side === "front" ? "add.scan.sideFront" : "add.scan.sideBack");
  const edit = (field: keyof BusinessCardReviewFields, value: string) => {
    const sources = { ...draft.sources };
    if (field in sources) sources[field as keyof typeof sources] = null;
    setDraft(card.cardId, {
      ...draft,
      dirty: true,
      fields: { ...draft.fields, [field]: value },
      manualFields: [...new Set([...draft.manualFields, field])],
      sources,
      unresolvedConflicts: draft.unresolvedConflicts.filter((entry) => entry !== field),
    });
  };
  const pick = (field: BusinessCardConflictField, value: string, itemId: string) => setDraft(card.cardId, {
    ...draft,
    dirty: true,
    fields: { ...draft.fields, [field]: value },
    manualFields: draft.manualFields.filter((entry) => entry !== field),
    sources: { ...draft.sources, [field]: itemId },
    unresolvedConflicts: draft.unresolvedConflicts.filter((entry) => entry !== field),
  });
  const flagged = new Set(card.flagged);
  const industryText = (pick: { primaryIndustryId: string; secondaryIndustryId: string | null }) => {
    const lang = language === "en" || language === "zh" ? language : "ja";
    if (!isIndustryIdCode(pick.primaryIndustryId)) return pick.primaryIndustryId;
    const secondary = pick.secondaryIndustryId ? secondaryIndustryLabel(pick.secondaryIndustryId as SecondaryIndustryIdCode, lang) : null;
    return [industryLabel(pick.primaryIndustryId, lang), secondary].filter(Boolean).join(" › ");
  };
  return (
    <View style={styles.stack} testID={`add-editor-${card.cardId}`}>
      {EDIT_FIELDS.map((field) => {
        const choices = draft.unresolvedConflicts.includes(field) ? draft.conflicts[field] ?? [] : [];
        return (
          <View key={field} style={styles.tightStack} testID={flagged.has(field) ? `add-field-flagged-${field}` : `add-field-${field}`}>
            <TextField label={t(FIELD_KEY[field])} value={draft.fields[field]} onChangeText={(value) => edit(field, value)} />
            {choices.length ? (
              <View style={styles.tightStack}>
                <Caption>{t("add.batch.pickOne")}</Caption>
                <View style={styles.row}>
                  {choices.map((choice) => <Button key={choice.itemId + choice.value} size="sm" variant="secondary" label={t("add.batch.pickSide", { side: sideLabel(choice.side), value: choice.value })} onPress={() => pick(field, choice.value, choice.itemId)} />)}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      {extra.industry.conflicted ? (
        <EnrichmentChoice label={t("add.batch.fieldIndustry")} options={extra.industry.choices.map((choice) => ({ key: `${choice.primaryIndustryId}/${choice.secondaryIndustryId ?? ""}`, label: industryText(choice), pick: () => setEnrichment(card.cardId, { ...extra, industry: { ...extra.industry, conflicted: false, value: choice } }) }))} onClear={() => setEnrichment(card.cardId, { ...extra, industry: { ...extra.industry, conflicted: false, value: null } })} />
      ) : null}
      {extra.seniority.conflicted ? (
        <EnrichmentChoice label={t("add.batch.fieldSeniority")} options={extra.seniority.choices.map((choice) => ({ key: choice, label: choice, pick: () => setEnrichment(card.cardId, { ...extra, seniority: { ...extra.seniority, conflicted: false, value: choice } }) }))} onClear={() => setEnrichment(card.cardId, { ...extra, seniority: { ...extra.seniority, conflicted: false, value: null } })} />
      ) : null}
      {extra.region.conflicted ? (
        <EnrichmentChoice label={t("add.batch.fieldRegion")} options={extra.region.choices.map((choice) => ({ key: `${choice.countryCode}/${choice.city ?? ""}`, label: [choice.countryCode, choice.city].filter(Boolean).join(" · "), pick: () => setEnrichment(card.cardId, { ...extra, region: { ...extra.region, conflicted: false, value: choice } }) }))} onClear={() => setEnrichment(card.cardId, { ...extra, region: { ...extra.region, conflicted: false, value: null } })} />
      ) : null}
      <TextField label={t("add.batch.fieldNotes")} value={draft.fields.notes} multiline onChangeText={(value) => edit("notes", value)} />
    </View>
  );
}

function EnrichmentChoice({ label, options, onClear }: { label: string; options: { key: string; label: string; pick: () => void }[]; onClear: () => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  return (
    <View style={styles.tightStack} testID="add-enrichment-choice">
      <UiText style={styles.strong}>{label}</UiText>
      <Caption>{t("add.batch.pickOne")}</Caption>
      <View style={styles.row}>
        {options.map((option) => <Button key={option.key} size="sm" variant="secondary" label={option.label} onPress={option.pick} />)}
        <Button size="sm" variant="ghost" label={t("add.batch.clearValue")} onPress={onClear} />
      </View>
    </View>
  );
}

function DonePanel({ view, eventTitle, dateLabel, onPlan, onNetwork, onMore }: { view: ScanBatchView; eventTitle: string | null; dateLabel: string; onPlan: () => void; onNetwork: () => void; onMore: () => void }) {
  const { t } = useOrbitLocale();
  const { styles } = useAddStyles();
  const scene = [t("add.batch.doneScene", { date: dateLabel, n: view.cards.length }), eventTitle].filter(Boolean).join(" · ");
  return (
    <View style={styles.stack} testID="add-batch-done-panel">
      <Card>
        <View style={[styles.stack, styles.centered]}>
          <MacTile emoji="🎉" />
          <UiText accessibilityRole="header" style={styles.bigTitle}>{t("add.batch.doneTitle", { n: view.counts.created + view.counts.merged })}</UiText>
          <Caption>{scene}</Caption>
        </View>
        <View style={styles.spaced}>
          <CountTiles tiles={[
            { key: "created", label: t("add.batch.doneNew"), value: view.counts.created },
            { key: "merged", label: t("add.batch.doneMerged"), value: view.counts.merged },
            { key: "unreadable", label: t("add.batch.doneFailed"), tone: "warn", value: view.counts.unreadable },
          ]} />
        </View>
      </Card>
      <Card>
        <View style={styles.stack}>
          <UiText style={styles.strong}>{t("add.batch.nextTitle")}</UiText>
          <View style={styles.row} testID={view.completed ? "add-done-plan-ready" : "add-done-plan-pending"}>
            <MacTile emoji="🎯" size="sm" />
            <View style={styles.grow}>
              <UiText style={styles.strong}>{t("add.batch.nextPlan")}</UiText>
              <Caption>{t(view.completed ? "add.batch.nextPlanReady" : "add.batch.nextPlanPending")}</Caption>
            </View>
            {view.completed ? <Button size="sm" label={t("add.batch.nextPlanOpen")} onPress={onPlan} /> : null}
          </View>
          {view.counts.unreadable ? (
            <View style={styles.row}>
              <MacTile emoji="🧩" size="sm" tone="apricot" />
              <View style={styles.grow}>
                <UiText style={styles.strong}>{t("add.batch.nextFailed", { n: view.counts.unreadable })}</UiText>
                <Caption>{t("add.batch.nextFailedBody")}</Caption>
              </View>
            </View>
          ) : null}
        </View>
      </Card>
      <Button variant="primary" block icon="users" label={t("add.batch.viewNetwork")} onPress={onNetwork} />
      <Button variant="ghost" icon="scan" label={t("add.batch.scanMore")} onPress={onMore} />
    </View>
  );
}

/** 撮り直す: the camera in single-shot mode (permission first); the photo replaces the failed side. */
function RetakeCamera({ onClose, onShot }: { onClose: () => void; onShot: (image: PreparedBatchImage) => Promise<boolean> }) {
  const { t } = useOrbitLocale();
  const { access, request } = useCameraAccess();
  const [notice, setNotice] = useState<"limit" | "pick" | "camera" | null>(null);
  if (access !== "granted") {
    return (
      <AppScreen title={t("add.batch.retake")} onBack={onClose}>
        <CameraPermissionPanel access={access} onAllow={() => void request()} onPick={() => {
          void pickCardImages(1).then((picked) => { if (picked?.[0]) void onShot(picked[0]); }).catch(() => setNotice("pick"));
        }} />
        {notice ? <Caption tone="error">{t("add.scan.pickFailed")}</Caption> : null}
      </AppScreen>
    );
  }
  return <CardCameraPane mode="single" tray={EMPTY_TRAY} notice={notice} onTray={() => undefined} onNotice={setNotice} onClose={onClose} onSingle={(image) => void onShot(image)} />;
}
