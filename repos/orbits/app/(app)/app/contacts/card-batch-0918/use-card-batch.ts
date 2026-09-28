/**
 * 名片批量导入的状态机 hook（新用户引导 / 人脉导入 / 全站提醒共用）。
 * 接口沿用 /api/contact-drafts/business-card/batches/v2/**；确认载荷、回执核验、正反面冲突处理复用
 * ingest-v2-route-view-model 的同一套函数。最后一张照片上传后服务端自动开始识别。
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { IngestItemDTO } from "../../../../../features/acquisition/business-card-ingest-v2/contract";
import type { IngestContactCandidateContract } from "../../../../../shared/contract/business-card-batch";
import {
  INGEST_V2_API_BASE,
  fetchBatchDetail,
  getPendingFiles,
  postAction,
  sha256OfFile,
  uploadItemContent,
  type IngestBatchDetail,
} from "../ingest-v2/ingest-v2-client";
import {
  buildConfirmationPayload,
  groupIngestItemsByCardId,
  initialCardDraft,
  readConfirmationReceipt,
  reconcileCardDraft,
  type IngestV2CardDraft,
  type IngestV2CardViewModel,
} from "../ingest-v2/ingest-v2-route-view-model";
import {
  CARD_BATCH_LEDGER_PREFIX,
  EMPTY_CARD_BATCH_LEDGER,
  cardReviewQueue,
  isAutoImportEligible,
  isAutoMergeEligible,
  isCardSkipped,
  parseStage,
  type CardBatchLedger,
  type Copy,
} from "./card-batch-model";
import { deletePendingFile, deletePendingFiles, loadPendingFiles, readCardBatchLedger, unregisterActiveBatch } from "./card-batch-store";

type T = (copy: Copy) => string;
export type ContactCandidate = IngestContactCandidateContract;
type ConfirmResult = "created" | "merged" | "duplicate" | "blocked" | "failed";

// 复核页比对已有联系人用的字段（与服务端 CardContactFields 一致）。
function matchFields(draft: IngestV2CardDraft) {
  const { address, displayName, email, organization, phone, role } = draft.fields;
  return { address, displayName, email, organization, phone, role };
}

// 本机账本：哪些卡是这次自动导入的、哪些经用户确认、哪些并入了已有联系人、哪些「稍后处理」。
// 服务端只知道 confirmed/skipped，区分不了来源；刷新后小结要保持一致，所以记在 localStorage（丢了也只影响计数口径）。
// 解析与待确认口径在 card-batch-model（今日要事的只读计数共用），读取在 card-batch-store。
type Ledger = CardBatchLedger;
const EMPTY_LEDGER: Ledger = EMPTY_CARD_BATCH_LEDGER;
const readLedger = readCardBatchLedger;

function writeLedger(batchId: string, ledger: Ledger): void {
  try {
    window.localStorage.setItem(`${CARD_BATCH_LEDGER_PREFIX}${batchId}`, JSON.stringify(ledger));
  } catch {
    // 存储不可用时只影响刷新后的计数口径。
  }
}

/**
 * 名片批次状态机：上传（含从 IndexedDB 续传）、识别轮询、识别后自动导入、逐张确认。
 * 挂在页面顶层（新用户引导 / 全站 CardBatchHost / 人脉导入页），离开具体界面时照常进行，
 * 解析完成的提醒才能拿到真实数字。batchId 为 null 时什么都不做。
 */
