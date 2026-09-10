"use client";

import { useEffect, useRef, useState } from "react";

import type { BusinessCardBatchDTO } from "../../../../features/acquisition/business-card-batch-contract";
import type { IngestBatchDTO } from "../../../../features/acquisition/business-card-ingest-v2/contract";
import { Icon } from "../orbit-reference-primitives";
import { useOrbitLanguage } from "../orbit-language-context";

import { uploadV1CardFiles } from "./business-card-import-client";
import { BusinessCardImportJobs, cardImportError } from "./business-card-import-progress";

type Translate = (copy: { en: string; zh: string }) => string;

/** V2 摄取协议 feature flag（方案 §九）：新批次走 batch2 引导流程，旧批次不迁移。 */
const INGEST_V2_ENABLED = process.env.NEXT_PUBLIC_ORBIT_INGEST_V2 === "1";

const INGEST_V2_STATUS_COPY: Record<IngestBatchDTO["status"], { en: string; zh: string }> = {
  cancelled: { en: "Cancelled", zh: "已取消" },
  collecting: { en: "Uploading", zh: "上传中" },
  completed: { en: "Completed", zh: "已完成" },
  expired: { en: "Expired", zh: "已过期" },
  processing: { en: "Processing", zh: "识别中" },
  ready_for_review: { en: "Ready to review", zh: "待确认" },
};

function IngestV2BatchRow({ batch, t }: { batch: IngestBatchDTO; t: Translate }) {
  return (
    <a
      className="card"
      href={`/app/contacts/new/batch2/${batch.id}`}
      style={{
        alignItems: "center",
        display: "flex",
        gap: 10,
        padding: "10px 12px",
        textDecoration: "none",
      }}
    >
      <Icon name="scan" size={16} color="var(--accent)" />
      <span style={{ color: "var(--ink)", flex: 1, fontSize: 13 }}>
        {batch.id.slice(0, 13)}
        <span style={{ color: "var(--text-3)", marginLeft: 8 }}>
          {batch.expectedItems} {t({ en: "photos", zh: "张" })}
        </span>
      </span>
      <span className="nc-src nc-src-scan">{t(INGEST_V2_STATUS_COPY[batch.status])}</span>
      <Icon name="chevR" size={16} color="var(--text-4)" />
    </a>
  );
}

const BATCH_STATUS_COPY: Record<
  BusinessCardBatchDTO["status"],
  { en: string; zh: string }
> = {
  cancelled: { en: "Cancelled", zh: "已取消" },
  completed: { en: "Completed", zh: "已完成" },
  processing: { en: "Processing", zh: "识别中" },
  ready_for_review: { en: "Ready to review", zh: "待确认" },
};

function BatchRow({ batch, t }: { batch: BusinessCardBatchDTO; t: Translate }) {
  const settled = batch.processedItems + batch.failedItems;

  return (
    <a
      className="card"
      href={`/app/contacts/new/batch/${batch.id}`}
      style={{
        alignItems: "center",
        display: "flex",
        gap: 10,
        padding: "10px 12px",
        textDecoration: "none",
      }}
    >
      <Icon name="scan" size={16} color="var(--accent)" />
      <span style={{ color: "var(--ink)", flex: 1, fontSize: 13 }}>
        {batch.sourceFiles[0]?.fileName ?? batch.id.slice(0, 8)}
        {batch.sourceFiles.length > 1 ? ` +${batch.sourceFiles.length - 1}` : ""}
        <span style={{ color: "var(--text-3)", marginLeft: 8 }}>
          {settled}/{batch.totalItems}
        </span>
      </span>
      <span className="nc-src nc-src-scan">{t(BATCH_STATUS_COPY[batch.status])}</span>
      <Icon name="chevR" size={16} color="var(--text-4)" />
    </a>
  );
}

/**
 * 批量导入入口：两个按钮分别接收多张照片与单个 PDF（用户明确要求的形态），
 * 上传成功即跳转批次进度页；下方列出进行中/待确认批次。
 */
