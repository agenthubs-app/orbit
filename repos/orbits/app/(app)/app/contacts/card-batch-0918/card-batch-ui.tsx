/**
 * 名片批量导入界面（新用户引导第 5 步 / 人脉「导入人脉」/ 全站提醒共用），新 UI 浅紫色版：
 *   - 上传：新用户引导.dc.html「批量上传名片照片」（CardBatchUploader）
 *   - 正在解析：06b 名片解析中
 *   - 确认：Network v2「10 名片确认」；全部处理后显示本批小结
 *   - 提醒：新用户引导.dc.html 621–650 行（解析中胶囊 / 完成弹窗 / 待确认胶囊）
 * 设计稿按「置信度 %」着色，识别管线不产出逐字段置信度，这里只用真实依据（reviewIssues、正反面冲突、空字段、是否改过）。
 */
"use client";

import { useEffect, useRef } from "react";

import { INGEST_V2_API_BASE, postAction } from "../ingest-v2/ingest-v2-client";
import { IngestV2PrivateImage } from "../ingest-v2/ingest-v2-private-image";
import {
  fieldCandidates,
  initialCardDraft,
  setDraftFieldSource,
  setManualDraftField,
  setManualDraftNotes,
  type IngestV2CardDraft,
  type IngestV2CardViewModel,
  type IngestV2Field,
} from "../ingest-v2/ingest-v2-route-view-model";
import {
  INGEST_V2_FIELDS,
  cardReason,
  fieldTag,
  flaggedFields,
  isCardSkipped,
  type Copy,
} from "./card-batch-model";
import { CARD_BATCH_STYLES } from "./card-batch-styles";
import { CardBatchUploader } from "./card-batch-uploader";
import type { CardBatch, ContactCandidate } from "./use-card-batch";

type T = (copy: Copy) => string;
export type BrowseTarget = "home" | "events";

const FIELD_LABELS: Record<IngestV2Field, Copy> = {
  displayName: { zh: "姓名", en: "Name" },
  organization: { zh: "公司", en: "Company" },
  role: { zh: "职位", en: "Title" },
  email: { zh: "邮箱", en: "Email" },
  phone: { zh: "电话", en: "Phone" },
  address: { zh: "地址", en: "Address" },
};

/** 名片导入区：无批次时是上传区，有批次时依次是正在解析 → 确认 → 小结。自带作用域样式 .cbx。 */
export function CardBatchImport(props: {
  available: boolean;
  batch: CardBatch;
  onBatchStarted: (batchId: string) => void;
  /** 引导页内切到预览；不传时「等待的时候」给出站内真实链接。 */
  onBrowse?: (target: BrowseTarget) => void;
  onReset: () => void;
  t: T;
}) {
  return (
    <div className="cbx">
      <style>{CARD_BATCH_STYLES}</style>
      <CardBatchImportBody {...props} />
    </div>
  );
}

function CardBatchImportBody({
  available, batch, onBatchStarted, onBrowse, onReset, t,
}: {
  available: boolean;
  batch: CardBatch;
  onBatchStarted: (batchId: string) => void;
  onBrowse?: (target: BrowseTarget) => void;
  onReset: () => void;
  t: T;
}) {
  if (!available) {
    return (
      <div className="cb-source cb-source-off">
        <span className="cb-source-glyph" aria-hidden>▭</span>
        <span className="cb-source-body">
          <strong>{t({ zh: "扫描名片夹", en: "Scan business cards" })}</strong>
          <span>{t({ zh: "名片识别暂未开放，之后可在人脉页使用", en: "Card recognition isn't available yet — use it later from Network" })}</span>
        </span>
      </div>
    );
  }
  if (!batch.batchId) {
    return (
      <CardBatchUploader onStarted={onBatchStarted} t={t} />
    );
  }
  return <BatchView batch={batch} onBrowse={onBrowse} onReset={onReset} t={t} />;
}