export function useCardBatch(batchId: string | null, t: T) {
  const [detail, setDetail] = useState<IngestBatchDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, IngestV2CardDraft>>({});
  const [ledger, setLedger] = useState<Ledger>(EMPTY_LEDGER);
  // cardId → 人脉里「可能是同一个人」的候选（null = 查过、没有）。按当前草稿字段查，字段变了重查。
  const [matches, setMatches] = useState<Record<string, ContactCandidate | null>>({});
  const matchKeys = useRef<Record<string, string>>({});
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
    setMatches({});
    matchKeys.current = {};
    setActiveId(null);
    setError("");
    setUploadFailed(false);
    autoAttempted.current = new Set();
    if (!batchId) {
      setLedger(EMPTY_LEDGER);
      return;
    }
    pendingFiles.current = getPendingFiles(batchId);
    setLedger(readLedger(batchId));
    void refresh();
    // 换页/刷新后内存里的照片没了：从 IndexedDB 取回继续上传。
    let active = true;
    void loadPendingFiles(batchId).then(stored => {
      if (!active || !stored.size) return;
      for (const [digest, file] of stored) {
        if (!pendingFiles.current.has(digest)) pendingFiles.current.set(digest, file);
      }
      void pumpUploadsRef.current();
    });
    return () => {
      active = false;
    };
  }, [batchId, refresh]);

  useEffect(() => {
    if (batchId) writeLedger(batchId, ledger);
  }, [batchId, ledger]);

  const status = detail?.batch.status;
  const items = useMemo(() => detail?.items ?? [], [detail?.items]);
  const cards = useMemo(() => groupIngestItemsByCardId(items), [items]);
  // 「重新识别」后批次仍是 ready_for_review，但 item 回到 queued/processing，需要继续轮询。
  const retrying = items.some(item => item.status === "queued" || item.status === "processing");
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
    if (status !== "collecting" && status !== "processing" && !retrying) return;
    const timer = setInterval(() => void refresh(), 2_500);
    return () => clearInterval(timer);
  }, [status, refresh, retrying]);

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
          else void deletePendingFile(batchId, item.clientDigest);
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

  const pumpUploadsRef = useRef(pumpUploads);
  pumpUploadsRef.current = pumpUploads;

  useEffect(() => {
    if (status === "collecting" && pendingFiles.current.size > 0) void pumpUploads();
    // 上传阶段结束（服务端已开始识别）：本机暂存的照片不再需要。
    if (batchId && status && status !== "collecting") void deletePendingFiles(batchId);
  }, [batchId, status, pumpUploads]);

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
  const confirmCard = useCallback(async (
    card: IngestV2CardViewModel,
    draft: IngestV2CardDraft,
    options: { allowDuplicate?: boolean; mergeInto?: string } = {},
  ): Promise<ConfirmResult> => {
    const allowDuplicate = options.allowDuplicate === true;
    const manual = card.hasTerminalFailure || !card.allExtracted;
    const seed = JSON.stringify({ allowDuplicate, draft, items: card.items.map(item => [item.id, item.version]), manual, mergeInto: options.mergeInto ?? null });
    const known = intents.current[card.cardId];
    const intentId = known && known.seed === seed ? known.id : crypto.randomUUID();
    intents.current[card.cardId] = { id: intentId, seed };
    const prepared = buildConfirmationPayload(card, draft, intentId, allowDuplicate, manual);
    if (!batchId || !prepared.payload) return "blocked";
    const payload = options.mergeInto ? { ...prepared.payload, mergeIntoContactId: options.mergeInto } : prepared.payload;
    const response = await postAction(`/${batchId}/items/${card.items[0]!.id}/${manual ? "manual-entry" : "confirm"}`, payload);
    const body = (await response.json().catch(() => null)) as { data?: { state?: string; contactId?: string; merged?: boolean; candidate?: ContactCandidate | null; item?: IngestItemDTO; items?: IngestItemDTO[] } } | null;
    if (!response.ok) return "failed";
    if (body?.data?.state === "duplicate_review") {
      // 服务端发现了候选（例如复核页还没来得及查到）：交给复核页显示「可能是同一个联系人」。
      const candidate = body.data.candidate ?? null;
      if (candidate) {
        matchKeys.current[card.cardId] = JSON.stringify(matchFields(draft));
        setMatches(current => ({ ...current, [card.cardId]: candidate }));
      }
      return "duplicate";
    }
    if (!readConfirmationReceipt(body?.data ?? {}, card).ok) return "failed";
    return body?.data?.merged ? "merged" : "created";
  }, [batchId]);

  // ── 查「可能是同一个联系人」：识别完成后对所有待确认的卡查一次，草稿字段变了再查 ──
  const lookupTargets = useMemo(
    () => (status === "ready_for_review" || status === "processing"
      ? groupIngestItemsByCardId(items).filter(card => card.reviewable && !card.allConfirmed && !isCardSkipped(card) && drafts[card.cardId])
      : []),
    [cards, drafts, status],
  );
  const matchesReady = lookupTargets.every(card => matchKeys.current[card.cardId] === JSON.stringify(matchFields(drafts[card.cardId]!)) && card.cardId in matches);
  useEffect(() => {
    if (!batchId) return;
    const stale = lookupTargets.filter(card => matchKeys.current[card.cardId] !== JSON.stringify(matchFields(drafts[card.cardId]!)) || !(card.cardId in matches));
    if (!stale.length) return;
    const timer = window.setTimeout(() => {
      const request = stale.map(card => ({ cardId: card.cardId, fields: matchFields(drafts[card.cardId]!) }));
      void fetch(`${INGEST_V2_API_BASE}/${batchId}/duplicates`, {
        body: JSON.stringify({ cards: request }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
        .then(response => (response.ok ? response.json() : null))
        .then((body: { data?: { matches?: Record<string, ContactCandidate | null> } } | null) => {
          const found = body?.data?.matches ?? {};
          for (const entry of request) matchKeys.current[entry.cardId] = JSON.stringify(entry.fields);
          setMatches(current => {
            const next = { ...current };
            for (const entry of request) next[entry.cardId] = found[entry.cardId] ?? null;
            return next;
          });
        })
        .catch(() => {
          // 查不到候选不阻塞导入：视为没有候选，确认时服务端仍会判重。
          for (const entry of request) matchKeys.current[entry.cardId] = JSON.stringify(entry.fields);
          setMatches(current => {
            const next = { ...current };
            for (const entry of request) if (!(entry.cardId in next)) next[entry.cardId] = null;
            return next;
          });
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [batchId, drafts, lookupTargets, matches]);

  // ── 识别完成后：没有疑点的卡自动导入 ──
  // 等「可能是同一个联系人」查完再动手：与已有联系人完全一致的卡直接并入（哪怕识别有疑点——
  // 每个字段都和人脉里的记录对得上，疑点已被印证）；有相似但不一致的候选时交给用户。
  useEffect(() => {
    if (!batchId || status !== "ready_for_review" || autoRunning || !matchesReady) return;
    const eligible = cards.filter(card => {
      const draft = drafts[card.cardId];
      if (!draft || autoAttempted.current.has(card.cardId) || !card.reviewable || card.allConfirmed || isCardSkipped(card)) return false;
      const candidate = matches[card.cardId];
      if (candidate) return candidate.identical && isAutoMergeEligible(card, draft);
      return isAutoImportEligible(card, draft);
    });
    if (!eligible.length) return;
    setAutoRunning(true);
    void (async () => {
      for (const card of eligible) {
        autoAttempted.current.add(card.cardId);
        const candidate = matches[card.cardId];
        const result = await confirmCard(card, drafts[card.cardId]!, candidate?.identical ? { mergeInto: candidate.contactId } : {}).catch(() => "failed" as const);
        if (result === "created" || result === "merged") {
          setLedger(current => ({
            ...current,
            auto: [...new Set([...current.auto, card.cardId])],
            merged: result === "merged" ? [...new Set([...current.merged, card.cardId])] : current.merged,
          }));
        }
      }
      await refresh();
      setAutoRunning(false);
    })();
  }, [autoRunning, cards, confirmCard, drafts, matches, matchesReady, refresh, status]);

  // ── 派生：复核队列与小结 ──
  const autoSet = useMemo(() => new Set(ledger.auto), [ledger.auto]);
  // 队列与待确认的口径与今日要事（W0011）共用 card-batch-model 的 cardReviewQueue。
  const { isHandled, laterSet, pending, queue } = useMemo(() => cardReviewQueue(cards, ledger), [cards, ledger]);
  const stage = parseStage(status);
  const reviewing = Boolean(status) && stage === "review" && !autoRunning && status !== "cancelled" && status !== "expired";
  const finished = reviewing && pending.length === 0;
  const active = queue.find(card => card.cardId === activeId && !isHandled(card)) ?? pending[0] ?? null;

  const mergedSet = useMemo(() => new Set(ledger.merged), [ledger.merged]);
  const autoCount = cards.filter(card => autoSet.has(card.cardId) && card.allConfirmed && !mergedSet.has(card.cardId)).length;
  const userCount = queue.filter(card => card.allConfirmed && !mergedSet.has(card.cardId)).length;
  const mergedCount = cards.filter(card => mergedSet.has(card.cardId) && card.allConfirmed).length;
  // 有相似但不完全一致的候选 → 复核页显示「可能是同一个联系人」与「已有联系人，合并」。
  const duplicates = useMemo(
    () => new Set(Object.entries(matches).filter(([, candidate]) => candidate && !candidate.identical).map(([cardId]) => cardId)),
    [matches],
  );
  const setAside = queue.filter(card => !card.allConfirmed && (isCardSkipped(card) || laterSet.has(card.cardId))).length;

  const laterCount = queue.filter(card => !card.allConfirmed && !isCardSkipped(card) && laterSet.has(card.cardId)).length;
  const settledCount = cards.filter(card => card.items.every(item => ["extracted", "terminal_failed", "confirmed", "skipped", "excluded"].includes(item.status))).length;
  const missing = status === "collecting" ? items.filter(item => item.status === "awaiting_upload" && !pendingFiles.current.has(item.clientDigest)).length : 0;
  // 批次读不到或已结束、且没有待确认/未读提醒时，从全站「进行中批次」登记表里移除。
  useEffect(() => {
    if (!batchId) return;
    const terminal = status === "cancelled" || status === "expired";
    if (loadFailed || terminal || (reviewing && pending.length === 0 && ledger.notified)) unregisterActiveBatch(batchId);
  }, [batchId, ledger.notified, loadFailed, pending.length, reviewing, status]);

  // 「解析完成」提醒只弹一次（记在本机账本里，刷新不重复弹）。
  const markNotified = useCallback(() => setLedger(current => (current.notified ? current : { ...current, notified: true })), []);

  function moveOn(from: IngestV2CardViewModel) {
    const index = queue.findIndex(card => card.cardId === from.cardId);
    const next = [...queue.slice(index + 1), ...queue.slice(0, index)].find(card => !isHandled(card) && card.cardId !== from.cardId);
    setActiveId(next?.cardId ?? null);
    setSide("front");
    setZoom(false);
  }

  async function act(kind: "confirm" | "merge" | "skip" | "later") {
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
        const candidate = matches[active.cardId];
        // 「确认无误」时如果页面上已经给出了候选，用户看过并选择了新建；「合并」并入候选联系人。
        const result = kind === "merge" && candidate
          ? await confirmCard(active, draft, { mergeInto: candidate.contactId })
          : await confirmCard(active, draft, { allowDuplicate: Boolean(candidate) });
        if (result === "created" || result === "merged") {
          setLedger(current => ({
            ...current,
            merged: result === "merged" ? [...new Set([...current.merged, active.cardId])] : current.merged,
            user: [...new Set([...current.user, active.cardId])],
          }));
          moveOn(active);
        } else if (result === "duplicate") {
          // 候选已由 confirmCard 写入 matches，复核页随即显示「可能是同一个联系人」。
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

  async function retryRecognition(card: IngestV2CardViewModel) {
    if (!batchId || busy) return;
    setBusy(true);
    setError("");
    try {
      await Promise.all(card.items.filter(item => item.status === "terminal_failed").map(item => postAction(`/${batchId}/items/${item.id}/retry`)));
      autoAttempted.current.delete(card.cardId);
      await refresh();
    } catch {
      setError(t({ zh: "没能重新识别，请稍后再试。", en: "Couldn't retry recognition — try again later." }));
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
    act, active, autoCount, autoRunning, batchId, busy, cards, detail, drafts, duplicates, error, finished, isHandled, matches, mergedCount,
    laterCount, laterSet, loadFailed, markNotified, missing, notified: ledger.notified, openCard, pending, pumpUploads,
    queue, reattach, refresh, retryRecognition, reviewing, setAside, setDrafts, setSide, setZoom, settledCount, side, stage, status, uploadFailed, userCount, zoom,
  };
}

export type CardBatch = ReturnType<typeof useCardBatch>;

