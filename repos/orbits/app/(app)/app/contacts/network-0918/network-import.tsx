/**
 * 「导入人脉」（Network v2 第 303–392 行）。
 * 四种方式卡 1:1；只有「扫描名片夹」接真实能力（名片 V2 入口 BusinessCardIngestV2Start），
 * 其余三张 CTA 为「即将开放」占位（无接口不做假流程）。
 * 设计稿的 CSV 预览表（328–360）被名片 V2 工作区替代；`?job=` 时工作区改为该批次详情。
 * 导入记录 = 名片 V2 批次列表（与 business-card-batch-entry 相同的 /batches/v2 接口）。
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { BusinessCardCaptureAvailability } from "../../../../../features/acquisition/business-card-capture-availability";
import type { IngestBatchDTO } from "../../../../../features/acquisition/business-card-ingest-v2/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import { BusinessCardIngestV2Start } from "../ingest-v2/business-card-ingest-v2-start";
import { BusinessCardIngestV2View } from "../ingest-v2/business-card-ingest-v2-view";
import { INGEST_V2_API_BASE } from "../ingest-v2/ingest-v2-client";
import { INGEST_V2_COPY } from "../ingest-v2/ingest-v2-copy";
import { NetworkShell } from "./network-shell";

export type NetworkImportMethod = "csv" | "contacts" | "scan" | "event";
/** 屏幕只消费可用性判定与原因；其余配置位（mode/provider 标志）不进 UI。 */
export type NetworkImportAvailability = Pick<BusinessCardCaptureAvailability, "available" | "reason">;

type Copy = { en: string; zh: string };

const METHODS: readonly { key: NetworkImportMethod; icon: string; title: Copy; desc: Copy; cta: Copy; hint: Copy; iconBg: string; iconFg: string }[] = [
  { key: "csv", icon: "▲", title: { en: "Upload CSV", zh: "上传 CSV" }, desc: { en: "Import contacts in bulk from an Excel or CSV file.", zh: "从 Excel 或 CSV 文件批量导入联系人。" }, cta: { en: "Choose file", zh: "选择文件" }, hint: { en: "Supports .csv and .xlsx", zh: "支持 .csv、.xlsx 格式" }, iconBg: "#DDDEFA", iconFg: "#2E3270" },
  { key: "contacts", icon: "▤", title: { en: "Import address book", zh: "导入通讯录" }, desc: { en: "Sync contacts from your phone or email address book.", zh: "从手机或邮箱通讯录快速同步联系人。" }, cta: { en: "Connect address book", zh: "连接通讯录" }, hint: { en: "Google, Apple and corporate email", zh: "支持 Google、Apple、企业邮箱" }, iconBg: "#E6F1EC", iconFg: "#2F6B4F" },
  { key: "scan", icon: "▭", title: { en: "Scan business cards", zh: "扫描名片夹" }, desc: { en: "Photograph or upload cards; AI recognises and imports them.", zh: "拍照或上传名片，AI 自动识别并导入。" }, cta: { en: "Upload cards", zh: "上传名片" }, hint: { en: "Images (JPG, PNG)", zh: "支持图片（JPG、PNG）" }, iconBg: "#ECEEFB", iconFg: "#4B4FC7" },
  { key: "event", icon: "▦", title: { en: "Add from an event", zh: "从活动添加联系人" }, desc: { en: "Pick an event you attended and add its attendees in one go.", zh: "选择你参与的活动，一键添加参会联系人。" }, cta: { en: "Choose event", zh: "选择活动" }, hint: { en: "From your past events", zh: "从历史活动中选择" }, iconBg: "#FBF1DC", iconFg: "#8A6420" },
];

const NOTES: readonly { icon: string; title: Copy; desc: Copy }[] = [
  { icon: "◎", title: { en: "Duplicate detection", zh: "去重识别" }, desc: { en: "Duplicates are detected from name, company and email, with merge suggestions.", zh: "系统会基于姓名、公司、邮箱等信息自动识别重复联系人，并提供合并建议。" } },
  { icon: "▤", title: { en: "File formats", zh: "文件格式" }, desc: { en: ".csv and .xlsx, up to 10MB and 10,000 records per file.", zh: "支持 .csv、.xlsx 格式，单个文件不超过 10MB，最多 10,000 条记录。" } },
  { icon: "≡", title: { en: "Recommended fields", zh: "推荐字段" }, desc: { en: "Include name, company, title, email and phone — fuller fields match better.", zh: "建议包含：姓名、公司、职位、邮箱、手机号。字段越完整，匹配越准确。" } },
  { icon: "◈", title: { en: "Data safety", zh: "数据安全" }, desc: { en: "Imported contacts stay in your personal CRM and are never shared.", zh: "我们严格保护你的数据，导入的联系人仅用于你的个人 CRM，不会对外泄露。" } },
];

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