export function BusinessCardBatchEntry() {
  const { t } = useOrbitLanguage();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [batches, setBatches] = useState<readonly BusinessCardBatchDTO[]>([]);
  const [ingestV2Batches, setIngestV2Batches] = useState<readonly IngestBatchDTO[]>([]);
  const [uploading, setUploading] = useState(false);
  const busy = useRef(false);
  const selectedFiles = useRef<readonly File[]>([]);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/contact-drafts/business-card/batches")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: { data?: { batches?: readonly BusinessCardBatchDTO[] } } | null) => {
        if (!cancelled && body?.data?.batches) {
          setBatches(body.data.batches.filter((batch) => batch.status !== "completed"));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!INGEST_V2_ENABLED) {
      return;
    }
    let cancelled = false;
    void fetch("/api/contact-drafts/business-card/batches/v2")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: { data?: { batches?: readonly IngestBatchDTO[] } } | null) => {
        if (!cancelled && body?.data?.batches) {
          setIngestV2Batches(
            body.data.batches.filter(
              (batch) =>
                batch.status === "collecting" ||
                batch.status === "processing" ||
                batch.status === "ready_for_review",
            ),
          );
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  async function submitBatch(files: FileList | readonly File[] | null) {
    if (!files || files.length === 0 || busy.current) {
      return;
    }

    busy.current = true;
    selectedFiles.current = Array.from(files);
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    setUploading(true);
    setUploadProgress({ done: 0, total: selectedFiles.current.length });
    setError(null);
    setNeedsLogin(false);
    const formData = new FormData();
    for (const file of selectedFiles.current) {
      formData.append("files", file);
    }

    try {
      const direct = await uploadV1CardFiles(selectedFiles.current, (done, total) => setUploadProgress({ done, total }));
      if (direct.kind === "created") {
        window.location.href = `/app/contacts/new/import/${direct.jobId}`;
        return;
      }
      if (direct.kind === "error") { setNeedsLogin(direct.code === "UNAUTHORIZED"); setError(cardImportError(direct.code, t)); return; }
      const response = await fetch("/api/contact-drafts/business-card/batches", {
        body: formData,
        method: "POST",
      });
      const body = (await response.json()) as {
        data?: { batch?: { id: string }; rejectedFiles?: readonly { fileName: string }[] };
        error?: { message?: string };
      };

      if (!response.ok || !body.data?.batch) {
        setError(
          body.error?.message ??
            t({ en: "Upload failed. Try again.", zh: "上传失败，请重试。" }),
        );
        return;
      }

      window.location.href = `/app/contacts/new/batch/${body.data.batch.id}`;
    } catch {
      setError(t({ en: "Upload failed. Try again.", zh: "上传失败，请重试。" }));
    } finally {
      busy.current = false;
      setUploading(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 16, padding: "14px 16px" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {t({ en: "Batch import", zh: "批量导入" })}
      </div>
      <div style={{ color: "var(--text-3)", fontSize: 12.5, marginBottom: 10 }}>
        {t({
          en: "Upload many card photos, or one PDF with one card per page. Recognition runs in the background.",
          zh: "一次上传多张名片照片，或一个每页一张名片的 PDF；识别在后台自动进行。",
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button
          className="btn btn-primary"
          disabled={uploading}
          onClick={() => {
            if (INGEST_V2_ENABLED) {
              window.location.href = "/app/contacts/new/batch2";
              return;
            }
            photoInputRef.current?.click();
          }}
          type="button"
        >
          <Icon name="upload" size={17} />
          {t({ en: "Bulk upload photos", zh: "批量上传照片" })}
        </button>
        <button
          className="btn btn-ghost"
          disabled={uploading}
          onClick={() => pdfInputRef.current?.click()}
          type="button"
        >
          <Icon name="list" size={17} />
          {t({ en: "Upload PDF", zh: "上传 PDF" })}
        </button>
      </div>
      <input
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        aria-label={t({ en: "Bulk upload card photos", zh: "批量上传名片照片" })}
        multiple
        onChange={(event) => void submitBatch(event.target.files)}
        ref={photoInputRef}
        style={{ display: "none" }}
        type="file"
      />
      <input
        accept="application/pdf,.pdf"
        aria-label={t({ en: "Upload a card PDF", zh: "上传名片 PDF" })}
        onChange={(event) => void submitBatch(event.target.files)}
        ref={pdfInputRef}
        style={{ display: "none" }}
        type="file"
      />
      {uploading ? (
        <div role="status" aria-live="polite" style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 10 }}>
          {t({ en: `Uploading: ${uploadProgress.done}/${uploadProgress.total} files. Keep this page open until upload finishes.`, zh: `上传中：${uploadProgress.done}/${uploadProgress.total} 个文件。上传完成前请保持页面打开。` })}
        </div>
      ) : null}
      {error ? (
        <div role="alert" style={{ color: "var(--amber-text)", fontSize: 12.5, marginTop: 10 }}>
          <p>{error}</p>
          {needsLogin ? <a className="btn btn-ghost" href="/app/account/login?next=%2Fapp%2Fcontacts%2Fnew">{t({ en: "Sign in", zh: "重新登录" })}</a> : <button type="button" className="btn btn-ghost" disabled={uploading} onClick={() => void submitBatch(selectedFiles.current)}>{t({ en: "Retry upload", zh: "重试上传" })}</button>}
        </div>
      ) : null}
      <BusinessCardImportJobs batchIds={batches.map((batch) => batch.id)} />
      {batches.length > 0 || ingestV2Batches.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {ingestV2Batches.map((batch) => (
            <IngestV2BatchRow batch={batch} key={batch.id} t={t} />
          ))}
          {batches.map((batch) => (
            <BatchRow batch={batch} key={batch.id} t={t} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