function BatchView({ batch, onBrowse, onReset, t }: { batch: CardBatch; onBrowse?: (target: BrowseTarget) => void; onReset: () => void; t: T }) {
  const {
    act, active, autoCount, autoRunning, busy, cards, detail, drafts, duplicates, error, finished, isHandled,
    matches, mergedCount, laterCount, laterSet, loadFailed, missing, openCard, pending, pumpUploads, queue, reattach, reviewing, setAside,
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
      void actRef.current("confirm");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, reviewing]);

  if (!detail) {
    return loadFailed ? (
      <div className="cb-notice cb-notice-warning" role="alert">
        {t({ zh: "这批名片读取不到了（可能已过期）。", en: "This batch can't be loaded (it may have expired)." })}
        <button className="btn cb-btn-soft" onClick={onReset} type="button">{t({ zh: "重新上传", en: "Upload again" })}</button>
      </div>
    ) : <ParsingPanel autoRunning={false} cards={[]} drafts={{}} missing={0} onBrowse={onBrowse} onReattach={() => undefined} onRetry={() => undefined} settled={0} stage="upload" t={t} total={0} uploadFailed={false} />;
  }

  if (status === "cancelled" || status === "expired") {
    return (
      <div className="cb-notice cb-notice-warning" role="alert">
        {status === "expired" ? t({ zh: "这批名片已过期，已确认的联系人都保留了。", en: "This batch expired; confirmed contacts were kept." }) : t({ zh: "这批名片已取消。", en: "This batch was cancelled." })}
        <button className="btn cb-btn-soft" onClick={onReset} type="button">{t({ zh: "重新上传", en: "Upload again" })}</button>
      </div>
    );
  }

  if (!reviewing) {
    return (
      <>
        <input accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="cb-sr" multiple onChange={event => { void reattach(event.target.files); event.target.value = ""; }} ref={reattachRef} tabIndex={-1} type="file" aria-hidden />
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
    return <FinishedPanel autoCount={autoCount} laterCount={laterCount} mergedCount={mergedCount} onReset={onReset} setAside={setAside} t={t} total={cards.length} userCount={userCount} />;
  }

  const draft = drafts[active.cardId] ?? initialCardDraft(active);
  const baseline = initialCardDraft(active);
  const flagged = flaggedFields(active, draft);
  const duplicate = duplicates.has(active.cardId);
  const candidate = duplicate ? matches[active.cardId] ?? null : null;
  const handledCount = queue.filter(isHandled).length;
  const remainingAfter = pending.filter(card => card.cardId !== active.cardId).length;
  const unresolved = [...flagged].filter(field => draft.fields[field] === baseline.fields[field]).length;
  const shownItem = active.items.find(item => item.side === side) ?? active.items[0]!;
  const reason = cardReason(active, draft, duplicate);

  return (
    <div className="cb-review" data-screen-label="10 名片确认">
      <div className="cb-review-top">
        <div className="cb-review-head">
          <h3 className="cb-review-h">{t({ zh: "确认名片识别结果", en: "Confirm the recognized cards" })}</h3>
          <p className="cb-p">
            {autoCount
              ? t({ zh: `本批 ${cards.length} 张。${autoCount} 张识别可靠，已自动导入；下面 ${queue.length} 张不太确定，请对照照片逐张确认。`, en: `${cards.length} cards. ${autoCount} were clear and imported automatically; please check the ${queue.length} below against the photo.` })
              : t({ zh: `本批 ${cards.length} 张，下面 ${queue.length} 张不太确定，请对照照片逐张确认。`, en: `${cards.length} cards — please check the ${queue.length} below against the photo.` })}
          </p>
        </div>
        <div className="cb-review-stats">
          <span className="cb-stat cb-stat-green"><strong>{autoCount}</strong><span>{t({ zh: "已自动导入", en: "Auto-imported" })}</span></span>
          <span className="cb-stat cb-stat-indigo"><strong>{handledCount} / {queue.length}</strong><span>{t({ zh: "已确认", en: "Checked" })}</span></span>
        </div>
      </div>

      <div className="cb-queue">
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
              className={`btn cb-queue-item${on ? " cb-queue-on" : ""}`}
              disabled={isHandled(card) && !laterSet.has(card.cardId)}
              key={card.cardId}
              onClick={() => openCard(card.cardId)}
              type="button"
            >
              <span className="cb-queue-n">{index + 1}</span>
              <span className="cb-queue-copy">
                <strong>{cardDraft.fields.displayName.trim() || t({ zh: "未识别姓名", en: "No name" })}</strong>
                <span className={`cb-queue-st cb-queue-st-${state.tone}`}>{t(state.copy)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="cb-review-grid">
        <section className="cb-photo-panel">
          <div className="cb-photo-top">
            <span className="cb-photo-file">{queue.findIndex(card => card.cardId === active.cardId) + 1} / {queue.length} · {shownItem.sourceFileName}</span>
            <span className="cb-photo-reason">⚠ {t(reason)}</span>
          </div>
          <div className="cb-photo-stage">
            <div className="cb-photo-frame" style={{ transform: `scale(${zoom ? 1.35 : 1})` }}>
              {shownItem.derivativeObjectKey && shownItem.imageDigest ? (
                <IngestV2PrivateImage
                  alt={shownItem.sourceFileName}
                  errorLabel={t({ zh: "照片暂时无法显示", en: "Photo unavailable" })}
                  expiredLabel={t({ zh: "照片已过期", en: "Photo expired" })}
                  key={`${shownItem.id}:${shownItem.version}`}
                  loadingLabel={t({ zh: "正在加载照片…", en: "Loading photo…" })}
                  src={`${INGEST_V2_API_BASE}/${batchId}/items/${shownItem.id}/image`}
                />
              ) : <span className="cb-photo-missing">{t({ zh: "这张照片没有可显示的图像", en: "No image to show for this photo" })}</span>}
            </div>
          </div>
          <div className="cb-photo-foot">
            <span>
              {active.isTwoSided ? (
                <span className="cb-side-toggle">
                  {(["front", "back"] as const).map(value => (
                    <button className={`btn cb-side-btn${side === value ? " cb-side-on" : ""}`} key={value} onClick={() => setSide(value)} type="button">{value === "front" ? t({ zh: "正面", en: "Front" }) : t({ zh: "反面", en: "Back" })}</button>
                  ))}
                </span>
              ) : t({ zh: "对照照片核对右侧字段", en: "Check the fields against the photo" })}
            </span>
            <button className="btn cb-photo-zoom" onClick={() => setZoom(value => !value)} type="button">{zoom ? t({ zh: "缩小", en: "Zoom out" }) : t({ zh: "放大查看", en: "Zoom in" })}</button>
          </div>
        </section>

        <section className="cb-fields-panel">
          <div className="cb-fields-head">
            <span className="cb-fields-title">
              <strong>{t({ zh: "识别出的文字", en: "Recognized text" })}</strong>
              <span>{duplicate && !unresolved
                ? t({ zh: "人脉里有一位可能是同一个人，见下方。", en: "Someone in your network may be this person — see below." })
                : unresolved
                  ? t({ zh: "黄色字段需要核对，请对照左侧照片。", en: "Check the amber fields against the photo." })
                  : t({ zh: "需要核对的字段已处理，确认后进入下一张。", en: "Flagged fields are handled — confirm to move on." })}</span>
            </span>
            <span className={`cb-check-chip${unresolved ? "" : " cb-check-chip-ok"}`}>
              {unresolved ? t({ zh: `${unresolved} 处需核对`, en: `${unresolved} to check` }) : t({ zh: "已核对", en: "Checked" })}
            </span>
          </div>



          {active.hasTerminalFailure ? (
            <div className="cb-notice cb-notice-warning">
              {t({ zh: "这张没有识别出来，可以重新识别、对照照片手动填写，或者跳过。", en: "This one wasn't recognized — retry, type it in from the photo, or skip it." })}
              <button className="btn cb-btn-soft" disabled={busy} onClick={() => void batch.retryRecognition(active)} type="button">{t({ zh: "重新识别", en: "Retry" })}</button>
            </div>
          ) : null}

          {INGEST_V2_FIELDS.map(field => {
            const value = draft.fields[field];
            const edited = value !== baseline.fields[field] && draft.fieldSources[field] === null;
            const tag = fieldTag({ edited, flagged: flagged.has(field), value });
            const alternatives = [...new Set(active.items.flatMap(item => fieldCandidates(item).filter(candidate => candidate.field === field).map(candidate => candidate.value)))]
              .filter(candidate => candidate !== value);
            return (
              <div className={`cb-rfield cb-rfield-${tag.kind}`} key={field}>
                <span className="cb-rfield-head"><span>{t(FIELD_LABELS[field])}</span><span className={`cb-rtag cb-rtag-${tag.kind}`}>{t(tag.label)}</span></span>
                <input
                  aria-label={t(FIELD_LABELS[field])}
                  className="cb-rinput"
                  disabled={busy}
                  onChange={event => setDrafts(current => ({ ...current, [active.cardId]: setManualDraftField(current[active.cardId] ?? draft, field, event.target.value) }))}
                  placeholder={value ? "" : t({ zh: "未识别到，请对照照片填写", en: "Not found — type it from the photo" })}
                  value={value}
                />
                {alternatives.length && !edited ? (
                  <span className="cb-alts">
                    {t({ zh: "可能是", en: "Maybe" })}
                    {alternatives.map(alternative => {
                      const candidate = active.items.flatMap(item => fieldCandidates(item)).find(entry => entry.field === field && entry.value === alternative)!;
                      return <button className="btn cb-alt" key={alternative} onClick={() => setDrafts(current => ({ ...current, [active.cardId]: setDraftFieldSource(current[active.cardId] ?? draft, field, candidate) }))} type="button">{alternative}</button>;
                    })}
                  </span>
                ) : null}
              </div>
            );
          })}

          <div className="cb-rfield cb-rfield-notes">
            <span className="cb-rfield-head"><span>{t({ zh: "备注", en: "Notes" })}</span><span className="cb-rtag cb-rtag-ok">{t({ zh: "名片上的其他信息", en: "Everything else on the card" })}</span></span>
            <textarea
              aria-label={t({ zh: "备注", en: "Notes" })}
              className="cb-rinput cb-rnotes"
              disabled={busy}
              onChange={event => setDrafts(current => ({ ...current, [active.cardId]: setManualDraftNotes(current[active.cardId] ?? draft, event.target.value) }))}
              placeholder={t({ zh: "传真、微信、网址等没有单独字段的信息会放在这里，可以修改", en: "Fax, WeChat, website and other details land here — edit freely" })}
              rows={Math.min(8, Math.max(3, draft.fields.notes.split("\n").length))}
              value={draft.fields.notes}
            />
          </div>

          {candidate ? <CandidatePanel candidate={candidate} draft={draft} t={t} /> : null}

          {error ? <div className="cb-notice cb-notice-error" role="alert">{error}</div> : null}

          <div className="cb-review-actions">
            <div className={candidate ? "cb-review-pair" : "cb-review-single"}>
              {candidate ? (
                <button className="btn cb-review-merge" disabled={busy} onClick={() => void act("merge")} type="button">
                  {t({ zh: "已有联系人，合并", en: "Existing contact — merge" })}
                </button>
              ) : null}
              <button className="btn cb-review-confirm" disabled={busy} onClick={() => void act("confirm")} type="button">
                {busy
                  ? t({ zh: "保存中…", en: "Saving…" })
                  : remainingAfter
                    ? unresolved ? t({ zh: "照原样确认，下一张", en: "Confirm as is, next" }) : t({ zh: "确认无误，下一张", en: "Looks right, next" })
                    : t({ zh: "确认，完成本批", en: "Confirm and finish" })}
                <span className="cb-kbd" aria-hidden>↵</span>
              </button>
            </div>
            {candidate ? (
              <span className="cb-review-hint">{t({ zh: "「确认无误」会新建一位联系人；「合并」把名片上的新信息补进已有联系人，不覆盖原有内容。", en: "“Looks right” adds a new contact; “Merge” adds the card’s new details to the existing one without overwriting anything." })}</span>
            ) : null}
            <div className="cb-review-minor">
              <button className="btn cb-btn-ghost cb-btn-ghost-sm" disabled={busy || queue.length < 2} onClick={() => {
                const index = queue.findIndex(card => card.cardId === active.cardId);
                const previous = [...queue.slice(0, index).reverse(), ...queue.slice(index + 1).reverse()].find(card => !card.allConfirmed && !isCardSkipped(card));
                if (previous) openCard(previous.cardId);
              }} type="button">{t({ zh: "← 上一张", en: "← Previous" })}</button>
              <span className="cb-review-links">
                <button className="btn cb-text-btn" disabled={busy} onClick={() => void act("later")} type="button">{t({ zh: "稍后处理", en: "Later" })}</button>
                <button className="btn cb-text-btn cb-text-danger" disabled={busy} onClick={() => void act("skip")} type="button">{t({ zh: "不是名片，删除", en: "Not a card — remove" })}</button>
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
  onBrowse?: (target: BrowseTarget) => void;
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
    <div className="cb-parse" aria-live="polite" data-screen-label="10a 正在解析">
      <div className="cb-parse-head">
        <span className="cb-kicker">{stage === "upload" ? t({ zh: `正在上传 · 共 ${total || "…"} 张`, en: `Uploading · ${total || "…"} cards` }) : t({ zh: `✓ 已接收 ${total} 张名片照片`, en: `✓ ${total} card photos received` })}</span>
        <h3 className="cb-review-h">{autoRunning ? t({ zh: "快好了，正在整理结果", en: "Almost there — sorting results" }) : t({ zh: "名片正在后台批量解析。", en: "Your cards are being read in the background." })}</h3>
        <p className="cb-p">{sub}</p>
      </div>
      <div className="cb-parse-steps">
        {steps.map((step, index) => (
          <span className={`cb-parse-step${index < current ? " cb-parse-step-done" : index === current ? " cb-parse-step-on" : ""}`} key={step.key}>
            <span className="cb-parse-dot" aria-hidden>{index < current ? "✓" : index + 1}</span>
            {t(step.label)}
          </span>
        ))}
      </div>
      {stage !== "upload" ? (
        <span className="cb-parse-count"><span>{t({ zh: `已解析 ${settled} / ${total}`, en: `${settled} / ${total} read` })}</span><span>{total ? Math.round((settled / total) * 100) : 0}%</span></span>
      ) : null}
      <span className="cb-parse-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></span>
      {missing > 0 ? (
        <div className="cb-notice cb-notice-warning">
          {t({ zh: `页面刷新过，还有 ${missing} 张照片需要重新选择（选同一批即可，会按内容自动匹配）。`, en: `The page reloaded — re-select ${missing} photo(s) (same ones; they're matched by content).` })}
          <button className="btn cb-btn-soft" onClick={onReattach} type="button">{t({ zh: "重新选择照片", en: "Re-select photos" })}</button>
        </div>
      ) : null}
      {uploadFailed ? (
        <div className="cb-notice cb-notice-warning">
          {t({ zh: "有照片没传上去。", en: "Some photos didn't upload." })}
          <button className="btn cb-btn-soft" onClick={onRetry} type="button">{t({ zh: "重试上传", en: "Retry upload" })}</button>
        </div>
      ) : null}
      <div className="cb-parse-wall">
        {(cards.length ? cards : Array.from({ length: 3 }, () => null)).map((card, index) => {
          if (!card) return <span className="cb-mini cb-mini-wait" key={`ph-${index}`}><span className="cb-mini-lines" aria-hidden><i /><i /><i /></span></span>;
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
            <span className={`cb-mini cb-mini-${kind}`} key={card.cardId}>
              {kind === "reading" ? <span className="cb-mini-scan" aria-hidden /> : null}
              {kind === "done" && fields?.displayName ? (
                <span className="cb-mini-text"><strong>{fields.displayName}</strong><span>{fields.organization || fields.role || "—"}</span></span>
              ) : <span className="cb-mini-lines" aria-hidden><i /><i /><i /></span>}
              <span className="cb-mini-foot"><span className="cb-mini-name">{card.items[0]?.sourceFileName}</span><span className={`cb-mini-st cb-mini-st-${kind}`}>{t(label)}</span></span>
            </span>
          );
        })}
      </div>
      {stage !== "upload" ? (
        <div className="cb-parse-wait">
          <span>{t({ zh: "等待的时候，可以先", en: "While you wait, you can" })}</span>
          <div className="cb-actions cb-actions-tight">
            {onBrowse ? (
              <>
                <button className="btn cb-btn-dark" onClick={() => onBrowse("events")} type="button">{t({ zh: "看看近期活动", en: "Browse upcoming events" })}</button>
                <button className="btn cb-btn-outline" onClick={() => onBrowse("home")} type="button">{t({ zh: "去 iOrbit 探索", en: "Explore iOrbit" })}</button>
              </>
            ) : (
              <>
                <a className="cb-btn-dark cb-link-btn" href="/app/events">{t({ zh: "看看近期活动", en: "Browse upcoming events" })}</a>
                <a className="cb-btn-outline cb-link-btn" href="/app/agent">{t({ zh: "去 iOrbit 探索", en: "Explore iOrbit" })}</a>
              </>
            )}
          </div>
        </div>
      ) : null}
      <div className="cb-tip cb-tip-sm">
        <span className="cb-spark" aria-hidden>⛨</span>
        <span>{t({ zh: "只有没有疑点的名片会自动导入；拿不准的会交给你逐张确认。Orbit 不会以你的名义给任何人发消息。", en: "Only cards with no doubts are imported automatically; anything uncertain comes to you. Orbit never messages anyone on your behalf." })}</span>
      </div>
    </div>
  );
}

