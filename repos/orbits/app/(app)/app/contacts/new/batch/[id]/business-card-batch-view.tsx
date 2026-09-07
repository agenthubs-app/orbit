"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  BusinessCardBatchDTO,
  BusinessCardBatchItemDTO,
} from "../../../../../../../features/acquisition/business-card-batch-contract";
import { aggregateBusinessCardNotes } from "../../../../../../../features/acquisition/business-card-notes-aggregation";
import { Icon } from "../../../../orbit-reference-primitives";
import { useOrbitLanguage } from "../../../../orbit-language-context";

type Translate = (copy: { en: string; zh: string }) => string;

const WORKER_STALL_MS = 60_000;

const ITEM_STATUS_COPY: Record<
  BusinessCardBatchItemDTO["status"],
  { en: string; zh: string }
> = {
  confirmed: { en: "Confirmed", zh: "已收录" },
  extracted: { en: "Recognized", zh: "已识别" },
  failed: { en: "Failed", zh: "识别失败" },
  pending: { en: "Waiting", zh: "排队中" },
  processing: { en: "Reading", zh: "识别中" },
  skipped: { en: "Skipped", zh: "已跳过" },
};

export interface BusinessCardBatchFixedFields {
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  relationshipContext: string;
  notes: string;
}

export function initialFixedFields(
  item: BusinessCardBatchItemDTO,
): BusinessCardBatchFixedFields {
  const extraction = item.extraction;
  const email = extraction?.emails[0]?.value ?? "";
  const phone =
    extraction?.contactPoints.find((point) => point.type !== "fax")?.value ?? "";

  return {
    displayName: extraction?.fullName ?? extraction?.nativeFullName ?? "",
    email,
    notes: extraction
      ? aggregateBusinessCardNotes(extraction, {
          email: email || null,
          phone: phone || null,
        })
      : "",
    organization: extraction?.organization ?? "",
    phone,
    relationshipContext: `批量导入 · ${item.sourceFileName}${
      item.sourcePage ? ` · 第${item.sourcePage}页` : ""
    }`,
    role: extraction?.title ?? "",
  };
}

function PrivacyNote({ t }: { t: Translate }) {
  return (
    <div className="bcb-privacy">
      <Icon name="lock" size={15} color="var(--accent)" />
      <span>
        {t({
          en: "After confirmation, images are no longer accessible and are deleted in the background. Skipping also removes the image.",
          zh: "确认后卡图不再可访问，并由后台删除；跳过也会移除卡图。",
        })}
      </span>
    </div>
  );
}

function itemImageUrl(item: BusinessCardBatchItemDTO): string {
  return `/api/contact-drafts/business-card/batches/${item.batchId}/items/${item.id}/image`;
}

export interface BusinessCardBatchViewPureProps {
  batch: BusinessCardBatchDTO;
  items: readonly BusinessCardBatchItemDTO[];
  nowMs: number;
  busy: boolean;
  duplicateItemId: string | null;
  onConfirm: (item: BusinessCardBatchItemDTO, fields: BusinessCardBatchFixedFields, allowDuplicate: boolean, manual?: boolean) => void;
  onSkip: (item: BusinessCardBatchItemDTO) => void;
  onRetry: (item: BusinessCardBatchItemDTO) => void;
  onFinish: () => void;
  onCancel: () => void;
}

