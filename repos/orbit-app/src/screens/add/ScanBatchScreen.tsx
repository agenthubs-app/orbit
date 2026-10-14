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
import { ActionSheet, BottomSheet, Button, Card, Chip, FilterOption, Icon, IconButton, MacTile, ProgressBar, RetryCard, Skeleton, TextField, UiPressable, UiText } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { MessageKey } from "../../i18n/messages";
import { reconcileBusinessCardReviewCard, type BusinessCardConflictField, type BusinessCardReviewCardDraft, type BusinessCardReviewFields } from "../../view-models/business-card-batch";
import { ingestCards, type IngestCard } from "../../view-models/business-card-ingest";
import { EMPTY_ATTRIBUTION, useAddApi, type BatchAttribution } from "./add-api";
import { EMPTY_LEDGER, readScanLedger, writeScanLedger, type ScanLedger } from "./add-storage";
import { Body, Caption, CountTiles, DensityBar, FadeIn, KIT_PAGE_INSET, SectionTitle, useAddStyles } from "./add-ui";
import { KitChip, KitEmo } from "../plan/plan-kit";
import { UnifiedReviewApp } from "./UnifiedReviewApp";
import { KIT_FOOT_SPACE, KitBar, KitBigNums, KitCardRow, KitDensityStack, KitErrCard, KitFoot, KitNg, KitOk, KitSpin, useScanKitStyles } from "./scan-kit";
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
  const { styles: kitStyles } = useScanKitStyles();
  const { styles: rs } = useReadStyles();
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
  const [selectedEventId, setSelectedEventId] = useState<string | null | undefined>(design?.selectedEventId);
  const [ledger, setLedger] = useState<ScanLedger>(EMPTY_LEDGER);
  const ledgerRef = useRef<ScanLedger>(EMPTY_LEDGER);
  const autoAttempted = useRef(new Set<string>());
  const [autoRunning, setAutoRunning] = useState(false);
  const [writtenEvents, setWrittenEvents] = useState<string[]>([]);
  const intents = useRef<Record<string, { seed: string; id: string }>>({});
  const [now, setNow] = useState(() => Date.now());
  const [retake, setRetake] = useState<string | null>(null);
  const [replaceFailed, setReplaceFailed] = useState(false);
  const [stage, setStage] = useState<ReviewStage>(batchId === "design-review" || batchId === "design-failed" ? "review" : "bridge");
  const [reviewFoot, setReviewFoot] = useState<ReviewFoot | null>(null);
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
  const reviewing = view.phase === "review";
  const stopped = (view.phase === "uploading" && !(upload && !upload.finished)) || view.phase === "expired" || view.phase === "cancelled";
  const reviewEvent = view.events.find((event) => event.eventId === selectedEventId)?.title ?? null;
  const title = stopped ? t("add.batch.title") : reading ? t("add.batch.readingTop") : reviewing ? t(stage === "bridge" ? "add.batch.bridgeTop" : "add.batch.reviewTop") : view.phase === "done" ? "" : t("add.batch.title");
  const subtitle = stopped ? (view.cards.length ? t("add.batch.readingTopSub", { n: view.cards.length }) : undefined) : reading ? t("add.batch.readingTopSub", { n: design?.total ?? view.cards.length })
    : reviewing ? (stage === "bridge" ? [reviewEvent, t("add.batch.readingTopSub", { n: view.cards.length })].filter(Boolean).join(" · ") : t("add.batch.reviewTopSub", { n: view.cards.length }))
    : undefined;
  const close = () => router.replace("/contacts" as Href);
  const foot = reading ? (
    <KitFoot><FootButton waiting label={t("add.batch.readingWait")} testID="add-batch-wait" /></KitFoot>
  ) : reviewing && reviewFoot ? (
    <KitFoot>
      <FootButton label={reviewFoot.primary} onPress={reviewFoot.onPrimary} waiting={reviewFoot.busy} disabled={reviewFoot.disabled} testID="add-batch-primary" />
      {reviewFoot.ghost && reviewFoot.onGhost ? <FootGhost label={reviewFoot.ghost} onPress={reviewFoot.onGhost} /> : null}
      {reviewFoot.note ? <UiText style={[kitStyles.lbl, readNote.note]}>{reviewFoot.note}</UiText> : null}
    </KitFoot>
  ) : view.phase === "done" ? (
    <KitFoot>
      <FootButton icon="users" label={t("add.batch.viewNetwork")} onPress={close} testID="add-batch-network" />
      <FootGhost label={t("add.batch.scanMore")} onPress={() => router.replace("/contacts/new/scan" as Href)} />
    </KitFoot>
  ) : null;
  return (
    <View style={{ flex: 1 }}>
    <AppScreen title={title} subtitle={subtitle} backIcon={reviewing && stage === "review" ? "left" : "x"} onBack={reviewing && stage === "review" ? () => setStage("bridge") : close} showBack={view.phase !== "done"}
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
        {stopped ? (
          <>
            {/* b12 N11 (アップロードが途中で止まりました) and the same card for 期限切れ / 取り消し済み. */}
            <KitErrCard title={t(view.phase === "uploading" ? "add.batch.uploadStoppedTitle" : view.phase === "expired" ? "add.batch.expiredTitle" : "add.batch.cancelledTitle")}
              sub={t(view.phase === "uploading" ? "add.batch.uploadStoppedBody" : view.phase === "expired" ? "add.batch.expiredBody" : "add.batch.cancelledBody")} testID="add-batch-stopped">
              <FootButton icon="scan" label={t("add.batch.scanAgain")} onPress={() => router.replace("/contacts/new/scan" as Href)} testID="add-batch-scan-again" />
              <FootGhost label={t("add.batch.viewNetwork")} onPress={close} />
            </KitErrCard>
            {view.phase === "uploading" ? <View style={rs.nextCard}><UiText style={rs.nextText}>{t("add.batch.uploadStoppedWhy")}</UiText></View> : null}
          </>
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
            stage={stage}
            onStage={setStage}
            onFoot={setReviewFoot}
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
    return <KitCardRow first={first} title={title} sub={[card.organization, t("add.batch.alreadyInNetwork")].filter(Boolean).join(" · ")} trailing={<KitChip label={t("add.batch.stateDuplicate")} tone="lav" style={rowChipStyles.rowChip} />} testID="add-card-duplicate" />;
  }
  if (card.kind === "guess") {
    return <KitCardRow first={first} title={title} sub={orgRole || card.fileName} trailing={<KitChip label={t("add.batch.stateGuess")} tone="apricot" style={rowChipStyles.rowChip} />} testID="add-card-guess" />;
  }
  if (card.kind === "skipped") {
    return <KitCardRow first={first} title={title} sub={orgRole || card.fileName} trailing={<KitChip label={t("add.batch.stateSkipped")} />} testID="add-card-skipped" />;
  }
  return <KitCardRow first={first} title={title} sub={orgRole || card.fileName} trailing={<KitOk />} testID={`add-card-${card.kind}`} />;
}

const readNote = StyleSheet.create({ note: { textAlign: "center" } });
// plan-kit KitChip sits at flex-start; in .prow2 (align-items: center) the chip is centred on the two-line meta.
const rowChipStyles = StyleSheet.create({ rowChip: { alignSelf: "center" } });
const doneBarStyles = StyleSheet.create({
  // marginTop −12: AppScreen's content starts 12 lower than kit .scroll without a nav bar too (see KIT_PAGE_INSET).
  // marginBottom −4: AppScreen's 16 gap after the header slot minus the panel's KIT_PAGE_INSET −12 leaves 4 more
  // than kit (.topbar padding-bottom 14 straight into .center margin-top 6), which put 🎉 / h1 and all below 4pt low.
  doneBar: { flexDirection: "row", justifyContent: "flex-end", marginTop: -12, marginBottom: -4, paddingTop: 6, paddingBottom: 14, paddingRight: 4, marginHorizontal: 2 },
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
  // b9 A1 ① 衔接：.emo.teal 84（圆角 28、40px）、.h1 margin-top 14、.bq（label / 数字 + 件）margin-top 20、.card.k-when margin-top 12。
  bridgeHead: { alignItems: "center", marginTop: 12 },
  bridgeEmo: { width: 84, height: 84, borderRadius: 28, backgroundColor: colors.macTeal, alignItems: "center", justifyContent: "center" },
  bridgeEmoText: { fontSize: 40, lineHeight: 48 },
  // b9 overrides .h1 to 23px (line-height 1.35); its .sub has no margin-top (the done page's sub keeps 4).
  bridgeTitle: { marginTop: 14, fontSize: 23, lineHeight: 31.05, letterSpacing: -0.23 },
  bridgeSub: { marginTop: 0 },
  bq: { flexDirection: "row", gap: 8, marginTop: 20 },
  bqTile: { flex: 1, minWidth: 0, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.surface },
  bqNum: { fontSize: 24, fontWeight: "800", lineHeight: 27.6, color: colors.ink, fontVariant: ["tabular-nums"] },
  // .bq 里的 span.lbl 是行内元素：行盒取父级 14px × 1.5 = 21。
  bqLbl: { lineHeight: 21 },
  metCard: { marginTop: 12, backgroundColor: colors.surface, borderRadius: 24, padding: 18 },
  metRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  metTitle: { fontSize: 13, fontWeight: "700", lineHeight: 19.5, color: colors.ink },
  metChoices: { marginTop: 10, flexWrap: "wrap" },
  metLead: { marginTop: 8 },
  extraGap: { marginTop: 0 },
  // b11 A1 ⑤ sheet：模糊名刺 120 宽、标题 16、.chip.coral、.card.flat 读めたところ、按钮列间距 8。
  sheetHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  blurCard: { width: 120, height: 120 * 55 / 91, borderRadius: 5, backgroundColor: colors.paper, opacity: 0.85, shadowColor: colors.cam, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 6 } },
  blurLine1: { position: "absolute", left: 9, top: 9, width: 54, height: 5, borderRadius: 3, backgroundColor: colors.paperInk2, opacity: 0.35 },
  blurLine2: { position: "absolute", left: 9, top: 30, width: 70, height: 9, borderRadius: 4, backgroundColor: colors.paperInk, opacity: 0.35 },
  blurLine3: { position: "absolute", left: 9, bottom: 10, width: 80, height: 4, borderRadius: 2, backgroundColor: colors.paperInk2, opacity: 0.3 },
  sheetTitle: { fontSize: 16, fontWeight: "700", lineHeight: 24, color: colors.ink },
  why: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  partCard: { marginTop: 12, backgroundColor: colors.surface2, borderRadius: 24, paddingVertical: 10, paddingHorizontal: 12 },
  parts: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  partUnknown: { opacity: 0.55 },
  sheetActs: { gap: 8, marginTop: 14 },
  block: { height: 40, borderRadius: 999, backgroundColor: colors.surface2, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  blockPrimary: { backgroundColor: colors.ink },
  blockGhost: { backgroundColor: "transparent" },
  blockOff: { opacity: 0.4 },
  blockText: { fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  xl: { height: 50, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  xlPrimary: { backgroundColor: colors.ink },
  xlWait: { backgroundColor: colors.surface3 },
  xlOff: { opacity: 0.4 },
  xlText: { fontSize: 14.5, fontWeight: "700", lineHeight: 21.75 },
  ghost: { height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  ghostText: { fontSize: 13, fontWeight: "700", lineHeight: 19.5, color: colors.ink2 },
}));

type Choice = "merge" | "separate";

export type ReviewStage = "bridge" | "review";
export type ReviewFoot = { primary: string; onPrimary: () => void; ghost: string | null; onGhost: (() => void) | null; note: string | null; disabled: boolean; busy: boolean };

const GROUP_SHORT: Record<ScanIssueGroup, MessageKey> = {
  enrichment: "add.batch.shortEnrichment", format: "add.batch.shortFormat", misread: "add.batch.shortMisread", name: "add.batch.shortName",
  orgSuffix: "add.batch.shortOrgSuffix", other: "add.batch.shortOther", sides: "add.batch.shortSides",
};

/**
 * Reading is over and some cards wait for the person (DESIGN §2.2 step 6):
 *   bridge (b9 A1 ①): 📇 N枚を読み取りました, the three tiles, 会った場所と日付 (推定) → まとめて確認へ / 確認せずに追加;
 *   review (b9 A2 ④ App, 統一 — UnifiedReviewApp): 重複 rows (checked = 統合), 要確認 by reason (a row opens its cards),
 *     then 会った場所 and 読み取れなかった名刺 (a row opens b11 A1 ⑤'s sheet: 撮り直す / 手入力で補う / スキップ).
 * The bottom buttons are the page's (KitFoot), handed up through onFoot.
 */
function ReviewPanel({ view, stage, onStage, language, selectedEventId, onChooseEvent, settle, reload, setDraft, setEnrichment, onRetake, onRetry, onFoot }: {
  view: ScanBatchView;
  stage: ReviewStage;
  onStage: (stage: ReviewStage) => void;
  language: string;
  selectedEventId: string | null;
  onChooseEvent: (eventId: string | null) => void;
  settle: (cardId: string, kind: "confirm" | "merge" | "separate" | "skip") => Promise<SettleResult>;
  reload: () => Promise<void>;
  setDraft: (cardId: string, draft: BusinessCardReviewCardDraft) => void;
  setEnrichment: (cardId: string, enrichment: EnrichmentDraft) => void;
  onRetake: (cardId: string) => void;
  onRetry: (cardId: string) => Promise<void>;
  onFoot: (foot: ReviewFoot) => void;
}) {
  const { t } = useOrbitLocale();
  const { styles: k } = useScanKitStyles();
  const { styles: r } = useReadStyles();
  const { styles } = useAddStyles();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
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

  const record = (cardId: string, result: SettleResult) => setProblems((current) => {
    const next = { ...current };
    if (result === "created" || result === "merged" || result === "skipped") delete next[cardId];
    else next[cardId] = result;
    return next;
  });
  const problemText = (card: ScanCardView): string | null => {
    const key = problemKey(card, problems[card.cardId] ?? null);
    return key ? t(key) : null;
  };
  const settleOne = async (card: ScanCardView): Promise<SettleResult> => {
    const kind = card.section === "duplicate" ? ((choices[card.cardId] ?? "merge") === "merge" ? "merge" : "separate") : "confirm";
    const result = await settle(card.cardId, kind);
    record(card.cardId, result);
    return result;
  };
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await work(); } finally { await reload(); setBusy(false); }
  };
  const addAll = () => run(async () => { for (const card of addable) await settleOne(card); });
  // 衔接「確認せずに N人を追加」: everything but 重複 (never merged unseen, R12 m9 / m5); the rest waits in まとめて確認.
  const quiet = [...reviews, ...ready];
  const addQuietly = () => run(async () => { for (const card of quiet) await settleOne(card); }).then(() => onStage("review"));
  const settleMany = (cards: readonly ScanCardView[], kind: "merge" | "separate") => run(async () => {
    for (const card of cards) record(card.cardId, await settle(card.cardId, kind));
  });
  const confirmOne = (card: ScanCardView) => run(async () => { await settleOne(card); });
  const skipOne = (card: ScanCardView) => run(async () => { await settle(card.cardId, "skip"); });
  const selectedDups = dups.filter((card) => (choices[card.cardId] ?? "merge") === "merge");
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
  const needs = dups.length + reviews.length + failed.length;

  // The page's bottom bar (KitFoot) — handed up whenever what it shows changes.
  const latest = useRef({ addAll, addQuietly, onStage });
  latest.current = { addAll, addQuietly, onStage };
  useEffect(() => {
    onFoot(stage === "bridge"
      ? { busy, disabled: false, ghost: quiet.length ? t("add.batch.addWithoutReview", { n: quiet.length }) : null, note: null, onGhost: () => void latest.current.addQuietly(), onPrimary: () => latest.current.onStage("review"), primary: t("add.batch.toReview", { n: needs }) }
      : { busy, disabled: !addable.length, ghost: null, note: t("add.batch.reviewFootNote"), onGhost: null, onPrimary: () => void latest.current.addAll(), primary: addLabel });
  }, [stage, busy, addable.length, quiet.length, needs, addLabel, t]);

  const event = view.events.find((entry) => entry.eventId === selectedEventId) ?? null;
  const metCard = view.events.length ? (
    <View style={r.metCard} testID="add-batch-met">
      <View style={r.metRow}>
        <KitEmo emoji="📍" tone="apricot" sm />
        <View style={r.nxMeta}>
          <UiText style={r.metTitle}>{t("add.batch.bridgeMetTitle")}</UiText>
          <UiText numberOfLines={1} style={k.lbl}>{event ? t("add.batch.metDateEvent", { date: longDate(event.startsAt, language, t), event: event.title }) : t("add.batch.metNone")}</UiText>
        </View>
        <KitChip label={t("add.batch.metEstimated")} tone="apricot" />
      </View>
      {stage === "review" ? (
        <View style={[styles.row, r.metChoices]} accessibilityRole="radiogroup" accessibilityLabel={t("add.batch.metTitle")}>
          {view.events.map((entry) => (
            <FilterOption key={entry.eventId} label={`${shortDate(entry.startsAt, language)} · ${entry.title}`} selected={selectedEventId === entry.eventId} onToggle={() => onChooseEvent(entry.eventId)} />
          ))}
          <FilterOption label={t("add.batch.metNone")} selected={selectedEventId === null} onToggle={() => onChooseEvent(null)} />
        </View>
      ) : null}
      <UiText style={[k.lbl, r.metLead]}>{t("add.batch.bridgeMetLead")}</UiText>
    </View>
  ) : null;

  const tiles = [
    { count: view.counts.duplicate, key: "duplicate" as const, label: t("add.batch.tileDuplicate") },
    { count: view.counts.review, key: "review" as const, label: t("add.batch.tileReview") },
    { count: view.counts.asIs, key: "asIs" as const, label: t("add.batch.tileAsIs") },
  ];

  if (stage === "bridge") {
    return (
      <View testID="add-batch-bridge">
        <View style={r.bridgeHead}>
          <View style={r.bridgeEmo}><UiText style={r.bridgeEmoText}>📇</UiText></View>
          <UiText accessibilityRole="header" style={[r.h1, r.bridgeTitle]}>{t("add.batch.reviewTitle", { n: view.cards.length })}</UiText>
          <UiText style={[r.sub, r.bridgeSub]}>{`${t("add.batch.bridgeLead1")}\n${t("add.batch.bridgeLead2")}`}</UiText>
        </View>
        <View style={r.bq}>
          {tiles.map((entry) => (
            <View key={entry.key} accessible accessibilityLabel={t("add.batch.tileLabel", { label: entry.label, n: entry.count })} style={r.bqTile} testID={`add-tile-${entry.key}`}>
              <UiText numberOfLines={1} style={[k.lbl, r.bqLbl]}>{entry.label}</UiText>
              <UiText style={r.bqNum}>{entry.count}</UiText>
              <UiText style={[k.lbl, r.bqLbl]}>{t("add.batch.tileUnit")}</UiText>
            </View>
          ))}
        </View>
        {metCard}
        <View style={{ height: KIT_FOOT_SPACE }} />
      </View>
    );
  }

  const failedSheet = failed.find((card) => card.cardId === sheet) ?? null;
  return (
    <>
      <UnifiedReviewApp
        tiles={tiles}
        active="duplicate"
        duplicateTitle={t("add.batch.duplicateTitle", { n: dups.length })}
        exceptionsOnly={t("add.batch.exceptionsOnly")}
        autoMergedLabel={view.counts.merged ? t("add.batch.autoMergedCards", { n: view.counts.merged }) : null}
        autoMergedNote={t("add.batch.autoMergedNote")}
        similarLabel={t("add.batch.similarOnly", { n: dups.length })}
        duplicates={dups.flatMap((card) => {
          const candidate = card.candidate;
          if (!candidate) return [];
          const name = card.name || t("add.batch.noName");
          const company = card.organization ? (candidate.organization && candidate.organization === card.organization ? "" : ` · ${card.organization}`) : t("add.batch.noCompany");
          return [{
            existingLine: t("add.batch.existingLine", { value: [candidate.organization, candidate.role].filter(Boolean).join(" · ") || candidate.displayName }),
            existingName: candidate.displayName, id: card.cardId,
            incomingLine: t("add.batch.incomingLine", { value: `${name}${company}` }),
            name, problem: problemText(card), selected: (choices[card.cardId] ?? "merge") === "merge",
          }];
        })}
        onToggle={(id) => setChoices((current) => ({ ...current, [id]: (current[id] ?? "merge") === "merge" ? "separate" : "merge" }))}
        onRowMenu={setRowMenu}
        toggleLabel={(row) => t("add.batch.selectRow", { name: row.name })}
        mergeLabel={t("add.batch.mergeSelected", { n: selectedDups.length })}
        separateLabel={t("add.batch.separate")}
        skipLabel={t("add.batch.skip")}
        onMergeSelected={() => void settleMany(selectedDups, "merge")}
        onSeparate={() => void settleMany(selectedDups, "separate")}
        reviewTitle={t("add.batch.reviewTitleN", { n: reviews.length })}
        reviewNote={t("add.batch.reviewNote")}
        estimated={t("add.batch.metEstimated")}
        groups={groups.map(([group, list]) => ({
          count: list.length,
          example: [list[0]!.name || t("add.batch.noName"), list[0]!.organization].filter(Boolean).join(" · "),
          key: group, label: t(GROUP_SHORT[group]), open: openGroup === group || list.some((card) => problemText(card) !== null),
          tone: group === "name" || group === "misread" ? "lo" as const : "mid" as const,
        }))}
        onGroup={(key) => setOpenGroup((value) => (value === key ? null : key))}
        groupBody={(key) => reviews.filter((card) => card.issueGroup === key).map((card) => <ReviewCard key={card.cardId} {...cardProps(card)} />)}
        reviewAttention={reviews.some((card) => problemText(card) !== null)}
        busy={busy}
      >
        {metCard ? <View style={r.extraGap}>{metCard}</View> : null}
        {/* そのまま追加 cards that could not be added say why (R12 review: a failed settle must never be silent). */}
        {ready.some((card) => problemText(card) !== null) ? (
          <View style={r.listCard} testID="add-section-ready">
            {ready.filter((card) => problemText(card) !== null).map((card, index) => (
              <View key={card.cardId}>
                <KitCardRow first={index === 0} title={card.name || t("add.batch.noName")} sub={[card.organization, card.role].filter(Boolean).join(" · ") || card.fileName} />
                <Caption tone="error">{problemText(card)!}</Caption>
              </View>
            ))}
          </View>
        ) : null}
        {failed.length ? (
          <View style={r.listCard} testID="add-section-failed">
            {failed.map((card, index) => (
              <UiPressable key={card.cardId} accessibilityRole="button" onPress={() => setSheet(card.cardId)} testID={`add-failed-row-${card.cardId}`}>
                <KitCardRow first={index === 0} failed title={t(card.failure === "busy" ? "add.batch.failedBusy" : "add.batch.failedTitle")} sub={t("add.batch.photoNth", { n: Math.min(...card.card.items.map((item) => item.seq)) })} trailing={<KitNg />} />
              </UiPressable>
            ))}
          </View>
        ) : null}
        {failed.filter((card) => card.cardId === open).map((card) => (
          <View key={card.cardId} style={r.extraGap}><FailedCard {...cardProps(card)} onRetake={() => onRetake(card.cardId)} onRetry={() => void run(() => onRetry(card.cardId))} /></View>
        ))}
        <View style={{ height: KIT_FOOT_SPACE }} />
      </UnifiedReviewApp>
      <ActionSheet visible={rowMenu !== null} title={dups.find((card) => card.cardId === rowMenu)?.name ?? ""} options={[{ key: "skip", label: t("add.batch.skip") }]}
        onSelect={() => { const card = dups.find((entry) => entry.cardId === rowMenu); setRowMenu(null); if (card) void skipOne(card); }} onClose={() => setRowMenu(null)} />
      <BottomSheet visible={Boolean(failedSheet)} onClose={() => setSheet(null)} accessibilityLabel={t("add.batch.failedSheetTitle")}>
        {failedSheet ? (
          <FailedSheet card={failedSheet} busy={busy}
            onRetake={() => { setSheet(null); onRetake(failedSheet.cardId); }}
            onRetry={failedSheet.failure === "busy" ? () => { setSheet(null); void run(() => onRetry(failedSheet.cardId)); } : null}
            onTypeIn={() => { setSheet(null); setOpen(failedSheet.cardId); }}
            onSkip={() => { setSheet(null); void skipOne(failedSheet); }} />
        ) : null}
      </BottomSheet>
    </>
  );
}

/** b11 A1 ⑤ 読み取れなかった 1枚: the card (blurred), why, what could be read, then 撮り直す / 手入力で補う / スキップ. */
function FailedSheet({ card, busy, onRetake, onRetry, onTypeIn, onSkip }: { card: ScanCardView; busy: boolean; onRetake: () => void; onRetry: (() => void) | null; onTypeIn: () => void; onSkip: () => void }) {
  const { t } = useOrbitLocale();
  const { styles: k } = useScanKitStyles();
  const { styles: r } = useReadStyles();
  const parts = [
    { key: "org", label: t("add.batch.partOrg", { value: card.organization ? `${card.organization}${t("add.batch.partGuess")}` : "—" }), known: Boolean(card.organization) },
    { key: "name", label: t("add.batch.partName", { value: card.name || "—" }), known: Boolean(card.name) },
    { key: "contact", label: t("add.batch.partContact", { value: card.draft?.fields.email || card.draft?.fields.phone || "—" }), known: Boolean(card.draft?.fields.email || card.draft?.fields.phone) },
  ];
  return (
    <View testID="add-failed-sheet">
      <View style={r.sheetHead}>
        <View style={r.blurCard}><View style={r.blurLine1} /><View style={r.blurLine2} /><View style={r.blurLine3} /></View>
        <View style={r.nxMeta}>
          <UiText style={r.sheetTitle}>{t("add.batch.failedSheetTitle")}</UiText>
          <View style={r.why}><KitChip label={t(card.failure === "busy" ? "add.batch.failedBusy" : "add.batch.failedImage")} tone="coral" /></View>
        </View>
      </View>
      <View style={r.partCard}>
        <UiText style={k.lbl}>{t("add.batch.readPart")}</UiText>
        <View style={r.parts}>
          {parts.map((part) => <KitChip key={part.key} label={part.label} tone={part.known ? "apricot" : "neutral"} style={part.known ? undefined : r.partUnknown} />)}
        </View>
      </View>
      <View style={r.sheetActs}>
        {onRetry ? <SheetButton primary label={t("add.batch.retryRead")} disabled={busy} onPress={onRetry} /> : null}
        <SheetButton primary={!onRetry} icon="scan" label={t("add.batch.retakeOne")} disabled={busy} onPress={onRetake} testID="add-failed-retake" />
        <SheetButton icon="pen" label={t("add.batch.typeInPartial")} disabled={busy} onPress={onTypeIn} testID="add-failed-typein" />
        <SheetButton ghost label={t("add.batch.skip")} disabled={busy} onPress={onSkip} testID="add-failed-skip" />
      </View>
    </View>
  );
}

/** .btn.block（高 40、13px 700）/ .primary / .ghost。 */
function SheetButton({ label, onPress, primary = false, ghost = false, disabled = false, icon, testID }: { label: string; onPress: () => void; primary?: boolean; ghost?: boolean; disabled?: boolean; icon?: "scan" | "pen"; testID?: string }) {
  const { colors } = useScanKitStyles();
  const { styles: r } = useReadStyles();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} hitSlop={2} onPress={onPress}
      style={[r.block, primary ? r.blockPrimary : ghost ? r.blockGhost : null, disabled ? r.blockOff : null]} testID={testID}>
      {icon ? <Icon name={icon} size={16} color={primary ? colors.bg : colors.ink} /> : null}
      <UiText numberOfLines={1} style={[r.blockText, { color: primary ? colors.bg : ghost ? colors.ink2 : colors.ink }]}>{label}</UiText>
    </UiPressable>
  );
}