// ── 解析提醒（新用户引导.dc.html 621–650 行）：离开解析界面时的进度胶囊、解析完成弹窗、待确认胶囊 ──
export function CardBatchReminders(props: { batch: CardBatch; onOpen: () => void; t: T; viewingImport: boolean }) {
  return (
    <div className="cbx cbx-float">
      <style>{CARD_BATCH_STYLES}</style>
      <CardBatchRemindersBody {...props} />
    </div>
  );
}

function CardBatchRemindersBody({ batch, onOpen, t, viewingImport }: { batch: CardBatch; onOpen: () => void; t: T; viewingImport: boolean }) {
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
      <div className="cb-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="cb-parse-done-title">
        <div className="cb-modal">
          <button aria-label={t({ zh: "关闭", en: "Close" })} className="btn cb-modal-close" onClick={markNotified} type="button">×</button>
          <span className="cb-modal-badge" aria-hidden>✓</span>
          <div className="cb-head">
            <h2 className="cb-modal-title" id="cb-parse-done-title">{t({ zh: `${total} 张名片解析完毕`, en: `${total} cards read` })}</h2>
            <p className="cb-p cb-p-sm">{pending.length
              ? t({ zh: "识别可靠的已自动导入。还有几张不太确定，需要你对照照片看一眼，大约 1 分钟。", en: "The clear ones are already imported. A few are uncertain — check them against the photo, about a minute." })
              : t({ zh: "全部识别可靠，已自动导入你的人脉。", en: "All of them were clear and are now in your network." })}</p>
          </div>
          <div className="cb-modal-stats">
            <span className="cb-fin-stat"><strong>{autoCount}</strong><span>{t({ zh: "已自动导入", en: "Auto-imported" })}</span></span>
            <span className="cb-fin-stat cb-fin-stat-amber"><strong>{pending.length}</strong><span>{t({ zh: "需要你确认", en: "Need your check" })}</span></span>
          </div>
          <div className="cb-modal-actions">
            <button className="btn cb-review-confirm" onClick={() => { markNotified(); onOpen(); }} type="button">
              {pending.length ? t({ zh: `去确认 ${pending.length} 张名片`, en: `Check ${pending.length} card(s)` }) : t({ zh: "查看结果", en: "See results" })}
            </button>
            <button className="btn cb-text-btn cb-modal-later" onClick={markNotified} type="button">{t({ zh: "稍后再说", en: "Later" })}</button>
          </div>
        </div>
      </div>
    );
  }

  if (parsing) {
    return (
      <button className="btn cb-float-pill" onClick={onOpen} type="button">
        <span className="cb-spark" aria-hidden>✦</span>
        <span className="cb-float-copy">
          <span>{status === "collecting" ? t({ zh: "正在上传名片", en: "Uploading cards" }) : t({ zh: `正在解析名片 ${settledCount}/${total}`, en: `Reading cards ${settledCount}/${total}` })}</span>
          <span className="cb-float-track"><span style={{ width: `${status === "collecting" ? 8 : percent}%` }} /></span>
        </span>
      </button>
    );
  }

  if (pending.length > 0) {
    return (
      <button className="btn cb-float-pill cb-float-pill-dark" onClick={onOpen} type="button">
        {t({ zh: `${pending.length} 张名片待你确认 →`, en: `${pending.length} card(s) to check →` })}
      </button>
    );
  }
  return null;
}