export function BusinessCardBatchViewPure({
  batch,
  items,
  nowMs,
  busy,
  duplicateItemId,
  onConfirm,
  onSkip,
  onRetry,
  onFinish,
  onCancel,
}: BusinessCardBatchViewPureProps) {
  const { t } = useOrbitLanguage();
  const currentItem = useMemo(
    () =>
      items.find((item) => item.status === "extracted") ??
      items.find((item) => item.status === "failed") ??
      null,
    [items],
  );
  const [fields, setFields] = useState<BusinessCardBatchFixedFields | null>(() =>
    currentItem ? initialFixedFields(currentItem) : null,
  );
  const [editedItemId, setEditedItemId] = useState<string | null>(
    currentItem?.id ?? null,
  );
  const [manualItemId, setManualItemId] = useState<string | null>(null);

  useEffect(() => {
    if (currentItem && currentItem.id !== editedItemId) {
      setFields(initialFixedFields(currentItem));
      setEditedItemId(currentItem.id);
      setManualItemId(null);
    }
  }, [currentItem, editedItemId]);

  const settled = batch.processedItems + batch.failedItems;
  const workerStalled =
    batch.status === "processing" &&
    nowMs - Date.parse(batch.updatedAt) > WORKER_STALL_MS &&
    !items.some((item) => item.status === "processing");

  if (batch.status === "cancelled") {
    return <section className="bcb-shell" data-batch-state="cancelled">
      <style>{BATCH_STYLE}</style>
      <h2>{t({ en: "Batch cancelled", zh: "批次已取消" })}</h2>
      <p className="bcb-lede">{t({ en: "Processing has stopped. Contacts already saved remain in your contacts.", zh: "已停止处理，已经收录的联系人会保留。" })}</p>
      <p className="bcb-lede">{batch.imagesDeletedAt ? t({ en: "Card images have been deleted.", zh: "卡图已删除。" }) : t({ en: "Card images are being deleted in the background.", zh: "正在后台删除卡图。" })}</p>
      <a className="btn btn-primary" href="/app/contacts">{t({ en: "Open contacts", zh: "查看名片夹" })}</a>
    </section>;
  }

  const cancelControl = <div>
    <button className="btn btn-ghost" disabled={busy} onClick={onCancel} type="button">{t({ en: "Cancel remaining import", zh: "取消剩余导入" })}</button>
    <p className="bcb-lede">{t({ en: "Stops processing and deletes card images. Contacts already saved are kept.", zh: "停止处理并删除卡图，保留已收录的联系人。" })}</p>
  </div>;

  if (batch.status === "completed") {
    return (
      <section className="bcb-shell">
        <style>{BATCH_STYLE}</style>
        <div className="eyebrow">{t({ en: "BATCH IMPORT", zh: "批量导入" })}</div>
        <h2>{t({ en: "Batch completed", zh: "批次已完成" })}</h2>
        <p className="bcb-lede">
          {t({ en: "Confirmed", zh: "已收录" })} {batch.confirmedItems} ·{" "}
          {t({ en: "Skipped", zh: "已跳过" })} {batch.skippedItems} ·{" "}
          {t({ en: "Failed", zh: "失败" })} {batch.failedItems}
        </p>
        <a className="btn btn-primary" href="/app/contacts">
          {t({ en: "Open contacts", zh: "查看名片夹" })}
        </a>
      </section>
    );
  }

  if (batch.status === "processing") {
    return (
      <section className="bcb-shell" data-batch-state="processing">
        <style>{BATCH_STYLE}</style>
        <div className="eyebrow">{t({ en: "BATCH IMPORT", zh: "批量导入" })}</div>
        <h2>{t({ en: "Recognizing your cards…", zh: "正在识别名片…" })}</h2>
        <p className="bcb-lede">
          {t({
            en: "You can leave this page — processing continues in the background.",
            zh: "可以离开本页，识别在后台继续；回来时进度自动恢复。",
          })}
        </p>
        {workerStalled ? (
          <div className="bcb-warn">
            {t({
              en: "Processing is taking longer than expected. You can return later, or cancel this import and add contacts manually.",
              zh: "处理时间比预期长。你可以稍后回来，也可以取消本次导入后手动添加联系人。",
            })}
          </div>
        ) : null}
        <div className="bcb-progress">
          <div
            className="bcb-progress-fill"
            style={{ width: `${batch.totalItems ? (settled / batch.totalItems) * 100 : 0}%` }}
          />
        </div>
        <div className="bcb-progress-label">
          {settled}/{batch.totalItems}
          {batch.failedItems > 0
            ? ` · ${t({ en: "failed", zh: "失败" })} ${batch.failedItems}`
            : ""}
        </div>
        <div className="bcb-grid">
          {items.map((item) => (
            <div className={`bcb-cell bcb-cell-${item.status}`} key={item.id}>
              <span className="bcb-cell-seq">#{item.seq}</span>
              <span className="bcb-cell-name">
                {item.sourceFileName}
                {item.sourcePage ? ` p${item.sourcePage}` : ""}
              </span>
              <span className="bcb-cell-status">{t(ITEM_STATUS_COPY[item.status])}</span>
            </div>
          ))}
        </div>
        {cancelControl}
        <PrivacyNote t={t} />
      </section>
    );
  }

  // ready_for_review
  if (!currentItem) {
    return (
      <section className="bcb-shell" data-batch-state="finishable">
        <style>{BATCH_STYLE}</style>
        <div className="eyebrow">{t({ en: "BATCH IMPORT", zh: "批量导入" })}</div>
        <h2>{t({ en: "All cards reviewed", zh: "全部卡片已处理" })}</h2>
        <p className="bcb-lede">
          {t({ en: "Confirmed", zh: "已收录" })} {batch.confirmedItems} ·{" "}
          {t({ en: "Skipped", zh: "已跳过" })} {batch.skippedItems} ·{" "}
          {t({ en: "Failed", zh: "失败" })} {batch.failedItems}
        </p>
        <button className="btn btn-primary" disabled={busy} onClick={onFinish} type="button">
          {t({ en: "Finish batch", zh: "完成批次" })}
        </button>
        {cancelControl}
        <PrivacyNote t={t} />
      </section>
    );
  }

  const remaining = items.filter(
    (item) => item.status === "extracted" || item.status === "failed",
  ).length;

  return (
    <section className="bcb-shell" data-batch-state="review">
      <style>{BATCH_STYLE}</style>
      <div className="eyebrow">
        {t({ en: "REVIEW", zh: "逐张确认" })} · {remaining}{" "}
        {t({ en: "left", zh: "张待处理" })}
      </div>
      <h2>
        #{currentItem.seq} · {currentItem.sourceFileName}
        {currentItem.sourcePage ? ` · 第${currentItem.sourcePage}页` : ""}
      </h2>
      <div className="bcb-review">
        <div className="bcb-review-image">
          {currentItem.imagePath ? (
            <img alt={t({ en: "Card image", zh: "名片图片" })} src={itemImageUrl(currentItem)} />
          ) : (
            <div className="bcb-image-missing">
              {t({ en: "Image removed", zh: "图片已删除" })}
            </div>
          )}
        </div>
        <div className="bcb-review-form">
          {currentItem.status === "failed" ? (
            <div className="bcb-warn">
              {t({ en: "Recognition failed", zh: "识别失败" })}
              {currentItem.errorCode ? ` · ${currentItem.errorCode}` : ""}
            </div>
          ) : null}
          {fields && (currentItem.status === "extracted" || manualItemId === currentItem.id) ? (
            <>
              {(
                [
                  ["displayName", { en: "Name", zh: "姓名" }],
                  ["organization", { en: "Company", zh: "公司" }],
                  ["role", { en: "Title", zh: "职位" }],
                  ["email", { en: "Email", zh: "邮箱" }],
                  ["phone", { en: "Phone", zh: "电话" }],
                  ["relationshipContext", { en: "How you met", zh: "认识场景" }],
                ] as const
              ).map(([key, label]) => (
                <label className="bcb-field" key={key}>
                  <span>{t(label)}</span>
                  <input
                    onChange={(event) =>
                      setFields((previous) =>
                        previous ? { ...previous, [key]: event.target.value } : previous,
                      )
                    }
                    value={fields[key]}
                  />
                </label>
              ))}
              <label className="bcb-field">
                <span>{t({ en: "Notes (nothing gets lost)", zh: "备注（其余信息都在这里）" })}</span>
                <textarea
                  onChange={(event) =>
                    setFields((previous) =>
                      previous ? { ...previous, notes: event.target.value } : previous,
                    )
                  }
                  rows={6}
                  value={fields.notes}
                />
              </label>
              {duplicateItemId === currentItem.id ? (
                <div className="bcb-warn">
                  {t({
                    en: "Looks like this person already exists in your contacts.",
                    zh: "该联系人似乎已存在于你的名片夹。",
                  })}
                </div>
              ) : null}
            </>
          ) : null}
          <div className="bcb-actions">
            {currentItem.status === "extracted" && fields ? (
              duplicateItemId === currentItem.id ? (
                <>
                  <button
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => onSkip(currentItem)}
                    type="button"
                  >
                    {t({ en: "Skip this card", zh: "跳过此卡" })}
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => onConfirm(currentItem, fields, true)}
                    type="button"
                  >
                    {t({ en: "Create anyway", zh: "仍然创建" })}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => onSkip(currentItem)}
                    type="button"
                  >
                    {t({ en: "Skip", zh: "跳过" })}
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => onConfirm(currentItem, fields, false)}
                    type="button"
                  >
                    {t({ en: "Confirm and next", zh: "确认并下一张" })}
                  </button>
                </>
              )
            ) : manualItemId === currentItem.id && fields ? (
              <>
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setManualItemId(null)}
                  type="button"
                >
                  {t({ en: "Back", zh: "返回" })}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || !fields.displayName.trim()}
                  onClick={() => onConfirm(currentItem, fields, duplicateItemId === currentItem.id, true)}
                  type="button"
                >
                  {t({ en: "Save manual entry", zh: "保存手工录入" })}
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => onSkip(currentItem)}
                  type="button"
                >
                  {t({ en: "Skip", zh: "跳过" })}
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setManualItemId(currentItem.id)}
                  type="button"
                >
                  {t({ en: "Type it in", zh: "手工录入" })}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => onRetry(currentItem)}
                  type="button"
                >
                  {t({ en: "Retry recognition", zh: "重试识别" })}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {cancelControl}
      <PrivacyNote t={t} />
    </section>
  );
}

