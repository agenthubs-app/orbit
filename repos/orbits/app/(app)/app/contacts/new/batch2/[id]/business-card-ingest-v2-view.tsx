"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  IngestBatchDTO,
  IngestItemDTO,
} from "../../../../../../../features/acquisition/business-card-ingest-v2/contract";
import { aggregateBusinessCardNotes } from "../../../../../../../features/acquisition/business-card-notes-aggregation";
import { useOrbitLanguage } from "../../../../orbit-language-context";
import {
  INGEST_V2_API_BASE,
  fetchBatchDetail,
  getPendingFiles,
  postAction,
  resolveUploadMimeType,
  sha256OfFile,
  uploadItemContent,
  type IngestBatchDetail,
} from "../ingest-v2-client";

type Translate = (copy: { en: string; zh: string }) => string;

const UPLOAD_CONCURRENCY = 3;

interface FixedFields {
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  relationshipContext: string;
  notes: string;
}

// 日中韩名片以突出印刷的原文姓名为主显示名；模型的 fullName 常给罗马字，
// 用它当主名会把「渡辺」变成 "Watanabe"。原文含 CJK 时优先 nativeFullName。
const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

function preferredDisplayName(
  extraction: IngestItemDTO["extraction"],
): string {
  const native = extraction?.nativeFullName ?? "";
  if (native && CJK_CHAR_RE.test(native)) {
    return native;
  }
  return extraction?.fullName ?? native;
}

function initialFields(item: IngestItemDTO): FixedFields {
  const extraction = item.extraction;
  const email = extraction?.emails[0]?.value ?? "";
  // 主电话只认 phone/mobile：contactPoints 现在还装着微信/LINE/网站等通用
  // 联系方式，"非传真即电话" 的旧写法会把微信号填进电话框。
  const phone =
    extraction?.contactPoints.find(
      (point) => point.type === "phone" || point.type === "mobile",
    )?.value ?? "";
  return {
    displayName: preferredDisplayName(extraction),
    email,
    notes: extraction
      ? aggregateBusinessCardNotes(extraction, {
          email: email || null,
          phone: phone || null,
        })
      : "",
    organization: extraction?.organization ?? "",
    phone,
    relationshipContext: `批量导入 · ${item.sourceFileName}`,
    role: extraction?.title ?? "",
  };
}

const EMPTY_FIELDS: FixedFields = {
  displayName: "",
  email: "",
  notes: "",
  organization: "",
  phone: "",
  relationshipContext: "",
  role: "",
};

type UploadPhaseState =
  | { kind: "waiting_file" }
  | { kind: "uploading" }
  | { kind: "failed"; code: string };

const ITEM_STATUS_COPY: Record<IngestItemDTO["status"], { en: string; zh: string }> = {
  awaiting_upload: { en: "Preparing", zh: "准备中" },
  confirmed: { en: "Confirmed", zh: "已收录" },
  excluded: { en: "Excluded", zh: "已排除" },
  extracted: { en: "Recognized", zh: "已识别" },
  processing: { en: "Reading", zh: "识别中" },
  queued: { en: "Waiting", zh: "排队中" },
  skipped: { en: "Skipped", zh: "已跳过" },
  terminal_failed: { en: "Failed", zh: "识别失败" },
  uploaded: { en: "Uploaded", zh: "已上传" },
};

function itemImageUrl(batchId: string, item: IngestItemDTO): string {
  return `${INGEST_V2_API_BASE}/${batchId}/items/${item.id}/image`;
}

// worker 早就把 reviewIssues 算好了，此前 view 一个都没渲染——用户只能肉眼
// 从头找差异。这里按 code 给用户语言的说明；未知 code 落回服务端原文。
const REVIEW_ISSUE_COPY: Record<string, { en: string; zh: string }> = {
  IDENTITY_MISSING: { en: "No name was recognized on this card.", zh: "没有识别到姓名。" },
  INVALID_EMAIL: { en: "An email address looks invalid — check it against the card.", zh: "有邮箱格式可疑，请对照图片核对。" },
  INVALID_PHONE: { en: "A phone number looks invalid — check it against the card.", zh: "有电话号码可疑，请对照图片核对。" },
  MULTIPLE_OFFICES: { en: "Multiple offices are printed — confirm the primary one.", zh: "名片上有多个办公地点，请确认主要地点。" },
  SHARED_CONTACT_VALUE: { en: "The same number appears under more than one label.", zh: "同一号码出现在多个标签下，请确认归属。" },
  NATIVE_ROMANIZED_NAME_CONFLICT: { en: "Native and romanized names differ — confirm which is primary.", zh: "原文姓名与罗马字拼写不同，请确认主名。" },
  ORG_SUFFIX_MISSING: { en: "The company name may be missing a legal suffix (株式会社 / Inc. …).", zh: "公司名可能丢失了「株式会社／Inc.」等后缀，请对照图片补全。" },
  VERIFICATION_MISMATCH: { en: "A second character-level read disagrees with a field — verify it character by character.", zh: "二次逐字符识别与结果不一致，请对照图片逐字核对标出的字段。" },
};

