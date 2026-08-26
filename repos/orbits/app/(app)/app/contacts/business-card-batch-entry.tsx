"use client";

import { useEffect, useRef, useState } from "react";

import type { BusinessCardBatchDTO } from "../../../../features/acquisition/business-card-batch-contract";
import { Icon } from "../orbit-reference-primitives";
import { useOrbitLanguage } from "../orbit-language-context";

type Translate = (copy: { en: string; zh: string }) => string;

const BATCH_STATUS_COPY: Record<
  BusinessCardBatchDTO["status"],
  { en: string; zh: string }
> = {
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function submitBatch(files: FileList | null) {
    if (!files || files.length === 0 || uploading) {
      return;
    }

    setUploading(true);
    setError(null);
    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append("files", file);
    }

    try {
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
          onClick={() => photoInputRef.current?.click()}
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
        <div style={{ color: "var(--text-3)", fontSize: 12.5, marginTop: 10 }}>
          {t({ en: "Uploading…", zh: "上传中…" })}
        </div>
      ) : null}
      {error ? (
        <div style={{ color: "var(--amber-text)", fontSize: 12.5, marginTop: 10 }}>
          {error}
        </div>
      ) : null}
      {batches.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {batches.map((batch) => (
            <BatchRow batch={batch} key={batch.id} t={t} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
