/**
 * 新用户引导第 5 步「带入人脉」：名片 V2 批量导入整段嵌在引导页里，不跳去人脉页。
 *
 *   1. 选照片：人脉导入页同一个上传组件（BusinessCardIngestV2Start，onStarted 回调接住批次 id）。
 *   2. 正在解析（设计外新增）：上传 → 识别 → 核对三段进度 + 每张名片的实时状态；上传完自动开始识别。
 *   3. 识别后：没有任何疑点的名片自动导入（设计稿「识别可靠，已自动导入」），其余进入
 *      Network v2「10 名片确认」屏逐张确认；全部处理后显示本批小结。
 *
 * 接口全部沿用 /api/contact-drafts/business-card/batches/v2/**；确认载荷、回执核验、正反面冲突
 * 处理复用 ingest-v2-route-view-model 的同一套函数。批次 id 存在引导草稿里，刷新/返回可恢复。
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { IngestItemDTO } from "../../../../../features/acquisition/business-card-ingest-v2/contract";
import { BusinessCardIngestV2Start } from "../../contacts/ingest-v2/business-card-ingest-v2-start";
import {
  INGEST_V2_API_BASE,
  fetchBatchDetail,
  getPendingFiles,
  postAction,
  sha256OfFile,
  uploadItemContent,
  type IngestBatchDetail,
} from "../../contacts/ingest-v2/ingest-v2-client";
import { IngestV2PrivateImage } from "../../contacts/ingest-v2/ingest-v2-private-image";
import {
  buildConfirmationPayload,
  fieldCandidates,
  groupIngestItemsByCardId,
  initialCardDraft,
  readConfirmationReceipt,
  reconcileCardDraft,
  setDraftFieldSource,
  setManualDraftField,
  type IngestV2CardDraft,
  type IngestV2CardViewModel,
  type IngestV2Field,
} from "../../contacts/ingest-v2/ingest-v2-route-view-model";
import {
  INGEST_V2_FIELDS,
  cardReason,
  fieldTag,
  flaggedFields,
  isAutoImportEligible,
  isCardSkipped,
  needsReview,
  parseStage,
} from "./onboarding-card-model";
import type { Copy } from "./onboarding-model";

type T = (copy: Copy) => string;

const FIELD_LABELS: Record<IngestV2Field, Copy> = {
  displayName: { zh: "姓名", en: "Name" },
  organization: { zh: "公司", en: "Company" },
  role: { zh: "职位", en: "Title" },
  email: { zh: "邮箱", en: "Email" },
  phone: { zh: "电话", en: "Phone" },
};

// 本机账本：哪些卡是这次自动导入的、哪些经用户确认、哪些「稍后处理」。服务端只知道 confirmed/skipped，
// 区分不了来源；刷新后小结要保持一致，所以记在 localStorage（丢了也只影响计数口径）。
interface Ledger { auto: string[]; user: string[]; later: string[]; notified: boolean }
const LEDGER_PREFIX = "orbit.onboarding.cards.v1:";

function readLedger(batchId: string): Ledger {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${LEDGER_PREFIX}${batchId}`) ?? "null") as Partial<Ledger> | null;
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
    return { auto: list(parsed?.auto), later: list(parsed?.later), notified: parsed?.notified === true, user: list(parsed?.user) };
  } catch {
    return { auto: [], later: [], notified: false, user: [] };
  }
}

function writeLedger(batchId: string, ledger: Ledger): void {
  try {
    window.localStorage.setItem(`${LEDGER_PREFIX}${batchId}`, JSON.stringify(ledger));
  } catch {
    // 存储不可用时只影响刷新后的计数口径。
  }
}

export function OnboardingCardImport({
  available, batch, onBatchStarted, onBrowse, onReset, t,
}: {
  available: boolean;
  batch: OnboardingCardBatch;
  onBatchStarted: (batchId: string) => void;
  onBrowse: (target: "home" | "events") => void;
  onReset: () => void;
  t: T;
}) {
  if (!available) {
    return (
      <div className="ob-source ob-source-off">
        <span className="ob-source-glyph" aria-hidden>▭</span>
        <span className="ob-source-body">
          <strong>{t({ zh: "扫描名片夹", en: "Scan business cards" })}</strong>
          <span>{t({ zh: "名片识别暂未开放，之后可在人脉页使用", en: "Card recognition isn't available yet — use it later from Network" })}</span>
        </span>
      </div>
    );
  }
  if (!batch.batchId) {
    return (
      <div className="ob-import-start">
        <BusinessCardIngestV2Start onStarted={onBatchStarted} />
      </div>
    );
  }
  return <BatchView batch={batch} onBrowse={onBrowse} onReset={onReset} t={t} />;
}

/**
 * 批次状态机放在引导页这一层（不随第 5 步卸载）：离开这一步时上传、识别轮询、自动导入照常进行，
 * 解析完成的提醒（胶囊 / 弹窗）才能拿到真实数字。batchId 为 null 时什么都不做。
 */
