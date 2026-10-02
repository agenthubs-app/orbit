/**
 * W0053：「上传 CSV」「导入通讯录（vCard）」的工作区：选文件 → 识别结果与字段对应 → 核对表（新联系人、可能重复、
 * 文件内重复、无法读取分开列出；合并到已有联系人必须确认，完全一致的预选「合并」）→ 提交 → 结果与后续更新状态。
 * 交互照名片批次「可能是同一个联系人」的样子做（命中原因 + 两边字段），不复用其状态机。
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CONTACT_IMPORT_MAPPABLE_FIELDS, type ContactImportMappableField, type ContactImportMapping } from "../../../../../features/contacts/import/types";
import {
  ImportApiError,
  importApi,
  newIdempotencyKey,
  type ContactImportBatchView,
  type ContactImportRowView,
} from "./network-import-client";

type Copy = { en: string; zh: string };
type T = (copy: Copy) => string;
type Filter = "all" | "duplicates" | "new" | "issues";

const FIELD_LABEL: Record<ContactImportMappableField, Copy> = {
  connectedOn: { en: "Connected on", zh: "连接日期" },
  country: { en: "Country", zh: "国家" },
  email: { en: "Email", zh: "邮箱" },
  firstName: { en: "First name", zh: "名" },
  lastName: { en: "Last name", zh: "姓" },
  linkedinUrl: { en: "LinkedIn URL", zh: "LinkedIn 链接" },
  location: { en: "Address", zh: "地址" },
  name: { en: "Full name", zh: "姓名" },
  notes: { en: "Notes", zh: "备注" },
  organization: { en: "Company", zh: "公司" },
  phone: { en: "Phone", zh: "电话" },
  role: { en: "Title", zh: "职位" },
};

const MATCH_REASON: Record<string, Copy> = {
  email: { en: "Same email", zh: "同邮箱" },
  name_organization: { en: "Same name & company", zh: "同姓名加公司" },
  phone: { en: "Same phone", zh: "同电话" },
};

const ISSUE: Record<string, Copy> = {
  decode_failed: { en: "Could not read this entry", zh: "这一条无法读取" },
  field_truncated: { en: "A long field was shortened", zh: "过长的字段已截断" },
  invalid_email: { en: "Email not recognised (left empty)", zh: "邮箱无法识别（已留空）" },
  missing_name: { en: "No name — cannot be imported", zh: "缺少姓名，无法导入" },
  malformed_row: { en: "Broken row (unclosed quote) — cannot be imported", zh: "这一行格式有误（引号未闭合），无法导入" },
  unknown_country: { en: "Country not recognised", zh: "国家无法识别" },
};

const REJECT: Record<string, Copy> = {
  empty: { en: "The file has no contacts.", zh: "文件里没有联系人。" },
  not_vcard: { en: "This is not a vCard (.vcf) file.", zh: "这不是 vCard（.vcf）文件。" },
  too_large: { en: "The file is larger than 5 MB. Split it and try again.", zh: "文件超过 5 MB，请拆分后再试。" },
  too_many_rows: { en: "More than 2,000 records. Split the file and try again.", zh: "超过 2,000 条记录，请拆分文件后再试。" },
  undecodable: { en: "The file encoding is not supported (use UTF-8 or Shift_JIS).", zh: "无法识别文件编码（请用 UTF-8 或 Shift_JIS）。" },
};

const FORMAT: Record<string, Copy> = {
  generic: { en: "Spreadsheet (CSV)", zh: "通用表格（CSV）" },
  linkedin: { en: "LinkedIn Connections export", zh: "LinkedIn 人脉导出" },
  vcard: { en: "vCard address book", zh: "vCard 通讯录" },
};

export function importErrorCopy(error: unknown): Copy {
  if (error instanceof ImportApiError) {
    if (error.reason && REJECT[error.reason]) return REJECT[error.reason]!;
    if (error.reason === "UNDECIDED_ROWS") return { en: "Some possible duplicates still need your choice.", zh: "还有可能重复的联系人需要你选择。" };
    if (error.reason === "MERGE_NOT_CONFIRMED") return { en: "The merges changed. Review them and confirm again.", zh: "合并项有变化，请重新核对后再确认。" };
    if (error.status === 503) return { en: "Import is temporarily unavailable.", zh: "导入暂时不可用。" };
  }
  return { en: "Something went wrong. Try again.", zh: "出了点问题，请重试。" };
}

export function followUpCopy(batch: Pick<ContactImportBatchView, "followUp" | "status">, nowMs = Date.now()): Copy | null {
  if (batch.status !== "completed") return null;
  if (batch.followUp.state === "retry") return { en: "Follow-up update will retry", zh: "后续更新待重试" };
  const deferred = batch.followUp.enrichmentDeferredUntil;
  if (deferred && Date.parse(deferred) > nowMs) return { en: "Enrichment continues tomorrow", zh: "补全明天继续" };
  if (batch.followUp.state === "pending") return { en: "Updating in the background", zh: "后台更新中" };
  return null;
}

function rowStatusCopy(row: ContactImportRowView): Copy {
  if (row.issues.includes("missing_name") || row.issues.includes("decode_failed") || row.issues.includes("malformed_row")) return { en: "Cannot import", zh: "无法导入" };
  if (row.inFileDuplicateOf !== null) return { en: `Duplicate of row ${row.inFileDuplicateOf}`, zh: `与第 ${row.inFileDuplicateOf} 行重复` };
  if (row.candidate?.identical) return { en: "Already in your network", zh: "人脉里已有（完全一致）" };
  if (row.candidate) return { en: "Possibly the same person", zh: "可能是同一个联系人" };
  return { en: "New contact", zh: "新联系人" };
}

function MappingEditor({ batch, busy, onApply, t }: { batch: ContactImportBatchView; busy: boolean; onApply: (mapping: ContactImportMapping) => void; t: T }) {
  const [draft, setDraft] = useState<ContactImportMapping | null>(batch.mapping);
  useEffect(() => setDraft(batch.mapping), [batch.mapping]);
  if (!draft) return null;
  const changed = JSON.stringify(draft) !== JSON.stringify(batch.mapping);
  return (
    <details className="nwi-mapping" open={batch.review ? batch.review.blocked === batch.rowCount : false}>
      <summary className="nwi-mapping-summary">{t({ en: "Field mapping", zh: "字段对应" })}</summary>
      <div className="nwi-mapping-grid">
        {CONTACT_IMPORT_MAPPABLE_FIELDS.map((field) => (
          <label key={field} className="nwi-mapping-field">
            <span>{t(FIELD_LABEL[field])}</span>
            <select
              className="nwi-select"
              value={draft[field] === null ? "" : String(draft[field])}
              onChange={(event) => setDraft({ ...draft, [field]: event.target.value === "" ? null : Number(event.target.value) })}
            >
              <option value="">{t({ en: "— not imported —", zh: "— 不导入 —" })}</option>
              {batch.headers.map((header, index) => <option key={`${index}:${header}`} value={index}>{header || `#${index + 1}`}</option>)}
            </select>
          </label>
        ))}
      </div>
      <button type="button" className="btn nwi-secondary" disabled={!changed || busy} onClick={() => onApply(draft)}>{t({ en: "Apply mapping", zh: "按新的对应重新识别" })}</button>
    </details>
  );
}

export function ReviewRow({ row, busy, onDecide, t }: { row: ContactImportRowView; busy: boolean; onDecide: (seq: number, decision: "create" | "merge" | "skip") => void; t: T }) {
  const blocked = row.issues.includes("missing_name") || row.issues.includes("decode_failed") || row.issues.includes("malformed_row");
  const fields = row.fields;
  return (
    <div className="nwi-row" data-import-row={row.seq} data-import-decision={row.decision ?? "undecided"}>
      <span className="nwi-row-seq">{row.seq}</span>
      <span className="nwi-row-main">
        <strong>{fields.displayName || t({ en: "(no name)", zh: "（无姓名）" })}</strong>
        <span className="nwi-row-sub">{[fields.organization, fields.role].filter(Boolean).join(" · ") || "—"}</span>
        <span className="nwi-row-sub">{[fields.email, fields.phone].filter(Boolean).join(" · ")}</span>
        {row.issues.length ? <span className="nwi-row-issue">{row.issues.map((issue) => t(ISSUE[issue] ?? { en: issue, zh: issue })).join("；")}</span> : null}
      </span>
      <span className="nwi-row-match">
        <span className={row.candidate && !row.candidate.identical ? "nwi-pill nwi-pill-warn" : "nwi-pill"}>{t(rowStatusCopy(row))}</span>
        {row.candidate ? (
          <span className="nwi-row-candidate">
            <span>{row.candidate.matchedOn.map((reason) => t(MATCH_REASON[reason] ?? { en: reason, zh: reason })).join(" · ")}</span>
            <span className="nwi-row-sub">{t({ en: "In your network: ", zh: "人脉里：" })}{[row.candidate.displayName, row.candidate.organization, row.candidate.email].filter(Boolean).join(" · ")}</span>
          </span>
        ) : null}
      </span>
      <span className="nwi-row-decision">
        {row.status !== "pending" || blocked ? (
          <span className="nwi-row-sub">{blocked ? t({ en: "Skipped", zh: "跳过" }) : "—"}</span>
        ) : (
          <select
            aria-label={t({ en: "Decision", zh: "处理方式" })}
            className={row.decision === null ? "nwi-select nwi-select-required" : "nwi-select"}
            disabled={busy}
            value={row.decision ?? ""}
            onChange={(event) => onDecide(row.seq, event.target.value as "create" | "merge" | "skip")}
          >
            {row.decision === null ? <option value="" disabled>{t({ en: "Choose…", zh: "请选择…" })}</option> : null}
            {row.candidate ? <option value="merge">{t({ en: "Merge into existing", zh: "合并到已有联系人" })}</option> : null}
            <option value="create">{t(row.candidate ? { en: "Create anyway", zh: "仍然新建" } : { en: "Create", zh: "新建" })}</option>
            <option value="skip">{t({ en: "Skip", zh: "跳过" })}</option>
          </select>
        )}
      </span>
    </div>
  );
}

const FILTERS: readonly { key: Filter; label: Copy }[] = [
  { key: "all", label: { en: "All", zh: "全部" } },
  { key: "duplicates", label: { en: "Possible duplicates", zh: "可能重复" } },
  { key: "new", label: { en: "New", zh: "新联系人" } },
  { key: "issues", label: { en: "Issues", zh: "有问题" } },
];

export function FileImportPanel({ kind, resumeBatchId, onChanged, t }: { kind: "csv" | "vcard"; resumeBatchId?: string; onChanged: () => void; t: T }) {
  const [batch, setBatch] = useState<ContactImportBatchView | null>(null);
  const [rows, setRows] = useState<ContactImportRowView[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Copy | null>(null);
  const intentRef = useRef<string>(newIdempotencyKey());
  const inputRef = useRef<HTMLInputElement>(null);

  const loadRows = useCallback(async (batchId: string, nextFilter: Filter, after: number, append: boolean) => {
    const page = await importApi.rows(batchId, after, nextFilter);
    setRows((current) => (append ? [...current, ...page.rows] : page.rows));
    setCursor(page.nextCursor);
  }, []);

  const open = useCallback(async (next: ContactImportBatchView) => {
    setBatch(next);
    setFilter("all");
    if (next.review) await loadRows(next.id, "all", 0, false);
    else setRows([]);
  }, [loadRows]);

  useEffect(() => {
    if (!resumeBatchId) return;
    let cancelled = false;
    void importApi.get(resumeBatchId).then((data) => (cancelled ? undefined : open(data.batch))).catch((caught) => !cancelled && setError(importErrorCopy(caught)));
    return () => {
      cancelled = true;
    };
  }, [resumeBatchId, open]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(importErrorCopy(caught));
    } finally {
      setBusy(false);
    }
  }

  function chooseFile(file: File | undefined) {
    if (!file) return;
    void run(async () => {
      const result = await importApi.upload(file, kind, newIdempotencyKey());
      intentRef.current = newIdempotencyKey();
      await open(result.batch);
      onChanged();
    });
  }

  const reset = () => {
    setBatch(null);
    setRows([]);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (!batch) {
    return (
      <div className="nwi-drop" data-import-uploader={kind}>
        <p className="nwi-drop-title">{t(kind === "csv" ? { en: "Choose a CSV file", zh: "选择 CSV 文件" } : { en: "Choose a vCard (.vcf) file", zh: "选择 vCard（.vcf）文件" })}</p>
        <p className="nwi-drop-hint">
          {t(kind === "csv"
            ? { en: "LinkedIn Connections.csv is recognised automatically. Excel: save as CSV first. Up to 5 MB / 2,000 rows.", zh: "LinkedIn 导出的 Connections.csv 自动识别；Excel 请先另存为 CSV。单个文件不超过 5 MB、2,000 条。" }
            : { en: "Export from iPhone (iCloud) or Google Contacts as vCard. Up to 5 MB / 2,000 contacts.", zh: "从 iPhone（iCloud）或 Google 通讯录导出为 vCard。单个文件不超过 5 MB、2,000 人。" })}
        </p>
        <label className={busy ? "btn nwi-primary nwi-disabled" : "btn nwi-primary"}>
          {busy ? t({ en: "Reading…", zh: "正在读取…" }) : t({ en: "Choose file", zh: "选择文件" })}
          <input ref={inputRef} className="nwi-file" type="file" accept={kind === "csv" ? ".csv,text/csv" : ".vcf,text/vcard,text/x-vcard"} disabled={busy} onChange={(event) => chooseFile(event.target.files?.[0])} />
        </label>
        {error ? <p className="nwi-error" role="alert">{t(error)}</p> : null}
      </div>
    );
  }

  const review = batch.review;
  if (batch.status !== "reviewing") {
    const follow = followUpCopy(batch);
    return (
      <div className="nwi-done" data-import-result={batch.status}>
        <strong className="nwi-done-title">
          {batch.status === "completed" ? t({ en: "Import finished", zh: "导入完成" }) : batch.status === "cancelled" ? t({ en: "Import cancelled", zh: "已取消导入" }) : batch.status === "failed" ? t({ en: "Import interrupted — partly imported", zh: "导入中断，部分已写入" }) : t({ en: "Import in progress — it resumes automatically if interrupted", zh: "正在导入（中断会自动续写）" })}
        </strong>
        <span className="nwi-done-counts">
          {t({ en: `${batch.counts.created} new · ${batch.counts.merged} merged · ${batch.counts.skipped} skipped · ${batch.counts.failed} not importable`, zh: `新建 ${batch.counts.created} · 合并 ${batch.counts.merged} · 跳过 ${batch.counts.skipped} · 无法导入 ${batch.counts.failed}` })}
        </span>
        {follow ? <span className="nwi-pill">{t(follow)}</span> : null}
        <span className="nwi-actions">
          <a className="nwi-link" href="/app/contacts">{t({ en: "View contacts", zh: "查看联系人" })}</a>
          <button type="button" className="btn nwi-secondary" onClick={reset}>{t({ en: "Import another file", zh: "再导入一个文件" })}</button>
        </span>
      </div>
    );
  }

  const confirmations = review?.mergeConfirmations ?? [];
  return (
    <div className="nwi-review" data-import-review={batch.id}>
      <div className="nwi-summary">
        <span className="nwi-summary-file"><strong>{batch.fileName || t({ en: "Untitled file", zh: "未命名文件" })}</strong> · {t(FORMAT[batch.format] ?? FORMAT.generic!)} · {t({ en: `${batch.rowCount} records`, zh: `${batch.rowCount} 条` })}</span>
        {review ? (
          <span className="nwi-summary-counts" data-import-summary>
            {t({ en: `New ${review.create} · Merge ${review.merge} · Skip ${review.skip} · To decide ${review.undecided} · Cannot import ${review.blocked}`, zh: `新建 ${review.create} · 合并 ${review.merge} · 跳过 ${review.skip} · 待选择 ${review.undecided} · 无法导入 ${review.blocked}` })}
          </span>
        ) : null}
      </div>
      {batch.kind === "csv" ? <MappingEditor batch={batch} busy={busy} t={t} onApply={(mapping) => void run(async () => { await open((await importApi.remap(batch.id, mapping)).batch); })} /> : null}
      <div className="nwi-filters" role="tablist">
        {FILTERS.map((entry) => (
          <button key={entry.key} type="button" role="tab" aria-selected={filter === entry.key} className={filter === entry.key ? "btn nwi-filter nwi-filter-on" : "btn nwi-filter"}
            onClick={() => void run(async () => { setFilter(entry.key); await loadRows(batch.id, entry.key, 0, false); })}>
            {t(entry.label)}
          </button>
        ))}
      </div>
      <div className="nwi-rows">
        {rows.map((row) => (
          <ReviewRow key={row.seq} row={row} busy={busy} t={t} onDecide={(seq, decision) => void run(async () => {
            const result = await importApi.decide(batch.id, [{ decision, seq }]);
            setBatch(result.batch);
            setRows((current) => current.map((entry) => (entry.seq === seq && result.updated.includes(seq) ? { ...entry, decision, mergeIntoContactId: decision === "merge" ? entry.candidate?.contactId ?? null : null } : entry)));
          })} />
        ))}
        {!rows.length ? <div className="nwi-empty">{t({ en: "Nothing here.", zh: "这里没有记录。" })}</div> : null}
        {cursor !== null ? (
          <button type="button" className="btn nwi-secondary" disabled={busy} onClick={() => void run(() => loadRows(batch.id, filter, cursor, true))}>{t({ en: "Load more", zh: "加载更多" })}</button>
        ) : null}
      </div>
      {error ? <p className="nwi-error" role="alert">{t(error)}</p> : null}
      <div className="nwi-footer">
        <span className="nwi-footer-note">
          {review && review.undecided > 0
            ? t({ en: `${review.undecided} possible duplicates need your choice before importing.`, zh: `还有 ${review.undecided} 条可能重复需要你选择，选完才能导入。` })
            : t({ en: `Merging ${confirmations.length} into existing contacts only fills empty fields; differences go to notes.`, zh: `将合并 ${confirmations.length} 位到已有联系人：只补空字段，不同的信息写进备注。` })}
        </span>
        <span className="nwi-actions">
          <button type="button" className="btn nwi-secondary" disabled={busy} onClick={() => void run(async () => { await importApi.cancel(batch.id); onChanged(); reset(); })}>{t({ en: "Cancel import", zh: "取消导入" })}</button>
          <button type="button" className="btn nwi-primary" data-import-commit disabled={busy || !review || review.undecided > 0}
            onClick={() => void run(async () => {
              const result = await importApi.commit(batch.id, intentRef.current, confirmations);
              setBatch(result.batch);
              onChanged();
            })}>
            {t({ en: "Accept all suggestions and import", zh: "全部按建议处理，确认导入" })}
          </button>
        </span>
      </div>
    </div>
  );
}
