/**
 * 「导入人脉」（Network v2 第 303–392 行）。
 * 四种方式卡 1:1，全部接真实能力：扫描名片夹（名片批量导入 card-batch-0918）；W0053 起上传 CSV、导入通讯录（vCard）、
 * 从活动添加（`/api/contacts/import/**`：服务端解析 → 字段对应 → 去重核对，合并需确认 → 幂等写入 → 三层更新）。
 * `?job=` 时是设计稿子页面「10 名片确认」（正在解析 → 逐张确认 → 小结），全宽、带「← 导入人脉」；
 * `?import=<批次>` 打开一批还在核对中的文件导入。
 * 导入记录 = 名片 V2 批次 + 文件／活动导入批次，按时间合并列出（来源、文件名、新建／合并数为真实值）。
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { BusinessCardCaptureAvailability } from "../../../../../features/acquisition/business-card-capture-availability";
import type { IngestBatchDTO } from "../../../../../features/acquisition/business-card-ingest-v2/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import { CardBatchImport, CardBatchReminders } from "../card-batch-0918/card-batch-ui";
import { useCardBatch } from "../card-batch-0918/use-card-batch";
import { INGEST_V2_API_BASE } from "../ingest-v2/ingest-v2-client";
import { INGEST_V2_COPY } from "../ingest-v2/ingest-v2-copy";
import { EventImportPanel } from "./network-import-event";
import { FileImportPanel, followUpCopy } from "./network-import-file";
import { importApi, type ContactImportBatchView } from "./network-import-client";
import { NETWORK_IMPORT_FLOW_CSS } from "./network-import-styles";
import { NetworkShell } from "./network-shell";

export type NetworkImportMethod = "csv" | "contacts" | "scan" | "event";
/** 屏幕只消费可用性判定与原因；其余配置位（mode/provider 标志）不进 UI。 */
export type NetworkImportAvailability = Pick<BusinessCardCaptureAvailability, "available" | "reason">;

type Copy = { en: string; zh: string };

const METHODS: readonly { key: NetworkImportMethod; icon: string; title: Copy; desc: Copy; cta: Copy; hint: Copy; iconBg: string; iconFg: string }[] = [
  { key: "csv", icon: "▲", title: { en: "Upload CSV", zh: "上传 CSV" }, desc: { en: "Import a LinkedIn Connections.csv or any spreadsheet saved as CSV.", zh: "导入 LinkedIn 导出的 Connections.csv，或另存为 CSV 的任意表格。" }, cta: { en: "Choose file", zh: "选择文件" }, hint: { en: ".csv (save Excel as CSV)", zh: "支持 .csv（Excel 请另存为 CSV）" }, iconBg: "#DDDEFA", iconFg: "#2E3270" },
  { key: "contacts", icon: "▤", title: { en: "Import address book", zh: "导入通讯录" }, desc: { en: "Upload a vCard (.vcf) exported from iPhone or Google Contacts.", zh: "上传从 iPhone、Google 通讯录导出的 vCard（.vcf）文件。" }, cta: { en: "Choose .vcf file", zh: "选择 .vcf 文件" }, hint: { en: "vCard 2.1 / 3.0 / 4.0", zh: "支持 vCard 2.1／3.0／4.0" }, iconBg: "#E6F1EC", iconFg: "#2F6B4F" },
  { key: "scan", icon: "▭", title: { en: "Scan business cards", zh: "扫描名片夹" }, desc: { en: "Photograph or upload cards; AI recognises and imports them.", zh: "拍照或上传名片，AI 自动识别并导入。" }, cta: { en: "Upload cards", zh: "上传名片" }, hint: { en: "Images (JPG, PNG)", zh: "支持图片（JPG、PNG）" }, iconBg: "#ECEEFB", iconFg: "#4B4FC7" },
  { key: "event", icon: "▦", title: { en: "Add from an event", zh: "从活动添加联系人" }, desc: { en: "Pick an event and add the people you exchanged cards with there.", zh: "选择你参加过的活动，把现场互换过名片的人补进人脉。" }, cta: { en: "Choose event", zh: "选择活动" }, hint: { en: "Only people you exchanged cards with", zh: "只含互换过名片的人" }, iconBg: "#FBF1DC", iconFg: "#8A6420" },
];