export function useOnboardingCardBatch(batchId: string | null, t: T) {
  const [detail, setDetail] = useState<IngestBatchDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, IngestV2CardDraft>>({});
  const [ledger, setLedger] = useState<Ledger>(() => ({ auto: [], later: [], notified: false, user: [] }));
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set());
  const [autoRunning, setAutoRunning] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [side, setSide] = useState<"front" | "back">("front");
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadFailed, setUploadFailed] = useState(false);
  const pendingFiles = useRef<Map<string, File>>(new Map());
  const uploadingRef = useRef(false);
  const finalizingRef = useRef(false);
  const autoAttempted = useRef<Set<string>>(new Set());
  const intents = useRef<Record<string, { seed: string; id: string }>>({});

  const refresh = useCallback(async () => {
    if (!batchId) return;
    try {
      const next = await fetchBatchDetail(batchId);
      if (next) {
        setDetail(next);
        setLoadFailed(false);
      } else {
        setLoadFailed(true);
      }
    } catch {
      // 网络抖动保留上一次状态，下一轮轮询恢复。
    }
  }, [batchId]);

  useEffect(() => {
    // 换批次（再上传一批 / 重置）时清空上一批的全部内存状态。
    setDetail(null);
    setLoadFailed(false);
    setDrafts({});
    setDuplicates(new Set());
    setActiveId(null);
    setError("");
    setUploadFailed(false);
    autoAttempted.current = new Set();
    if (!batchId) {
      setLedger({ auto: [], later: [], notified: false, user: [] });
      return;
    }
    pendingFiles.current = getPendingFiles(batchId);
    setLedger(readLedger(batchId));
    void refresh();
  }, [batchId, refresh]);

  useEffect(() => {
    if (batchId) writeLedger(batchId, ledger);
  }, [batchId, ledger]);

  const status = detail?.batch.status;
  const items = useMemo(() => detail?.items ?? [], [detail?.items]);
  const cards = useMemo(() => groupIngestItemsByCardId(items), [items]);
  const fingerprint = cards.map(card => `${card.cardId}:${card.items.map(item => `${item.id}:${item.version}:${item.status}`).join(",")}`).join("|");

  useEffect(() => {
    setDrafts(previous => {
      const next: Record<string, IngestV2CardDraft> = {};
      for (const card of cards) {
        // 识别完成前不建草稿：空草稿会被 reconcileCardDraft 当成「用户清空」保留下来，
        // 识别结果就再也填不进来了。
        if (!card.reviewable) continue;
        const prior = previous[card.cardId];
        next[card.cardId] = prior ? reconcileCardDraft(prior, card) : initialCardDraft(card);
      }
      return next;
    });
    // 以卡片指纹为准重算，避免轮询返回同样数据时反复重建草稿。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  // 上传与识别阶段轮询；识别结束后停止。
  useEffect(() => {
    if (status !== "collecting" && status !== "processing") return;
    const timer = setInterval(() => void refresh(), 2_500);
    return () => clearInterval(timer);
  }, [status, refresh]);

  // ── 上传（与名片夹复核页同一策略：每波 3 张，失败即停，等用户重试）──
  const pumpUploads = useCallback(async () => {
    if (!batchId || uploadingRef.current) return;
    uploadingRef.current = true;
    setUploadFailed(false);
    try {
      for (;;) {
        const current = await fetchBatchDetail(batchId);
        if (!current || current.batch.status !== "collecting") break;
        setDetail(current);
        const uploadable = current.items.filter(item => item.status === "awaiting_upload" && pendingFiles.current.has(item.clientDigest));
        if (!uploadable.length) break;
        let failed = false;
        await Promise.all(uploadable.slice(0, 3).map(async item => {
          const file = pendingFiles.current.get(item.clientDigest);
          if (!file) return;
          const result = await uploadItemContent({ batchId, file, itemId: item.id });
          if (!result.ok) failed = true;
          if (result.errorCode?.startsWith("IMAGE_INVALID")) pendingFiles.current.delete(item.clientDigest);
        }));
        if (failed) {
          setUploadFailed(true);
          break;
        }
      }
    } finally {
      uploadingRef.current = false;
      await refresh();
    }
  }, [batchId, refresh]);

  useEffect(() => {
    if (status === "collecting" && pendingFiles.current.size > 0) void pumpUploads();
  }, [status, pumpUploads]);

  // 全部上传完就自动开始识别（引导里不再多一步「开始识别」）。
  useEffect(() => {
    if (!batchId || status !== "collecting" || finalizingRef.current || uploadingRef.current) return;
    const awaiting = items.filter(item => item.status === "awaiting_upload").length;
    const uploaded = items.filter(item => item.status === "uploaded").length;
    if (awaiting > 0 || uploaded === 0) return;
    finalizingRef.current = true;
    void postAction(`/${batchId}/finalize`).finally(() => {
      finalizingRef.current = false;
      void refresh();
    });
  }, [batchId, items, refresh, status]);

  async function reattach(fileList: FileList | null) {
    for (const file of Array.from(fileList ?? [])) {
      pendingFiles.current.set(await sha256OfFile(file), file);
    }
    void pumpUploads();
  }

  // ── 确认 ──
  const confirmCard = useCallback(async (card: IngestV2CardViewModel, draft: IngestV2CardDraft, allowDuplicate: boolean): Promise<"created" | "duplicate" | "blocked" | "failed"> => {
    const manual = card.hasTerminalFailure || !card.allExtracted;
    const seed = JSON.stringify({ allowDuplicate, draft, items: card.items.map(item => [item.id, item.version]), manual });
    const known = intents.current[card.cardId];
    const intentId = known && known.seed === seed ? known.id : crypto.randomUUID();
    intents.current[card.cardId] = { id: intentId, seed };
    const prepared = buildConfirmationPayload(card, draft, intentId, allowDuplicate, manual);
    if (!batchId || !prepared.payload) return "blocked";
    const response = await postAction(`/${batchId}/items/${card.items[0]!.id}/${manual ? "manual-entry" : "confirm"}`, prepared.payload);
    const body = (await response.json().catch(() => null)) as { data?: { state?: string; contactId?: string; item?: IngestItemDTO; items?: IngestItemDTO[] } } | null;
    if (!response.ok) return "failed";
    if (body?.data?.state === "duplicate_review") return "duplicate";
    return readConfirmationReceipt(body?.data ?? {}, card).ok ? "created" : "failed";
  }, [batchId]);

  // ── 识别完成后：没有疑点的卡自动导入 ──
  useEffect(() => {
    if (!batchId || status !== "ready_for_review" || autoRunning) return;
    const eligible = cards.filter(card => {
      const draft = drafts[card.cardId];
      return draft && !autoAttempted.current.has(card.cardId) && isAutoImportEligible(card, draft);
    });
    if (!eligible.length) return;
    setAutoRunning(true);
    void (async () => {
      for (const card of eligible) {
        autoAttempted.current.add(card.cardId);
        const result = await confirmCard(card, drafts[card.cardId]!, false).catch(() => "failed" as const);
        if (result === "created") setLedger(current => ({ ...current, auto: [...new Set([...current.auto, card.cardId])] }));
        if (result === "duplicate") setDuplicates(current => new Set(current).add(card.cardId));
      }
      await refresh();
      setAutoRunning(false);
    })();
  }, [autoRunning, cards, confirmCard, drafts, refresh, status]);

  // ── 派生：复核队列与小结 ──
  const autoSet = useMemo(() => new Set(ledger.auto), [ledger.auto]);
  const queue = useMemo(
    () => cards.filter(card => !autoSet.has(card.cardId) && (needsReview(card, autoSet) || ledger.user.includes(card.cardId) || (isCardSkipped(card) && card.items.some(item => item.status === "skipped")))),
    [autoSet, cards, ledger.user],
  );
  const laterSet = useMemo(() => new Set(ledger.later), [ledger.later]);
  const isHandled = useCallback((card: IngestV2CardViewModel) => card.allConfirmed || isCardSkipped(card) || laterSet.has(card.cardId), [laterSet]);
  const pending = queue.filter(card => !isHandled(card));
  const stage = parseStage(status);
  const reviewing = Boolean(status) && stage === "review" && !autoRunning && status !== "cancelled" && status !== "expired";
  const finished = reviewing && pending.length === 0;
  const active = queue.find(card => card.cardId === activeId && !isHandled(card)) ?? pending[0] ?? null;

  const autoCount = cards.filter(card => autoSet.has(card.cardId) && card.allConfirmed).length;
  const userCount = queue.filter(card => card.allConfirmed).length;
  const setAside = queue.filter(card => !card.allConfirmed && (isCardSkipped(card) || laterSet.has(card.cardId))).length;

  const laterCount = queue.filter(card => !card.allConfirmed && !isCardSkipped(card) && laterSet.has(card.cardId)).length;
  const settledCount = cards.filter(card => card.items.every(item => ["extracted", "terminal_failed", "confirmed", "skipped", "excluded"].includes(item.status))).length;
  const missing = status === "collecting" ? items.filter(item => item.status === "awaiting_upload" && !pendingFiles.current.has(item.clientDigest)).length : 0;
  // 「解析完成」提醒只弹一次（记在本机账本里，刷新不重复弹）。
  const markNotified = useCallback(() => setLedger(current => (current.notified ? current : { ...current, notified: true })), []);

  function moveOn(from: IngestV2CardViewModel) {
    const index = queue.findIndex(card => card.cardId === from.cardId);
    const next = [...queue.slice(index + 1), ...queue.slice(0, index)].find(card => !isHandled(card) && card.cardId !== from.cardId);
    setActiveId(next?.cardId ?? null);
    setSide("front");
    setZoom(false);
  }

  async function act(kind: "confirm" | "duplicate-new" | "skip" | "later") {
    if (!batchId || !active || busy) return;
    const draft = drafts[active.cardId] ?? initialCardDraft(active);
    setError("");
    if (kind === "later") {
      setLedger(current => ({ ...current, later: [...new Set([...current.later, active.cardId])] }));
      moveOn(active);
      return;
    }
    setBusy(true);
    try {
      if (kind === "skip") {
        const response = await postAction(`/${batchId}/items/${active.items[0]!.id}/skip`);
        if (!response.ok) throw new Error("skip_failed");
        moveOn(active);
      } else {
        const result = await confirmCard(active, draft, kind === "duplicate-new");
        if (result === "created") {
          setLedger(current => ({ ...current, user: [...new Set([...current.user, active.cardId])] }));
          setDuplicates(current => {
            const next = new Set(current);
            next.delete(active.cardId);
            return next;
          });
          moveOn(active);
        } else if (result === "duplicate") {
          setDuplicates(current => new Set(current).add(active.cardId));
        } else if (result === "blocked") {
          setError(t(draft.conflictedFields.length
            ? { zh: "正反面识别结果不一致，请为标出的字段选一个值或直接填写。", en: "The two sides disagree — pick a value or type one for the flagged fields." }
            : !draft.fields.displayName.trim()
              ? { zh: "请先填写姓名再确认。", en: "Add a name before confirming." }
              : { zh: "这张名片的数据已过期，请刷新后再确认。", en: "This card's data changed — refresh and try again." }));
        } else {
          setError(t({ zh: "没有保存成功，请重试。", en: "That didn't save — please try again." }));
        }
      }
      await refresh();
    } catch {
      setError(t({ zh: "没有保存成功，请重试。", en: "That didn't save — please try again." }));
    } finally {
      setBusy(false);
    }
  }

  function openCard(cardId: string) {
    setLedger(current => ({ ...current, later: current.later.filter(id => id !== cardId) }));
    setActiveId(cardId);
    setSide("front");
    setZoom(false);
    setError("");
  }

  return {
    act, active, autoCount, autoRunning, batchId, busy, cards, detail, drafts, duplicates, error, finished, isHandled,
    laterCount, laterSet, loadFailed, markNotified, missing, notified: ledger.notified, openCard, pending, pumpUploads,
    queue, reattach, reviewing, setAside, setDrafts, setSide, setZoom, settledCount, side, stage, status, uploadFailed, userCount, zoom,
  };
}

export type OnboardingCardBatch = ReturnType<typeof useOnboardingCardBatch>;

function BatchView({ batch, onBrowse, onReset, t }: { batch: OnboardingCardBatch; onBrowse: (target: "home" | "events") => void; onReset: () => void; t: T }) {
  const {
    act, active, autoCount, autoRunning, busy, cards, detail, drafts, duplicates, error, finished, isHandled,
    laterCount, laterSet, loadFailed, missing, openCard, pending, pumpUploads, queue, reattach, reviewing, setAside,
    setDrafts, setSide, setZoom, settledCount, side, stage, status, uploadFailed, userCount, zoom,
  } = batch;
  const batchId = batch.batchId!;
  const reattachRef = useRef<HTMLInputElement | null>(null);

  // 回车确认（设计稿 ↵），输入框内也生效；按钮/多行文本不拦截。
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    if (!reviewing || finished) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key !== "Enter" || event.isComposing || target?.tagName === "TEXTAREA" || target?.tagName === "BUTTON") return;
      event.preventDefault();
      void actRef.current(duplicates.has(active?.cardId ?? "") ? "duplicate-new" : "confirm");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active?.cardId, duplicates, finished, reviewing]);

  if (!detail) {
    return loadFailed ? (
      <div className="ob-notice ob-notice-warning" role="alert">
        {t({ zh: "这批名片读取不到了（可能已过期）。", en: "This batch can't be loaded (it may have expired)." })}
        <button className="btn ob-btn-soft" onClick={onReset} type="button">{t({ zh: "重新上传", en: "Upload again" })}</button>
      </div>
    ) : <ParsingPanel autoRunning={false} cards={[]} drafts={{}} missing={0} onBrowse={onBrowse} onReattach={() => undefined} onRetry={() => undefined} settled={0} stage="upload" t={t} total={0} uploadFailed={false} />;
  }

  if (status === "cancelled" || status === "expired") {
    return (
      <div className="ob-notice ob-notice-warning" role="alert">
        {status === "expired" ? t({ zh: "这批名片已过期，已确认的联系人都保留了。", en: "This batch expired; confirmed contacts were kept." }) : t({ zh: "这批名片已取消。", en: "This batch was cancelled." })}
        <button className="btn ob-btn-soft" onClick={onReset} type="button">{t({ zh: "重新上传", en: "Upload again" })}</button>
      </div>
    );
  }

  if (!reviewing) {
    return (
      <>
        <input accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="ob-sr" multiple onChange={event => { void reattach(event.target.files); event.target.value = ""; }} ref={reattachRef} tabIndex={-1} type="file" aria-hidden />
        <ParsingPanel
          autoRunning={autoRunning}
          cards={cards}
          drafts={drafts}
          missing={missing}
          onBrowse={onBrowse}
          settled={settledCount}
          onReattach={() => reattachRef.current?.click()}
          onRetry={() => void pumpUploads()}
          stage={stage}
          t={t}
          total={cards.length}
          uploadFailed={uploadFailed}
        />
      </>
    );
  }

  if (finished || !active) {
    return <FinishedPanel autoCount={autoCount} laterCount={laterCount} onReset={onReset} setAside={setAside} t={t} total={cards.length} userCount={userCount} />;
  }

  const draft = drafts[active.cardId] ?? initialCardDraft(active);
  const baseline = initialCardDraft(active);
  const flagged = flaggedFields(active, draft);
  const duplicate = duplicates.has(active.cardId);
  const handledCount = queue.filter(isHandled).length;
  const remainingAfter = pending.filter(card => card.cardId !== active.cardId).length;
  const unresolved = [...flagged].filter(field => draft.fields[field] === baseline.fields[field]).length;
  const shownItem = active.items.find(item => item.side === side) ?? active.items[0]!;
  const reason = cardReason(active, draft, duplicate);

  return (
    <div className="ob-review" data-screen-label="10 名片确认">
      <div className="ob-review-top">
        <div className="ob-review-head">
          <h3 className="ob-review-h">{t({ zh: "确认名片识别结果", en: "Confirm the recognized cards" })}</h3>
          <p className="ob-p">
            {autoCount
              ? t({ zh: `本批 ${cards.length} 张。${autoCount} 张识别可靠，已自动导入；下面 ${queue.length} 张不太确定，请对照照片逐张确认。`, en: `${cards.length} cards. ${autoCount} were clear and imported automatically; please check the ${queue.length} below against the photo.` })
              : t({ zh: `本批 ${cards.length} 张，下面 ${queue.length} 张不太确定，请对照照片逐张确认。`, en: `${cards.length} cards — please check the ${queue.length} below against the photo.` })}
          </p>
        </div>
        <div className="ob-review-stats">
          <span className="ob-stat ob-stat-green"><strong>{autoCount}</strong><span>{t({ zh: "已自动导入", en: "Auto-imported" })}</span></span>
          <span className="ob-stat ob-stat-indigo"><strong>{handledCount} / {queue.length}</strong><span>{t({ zh: "已确认", en: "Checked" })}</span></span>
        </div>
      </div>

      <div className="ob-queue">
        {queue.map((card, index) => {
          const cardDraft = drafts[card.cardId] ?? initialCardDraft(card);
          const on = card.cardId === active.cardId;
          const state = card.allConfirmed
            ? { copy: { zh: "✓ 已确认", en: "✓ Confirmed" }, tone: "ok" }
            : isCardSkipped(card)
              ? { copy: { zh: "已删除", en: "Removed" }, tone: "muted" }
              : laterSet.has(card.cardId)
                ? { copy: { zh: "稍后处理", en: "Later" }, tone: "later" }
                : { copy: cardReason(card, cardDraft, duplicates.has(card.cardId)), tone: "plain" };
          return (
            <button
              className={`btn ob-queue-item${on ? " ob-queue-on" : ""}`}
              disabled={isHandled(card) && !laterSet.has(card.cardId)}
              key={card.cardId}
              onClick={() => openCard(card.cardId)}
              type="button"
            >
              <span className="ob-queue-n">{index + 1}</span>
              <span className="ob-queue-copy">
                <strong>{cardDraft.fields.displayName.trim() || t({ zh: "未识别姓名", en: "No name" })}</strong>
                <span className={`ob-queue-st ob-queue-st-${state.tone}`}>{t(state.copy)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="ob-review-grid">
        <section className="ob-photo-panel">
          <div className="ob-photo-top">
            <span className="ob-photo-file">{queue.findIndex(card => card.cardId === active.cardId) + 1} / {queue.length} · {shownItem.sourceFileName}</span>
            <span className="ob-photo-reason">⚠ {t(reason)}</span>
          </div>
          <div className="ob-photo-stage">
            <div className="ob-photo-frame" style={{ transform: `scale(${zoom ? 1.35 : 1})` }}>
              {shownItem.derivativeObjectKey && shownItem.imageDigest ? (
                <IngestV2PrivateImage
                  alt={shownItem.sourceFileName}
                  errorLabel={t({ zh: "照片暂时无法显示", en: "Photo unavailable" })}
                  expiredLabel={t({ zh: "照片已过期", en: "Photo expired" })}
                  key={`${shownItem.id}:${shownItem.version}`}
                  loadingLabel={t({ zh: "正在加载照片…", en: "Loading photo…" })}
                  src={`${INGEST_V2_API_BASE}/${batchId}/items/${shownItem.id}/image`}
                />
              ) : <span className="ob-photo-missing">{t({ zh: "这张照片没有可显示的图像", en: "No image to show for this photo" })}</span>}
            </div>
          </div>
          <div className="ob-photo-foot">
            <span>
              {active.isTwoSided ? (
                <span className="ob-side-toggle">
                  {(["front", "back"] as const).map(value => (
                    <button className={`btn ob-side-btn${side === value ? " ob-side-on" : ""}`} key={value} onClick={() => setSide(value)} type="button">{value === "front" ? t({ zh: "正面", en: "Front" }) : t({ zh: "反面", en: "Back" })}</button>
                  ))}
                </span>
              ) : t({ zh: "对照照片核对右侧字段", en: "Check the fields against the photo" })}
            </span>
            <button className="btn ob-photo-zoom" onClick={() => setZoom(value => !value)} type="button">{zoom ? t({ zh: "缩小", en: "Zoom out" }) : t({ zh: "放大查看", en: "Zoom in" })}</button>
          </div>
        </section>

        <section className="ob-fields-panel">
          <div className="ob-fields-head">
            <span className="ob-fields-title">
              <strong>{t({ zh: "识别出的文字", en: "Recognized text" })}</strong>
              <span>{duplicate
                ? t({ zh: "文字识别可靠，但可能与已有联系人重复。", en: "The text looks right, but this may be someone you already have." })
                : unresolved
                  ? t({ zh: "黄色字段需要核对，请对照左侧照片。", en: "Check the amber fields against the photo." })
                  : t({ zh: "需要核对的字段已处理，确认后进入下一张。", en: "Flagged fields are handled — confirm to move on." })}</span>
            </span>
            <span className={`ob-check-chip${unresolved ? "" : " ob-check-chip-ok"}`}>
              {unresolved ? t({ zh: `${unresolved} 处需核对`, en: `${unresolved} to check` }) : t({ zh: "已核对", en: "Checked" })}
            </span>
          </div>

          {duplicate ? (
            <div className="ob-dup">
              <span className="ob-dup-text"><span className="ob-spark" aria-hidden>✦</span><span>{t({ zh: "人脉里可能已经有这个人了。", en: "This person may already be in your network." })}</span></span>
              <div className="ob-chips">
                <button className="btn ob-dup-btn" disabled={busy} onClick={() => void act("duplicate-new")} type="button">{t({ zh: "仍作为新联系人", en: "Add as new contact" })}</button>
                <button className="btn ob-dup-btn" disabled={busy} onClick={() => void act("skip")} type="button">{t({ zh: "已经有了，跳过这张", en: "Already have them — skip" })}</button>
              </div>
            </div>
          ) : null}

          {active.hasTerminalFailure ? (
            <div className="ob-notice ob-notice-warning">{t({ zh: "这张没有识别出来，可以对照照片手动填写，或者跳过。", en: "This one wasn't recognized — type it in from the photo, or skip it." })}</div>
          ) : null}

          {INGEST_V2_FIELDS.map(field => {
            const value = draft.fields[field];
            const edited = value !== baseline.fields[field] && draft.fieldSources[field] === null;
            const tag = fieldTag({ edited, flagged: flagged.has(field), value });
            const alternatives = [...new Set(active.items.flatMap(item => fieldCandidates(item).filter(candidate => candidate.field === field).map(candidate => candidate.value)))]
              .filter(candidate => candidate !== value);
            return (
              <div className={`ob-rfield ob-rfield-${tag.kind}`} key={field}>
                <span className="ob-rfield-head"><span>{t(FIELD_LABELS[field])}</span><span className={`ob-rtag ob-rtag-${tag.kind}`}>{t(tag.label)}</span></span>
                <input
                  aria-label={t(FIELD_LABELS[field])}
                  className="ob-rinput"
                  disabled={busy}
                  onChange={event => setDrafts(current => ({ ...current, [active.cardId]: setManualDraftField(current[active.cardId] ?? draft, field, event.target.value) }))}
                  placeholder={value ? "" : t({ zh: "未识别到，请对照照片填写", en: "Not found — type it from the photo" })}
                  value={value}
                />
                {alternatives.length && !edited ? (
                  <span className="ob-alts">
                    {t({ zh: "可能是", en: "Maybe" })}
                    {alternatives.map(alternative => {
                      const candidate = active.items.flatMap(item => fieldCandidates(item)).find(entry => entry.field === field && entry.value === alternative)!;
                      return <button className="btn ob-alt" key={alternative} onClick={() => setDrafts(current => ({ ...current, [active.cardId]: setDraftFieldSource(current[active.cardId] ?? draft, field, candidate) }))} type="button">{alternative}</button>;
                    })}
                  </span>
                ) : null}
              </div>
            );
          })}

          {error ? <div className="ob-notice ob-notice-error" role="alert">{error}</div> : null}

          <div className="ob-review-actions">
            <button className="btn ob-review-confirm" disabled={busy} onClick={() => void act(duplicate ? "duplicate-new" : "confirm")} type="button">
              {busy
                ? t({ zh: "保存中…", en: "Saving…" })
                : remainingAfter
                  ? unresolved ? t({ zh: "照原样确认，下一张", en: "Confirm as is, next" }) : t({ zh: "确认无误，下一张", en: "Looks right, next" })
                  : t({ zh: "确认，完成本批", en: "Confirm and finish" })}
              <span className="ob-kbd" aria-hidden>↵</span>
            </button>
            <div className="ob-review-minor">
              <button className="btn ob-btn-ghost ob-btn-ghost-sm" disabled={busy || queue.length < 2} onClick={() => {
                const index = queue.findIndex(card => card.cardId === active.cardId);
                const previous = [...queue.slice(0, index).reverse(), ...queue.slice(index + 1).reverse()].find(card => !card.allConfirmed && !isCardSkipped(card));
                if (previous) openCard(previous.cardId);
              }} type="button">{t({ zh: "← 上一张", en: "← Previous" })}</button>
              <span className="ob-review-links">
                <button className="btn ob-text-btn" disabled={busy} onClick={() => void act("later")} type="button">{t({ zh: "稍后处理", en: "Later" })}</button>
                <button className="btn ob-text-btn ob-text-danger" disabled={busy} onClick={() => void act("skip")} type="button">{t({ zh: "不是名片，删除", en: "Not a card — remove" })}</button>
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );}

// ── 正在解析（设计外新增）：三段进度 + 名片墙，每张卡按真实状态变化 ──
function ParsingPanel({
  autoRunning, cards, drafts, missing, onBrowse, onReattach, onRetry, settled, stage, t, total, uploadFailed,
}: {
  autoRunning: boolean;
  cards: IngestV2CardViewModel[];
  drafts: Record<string, IngestV2CardDraft>;
  missing: number;
  onBrowse: (target: "home" | "events") => void;
  onReattach: () => void;
  settled: number;
  onRetry: () => void;
  stage: "upload" | "recognize" | "review";
  t: T;
  total: number;
  uploadFailed: boolean;
}) {
  const itemsAll = cards.flatMap(card => card.items);
  const uploaded = itemsAll.filter(item => item.status !== "awaiting_upload").length;
  const percent = !total ? 4
    : stage === "upload" ? Math.max(4, Math.round((uploaded / Math.max(itemsAll.length, 1)) * 30))
      : stage === "recognize" ? 30 + Math.round((settled / total) * 62)
        : 96;
  const steps: { key: "upload" | "recognize" | "review"; label: Copy }[] = [
    { key: "upload", label: { zh: "上传照片", en: "Upload" } },
    { key: "recognize", label: { zh: "识别文字", en: "Read text" } },
    { key: "review", label: { zh: "整理核对", en: "Sort & check" } },
  ];
  const order = ["upload", "recognize", "review"];
  // 名片 V2 worker 实测每张约 5–15 秒（并发处理），按 10 秒/张粗估，至少 1 分钟。
  const minutes = Math.max(1, Math.round(((total - settled) * 10) / 60));
  const current = order.indexOf(stage);
  const sub = stage === "upload"
    ? t({ zh: `正在上传 ${uploaded} / ${itemsAll.length || total} 张照片，传完会自动开始识别。`, en: `Uploading ${uploaded} / ${itemsAll.length || total} photos — recognition starts automatically.` })
    : stage === "recognize"
      ? t({ zh: `大约需要 ${minutes} 分钟，不用等在这里。解析完成后会提醒你——只有识别不确定的几张需要你看一眼。`, en: `About ${minutes} min — no need to wait here. We'll let you know when it's done; only the uncertain cards need a look.` })
      : t({ zh: "正在把识别可靠的名片直接导入，其余的马上交给你确认…", en: "Importing the clear cards; the rest are coming to you for a quick check…" });

  return (
    <div className="ob-parse" aria-live="polite" data-screen-label="10a 正在解析">
      <div className="ob-parse-head">
        <span className="ob-kicker">{stage === "upload" ? t({ zh: `正在上传 · 共 ${total || "…"} 张`, en: `Uploading · ${total || "…"} cards` }) : t({ zh: `✓ 已接收 ${total} 张名片照片`, en: `✓ ${total} card photos received` })}</span>
        <h3 className="ob-review-h">{autoRunning ? t({ zh: "快好了，正在整理结果", en: "Almost there — sorting results" }) : t({ zh: "名片正在后台批量解析。", en: "Your cards are being read in the background." })}</h3>
        <p className="ob-p">{sub}</p>
      </div>
      <div className="ob-parse-steps">
        {steps.map((step, index) => (
          <span className={`ob-parse-step${index < current ? " ob-parse-step-done" : index === current ? " ob-parse-step-on" : ""}`} key={step.key}>
            <span className="ob-parse-dot" aria-hidden>{index < current ? "✓" : index + 1}</span>
            {t(step.label)}
          </span>
        ))}
      </div>
      {stage !== "upload" ? (
        <span className="ob-parse-count"><span>{t({ zh: `已解析 ${settled} / ${total}`, en: `${settled} / ${total} read` })}</span><span>{total ? Math.round((settled / total) * 100) : 0}%</span></span>
      ) : null}
      <span className="ob-parse-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></span>
      {missing > 0 ? (
        <div className="ob-notice ob-notice-warning">
          {t({ zh: `页面刷新过，还有 ${missing} 张照片需要重新选择（选同一批即可，会按内容自动匹配）。`, en: `The page reloaded — re-select ${missing} photo(s) (same ones; they're matched by content).` })}
          <button className="btn ob-btn-soft" onClick={onReattach} type="button">{t({ zh: "重新选择照片", en: "Re-select photos" })}</button>
        </div>
      ) : null}
      {uploadFailed ? (
        <div className="ob-notice ob-notice-warning">
          {t({ zh: "有照片没传上去。", en: "Some photos didn't upload." })}
          <button className="btn ob-btn-soft" onClick={onRetry} type="button">{t({ zh: "重试上传", en: "Retry upload" })}</button>
        </div>
      ) : null}
      <div className="ob-parse-wall">
        {(cards.length ? cards : Array.from({ length: 3 }, () => null)).map((card, index) => {
          if (!card) return <span className="ob-mini ob-mini-wait" key={`ph-${index}`}><span className="ob-mini-lines" aria-hidden><i /><i /><i /></span></span>;
          const statuses = card.items.map(item => item.status);
          const kind = statuses.every(value => value === "extracted" || value === "confirmed")
            ? "done"
            : statuses.some(value => value === "terminal_failed")
              ? "fail"
              : statuses.some(value => value === "processing")
                ? "reading"
                : statuses.some(value => value === "awaiting_upload")
                  ? "upload"
                  : "wait";
          const fields = drafts[card.cardId]?.fields;
          const label: Copy = kind === "done" ? { zh: "已识别", en: "Read" } : kind === "fail" ? { zh: "识别失败", en: "Failed" } : kind === "reading" ? { zh: "识别中", en: "Reading" } : kind === "upload" ? { zh: "上传中", en: "Uploading" } : { zh: "排队中", en: "Queued" };
          return (
            <span className={`ob-mini ob-mini-${kind}`} key={card.cardId}>
              {kind === "reading" ? <span className="ob-mini-scan" aria-hidden /> : null}
              {kind === "done" && fields?.displayName ? (
                <span className="ob-mini-text"><strong>{fields.displayName}</strong><span>{fields.organization || fields.role || "—"}</span></span>
              ) : <span className="ob-mini-lines" aria-hidden><i /><i /><i /></span>}
              <span className="ob-mini-foot"><span className="ob-mini-name">{card.items[0]?.sourceFileName}</span><span className={`ob-mini-st ob-mini-st-${kind}`}>{t(label)}</span></span>
            </span>
          );
        })}
      </div>
      {stage !== "upload" ? (
        <div className="ob-parse-wait">
          <span>{t({ zh: "等待的时候，可以先", en: "While you wait, you can" })}</span>
          <div className="ob-actions ob-actions-tight">
            <button className="btn ob-btn-dark" onClick={() => onBrowse("events")} type="button">{t({ zh: "看看近期活动", en: "Browse upcoming events" })}</button>
            <button className="btn ob-btn-outline" onClick={() => onBrowse("home")} type="button">{t({ zh: "去 iOrbit 探索", en: "Explore iOrbit" })}</button>
          </div>
        </div>
      ) : null}
      <div className="ob-tip ob-tip-sm">
        <span className="ob-spark" aria-hidden>⛨</span>
        <span>{t({ zh: "只有没有疑点的名片会自动导入；拿不准的会交给你逐张确认。Orbit 不会以你的名义给任何人发消息。", en: "Only cards with no doubts are imported automatically; anything uncertain comes to you. Orbit never messages anyone on your behalf." })}</span>
      </div>
    </div>
  );
}

// ── 解析提醒（新用户引导.dc.html 621–650 行）：离开解析界面时的进度胶囊、解析完成弹窗、待确认胶囊 ──
export function CardBatchReminders({ batch, onOpen, t, viewingImport }: { batch: OnboardingCardBatch; onOpen: () => void; t: T; viewingImport: boolean }) {
  const { autoCount, autoRunning, cards, markNotified, notified, pending, reviewing, settledCount, status } = batch;
  // 正在看第 5 步时，进度与确认界面就在眼前：进入确认界面即视为已提醒，不再弹窗。
  useEffect(() => {
    if (viewingImport && reviewing && !autoRunning && !notified) markNotified();
  }, [autoRunning, markNotified, notified, reviewing, viewingImport]);
  if (!batch.batchId || !batch.detail || status === "cancelled" || status === "expired" || viewingImport) return null;
  const total = cards.length;
  const parsing = !reviewing;
  const percent = total ? Math.round((settledCount / total) * 100) : 0;
  const showModal = reviewing && !notified && !autoRunning;

  if (showModal) {
    return (
      <div className="ob-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="ob-parse-done-title">
        <div className="ob-modal">
          <button aria-label={t({ zh: "关闭", en: "Close" })} className="btn ob-modal-close" onClick={markNotified} type="button">×</button>
          <span className="ob-modal-badge" aria-hidden>✓</span>
          <div className="ob-head">
            <h2 className="ob-modal-title" id="ob-parse-done-title">{t({ zh: `${total} 张名片解析完毕`, en: `${total} cards read` })}</h2>
            <p className="ob-p ob-p-sm">{pending.length
              ? t({ zh: "识别可靠的已自动导入。还有几张不太确定，需要你对照照片看一眼，大约 1 分钟。", en: "The clear ones are already imported. A few are uncertain — check them against the photo, about a minute." })
              : t({ zh: "全部识别可靠，已自动导入你的人脉。", en: "All of them were clear and are now in your network." })}</p>
          </div>
          <div className="ob-modal-stats">
            <span className="ob-fin-stat"><strong>{autoCount}</strong><span>{t({ zh: "已自动导入", en: "Auto-imported" })}</span></span>
            <span className="ob-fin-stat ob-fin-stat-amber"><strong>{pending.length}</strong><span>{t({ zh: "需要你确认", en: "Need your check" })}</span></span>
          </div>
          <div className="ob-modal-actions">
            <button className="btn ob-review-confirm" onClick={() => { markNotified(); onOpen(); }} type="button">
              {pending.length ? t({ zh: `去确认 ${pending.length} 张名片`, en: `Check ${pending.length} card(s)` }) : t({ zh: "查看结果", en: "See results" })}
            </button>
            <button className="btn ob-text-btn ob-modal-later" onClick={markNotified} type="button">{t({ zh: "稍后再说", en: "Later" })}</button>
          </div>
        </div>
      </div>
    );
  }

  if (parsing) {
    return (
      <button className="btn ob-float-pill" onClick={onOpen} type="button">
        <span className="ob-spark" aria-hidden>✦</span>
        <span className="ob-float-copy">
          <span>{status === "collecting" ? t({ zh: "正在上传名片", en: "Uploading cards" }) : t({ zh: `正在解析名片 ${settledCount}/${total}`, en: `Reading cards ${settledCount}/${total}` })}</span>
          <span className="ob-float-track"><span style={{ width: `${status === "collecting" ? 8 : percent}%` }} /></span>
        </span>
      </button>
    );
  }

  if (pending.length > 0) {
    return (
      <button className="btn ob-float-pill ob-float-pill-dark" onClick={onOpen} type="button">
        {t({ zh: `${pending.length} 张名片待你确认 →`, en: `${pending.length} card(s) to check →` })}
      </button>
    );
  }
  return null;
}

function FinishedPanel({ autoCount, laterCount, onReset, setAside, t, total, userCount }: { autoCount: number; laterCount: number; onReset: () => void; setAside: number; t: T; total: number; userCount: number }) {
  return (
    <section className="ob-fin">
      <div className="ob-head">
        <span className="ob-fin-kicker">{t({ zh: "✓ 本批名片已全部处理", en: "✓ This batch is done" })}</span>
        <h3 className="ob-review-h">{t({ zh: `本批 ${total} 张名片，${autoCount + userCount} 位联系人已进入你的人脉。`, en: `${total} cards — ${autoCount + userCount} contacts are now in your network.` })}</h3>
      </div>
      <div className="ob-fin-stats">
        <span className="ob-fin-stat"><strong>{autoCount}</strong><span>{t({ zh: "自动导入", en: "Auto-imported" })}</span></span>
        <span className="ob-fin-stat ob-fin-stat-indigo"><strong>{userCount}</strong><span>{t({ zh: "经你确认", en: "Confirmed by you" })}</span></span>
        <span className="ob-fin-stat"><strong>{setAside}</strong><span>{t({ zh: "稍后处理 / 已删除", en: "Later / removed" })}</span></span>
      </div>
      {laterCount ? <span className="ob-label-note ob-privacy">{t({ zh: `${laterCount} 张「稍后处理」的名片会留在人脉 → 导入人脉里，随时可以继续确认。`, en: `${laterCount} card(s) set aside stay under Network → Import, ready whenever you are.` })}</span> : null}
      <div className="ob-actions">
        <button className="btn ob-link-under ob-link-under-strong" onClick={onReset} type="button">{t({ zh: "再上传一批名片", en: "Upload another batch" })}</button>
      </div>
    </section>
  );
}
