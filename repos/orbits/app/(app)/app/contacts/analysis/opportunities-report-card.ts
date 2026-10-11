/**
 * W0050：机会标签报告卡的纯函数（W0048a `NetworkSnapshotView` → 文案与按钮）与客户端安全的常量。
 * 本文件只依赖类型与 network-copy，客户端组件可直接 import（不牵入服务端模块）。
 */
import type { NetworkSnapshotView } from "../../../../../features/network-analysis/contract";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { planTaskSegmentHref } from "../../../../../shared/compute/plan-href";
import { pickCopy, type NetworkCopy } from "./network-copy";

/** 计划入口：Task › プラン（R25 起旧的计划页 agent/plan 已删除）。 */
export const PLAN_HREF = planTaskSegmentHref("web");

export type ReportCardLimit = "manual" | "user" | null;

export interface ReportCardModel {
  /** 「生成于 M/D · 基于 N 人 · 新增 M 人未纳入」；none／insufficient／unavailable 为说明句。 */
  status: string;
  /** 「正在更新」「今日自动更新次数已用完，明天更新」等（可空）。 */
  note: string | null;
  button: { label: string; disabled: boolean; hint: string | null } | null;
}

function monthDay(iso: string, language: OrbitLanguage): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "numeric", timeZone: "Asia/Tokyo" }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return language === "zh" ? `${month}/${day}` : `${month}/${day}`;
}

/** 剩余手动次数：k = min(3 − manual.usedToday, 10 − user.usedToday)，不小于 0。 */
export function manualRemaining(report: Pick<NetworkSnapshotView, "quota">): number {
  const { manual, user } = report.quota;
  return Math.max(0, Math.min(manual.limit - manual.usedToday, user.limit - user.usedToday));
}

/**
 * 报告卡（W0048a 视图 → 文案与按钮）。`limit` 为点击后服务端 429 的原因（`MANUAL_REFRESH_LIMIT` → manual，
 * `USER_DAILY_LIMIT` → user），与配额读数任一满足即置灰。
 */
export function reportCardModel(report: NetworkSnapshotView, language: OrbitLanguage, limit: ReportCardLimit = null): ReportCardModel {
  const t = (copy: NetworkCopy) => pickCopy(copy, language);
  if (report.state === "unavailable") {
    return { button: null, note: null, status: t({ en: "The analysis report is temporarily unavailable.", zh: "分析报告暂时读不到。" }) };
  }
  if (report.state === "insufficient") {
    return { button: null, note: null, status: t({ en: "Add at least 3 contacts to generate a network analysis.", zh: "至少有 3 位联系人后才能生成人脉分析。" }) };
  }
  const userCapped = limit === "user" || report.quota.user.usedToday >= report.quota.user.limit;
  const manualCapped = limit === "manual" || report.quota.manual.usedToday >= report.quota.manual.limit;
  const remaining = manualRemaining(report);
  const label = report.state === "none"
    ? t({ en: "Generate analysis", zh: "生成分析" })
    : t({ en: `Analyze again (${remaining} left today)`, zh: `重新分析（今天还剩 ${remaining} 次）` });
  const button = userCapped
    ? { disabled: true, hint: t({ en: "You've used today's requests. Available again tomorrow.", zh: "今天次数已用完，明天可用" }), label }
    : manualCapped
      ? { disabled: true, hint: null, label: t({ en: `Analyzed ${report.quota.manual.limit} times today`, zh: `今天已重新分析 ${report.quota.manual.limit} 次` }) }
      : { disabled: remaining <= 0, hint: null, label };
  const job = report.freshness.job;
  const note = job === "queued" || job === "running"
    ? t({ en: "Updating…", zh: "正在更新" })
    : job === "deferred"
      ? t({ en: "Today's automatic updates are used up — it will update tomorrow.", zh: "今日自动更新次数已用完，明天更新" })
      : null;
  if (report.state === "none") {
    return { button, note, status: t({ en: "No analysis yet", zh: "尚未生成分析" }) };
  }
  const parts = [
    t({ en: `Generated ${monthDay(report.generatedAt ?? "", language)}`, zh: `生成于 ${monthDay(report.generatedAt ?? "", language)}` }),
    t({ en: `based on ${report.contactCount} contacts`, zh: `基于 ${report.contactCount} 人` }),
  ];
  if (report.freshness.newContactCount > 0) {
    parts.push(t({ en: `${report.freshness.newContactCount} new not yet included`, zh: `新增 ${report.freshness.newContactCount} 人未纳入` }));
  }
  return { button, note, status: parts.join(" · ") };
}