const MATCH_REASON: Record<ContactCandidate["matchedOn"][number], Copy> = {
  email: { zh: "同邮箱", en: "Same email" },
  name_organization: { zh: "同名同公司", en: "Same name & company" },
  phone: { zh: "同电话", en: "Same phone" },
};

const CANDIDATE_ROWS: readonly { field: "displayName" | "organization" | "role" | "phone" | "email" | "address"; label: Copy }[] = [
  { field: "displayName", label: { zh: "姓名", en: "Name" } },
  { field: "organization", label: { zh: "公司", en: "Company" } },
  { field: "role", label: { zh: "职位", en: "Title" } },
  { field: "phone", label: { zh: "电话", en: "Phone" } },
  { field: "email", label: { zh: "邮箱", en: "Email" } },
  { field: "address", label: { zh: "地址", en: "Address" } },
];

function sameValue(field: string, left: string, right: string): boolean {
  if (field === "phone") return left.replace(/\D/g, "") === right.replace(/\D/g, "");
  const norm = (value: string) => value.normalize("NFKC").replace(/\s+/g, field === "displayName" ? "" : " ").trim().toLowerCase();
  return norm(left) === norm(right);
}

/** 「可能是同一个联系人」：已有联系人的结构化信息，逐项标出与名片相同 / 不同 / 名片可补充。 */
function CandidatePanel({ candidate, draft, t }: { candidate: ContactCandidate; draft: IngestV2CardDraft; t: T }) {
  return (
    <div className="cb-match">
      <div className="cb-match-head">
        <span className="cb-match-title"><span className="cb-spark" aria-hidden>✦</span><strong>{t({ zh: "可能是同一个联系人", en: "Possibly the same person" })}</strong></span>
        <span className="cb-match-why">{candidate.matchedOn.map(reason => t(MATCH_REASON[reason])).join(" · ")}</span>
      </div>
      <dl className="cb-match-grid">
        {CANDIDATE_ROWS.map(({ field, label }) => {
          const existing = candidate[field].trim();
          const card = draft.fields[field].trim();
          const state = !existing && !card ? "none" : !existing ? "fill" : !card ? "keep" : sameValue(field, existing, card) ? "same" : "diff";
          const tag: Record<string, Copy | null> = {
            diff: { zh: "与名片不同", en: "Differs" },
            fill: { zh: "名片可补充", en: "Card adds this" },
            keep: null,
            none: null,
            same: { zh: "一致", en: "Same" },
          };
          return (
            <div className={`cb-match-row cb-match-${state}`} key={field}>
              <dt>{t(label)}</dt>
              <dd>
                <span className="cb-match-val">{existing || "—"}</span>
                {tag[state] ? <span className="cb-match-tag">{t(tag[state]!)}</span> : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function FinishedPanel({ autoCount, laterCount, mergedCount, onReset, setAside, t, total, userCount }: { autoCount: number; laterCount: number; mergedCount: number; onReset: () => void; setAside: number; t: T; total: number; userCount: number }) {
  return (
    <section className="cb-fin">
      <div className="cb-head">
        <span className="cb-fin-kicker">{t({ zh: "✓ 本批名片已全部处理", en: "✓ This batch is done" })}</span>
        <h3 className="cb-review-h">{mergedCount
          ? t({ zh: `本批 ${total} 张名片，${autoCount + userCount} 位新联系人已进入你的人脉，${mergedCount} 张并入了已有联系人。`, en: `${total} cards — ${autoCount + userCount} new contacts added, ${mergedCount} merged into existing ones.` })
          : t({ zh: `本批 ${total} 张名片，${autoCount + userCount} 位联系人已进入你的人脉。`, en: `${total} cards — ${autoCount + userCount} contacts are now in your network.` })}</h3>
      </div>
      <div className="cb-fin-stats">
        <span className="cb-fin-stat"><strong>{autoCount}</strong><span>{t({ zh: "自动导入", en: "Auto-imported" })}</span></span>
        <span className="cb-fin-stat cb-fin-stat-indigo"><strong>{userCount}</strong><span>{t({ zh: "经你确认", en: "Confirmed by you" })}</span></span>
        {mergedCount ? <span className="cb-fin-stat cb-fin-stat-indigo"><strong>{mergedCount}</strong><span>{t({ zh: "并入已有联系人", en: "Merged into existing" })}</span></span> : null}
        <span className="cb-fin-stat"><strong>{setAside}</strong><span>{t({ zh: "稍后处理 / 已删除", en: "Later / removed" })}</span></span>
      </div>
      {laterCount ? <span className="cb-label-note cb-privacy">{t({ zh: `${laterCount} 张「稍后处理」的名片会留在人脉 → 导入人脉里，随时可以继续确认。`, en: `${laterCount} card(s) set aside stay under Network → Import, ready whenever you are.` })}</span> : null}
      <div className="cb-actions">
        <button className="btn cb-link-under cb-link-under-strong" onClick={onReset} type="button">{t({ zh: "再上传一批名片", en: "Upload another batch" })}</button>
      </div>
    </section>
  );
}