function ReviewIssueList({ issues, t }: { issues: IngestItemDTO["reviewIssues"]; t: Translate }) {
  if (issues.length === 0) {
    return null;
  }
  return (
    <ul className="bci-issues" data-ingest-review-issues>
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`}>
          {REVIEW_ISSUE_COPY[issue.code] ? t(REVIEW_ISSUE_COPY[issue.code]) : issue.message}
        </li>
      ))}
    </ul>
  );
}

const CONTACT_POINT_TYPE_LABELS: Record<string, { en: string; zh: string }> = {
  phone: { en: "Phone", zh: "电话" },
  mobile: { en: "Mobile", zh: "手机" },
  fax: { en: "Fax", zh: "传真" },
  wechat: { en: "WeChat", zh: "微信" },
  line: { en: "LINE", zh: "LINE" },
  whatsapp: { en: "WhatsApp", zh: "WhatsApp" },
  website: { en: "Website", zh: "网站" },
  other: { en: "Other", zh: "其他" },
};

// 固定表单只有一个邮箱/电话槽位，识别出的其余联系方式此前只沉在备注里。
// 这里把它们列成可见的行：邮箱/电话可一键填入对应字段，其余（微信等）保证可见。
function ExtraContactSignals({
  extraction,
  fields,
  onChange,
  t,
}: {
  extraction: NonNullable<IngestItemDTO["extraction"]>;
  fields: FixedFields;
  onChange: (next: FixedFields) => void;
  t: Translate;
}) {
  const extraEmails = extraction.emails.filter((email) => email.value !== fields.email);
  const extraPoints = extraction.contactPoints.filter((point) => point.value !== fields.phone);
  if (extraEmails.length === 0 && extraPoints.length === 0) {
    return null;
  }
  return (
    <div className="bci-signals" data-ingest-extra-signals>
      <span className="bci-signals-label">{t({ en: "Also recognized", zh: "还识别到" })}</span>
      {extraEmails.map((email, index) => (
        <button
          className="bci-signal"
          key={`email-${index}`}
          onClick={() => onChange({ ...fields, email: email.value })}
          title={t({ en: "Use as the email", zh: "填入邮箱" })}
          type="button"
        >
          {t({ en: "Email", zh: "邮箱" })}{email.label ? ` · ${email.label}` : ""}：{email.value}
        </button>
      ))}
      {extraPoints.map((point, index) => {
        const fillable = point.type === "phone" || point.type === "mobile";
        const label = CONTACT_POINT_TYPE_LABELS[point.type] ?? CONTACT_POINT_TYPE_LABELS.other;
        return (
          <button
            className="bci-signal"
            disabled={!fillable}
            key={`point-${index}`}
            onClick={fillable ? () => onChange({ ...fields, phone: point.value }) : undefined}
            title={fillable ? t({ en: "Use as the phone", zh: "填入电话" }) : undefined}
            type="button"
          >
            {t(label)}{point.label ? ` · ${point.label}` : ""}：{point.value}
          </button>
        );
      })}
    </div>
  );
}

function FieldEditor({
  fields,
  onChange,
  t,
}: {
  fields: FixedFields;
  onChange: (next: FixedFields) => void;
  t: Translate;
}) {
  return (
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
        <label className="bci-field" key={key}>
          <span>{t(label)}</span>
          <input
            onChange={(event) => onChange({ ...fields, [key]: event.target.value })}
            value={fields[key]}
          />
        </label>
      ))}
      <label className="bci-field">
        <span>{t({ en: "Notes (nothing gets lost)", zh: "备注（其余信息都在这里）" })}</span>
        <textarea
          onChange={(event) => onChange({ ...fields, notes: event.target.value })}
          rows={6}
          value={fields.notes}
        />
      </label>
    </>
  );
}

export function BusinessCardIngestV2View({ batchId }: { batchId: string }) {
  const { t } = useOrbitLanguage();
  const [detail, setDetail] = useState<IngestBatchDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicateItemId, setDuplicateItemId] = useState<string | null>(null);
  const [manualItemId, setManualItemId] = useState<string | null>(null);
  const [uploadStates, setUploadStates] = useState<Record<string, UploadPhaseState>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  const uploadingRef = useRef(false);
  const reattachRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<IngestItemDTO | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchBatchDetail(batchId);
      if (next) {
        setDetail(next);
      }
    } catch {
      // 网络抖动时保留上一次状态，下一轮轮询恢复。
    }
  }, [batchId]);

  useEffect(() => {
    pendingFilesRef.current = getPendingFiles(batchId);
    void refresh();
  }, [batchId, refresh]);

  const status = detail?.batch.status;
  useEffect(() => {
    if (status !== "collecting" && status !== "processing") {
      return;
    }
    const timer = setInterval(() => void refresh(), 3_000);
    return () => clearInterval(timer);
  }, [status, refresh]);

  const pumpUploads = useCallback(async () => {
    if (uploadingRef.current) {
      return;
    }
    uploadingRef.current = true;
    try {
      for (;;) {
        const current = await fetchBatchDetail(batchId);
        if (!current || current.batch.status !== "collecting") {
          break;
        }
        setDetail(current);
        const uploadable = current.items.filter(
          (item) =>
            item.status === "awaiting_upload" &&
            pendingFilesRef.current.has(item.clientDigest),
        );
        if (uploadable.length === 0) {
          break;
        }
        const wave = uploadable.slice(0, UPLOAD_CONCURRENCY);
        setUploadStates((previous) => {
          const next = { ...previous };
          for (const item of wave) {
            next[item.id] = { kind: "uploading" };
          }
          return next;
        });
        await Promise.all(
          wave.map(async (item) => {
            const file = pendingFilesRef.current.get(item.clientDigest);
            if (!file) {
              return;
            }
            const result = await uploadItemContent({ batchId, itemId: item.id, file });
            setUploadStates((previous) => {
              const next = { ...previous };
              if (result.ok) {
                delete next[item.id];
              } else {
                next[item.id] = { kind: "failed", code: result.errorCode ?? "UPLOAD_FAILED" };
              }
              return next;
            });
            if (result.ok || result.errorCode?.startsWith("IMAGE_INVALID")) {
              pendingFilesRef.current.delete(item.clientDigest);
            }
          }),
        );
      }
    } finally {
      uploadingRef.current = false;
      await refresh();
    }
  }, [batchId, refresh]);

  useEffect(() => {
    if (status === "collecting" && pendingFilesRef.current.size > 0) {
      void pumpUploads();
    }
  }, [status, pumpUploads]);

  async function attachFiles(fileList: FileList | null): Promise<void> {
    const files = Array.from(fileList ?? []);
    for (const file of files) {
      const digest = await sha256OfFile(file);
      pendingFilesRef.current.set(digest, file);
    }
    void pumpUploads();
  }

  async function withBusy(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setGlobalError(null);
    try {
      await action();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitReplace(item: IngestItemDTO, file: File): Promise<void> {
    await withBusy(async () => {
      const response = await fetch(
        `${INGEST_V2_API_BASE}/${batchId}/items/${item.id}/replace`,
        {
          body: file,
          headers: {
            "Content-Type": resolveUploadMimeType(file),
            "If-Match": String(item.version),
          },
          method: "POST",
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setGlobalError(body?.error?.message ?? `HTTP ${response.status}`);
      }
    });
  }

  async function submitConfirm(
    item: IngestItemDTO,
    fields: FixedFields,
    allowDuplicate: boolean,
    manual: boolean,
  ): Promise<void> {
    await withBusy(async () => {
      const response = await postAction(
        `/${batchId}/items/${item.id}/${manual ? "manual-entry" : "confirm"}`,
        { ...fields, allowDuplicate },
      );
      const body = (await response.json().catch(() => null)) as {
        data?: { state?: string };
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        setGlobalError(body?.error?.message ?? `HTTP ${response.status}`);
        return;
      }
      if (body?.data?.state === "duplicate_review") {
        setDuplicateItemId(item.id);
      } else {
        setDuplicateItemId(null);
        setManualItemId(null);
      }
    });
  }

  if (!detail) {
    return null;
  }
  const { batch, items } = detail;

  return (
    <section className="bci-shell">
      <style>{VIEW_STYLE}</style>
      <input
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        hidden
        multiple
        onChange={(event) => void attachFiles(event.target.files)}
        ref={reattachRef}
        type="file"
      />
      <input
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && replaceTarget) {
            void submitReplace(replaceTarget, file);
          }
          setReplaceTarget(null);
          event.target.value = "";
        }}
        ref={replaceRef}
        type="file"
      />
      <div className="bci-headline">
        <div className="eyebrow">
          {t({ en: "BATCH IMPORT", zh: "批量导入" })} ·{" "}
          <span className="bci-batch-id">{batch.id.slice(0, 13)}</span>
        </div>
      </div>
      {globalError ? <div className="bci-warn">{globalError}</div> : null}
      {renderPhase()}
      <div className="bci-privacy">
        {t({
          en: "Originals are never stored. Recognition copies are deleted right after you confirm or skip.",
          zh: "原始照片不会被保存；识别用的图片副本在确认或跳过后立即删除。",
        })}
      </div>
    </section>
  );

  function renderPhase() {
    if (batch.status === "cancelled" || batch.status === "expired") {
      return (
        <>
          <h2>
            {batch.status === "cancelled"
              ? t({ en: "Batch cancelled", zh: "批次已取消" })
              : t({ en: "Batch expired", zh: "批次已过期" })}
          </h2>
          <p className="bci-lede">
            {t({
              en: "Confirmed contacts are kept; everything else was cleaned up.",
              zh: "已确认的联系人会保留，其余项目与图片均已清理。",
            })}
          </p>
          <a className="btn btn-primary" href="/app/contacts/new">
            {t({ en: "Back to import center", zh: "返回导入中心" })}
          </a>
        </>
      );
    }

    if (batch.status === "completed") {
      const confirmed = items.filter((item) => item.status === "confirmed").length;
      const skipped = items.filter((item) => item.status === "skipped").length;
      return (
        <>
          <h2>{t({ en: "Batch completed", zh: "批次已完成" })}</h2>
          <p className="bci-lede">
            {t({ en: "Confirmed", zh: "已收录" })} {confirmed} ·{" "}
            {t({ en: "Skipped", zh: "已跳过" })} {skipped}
          </p>
          <a className="btn btn-primary" href="/app/contacts">
            {t({ en: "Open contacts", zh: "查看名片夹" })}
          </a>
        </>
      );
    }

    if (batch.status === "collecting") {
      return renderCollecting();
    }
    if (batch.status === "processing") {
      return renderProcessing();
    }
    return renderReview();
  }

  function renderCollecting() {
    const uploaded = items.filter((item) => item.status === "uploaded").length;
    const excluded = items.filter((item) => item.status === "excluded").length;
    const awaiting = items.filter((item) => item.status === "awaiting_upload");
    const readyToFinalize = awaiting.length === 0 && uploaded > 0;
    const missingFiles = awaiting.filter(
      (item) =>
        !pendingFilesRef.current.has(item.clientDigest) && !uploadStates[item.id],
    );

    return (
      <>
        <h2>{t({ en: "Uploading photos…", zh: "正在上传照片…" })}</h2>
        <p className="bci-lede">
          {uploaded + excluded}/{batch.expectedItems}{" "}
          {t({ en: "done", zh: "已就绪" })}
          {excluded > 0 ? ` · ${t({ en: "excluded", zh: "已排除" })} ${excluded}` : ""}
        </p>
        <div className="bci-progress">
          <div
            className="bci-progress-fill"
            style={{
              width: `${batch.expectedItems ? ((uploaded + excluded) / batch.expectedItems) * 100 : 0}%`,
            }}
          />
        </div>
        {missingFiles.length > 0 ? (
          <div className="bci-warn">
            {t({
              en: `${missingFiles.length} photo(s) need to be re-attached (the page was reloaded). Choose the same photos again — they are matched by content.`,
              zh: `${missingFiles.length} 张照片需要重新挂载（页面曾刷新）。重新选择同一批照片即可，系统按内容自动匹配。`,
            })}
          </div>
        ) : null}
        <div className="bci-rows">
          {items.map((item) => {
            const uploadState = uploadStates[item.id];
            const statusCopy =
              item.status === "awaiting_upload"
                ? uploadState?.kind === "uploading"
                  ? { en: "Uploading…", zh: "上传中…" }
                  : uploadState?.kind === "failed"
                    ? { en: `Invalid: ${uploadState.code}`, zh: `图片无效：${uploadState.code}` }
                    : { en: "Waiting for file", zh: "等待文件" }
                : ITEM_STATUS_COPY[item.status];
            return (
              <div className={`bci-row bci-row-${item.status}`} key={item.id}>
                <span className="bci-row-seq">#{item.seq}</span>
                <span className="bci-row-name">{item.sourceFileName}</span>
                <span className="bci-row-status">{t(statusCopy)}</span>
                {item.status === "awaiting_upload" ? (
                  <button
                    className="btn btn-ghost bci-row-action"
                    disabled={busy}
                    onClick={() =>
                      void withBusy(async () => {
                        await postAction(`/${batchId}/items/${item.id}/exclude`);
                      })
                    }
                    type="button"
                  >
                    {t({ en: "Exclude", zh: "排除" })}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="bci-actions">
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() =>
              void withBusy(async () => {
                await postAction(`/${batchId}/cancel`);
              })
            }
            type="button"
          >
            {t({ en: "Cancel batch", zh: "取消批次" })}
          </button>
          {missingFiles.length > 0 ? (
            <button
              className="btn btn-ghost"
              onClick={() => reattachRef.current?.click()}
              type="button"
            >
              {t({ en: "Re-attach photos", zh: "重新选择照片" })}
            </button>
          ) : null}
          <button
            className="btn btn-primary"
            disabled={busy || !readyToFinalize}
            onClick={() =>
              void withBusy(async () => {
                const response = await postAction(`/${batchId}/finalize`);
                if (!response.ok) {
                  const body = (await response.json().catch(() => null)) as {
                    error?: { message?: string };
                  } | null;
                  setGlobalError(body?.error?.message ?? `HTTP ${response.status}`);
                }
              })
            }
            type="button"
          >
            {t({ en: "Start recognition", zh: "开始识别" })}
          </button>
        </div>
      </>
    );
  }

  function renderProcessing() {
    const settled = items.filter((item) =>
      ["extracted", "terminal_failed", "confirmed", "skipped", "excluded"].includes(
        item.status,
      ),
    ).length;
    return (
      <>
        <h2>{t({ en: "Recognizing your cards…", zh: "正在识别名片…" })}</h2>
        <p className="bci-lede">
          {t({
            en: "You can leave this page — processing continues in the background.",
            zh: "可以离开本页，识别在后台继续；回来时进度自动恢复。",
          })}
        </p>
        <div className="bci-progress">
          <div
            className="bci-progress-fill"
            style={{ width: `${items.length ? (settled / items.length) * 100 : 0}%` }}
          />
        </div>
        <div className="bci-progress-label">
          {settled}/{items.length}
        </div>
        <div className="bci-rows">
          {items.map((item) => (
            <div className={`bci-row bci-row-${item.status}`} key={item.id}>
              <span className="bci-row-seq">#{item.seq}</span>
              <span className="bci-row-name">{item.sourceFileName}</span>
              <span className="bci-row-status">
                {t(ITEM_STATUS_COPY[item.status])}
                {item.status === "queued" && item.attemptCount > 0
                  ? ` · ${t({ en: "retrying", zh: "等待重试" })}`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderReview() {
    const currentItem =
      items.find((item) => item.status === "extracted") ??
      items.find((item) => item.status === "terminal_failed") ??
      null;
    if (!currentItem) {
      const confirmed = items.filter((item) => item.status === "confirmed").length;
      const skipped = items.filter((item) => item.status === "skipped").length;
      return (
        <>
          <h2>{t({ en: "All cards reviewed", zh: "全部卡片已处理" })}</h2>
          <p className="bci-lede">
            {t({ en: "Confirmed", zh: "已收录" })} {confirmed} ·{" "}
            {t({ en: "Skipped", zh: "已跳过" })} {skipped}
          </p>
        </>
      );
    }
    return (
      <ReviewPane
        batchId={batchId}
        busy={busy}
        duplicate={duplicateItemId === currentItem.id}
        item={currentItem}
        manual={manualItemId === currentItem.id}
        onConfirm={(fields, allowDuplicate, manual) =>
          void submitConfirm(currentItem, fields, allowDuplicate, manual)
        }
        onManualToggle={() =>
          setManualItemId((previous) => (previous === currentItem.id ? null : currentItem.id))
        }
        onReplace={() => {
          setReplaceTarget(currentItem);
          replaceRef.current?.click();
        }}
        onRetry={() =>
          void withBusy(async () => {
            await postAction(`/${batchId}/items/${currentItem.id}/retry`);
          })
        }
        onSkip={() =>
          void withBusy(async () => {
            await postAction(`/${batchId}/items/${currentItem.id}/skip`);
            setDuplicateItemId(null);
            setManualItemId(null);
          })
        }
        remaining={
          items.filter(
            (item) => item.status === "extracted" || item.status === "terminal_failed",
          ).length
        }
        t={t}
      />
    );
  }
}

function ReviewPane({
  batchId,
  busy,
  duplicate,
  item,
  manual,
  onConfirm,
  onManualToggle,
  onReplace,
  onRetry,
  onSkip,
  remaining,
  t,
}: {
  batchId: string;
  busy: boolean;
  duplicate: boolean;
  item: IngestItemDTO;
  manual: boolean;
  onConfirm: (fields: FixedFields, allowDuplicate: boolean, manual: boolean) => void;
  onManualToggle: () => void;
  onReplace: () => void;
  onRetry: () => void;
  onSkip: () => void;
  remaining: number;
  t: Translate;
}) {
  const initial = useMemo(
    () => (item.status === "extracted" ? initialFields(item) : EMPTY_FIELDS),
    [item],
  );
  const [fields, setFields] = useState<FixedFields>(initial);
  const [editedItemId, setEditedItemId] = useState(item.id);
  useEffect(() => {
    if (item.id !== editedItemId) {
      setFields(item.status === "extracted" ? initialFields(item) : EMPTY_FIELDS);
      setEditedItemId(item.id);
    }
  }, [item, editedItemId]);

  const failed = item.status === "terminal_failed";

  return (
    <>
      <div className="eyebrow">
        {t({ en: "REVIEW", zh: "逐张确认" })} · {remaining}{" "}
        {t({ en: "left", zh: "张待处理" })}
      </div>
      <h2>
        #{item.seq} · {item.sourceFileName}
      </h2>
      <div className="bci-review">
        <div className="bci-review-image">
          {item.derivativeObjectKey ? (
            <img alt={t({ en: "Card image", zh: "名片图片" })} src={itemImageUrl(batchId, item)} />
          ) : (
            <div className="bci-image-missing">
              {t({ en: "Image removed", zh: "图片已删除" })}
            </div>
          )}
        </div>
        <div className="bci-review-form">
          {failed ? (
            <div className="bci-warn">
              {t({ en: "Recognition failed", zh: "识别失败" })}
              {item.errorCode ? ` · ${item.errorCode}` : ""}
              {item.errorCode === "LEASE_EXHAUSTED"
                ? ` · ${t({ en: "the photo may be too hard to read", zh: "照片可能过难识别" })}`
                : ""}
            </div>
          ) : null}
          {item.status === "extracted" ? (
            <ReviewIssueList issues={item.reviewIssues} t={t} />
          ) : null}
          {item.status === "extracted" || (failed && manual) ? (
            <FieldEditor fields={fields} onChange={setFields} t={t} />
          ) : null}
          {item.status === "extracted" && item.extraction ? (
            <ExtraContactSignals extraction={item.extraction} fields={fields} onChange={setFields} t={t} />
          ) : null}
          {duplicate ? (
            <div className="bci-warn">
              {t({
                en: "Looks like this person already exists in your contacts.",
                zh: "该联系人似乎已存在于你的名片夹。",
              })}
            </div>
          ) : null}
          <div className="bci-actions">
            <button className="btn btn-ghost" disabled={busy} onClick={onSkip} type="button">
              {duplicate
                ? t({ en: "Skip this card", zh: "跳过此卡" })
                : t({ en: "Skip", zh: "跳过" })}
            </button>
            {item.status === "extracted" ? (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => onConfirm(fields, duplicate, false)}
                type="button"
              >
                {duplicate
                  ? t({ en: "Create anyway", zh: "仍然创建" })
                  : t({ en: "Confirm and next", zh: "确认并下一张" })}
              </button>
            ) : manual ? (
              <>
                <button className="btn btn-ghost" disabled={busy} onClick={onManualToggle} type="button">
                  {t({ en: "Back", zh: "返回" })}
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || !fields.displayName.trim()}
                  onClick={() => onConfirm(fields, duplicate, true)}
                  type="button"
                >
                  {t({ en: "Save manual entry", zh: "保存手工录入" })}
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost" disabled={busy} onClick={onReplace} type="button">
                  {t({ en: "Replace photo", zh: "替换图片" })}
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={onManualToggle} type="button">
                  {t({ en: "Type it in", zh: "手工录入" })}
                </button>
                <button className="btn btn-primary" disabled={busy} onClick={onRetry} type="button">
                  {t({ en: "Retry recognition", zh: "重试识别" })}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const VIEW_STYLE = `
.bci-shell { display: flex; flex-direction: column; gap: 12px; }
.bci-shell h2 { color: var(--ink); font-family: var(--ff-display); font-size: clamp(20px, 2.6vw, 28px); letter-spacing: -.03em; margin: 0; }
.bci-lede { color: var(--text-2); font-size: 14px; line-height: 1.6; margin: 0; }
.bci-batch-id { font-family: var(--mono); text-transform: none; }
.bci-privacy { background: var(--accent-softer); border-radius: 11px; color: var(--text-2); font-size: 12px; line-height: 1.5; padding: 10px 12px; }
.bci-warn { background: var(--amber-soft); border-radius: 10px; color: var(--amber-text); font-size: 12.5px; line-height: 1.5; padding: 10px 12px; }
.bci-issues { background: var(--amber-soft); border-radius: 10px; color: var(--amber-text); display: grid; font-size: 12.5px; gap: 5px; line-height: 1.5; list-style: none; margin: 0; padding: 10px 12px; }
.bci-issues li { padding-left: 14px; position: relative; }
.bci-issues li::before { content: "•"; left: 2px; position: absolute; }
.bci-signals { align-items: baseline; display: flex; flex-wrap: wrap; gap: 6px; }
.bci-signals-label { color: var(--text-3); font-size: 12px; }
.bci-signal { background: var(--surface-2); border: 1px solid var(--border); border-radius: 16px; color: var(--text-2); cursor: pointer; font: inherit; font-size: 12px; padding: 3px 10px; }
.bci-signal:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.bci-signal:disabled { cursor: default; }
.bci-progress { background: var(--surface-3); border-radius: 999px; height: 8px; overflow: hidden; }
.bci-progress-fill { background: var(--accent); border-radius: 999px; height: 100%; transition: width .4s ease; }
.bci-progress-label { color: var(--text-3); font-family: var(--mono); font-size: 12px; }
.bci-rows { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
.bci-row { align-items: baseline; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; display: flex; flex-wrap: wrap; font-size: 11.5px; gap: 6px; padding: 8px 10px; }
.bci-row-seq { color: var(--text-4); font-family: var(--mono); }
.bci-row-name { color: var(--text-2); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bci-row-status { font-weight: 600; }
.bci-row-extracted .bci-row-status, .bci-row-confirmed .bci-row-status, .bci-row-uploaded .bci-row-status { color: var(--live-text); }
.bci-row-terminal_failed .bci-row-status { color: var(--amber-text); }
.bci-row-awaiting_upload .bci-row-status, .bci-row-queued .bci-row-status, .bci-row-processing .bci-row-status { color: var(--text-3); }
.bci-row-excluded .bci-row-status, .bci-row-skipped .bci-row-status { color: var(--text-4); }
.bci-row-action { font-size: 11px; padding: 2px 8px; }
.bci-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; margin-top: 4px; }
.bci-review { align-items: start; display: grid; gap: 18px; grid-template-columns: minmax(180px, 320px) 1fr; }
@media (max-width: 760px) { .bci-review { grid-template-columns: 1fr; } }
.bci-review-image img { border: 1px solid var(--border); border-radius: 12px; max-width: 100%; }
.bci-image-missing { background: var(--surface-3); border-radius: 12px; color: var(--text-3); font-size: 12.5px; padding: 30px 12px; text-align: center; }
.bci-review-form { display: flex; flex-direction: column; gap: 10px; }
.bci-field { display: flex; flex-direction: column; gap: 4px; }
.bci-field > span { color: var(--text-3); font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.bci-field input, .bci-field textarea { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; color: var(--ink); font: inherit; font-size: 14px; padding: 9px 11px; resize: vertical; }
`;