/** 10月7日（水）: the month, day and weekday from Intl, the shape from the dictionary. */
function longDate(iso: string, language: string, t: (key: "add.batch.metDate", values: { m: number; d: number; w: string }) => string): string {
  const date = new Date(iso);
  const weekday = date.toLocaleDateString(language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP", { weekday: "short" });
  return t("add.batch.metDate", { d: date.getDate(), m: date.getMonth() + 1, w: weekday });
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
            <KitDensityStack counts={view.density} countLabel={(n) => t("add.batch.peopleN", { n })} accessibilityLabel={([1, 2, 3] as const).map((level) => t("add.batch.doneDensityLevel", { label: t(DENSITY_LABEL[level]), n: view.density![level] })).join(" · ")} />
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
function FootButton({ label, onPress, waiting = false, disabled = false, icon, testID }: { label: string; onPress?: () => void; waiting?: boolean; disabled?: boolean; icon?: "users" | "scan"; testID?: string }) {
  const { colors } = useScanKitStyles();
  const { styles } = useReadStyles();
  return (
    <UiPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: waiting || disabled, busy: waiting }} disabled={waiting || disabled} onPress={onPress}
      style={[styles.xl, waiting ? styles.xlWait : styles.xlPrimary, disabled && !waiting ? styles.xlOff : null]} testID={testID}>
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