const NOTES: readonly { icon: string; title: Copy; desc: Copy }[] = [
  { icon: "◎", title: { en: "Duplicate detection", zh: "去重识别" }, desc: { en: "Possible duplicates are found by email, phone, or name plus company. Nothing is merged into an existing contact until you confirm.", zh: "按邮箱、电话、姓名加公司识别可能重复的联系人；合并到已有联系人前都会让你确认。" } },
  { icon: "▤", title: { en: "File formats", zh: "文件格式" }, desc: { en: ".csv and .vcf, up to 5 MB and 2,000 records per file — split larger files. Save Excel files as CSV.", zh: "支持 .csv 与 .vcf，单个文件不超过 5 MB、最多 2,000 条记录，超出请拆分；Excel 请另存为 CSV。" } },
  { icon: "≡", title: { en: "Recommended fields", zh: "推荐字段" }, desc: { en: "Include name, company, title, email and phone — fuller fields match better.", zh: "建议包含：姓名、公司、职位、邮箱、手机号。字段越完整，匹配越准确。" } },
  { icon: "◈", title: { en: "Data safety", zh: "数据安全" }, desc: { en: "The uploaded file is not kept; parsed rows are deleted 7 days after the import. Contacts stay in your personal CRM.", zh: "上传的文件不保存，解析出的行在导入结束 7 天后删除；联系人仅用于你的个人 CRM，不会对外泄露。" } },
];

const IMPORT_SOURCE: Record<ContactImportBatchView["kind"], Copy> = {
  csv: { en: "CSV upload", zh: "上传 CSV" },
  event: { en: "From an event", zh: "从活动添加" },
  vcard: { en: "Address book", zh: "导入通讯录" },
};

const IMPORT_STATUS: Record<ContactImportBatchView["status"], { copy: Copy; color: string }> = {
  parsed: { copy: { en: "Ready to review", zh: "待确认" }, color: "#8A6420" },
  reviewing: { copy: { en: "Ready to review", zh: "待确认" }, color: "#8A6420" },
  committing: { copy: { en: "Importing", zh: "导入中" }, color: "#8A6420" },
  completed: { copy: { en: "Completed", zh: "已完成" }, color: "#2F6B4F" },
  cancelled: { copy: { en: "Cancelled", zh: "已取消" }, color: "#9FA3C4" },
  expired: { copy: { en: "Expired", zh: "已过期" }, color: "#9FA3C4" },
};

type LogEntry = { kind: "card"; at: string; batch: IngestBatchDTO } | { kind: "import"; at: string; batch: ContactImportBatchView };

export function importMethodFor(kind: ContactImportBatchView["kind"]): NetworkImportMethod {
  return kind === "csv" ? "csv" : kind === "vcard" ? "contacts" : "event";
}

export function importHref(batch: Pick<ContactImportBatchView, "id" | "kind">): string {
  return `/app/contacts/new?method=${importMethodFor(batch.kind)}&import=${encodeURIComponent(batch.id)}`;
}

/** 批次状态 → 记录表「状态」列文案与点色（已完成取设计稿 #2F6B4F；进行中/终止用设计稿调色板）。 */
const LOG_STATUS: Record<IngestBatchDTO["status"], { copy: Copy; color: string }> = {
  collecting: { copy: { en: "Uploading", zh: "上传中" }, color: "#8A6420" },
  processing: { copy: { en: "Processing", zh: "识别中" }, color: "#8A6420" },
  ready_for_review: { copy: { en: "Ready to review", zh: "待确认" }, color: "#8A6420" },
  completed: { copy: { en: "Completed", zh: "已完成" }, color: "#2F6B4F" },
  cancelled: { copy: { en: "Cancelled", zh: "已取消" }, color: "#9FA3C4" },
  expired: { copy: { en: "Expired", zh: "已过期" }, color: "#9FA3C4" },
};

const UNAVAILABLE_COPY: Record<Exclude<NetworkImportAvailability["reason"], "ready">, Copy> = {
  live_mode_required: INGEST_V2_COPY.unavailableLiveMode,
  contact_storage_unconfigured: INGEST_V2_COPY.unavailableStorage,
  ocr_provider_unconfigured: INGEST_V2_COPY.unavailableOcr,
};

/** 记录表「导入时间」列：设计稿格式 2026-09-12 14:30（本地时区；仅客户端拉取后渲染，无水合差异）。 */
export function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function jobHref(batchId: string): string {
  return `/app/contacts/new?job=${encodeURIComponent(batchId)}`;
}

/** W0053：导入记录里的一行文件／活动导入（来源、文件名、总数、新建、合并为真实值；核对中的可点开继续）。 */
export function ImportLogRow({ batch: b, href, t, nowMs }: { batch: ContactImportBatchView; href: string; t: (copy: Copy) => string; nowMs?: number }) {
  const dash = "—";
  const status = IMPORT_STATUS[b.status];
  const follow = followUpCopy(b, nowMs);
  const reviewing = b.status === "reviewing" || b.status === "parsed";
  const cells = (
    <>
      <span className="nw-import-row-time">{formatLogTime(b.createdAt)}</span>
      <span>{t(IMPORT_SOURCE[b.kind])}</span>
      <span className="nw-import-row-file" title={b.fileName}>{b.fileName || dash}</span>
      <span>{b.rowCount}</span>
      <span>{b.status === "completed" ? b.counts.created : dash}</span>
      <span>{b.status === "completed" ? b.counts.merged : dash}</span>
      <span className="nw-import-row-status" style={{ color: status.color }}><span className="nw-import-dot" style={{ background: status.color }}></span>{t(status.copy)}{follow ? <span className="nwi-log-follow">{t(follow)}</span> : null}</span>
    </>
  );
  return reviewing ? (
    <a className="btn nw-import-row" href={href} data-import-log={b.id}>
      {cells}
      <span className="nw-import-row-link">{t({ en: "Continue", zh: "继续核对" })}</span>
    </a>
  ) : (
    <div className="nw-import-row nwi-log-row" data-import-log={b.id}>
      {cells}
      <span className="nw-import-row-file">{dash}</span>
    </div>
  );
}

