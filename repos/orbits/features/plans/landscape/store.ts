/**
 * R23 业界现状库的唯一读入口（DESIGN §6）。以后条目迁到表里，只换这里的实现。
 *
 * - 初版（C6）与見直し（C9）只能引用 `publishedEntriesFor` 给出的条目：`published`、`updatedOn` 在 12 个月内、
 *   目标类型相符；行业相符的排前面；最多 12 条。
 * - 已保存计划里的引用用 `resolveCitations` 按 id + 版本解析（retired / 过期的旧版本也能显示，不再被新方案引用）。
 */
import { createHash } from "node:crypto";

import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type { IndustryIdCode } from "../../../shared/contract/industries";
import type { PlanCitation, PlanCitationView, PlanGoalKind } from "../../../shared/contract/plan-v2";
import { LANDSCAPE_ENTRIES } from "./entries";
import type { LandscapeEntry } from "./types";

export const LANDSCAPE_MAX_AGE_MONTHS = 12;
export const LANDSCAPE_MAX_ENTRIES = 12;

/** 条目内容的哈希（不含 status / reviewedBy / checksum：发布与审核不改内容）。 */
export function landscapeChecksum(entry: Omit<LandscapeEntry, "checksum" | "status" | "reviewedBy">): string {
  const content = {
    goalKinds: entry.goalKinds,
    id: entry.id,
    industries: entry.industries,
    source: entry.source,
    summary: entry.summary,
    title: entry.title,
    updatedOn: entry.updatedOn,
    version: entry.version,
  };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 16);
}

function monthsAgo(now: Date, months: number): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

function industryRoot(industry: string): string {
  return industry.split(".")[0] ?? industry;
}

/** 每个 id 只取最新的 published 版本。 */
function latestPublished(entries: readonly LandscapeEntry[]): LandscapeEntry[] {
  const byId = new Map<string, LandscapeEntry>();
  for (const entry of entries) {
    if (entry.status !== "published") continue;
    const current = byId.get(entry.id);
    if (!current || entry.version > current.version) byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

export function publishedEntriesFor(input: {
  goalKind: PlanGoalKind;
  industries?: readonly string[];
  now: Date;
  limit?: number;
  entries?: readonly LandscapeEntry[];
}): LandscapeEntry[] {
  const cutoff = monthsAgo(input.now, LANDSCAPE_MAX_AGE_MONTHS);
  const wanted = new Set((input.industries ?? []).map(industryRoot));
  const eligible = latestPublished(input.entries ?? LANDSCAPE_ENTRIES).filter((entry) =>
    entry.updatedOn >= cutoff
    && entry.goalKinds.includes(input.goalKind)
    && (entry.industries.length === 0 || entry.industries.some((industry) => wanted.has(industryRoot(industry)))),
  );
  const matchesIndustry = (entry: LandscapeEntry) => (entry.industries.length > 0 ? 0 : 1);
  return eligible
    .sort((a, b) => matchesIndustry(a) - matchesIndustry(b) || b.updatedOn.localeCompare(a.updatedOn) || a.id.localeCompare(b.id))
    .slice(0, input.limit ?? LANDSCAPE_MAX_ENTRIES);
}

export function landscapeEntry(id: string, version: number, entries: readonly LandscapeEntry[] = LANDSCAPE_ENTRIES): LandscapeEntry | null {
  return entries.find((entry) => entry.id === id && entry.version === version) ?? null;
}

export function citationView(entry: LandscapeEntry, language: PlanCopyLanguage): PlanCitationView {
  return {
    id: entry.id,
    sourceLabel: entry.source.label,
    sourcePublishedOn: entry.source.publishedOn,
    sourceUrl: entry.source.url,
    summary: entry.summary[language],
    title: entry.title[language],
    updatedOn: entry.updatedOn,
    version: entry.version,
  };
}

/** 计划里保存的引用 → 界面显示用（找不到的引用丢弃）。 */
export function resolveCitations(citations: readonly PlanCitation[], language: PlanCopyLanguage, entries: readonly LandscapeEntry[] = LANDSCAPE_ENTRIES): PlanCitationView[] {
  return citations.flatMap((citation) => {
    const entry = landscapeEntry(citation.id, citation.version, entries);
    return entry ? [citationView(entry, language)] : [];
  });
}

export type { IndustryIdCode };
