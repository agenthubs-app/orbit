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
import { StyleSheet, View } from "react-native";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { PreparedBatchImage } from "../../api/batch-images";
import { planTaskSegmentHref } from "../../api/compute/plan-href";
import type { IngestBatchDetailContract, IngestContactCandidateContract } from "../../api/contract/business-card-batch";
import type { SecondaryIndustryIdCode } from "../../api/contract/industries";
import { industryLabel, isIndustryIdCode, secondaryIndustryLabel } from "../../api/domain/industries";
import { AppScreen } from "../../components/AppScreen";
import { Button, Card, Chip, FilterOption, Icon, IconButton, MacTile, ProgressBar, RetryCard, Skeleton, TextField, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import { reconcileBusinessCardReviewCard, type BusinessCardConflictField, type BusinessCardReviewCardDraft, type BusinessCardReviewFields } from "../../view-models/business-card-batch";
import { ingestCards, type IngestCard } from "../../view-models/business-card-ingest";
import { EMPTY_ATTRIBUTION, useAddApi, type BatchAttribution } from "./add-api";
import { EMPTY_LEDGER, readScanLedger, writeScanLedger, type ScanLedger } from "./add-storage";
import { Body, Caption, CountTiles, DensityBar, FadeIn, KIT_PAGE_INSET, SectionTitle, useAddStyles } from "./add-ui";
import { KitChip, KitEmo } from "../plan/plan-kit";
import { KIT_FOOT_SPACE, KitBar, KitBigNums, KitCardRow, KitDensityStack, KitFoot, KitNg, KitOk, KitSpin, useScanKitStyles } from "./scan-kit";
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
import { scanDesignFor } from "./scan-design-fixtures";
import { forgetScanUpload, runScanUpload, scanUploadState, subscribeScanUpload, type ScanUploadState } from "./scan-upload-queue";
import { pickCardImages, preparedImageBytes, useCameraAccess } from "./scan-media";

const POLL_MS = 3000;
const DENSITY_LABEL = { 1: "add.doors.density1", 2: "add.doors.density2", 3: "add.doors.density3" } as const;
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
  // 本机像素门禁的只读演示（scan-design-fixtures）：开发包 + 开关下 design-* 用示例数据，不读服务器。
  const design = useMemo(() => scanDesignFor(batchId), [batchId]);
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
  // R12 review m9: cards whose duplicate lookup failed — never added automatically.
  const lookupFailed = useRef(new Set<string>());
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
    if (design) return;
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
  }, [api, batchId, design, ownerId]);

  useEffect(() => {
    void load();
    void readScanLedger(batchId).then((stored) => {
      if (!mounted.current) return;
      ledgerRef.current = stored;
      setLedger(stored);
    });
  }, [batchId, load]);

  // R12 review m7: photos still going up from the camera page (the queue keeps going when that page closes).
  const [upload, setUpload] = useState<ScanUploadState | null>(() => scanUploadState(ownerId, batchId));
  useEffect(() => subscribeScanUpload(ownerId, batchId, (state) => {
    if (!mounted.current) return;
    setUpload(state);
    if (state.finished) {
      forgetScanUpload(ownerId, batchId);
      void load();
    }
  }), [batchId, load, ownerId]);

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
        for (const entry of request) {
          matchKeys.current[entry.cardId] = JSON.stringify(entry.fields);
          if (result.ok) lookupFailed.current.delete(entry.cardId);
          else lookupFailed.current.add(entry.cardId);
        }
        // A failed lookup never blocks the page, but those cards wait for the person (R12 review m9:
        // the confirm endpoint does not check 同名, so it cannot be the safety net).
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

  const input = { attribution, autoAttempted: autoAttempted.current, autoRunning, detail, drafts, enrichment, ledger, loadFailed, lookupFailed: lookupFailed.current, matches, matchesReady, now, selectedEventId: selectedEventId ?? null };
  const view = design?.view ?? buildScanView(input);

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

  const reading = view.phase === "reading" || view.phase === "importing";
  const readStyles = doneBarStyles;
  const title = reading ? t("add.batch.readingTop") : view.phase === "done" ? "" : t("add.batch.title");
  const subtitle = reading ? t("add.batch.readingTopSub", { n: design?.total ?? view.cards.length }) : undefined;
  const close = () => router.replace("/contacts" as Href);
  const foot = reading ? (
    <KitFoot><FootButton waiting label={t("add.batch.readingWait")} testID="add-batch-wait" /></KitFoot>
  ) : view.phase === "done" ? (
    <KitFoot>
      <FootButton icon="users" label={t("add.batch.viewNetwork")} onPress={close} testID="add-batch-network" />
      <FootGhost label={t("add.batch.scanMore")} onPress={() => router.replace("/contacts/new/scan" as Href)} />
    </KitFoot>
  ) : null;
  return (
    <View style={{ flex: 1 }}>
    <AppScreen title={title} subtitle={subtitle} backIcon="x" onBack={close} showBack={view.phase !== "done"}
      header={view.phase === "done" ? (
        // b11 #3: the top bar has only ✕ on the right (kit .topbar 6 / 14, 44 cells), inside the scroll like kit.
        <View style={readStyles.doneBar}><IconButton icon="x" accessibilityLabel={t("add.batch.viewNetwork")} onPress={close} /></View>
      ) : undefined}>
      <FadeIn testID={`add-batch-phase-${view.phase}`} style={KIT_PAGE_INSET}>
        {view.phase === "loading" ? <Skeleton lines={6} /> : null}
        {view.phase === "missing" ? <RetryCard title={t("add.batch.loadFailed")} onRetry={() => void load()} /> : null}
        {view.phase === "uploading" && upload && !upload.finished ? (
          <Card>
            <View style={styles.stack} testID="add-batch-uploading">
              <UiText style={styles.title}>{t("add.scan.uploadingTitle", { done: upload.done, n: upload.total })}</UiText>
              <ProgressBar value={upload.total ? Math.round((upload.done / upload.total) * 100) : 0} accessibilityLabel={t("add.scan.uploadingTitle", { done: upload.done, n: upload.total })} />
              <Body>{t("add.scan.uploadingLead")}</Body>
              {upload.problem ? <Caption tone="error">{t("add.scan.uploadFailed")}</Caption> : null}
              {upload.problem ? <Button label={t("add.scan.retryUpload")} icon="refresh" loading={upload.busy} onPress={() => void runScanUpload(ownerId, batchId)} /> : null}
            </View>
          </Card>
        ) : null}
        {(view.phase === "uploading" && !(upload && !upload.finished)) || view.phase === "expired" || view.phase === "cancelled" ? (
          <Card>
            <View style={styles.stack}>
              <Body>{t(view.phase === "uploading" ? "add.batch.notUploaded" : view.phase === "expired" ? "add.batch.expired" : "add.batch.cancelled")}</Body>
              <Button variant="primary" icon="scan" label={t("add.batch.scanAgain")} onPress={() => router.replace("/contacts/new/scan" as Href)} />
            </View>
          </Card>
        ) : null}
        {view.phase === "reading" || view.phase === "importing" ? <ReadingPanel view={view} total={design?.total ?? view.cards.length} /> : null}
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
            eventTitle={design ? design.eventTitle : attribution?.events.find((event) => writtenEvents.includes(event.eventId))?.title ?? null}
            dateLabel={design ? design.dateLabel : view.createdAt ? new Date(view.createdAt).toLocaleDateString(language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP", { day: "numeric", month: "long" }) : ""}
            onPlan={() => router.push(planTaskSegmentHref("app") as Href)}
            onFailed={() => router.push("/contacts/new/manual" as Href)}
          />
        ) : null}
      </FadeIn>
    </AppScreen>
    {foot}
    </View>
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

/**
 * 読み取り中 (b11 A1 ③, App): N / M枚 · 閉じても続きます with the bar, one row per card (✓ added /
 * 推測あり / 重複 / N枚目を読み取り中 · 表＋裏 / 読み取れませんでした), the waiting photos as one 残り N枚 row,
 * and what happens when reading ends. The bottom button waits (KitFoot in the screen).
 */
function ReadingPanel({ view, total }: { view: ScanBatchView; total: number }) {
  const { t } = useOrbitLocale();
  const { colors, styles: k } = useScanKitStyles();
  const { styles } = useReadStyles();
  const percent = view.phase === "importing" ? 96 : total ? (view.settled / total) * 100 : 0;
  const waiting = view.cards.filter((card) => card.kind === "queued" || card.kind === "uploading");
  const shown = view.cards.filter((card) => card.kind !== "queued" && card.kind !== "uploading");
  return (
    <View testID="add-batch-reading">
      <View style={styles.barCard}>
        <View style={styles.between}>
          <UiText accessibilityLiveRegion="polite" style={styles.count}>
            {view.phase === "importing" ? t("add.batch.importing") : <><UiText style={styles.countNum}>{view.settled}</UiText>{t("add.batch.readCountOf", { n: total })}</>}
          </UiText>
          <UiText style={k.lbl}>{t("add.batch.keepGoing")}</UiText>
        </View>
        <KitBar percent={percent} />
        <UiText style={[k.lbl, styles.barNote]}>{t("add.batch.notifyLead")}</UiText>
      </View>
      <View style={styles.listCard}>
        {shown.map((card, index) => <ReadingRow key={card.cardId} card={card} first={index === 0} />)}
        {waiting.length ? (
          <KitCardRow first={!shown.length} title={t("add.batch.restCount", { n: waiting.length })} sub={t("add.batch.stateQueued")} trailing={<UiText style={k.lbl}>…</UiText>} testID="add-card-queued" />
        ) : null}
      </View>
      <View style={styles.nextCard}>
        <UiText style={styles.nextText}>
          {t("add.batch.nextLead1")}<UiText style={styles.nextStrong}>{t("add.batch.nextLead2")}</UiText>{t("add.batch.nextLead3")}<UiText style={styles.nextStrong}>{t("add.batch.stateDuplicate")}</UiText>{t("add.batch.nextLead4")}<UiText style={styles.nextStrong}>{t("add.batch.stateGuess")}</UiText>{t("add.batch.nextLead5")}
        </UiText>
      </View>
      <View style={{ height: KIT_FOOT_SPACE }} />
    </View>
  );
}

function ReadingRow({ card, first }: { card: ScanCardView; first: boolean }) {
  const { t } = useOrbitLocale();
  const seq = Math.min(...card.card.items.map((item) => item.seq));
  const orgRole = [card.organization, card.role].filter(Boolean).join(" · ");
  if (card.kind === "reading") {
    return <KitCardRow first={first} title={t("add.batch.readingNth", { n: seq })} sub={t(card.twoSided ? "add.batch.sideBoth" : "add.batch.sideFront")} trailing={<KitSpin />} testID="add-card-reading" />;
  }
  if (card.kind === "failed") {
    return <KitCardRow first={first} failed title={t("add.batch.failedTitle")} sub={t("add.batch.photoNth", { n: seq })} trailing={<KitNg />} testID="add-card-failed" />;
  }
  const title = card.name || t("add.batch.noName");
  if (card.kind === "duplicate") {
    return <KitCardRow first={first} title={title} sub={[card.organization, t("add.batch.alreadyInNetwork")].filter(Boolean).join(" · ")} trailing={<KitChip label={t("add.batch.stateDuplicate")} tone="lav" />} testID="add-card-duplicate" />;
  }
  if (card.kind === "guess") {
    return <KitCardRow first={first} title={title} sub={orgRole || card.fileName} trailing={<KitChip label={t("add.batch.stateGuess")} tone="apricot" />} testID="add-card-guess" />;
  }
  if (card.kind === "skipped") {
    return <KitCardRow first={first} title={title} sub={orgRole || card.fileName} trailing={<KitChip label={t("add.batch.stateSkipped")} />} testID="add-card-skipped" />;
  }
  return <KitCardRow first={first} title={title} sub={orgRole || card.fileName} trailing={<KitOk />} testID={`add-card-${card.kind}`} />;
}

const doneBarStyles = StyleSheet.create({
  // marginTop −12: AppScreen's content starts 12 lower than kit .scroll without a nav bar too (see KIT_PAGE_INSET).
  doneBar: { flexDirection: "row", justifyContent: "flex-end", marginTop: -12, paddingTop: 6, paddingBottom: 14, paddingRight: 4, marginHorizontal: 2 },
});

// kit 数值（b11 #2）：.card.k-spbar padding 14 / 16；.card.k-splist padding 4 / 16；.card.flat.k-spnext padding 12 / 14。
const useReadStyles = createThemedStyles((colors) => StyleSheet.create({
  barCard: { backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 16 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  count: { fontSize: 15, fontWeight: "700", lineHeight: 22.5, color: colors.ink },
  countNum: { fontWeight: "800", fontVariant: ["tabular-nums"] },
  // .bar margin-bottom 4 and the note's margin-top 4 collapse into one 4 in CSS.
  barNote: { marginTop: 0 },
  listCard: { marginTop: 12, backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 4, paddingHorizontal: 16 },
  nextCard: { marginTop: 12, backgroundColor: colors.surface2, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 14 },
  nextText: { fontSize: 11.5, fontWeight: "500", lineHeight: 18.4, color: colors.ink2 },
  nextStrong: { fontWeight: "700", color: colors.ink },
  center: { alignItems: "center", marginTop: 6 },
  hero: { fontSize: 46, lineHeight: 46 },
  h1: { marginTop: 8, fontSize: 22, fontWeight: "900", lineHeight: 29.7, letterSpacing: -0.22, color: colors.ink, textAlign: "center" },
  sub: { marginTop: 4, fontSize: 12.5, lineHeight: 18.75, color: colors.ink2, textAlign: "center" },
  numCard: { marginTop: 14, backgroundColor: colors.surface, borderRadius: 24, padding: 14 },
  densLbl: { marginTop: 12 },
  nxCard: { marginTop: 12, backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 6, paddingHorizontal: 16 },
  cardH: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 2 },
  h3: { fontSize: 14.5, fontWeight: "800", lineHeight: 21.75, color: colors.ink },
  nx: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  nxLine: { borderTopWidth: 1, borderTopColor: colors.line },
  nxMeta: { flex: 1, minWidth: 0 },
  nxTitle: { fontSize: 13, fontWeight: "700", lineHeight: 19.5, color: colors.ink },
  nxSub: { fontSize: 11.5, lineHeight: 17.25, color: colors.ink3 },
  xl: { height: 50, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  xlPrimary: { backgroundColor: colors.ink },
  xlWait: { backgroundColor: colors.surface3 },
  xlText: { fontSize: 14.5, fontWeight: "700", lineHeight: 21.75 },
  ghost: { height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  ghostText: { fontSize: 13, fontWeight: "700", lineHeight: 19.5, color: colors.ink2 },
}));

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
  // R12 review m5: 統合 is not 追加 — the button counts them apart.
  const merging = dups.filter((card) => (choices[card.cardId] ?? "merge") === "merge").length;
  const adding = addable.length - merging;
  const addLabel = !merging ? t("add.batch.addAll", { n: adding }) : adding ? t("add.batch.addAllWithMerge", { m: merging, n: adding }) : t("add.batch.mergeAll", { m: merging });

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
        <Button variant="primary" block icon="user-plus" label={addLabel} disabled={!addable.length} loading={busy} onPress={() => void addAll()} />
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

function DuplicateCard({ card, busy, problem, onSkip, choice, onChoose }: CardProps & { choice: Choice; onChoose: (choice: Choice) => void }) {
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
        {/* R12 review M2: the choice above is the only 統合する; 「N人を追加」 carries it out. */}
        <View style={styles.row}>
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

/**
 * 完成 (b11 A1 ④, App; 暗 #46): 🎉 N人を人脈に追加しました, 名刺 N枚 · date · event, 新しく追加 / 既存と統合 /
 * 読み取れず (never counted as added), 情報の濃さ, then 次にやるといいこと (プラン, 読み取れなかった N枚).
 * 人脈で見る / 続けて撮る sit in the bottom bar (KitFoot in the screen).
 */
function DonePanel({ view, eventTitle, dateLabel, onPlan, onFailed }: { view: ScanBatchView; eventTitle: string | null; dateLabel: string; onPlan: () => void; onFailed: () => void }) {
  const { t } = useOrbitLocale();
  const { colors, styles: k } = useScanKitStyles();
  const { styles } = useReadStyles();
  const scene = [t("add.batch.doneScene", { date: dateLabel, n: view.cards.length }), eventTitle].filter(Boolean).join(" ");
  const rows = [
    { key: "plan", emoji: "🎯", tone: "lav" as const, title: t("add.batch.nextPlan"), sub: t(view.completed ? "add.batch.nextPlanReady" : "add.batch.nextPlanPending"), onPress: view.completed ? onPlan : null, testID: view.completed ? "add-done-plan-ready" : "add-done-plan-pending" },
    ...(view.counts.unreadable ? [{ key: "failed", emoji: "🧩", tone: "apricot" as const, title: t("add.batch.nextFailed", { n: view.counts.unreadable }), sub: t("add.batch.nextFailedBody"), onPress: onFailed, testID: "add-done-failed" }] : []),
  ];
  return (
    <View testID="add-batch-done-panel">
      <View style={styles.center}>
        <UiText style={styles.hero}>🎉</UiText>
        <UiText accessibilityRole="header" style={styles.h1}>{t("add.batch.doneTitle", { n: view.counts.created + view.counts.merged })}</UiText>
        <UiText style={styles.sub}>{scene}</UiText>
      </View>
      <View style={styles.numCard}>
        <KitBigNums items={[
          { key: "created", label: t("add.batch.doneNew"), value: view.counts.created },
          { key: "merged", label: t("add.batch.doneMerged"), value: view.counts.merged },
          { key: "unreadable", label: t("add.batch.doneFailed"), tone: "coral" as const, value: view.counts.unreadable },
        ].map((item) => ({ ...item, accessibilityLabel: t("add.batch.tileLabel", { label: item.label, n: item.value }) }))} />
        {view.density ? (
          <>
            <UiText style={[k.lbl, styles.densLbl]}>{t("add.doors.densityTitle")}</UiText>
            <KitDensityStack counts={view.density} accessibilityLabel={([1, 2, 3] as const).map((level) => t("add.batch.doneDensityLevel", { label: t(DENSITY_LABEL[level]), n: view.density![level] })).join(" · ")} />
          </>
        ) : null}
      </View>
      <View style={styles.nxCard}>
        <View style={styles.cardH}><UiText style={styles.h3}>{t("add.batch.nextTitle")}</UiText></View>
        {rows.map((row, index) => (
          <UiPressable key={row.key} accessibilityRole={row.onPress ? "button" : "text"} disabled={!row.onPress} onPress={row.onPress ?? undefined}
            style={[styles.nx, index > 0 && styles.nxLine]} testID={row.testID}>
            <KitEmo emoji={row.emoji} tone={row.tone} sm />
            <View style={styles.nxMeta}>
              <UiText numberOfLines={1} style={styles.nxTitle}>{row.title}</UiText>
              <UiText numberOfLines={1} style={styles.nxSub}>{row.sub}</UiText>
            </View>
            <Icon name="right" size={16} color={colors.ink3} />
          </UiPressable>
        ))}
      </View>
      <View style={{ height: KIT_FOOT_SPACE }} />
    </View>
  );
}

/** .btn.block.xl（高 50、14.5px）：primary 或读取中的等待态（surface-3 底、ink-3 字、转圈）。 */
function FootButton({ label, onPress, waiting = false, icon, testID }: { label: string; onPress?: () => void; waiting?: boolean; icon?: "users"; testID?: string }) {
  const { colors } = useScanKitStyles();
  const { styles } = useReadStyles();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: waiting, busy: waiting }} disabled={waiting} onPress={onPress}
      style={[styles.xl, waiting ? styles.xlWait : styles.xlPrimary]} testID={testID}>
      {waiting ? <KitSpin tone="muted" /> : null}
      {icon ? <Icon name={icon} size={16} color={colors.bg} /> : null}
      <UiText numberOfLines={1} style={[styles.xlText, { color: waiting ? colors.ink3 : colors.bg }]}>{label}</UiText>
    </UiPressable>
  );
}

function FootGhost({ label, onPress }: { label: string; onPress: () => void }) {
  const { styles } = useReadStyles();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.ghost}>
      <UiText style={styles.ghostText}>{label}</UiText>
    </UiPressable>
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