export function NetworkImport({ availability, initialMethod = "scan", jobId, importId }: { availability: NetworkImportAvailability; initialMethod?: NetworkImportMethod; jobId?: string; importId?: string }) {
  const { t, preserveHref } = useOrbitLanguage();
  const router = useRouter();
  const [method, setMethod] = useState<NetworkImportMethod>(initialMethod);
  // null = 尚未拉取（SSR / 首帧）：不显示空态，避免闪一次「还没有导入记录」；"error" = 拉取失败（非 OK / 抛错），显示错误行而非空态。
  const [batches, setBatches] = useState<readonly IngestBatchDTO[] | null | "error">(null);
  // W0053：文件／活动导入批次。拉取失败（例如本机未配置数据库）不影响名片记录，按没有处理。
  const [imports, setImports] = useState<readonly ContactImportBatchView[] | null>(null);
  const [logVersion, setLogVersion] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = METHODS.find((m) => m.key === method) ?? METHODS[2]!;
  const batch = useCardBatch(jobId ?? null, t);
  const dash = "—";

  useEffect(() => {
    let cancelled = false;
    void fetch(INGEST_V2_API_BASE)
      .then(async (response) => {
        if (!response.ok) throw new Error(`ingest batches ${response.status}`);
        return response.json() as Promise<{ data?: { batches?: readonly IngestBatchDTO[] } }>;
      })
      .then((body) => {
        if (!cancelled) setBatches(body?.data?.batches ?? []);
      })
      .catch(() => {
        if (!cancelled) setBatches("error");
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, logVersion]);

  useEffect(() => {
    let cancelled = false;
    void importApi.list()
      .then((data) => {
        if (!cancelled) setImports(data.batches);
      })
      .catch(() => {
        if (!cancelled) setImports([]);
      });
    return () => {
      cancelled = true;
    };
  }, [logVersion]);

  function choose(next: NetworkImportMethod) {
    setMethod(next);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openBatch(batchId: string) {
    router.push(preserveHref(jobHref(batchId)));
  }

  const refreshLog = () => setLogVersion((value) => value + 1);

  function renderWorkArea() {
    if (method === "csv" || method === "contacts") {
      const kind = method === "csv" ? "csv" : "vcard";
      return <FileImportPanel key={kind} kind={kind} resumeBatchId={importId && method === initialMethod ? importId : undefined} onChanged={refreshLog} t={t} />;
    }
    if (method === "event") return <EventImportPanel eventsHref={preserveHref("/app/events")} onChanged={refreshLog} t={t} />;
    if (!availability.available) {
      return (
        <div className="nw-import-note">
          <span className="nw-import-note-icon">⊘</span>
          <span className="nw-import-note-copy"><strong className="nw-import-note-title">{t(INGEST_V2_COPY.unavailableTitle)}</strong><span className="nw-import-note-desc">{t(availability.reason === "ready" ? INGEST_V2_COPY.unavailableOcr : UNAVAILABLE_COPY[availability.reason])}</span></span>
        </div>
      );
    }
    return <CardBatchImport available batch={batch} onBatchStarted={openBatch} onReset={() => router.push(preserveHref("/app/contacts/new?method=scan"))} t={t} />;
  }

  if (jobId) {
    return (
      <NetworkShell screen="import">
        <div className="nw-import nw-import-job" data-network-import-job={jobId}>
          <a className="btn nw-import-back" href={preserveHref("/app/contacts/new?method=scan")}>{t({ en: "← Import contacts", zh: "← 导入人脉" })}</a>
          <CardBatchImport available={availability.available} batch={batch} onBatchStarted={openBatch} onReset={() => router.push(preserveHref("/app/contacts/new?method=scan"))} t={t} />
          {/* 在确认页上：进入确认界面即视为已提醒，全站不再弹窗。 */}
          <CardBatchReminders batch={batch} onOpen={() => undefined} t={t} viewingImport />
        </div>
      </NetworkShell>
    );
  }

  const log: LogEntry[] = [
    ...(Array.isArray(batches) ? batches : []).map((entry): LogEntry => ({ at: entry.createdAt, batch: entry, kind: "card" })),
    ...(imports ?? []).map((entry): LogEntry => ({ at: entry.createdAt, batch: entry, kind: "import" })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <NetworkShell screen="import">
      <style>{NETWORK_IMPORT_FLOW_CSS}</style>
      <div className="nw-import">
        <div className="nw-import-grid">
          <div className="nw-import-main">
            <div className="nw-import-card">
              <div className="nw-card-head">
                <h2 className="nw-h2">{t({ en: "Choose an import method", zh: "选择导入方式" })}</h2>
                <span className="nw-card-hint">{t({ en: "Import contacts from different sources to grow your network quickly.", zh: "从不同来源导入联系人，快速扩充你的人脉网络。" })}</span>
              </div>
              <div className="nw-import-methods">
                {METHODS.map((m) => {
                  const on = method === m.key;
                  return (
                    <div key={m.key} className={on ? "nw-import-method nw-import-method-on" : "nw-import-method"} data-import-method={m.key}>
                      <span className="nw-import-method-icon" style={{ background: m.iconBg, color: m.iconFg }}>{m.icon}</span>
                      <strong className="nw-import-method-title">{t(m.title)}</strong>
                      <span className="nw-import-method-desc">{t(m.desc)}</span>
                      <button type="button" className={on ? "btn nw-import-cta nw-import-cta-on" : "btn nw-import-cta"} onClick={() => choose(m.key)}>{t(m.cta)}</button>
                      <span className="nw-import-method-hint">{t(m.hint)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="nw-import-panel" ref={panelRef} data-import-panel={method}>
              <div className="nw-import-panel-head">
                <div className="nw-card-head">
                  <h2 className="nw-h2">{t(selected.title)}</h2>
                  <span className="nw-card-hint">{t(selected.desc)}</span>
                </div>
              </div>
              {renderWorkArea()}
            </div>
          </div>

          <div className="nw-import-box">
            <h2 className="nw-h2">{t({ en: "Import notes", zh: "导入说明" })}</h2>
            {NOTES.map((n) => (
              <div key={n.icon} className="nw-import-note">
                <span className="nw-import-note-icon">{n.icon}</span>
                <span className="nw-import-note-copy"><strong className="nw-import-note-title">{t(n.title)}</strong><span className="nw-import-note-desc">{t(n.desc)}</span></span>
              </div>
            ))}
          </div>
        </div>

        <div className="nw-import-box">
          <div className="nw-import-log-head">
            <h2 className="nw-h2">{t({ en: "Recent imports", zh: "最近导入记录" })}</h2>
          </div>
          <div className="nw-import-scroll">
            <div className="nw-import-thead">
              <span>{t({ en: "Imported at", zh: "导入时间" })}</span><span>{t({ en: "Source", zh: "来源" })}</span><span>{t({ en: "File / event", zh: "文件 / 活动" })}</span><span>{t({ en: "Total", zh: "导入总数" })}</span><span>{t({ en: "New contacts", zh: "新增联系人" })}</span><span>{t({ en: "Merged", zh: "合并联系人" })}</span><span>{t({ en: "Status", zh: "状态" })}</span><span>{t({ en: "Action", zh: "操作" })}</span>
            </div>
            {log.map((entry) => {
              if (entry.kind === "card") {
                const b = entry.batch;
                const status = LOG_STATUS[b.status];
                return (
                  <a key={b.id} className="btn nw-import-row" href={preserveHref(jobHref(b.id))} aria-current={jobId === b.id ? "true" : undefined}>
                    <span className="nw-import-row-time">{formatLogTime(b.createdAt)}</span>
                    <span>{t({ en: "Card scan", zh: "扫描名片夹" })}</span>
                    <span className="nw-import-row-file">{dash}</span>
                    <span>{b.expectedItems}</span>
                    <span>{dash}</span>
                    <span>{dash}</span>
                    <span className="nw-import-row-status" style={{ color: status.color }}><span className="nw-import-dot" style={{ background: status.color }}></span>{t(status.copy)}</span>
                    <span className="nw-import-row-link">{t({ en: "View", zh: "查看详情" })}</span>
                  </a>
                );
              }
              return <ImportLogRow key={entry.batch.id} batch={entry.batch} href={preserveHref(importHref(entry.batch))} t={t} />;
            })}
            {batches === "error" ? (
              <div className="nw-empty" role="alert" data-import-log-error>{t({ en: "Could not load import history", zh: "无法加载导入记录" })}</div>
            ) : batches !== null && imports !== null && log.length === 0 ? (
              <div className="nw-empty">{t({ en: "No imports yet", zh: "还没有导入记录" })}</div>
            ) : null}
          </div>
        </div>
      </div>
    </NetworkShell>
  );
}