class BatchRequestFailure extends Error {
  constructor(readonly status: number) { super("Batch request failed."); }
}

async function requestBatchJson(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(path, { ...init, signal: controller.signal });
    if (!response.ok) throw new BatchRequestFailure(response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}

export function BusinessCardBatchView({ batchId }: { batchId: string }) {
  const { t } = useOrbitLanguage();
  const [actionError, setActionError] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<number | null>(null);
  const requestSequence = useRef(0);
  const actionInFlight = useRef(false);
  const [batch, setBatch] = useState<BusinessCardBatchDTO | null>(null);
  const [items, setItems] = useState<readonly BusinessCardBatchItemDTO[]>([]);
  const [busy, setBusy] = useState(false);
  const [duplicateItemId, setDuplicateItemId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(async (afterAction = false) => {
    if (actionInFlight.current && !afterAction) return;
    const sequence = ++requestSequence.current;
    try {
      const body = await requestBatchJson(`/api/contact-drafts/business-card/batches/${batchId}`);
      if (sequence !== requestSequence.current || (actionInFlight.current && !afterAction)) return;
      if (body?.data?.batch?.id !== batchId || !Array.isArray(body?.data?.items)) throw new BatchRequestFailure(502);
      setBatch(body.data.batch);
      setItems(body.data.items);
      setLoadError(null);
    } catch (error) {
      if (sequence === requestSequence.current && (!actionInFlight.current || afterAction)) {
        setLoadError(error instanceof BatchRequestFailure ? error.status : 0);
      }
    } finally {
      if (sequence === requestSequence.current) setNowMs(Date.now());
    }
  }, [batchId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3_000);

    return () => { clearInterval(timer); requestSequence.current++; };
  }, [refresh]);

  async function post(path: string, body?: unknown) {
    return requestBatchJson(path, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  async function withBusy(action: () => Promise<void>): Promise<void> {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    requestSequence.current++;
    setActionError(null);
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof BatchRequestFailure ? error.status : 0);
    } finally {
      await refresh(true);
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  const errorStatus = actionError === 401 || loadError === 401 ? 401 : actionError ?? loadError;
  const feedback = errorStatus !== null ? <div role="alert">
    <p>{errorStatus === 401 ? t({ en: "Your session has expired. Sign in again to continue.", zh: "登录已过期，请重新登录后继续。" })
      : errorStatus === 403 ? t({ en: "You do not have permission to perform this action.", zh: "你没有执行此操作的权限。" })
      : errorStatus === 404 ? t({ en: "This batch is no longer available.", zh: "此批次已不可用。" })
      : actionError !== null ? t({ en: "The result could not be confirmed. Check the latest batch state below before retrying.", zh: "暂时无法确认操作结果。请检查下方最新批次状态，再决定是否重试。" })
      : batch ? t({ en: "Batch progress could not be loaded. Your last displayed state has been kept; try refreshing.", zh: "暂时无法加载批次进度，已保留上次显示的状态，请刷新重试。" })
      : t({ en: "Batch progress could not be loaded. Try refreshing.", zh: "暂时无法加载批次进度，请刷新重试。" })}</p>
    {errorStatus === 401 ? <a className="btn btn-primary" href={`/app/account/login?next=${encodeURIComponent(`/app/contacts/new/batch/${batchId}`)}`}>{t({ en: "Sign in", zh: "重新登录" })}</a>
      : <button className="btn btn-ghost" disabled={busy} type="button" onClick={() => { setActionError(null); void refresh(); }}>{t({ en: "Refresh status", zh: "刷新状态" })}</button>}
  </div> : null;

  if (!batch || batch.id !== batchId) {
    return <section className="bcb-shell"><style>{BATCH_STYLE}</style>
      <h2>{t({ en: "Card import", zh: "名片导入" })}</h2>
      {feedback ?? <p role="status">{t({ en: "Loading batch…", zh: "正在加载批次…" })}</p>}
      <a href="/app/contacts">{t({ en: "Back to contacts", zh: "返回名片夹" })}</a>
    </section>;
  }

  return (
    <>
    {feedback}
    <BusinessCardBatchViewPure
      batch={batch}
      busy={busy}
      duplicateItemId={duplicateItemId}
      items={items}
      nowMs={nowMs}
      onConfirm={(item, fields, allowDuplicate, manual = false) =>
        void withBusy(async () => {
          const body = await post(
            `/api/contact-drafts/business-card/batches/${batch.id}/items/${item.id}/${manual ? "manual-entry" : "confirm"}`,
            { ...fields, allowDuplicate },
          );
          if (!["duplicate_review", "created", "already_confirmed"].includes(body?.data?.state)) throw new BatchRequestFailure(502);

          if (body.data?.state === "duplicate_review") {
            setDuplicateItemId(item.id);
          } else {
            setDuplicateItemId(null);
          }
        })
      }
      onCancel={() => void withBusy(async () => {
        await post(`/api/contact-drafts/business-card/batches/${batch.id}/cancel`);
      })}
      onFinish={() =>
        void withBusy(async () => {
          await post(`/api/contact-drafts/business-card/batches/${batch.id}/finish`);
        })
      }
      onRetry={(item) =>
        void withBusy(async () => {
          await post(
            `/api/contact-drafts/business-card/batches/${batch.id}/items/${item.id}/retry`,
          );
        })
      }
      onSkip={(item) =>
        void withBusy(async () => {
          await post(
            `/api/contact-drafts/business-card/batches/${batch.id}/items/${item.id}/skip`,
          );
          setDuplicateItemId(null);
        })
      }
    />
    </>
  );
}

const BATCH_STYLE = `
.bcb-shell { display: flex; flex-direction: column; gap: 12px; }
.bcb-shell h2 { color: var(--ink); font-family: var(--ff-display); font-size: clamp(20px, 2.6vw, 28px); letter-spacing: -.03em; margin: 0; }
.bcb-lede { color: var(--text-2); font-size: 14px; line-height: 1.6; margin: 0; }
.bcb-privacy { align-items: flex-start; background: var(--accent-softer); border-radius: 11px; color: var(--text-2); display: flex; font-size: 12px; gap: 8px; line-height: 1.5; padding: 10px 12px; }
.bcb-warn { background: var(--amber-soft); border-radius: 10px; color: var(--amber-text); font-size: 12.5px; line-height: 1.5; padding: 10px 12px; }
.bcb-progress { background: var(--surface-3); border-radius: 999px; height: 8px; overflow: hidden; }
.bcb-progress-fill { background: var(--accent); border-radius: 999px; height: 100%; transition: width .4s ease; }
.bcb-progress-label { color: var(--text-3); font-family: var(--mono); font-size: 12px; }
.bcb-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.bcb-cell { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; display: flex; flex-direction: column; font-size: 11.5px; gap: 2px; padding: 8px 10px; }
.bcb-cell-seq { color: var(--text-4); font-family: var(--mono); }
.bcb-cell-name { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bcb-cell-status { font-weight: 600; }
.bcb-cell-extracted .bcb-cell-status, .bcb-cell-confirmed .bcb-cell-status { color: var(--live-text); }
.bcb-cell-failed .bcb-cell-status { color: var(--amber-text); }
.bcb-cell-pending .bcb-cell-status, .bcb-cell-processing .bcb-cell-status { color: var(--text-3); }
.bcb-review { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(180px, 320px) 1fr; }
@media (max-width: 760px) { .bcb-review { grid-template-columns: 1fr; } }
.bcb-review-image img { border: 1px solid var(--border); border-radius: 12px; max-width: 100%; }
.bcb-image-missing { background: var(--surface-3); border-radius: 12px; color: var(--text-3); font-size: 12.5px; padding: 30px 12px; text-align: center; }
.bcb-review-form { display: flex; flex-direction: column; gap: 10px; }
.bcb-field { display: flex; flex-direction: column; gap: 4px; }
.bcb-field > span { color: var(--text-3); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.bcb-field input, .bcb-field textarea { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; color: var(--ink); font: inherit; font-size: 14px; padding: 9px 11px; resize: vertical; }
.bcb-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
`;