export function NetworkImport({ availability, initialMethod = "scan", jobId }: { availability: NetworkImportAvailability; initialMethod?: NetworkImportMethod; jobId?: string }) {
  const { t, preserveHref } = useOrbitLanguage();
  const router = useRouter();
  const [method, setMethod] = useState<NetworkImportMethod>(initialMethod);
  // null = 尚未拉取（SSR / 首帧）：不显示空态，避免闪一次「还没有导入记录」；"error" = 拉取失败（非 OK / 抛错），显示错误行而非空态。
  const [batches, setBatches] = useState<readonly IngestBatchDTO[] | null | "error">(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = METHODS.find((m) => m.key === method) ?? METHODS[2]!;
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
  }, [jobId]);

  function chooseScan() {
    // 批次详情态下工作区被详情占用：CTA 改为导航回扫描方式；否则选中并滚到工作区。
    if (jobId) {
      router.push(preserveHref("/app/contacts/new?method=scan"));
      return;
    }
    setMethod("scan");
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderWorkArea() {
    if (jobId) {
      return (
        <div data-network-import-job={jobId}>
          <BusinessCardIngestV2View batchId={jobId} />
        </div>
      );
    }
    if (method !== "scan") {
      return (
        <div className="nw-import-note">
          <span className="nw-import-note-icon">{selected.icon}</span>
          <span className="nw-import-note-copy"><strong className="nw-import-note-title">{t({ en: "Coming soon", zh: "即将开放" })}</strong><span className="nw-import-note-desc">{t({ en: "This method is not connected yet. Scan business cards to import contacts today.", zh: "该方式尚未接入；目前可通过扫描名片夹导入联系人。" })}</span></span>
        </div>
      );
    }
    if (!availability.available) {
      return (
        <div className="nw-import-note">
          <span className="nw-import-note-icon">⊘</span>
          <span className="nw-import-note-copy"><strong className="nw-import-note-title">{t(INGEST_V2_COPY.unavailableTitle)}</strong><span className="nw-import-note-desc">{t(availability.reason === "ready" ? INGEST_V2_COPY.unavailableOcr : UNAVAILABLE_COPY[availability.reason])}</span></span>
        </div>
      );
    }
    return <BusinessCardIngestV2Start />;
  }

  return (
    <NetworkShell screen="import">
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
                  const on = method === m.key && !jobId;
                  const soon = m.key !== "scan";
                  return (
                    <div key={m.key} className={["nw-import-method", soon ? "nw-import-method-soon" : "", on ? "nw-import-method-on" : ""].filter(Boolean).join(" ")} data-import-method={m.key}>
                      <span className="nw-import-method-icon" style={{ background: m.iconBg, color: m.iconFg }}>{m.icon}</span>
                      <strong className="nw-import-method-title">{t(m.title)}</strong>
                      <span className="nw-import-method-desc">{t(m.desc)}</span>
                      {soon ? (
                        <span className={on ? "nw-import-cta nw-import-cta-soon nw-import-cta-on" : "nw-import-cta nw-import-cta-soon"} aria-disabled="true">{t({ en: "Coming soon", zh: "即将开放" })}</span>
                      ) : (
                        <button type="button" className={on ? "btn nw-import-cta nw-import-cta-on" : "btn nw-import-cta"} onClick={chooseScan}>{t(m.cta)}</button>
                      )}
                      <span className="nw-import-method-hint">{t(m.hint)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="nw-import-panel" ref={panelRef}>
              <div className="nw-import-panel-head">
                <div className="nw-card-head">
                  <h2 className="nw-h2">{jobId ? t({ en: "Batch detail", zh: "批次详情" }) : t(selected.title)}</h2>
                  <span className="nw-card-hint">{jobId ? t({ en: "Upload, recognition and review of this card batch.", zh: "该批名片的上传、识别与逐张复核。" }) : t(selected.desc)}</span>
                </div>
                {jobId ? <a className="nw-import-panel-link" href={preserveHref("/app/contacts/new?method=scan")}>{t({ en: "Back to import", zh: "返回导入" })}</a> : null}
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
            {(Array.isArray(batches) ? batches : []).map((b) => {
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
            })}
            {batches === "error" ? (
              <div className="nw-empty" role="alert" data-import-log-error>{t({ en: "Could not load import history", zh: "无法加载导入记录" })}</div>
            ) : batches !== null && batches.length === 0 ? (
              <div className="nw-empty">{t({ en: "No imports yet", zh: "还没有导入记录" })}</div>
            ) : null}
          </div>
        </div>
      </div>
    </NetworkShell>
  );
}
