import { pathToFileURL } from "node:url";

import { resolveCanonicalAccountOwnerId } from "../features/account/canonical-account-owner";
import { createConfiguredStorageAccountSessionProvider } from "../features/account/storage/account-live-record-provider";
import { createConfiguredStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";
import type { IndustryIdCode } from "../shared/contract/industries";
import { isIndustryIdCode } from "../shared/domain/industries";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../shared/storage/live-record-store";
import { loadLocalEnv } from "./load-local-env";

const legacyIndustryMap: Readonly<Record<string, IndustryIdCode>> = {
  "AI": "technology_internet",
  "Enterprise AI": "technology_internet",
  "Enterprise software": "technology_internet",
  "SaaS": "technology_internet",
  "互联网": "technology_internet",
  "人工智能与企业软件": "technology_internet",
  "企业人工智能": "technology_internet",
  "企业软件": "technology_internet",
  "云基础设施": "technology_internet",
  "Venture": "finance_investment",
  "Venture capital": "finance_investment",
  "Finance": "finance_investment",
  "FinTech": "finance_investment",
  "climate finance": "finance_investment",
  "风险投资": "finance_investment",
  "startup operations": "professional_services",
  "创业服务": "professional_services",
  "Industrial software": "manufacturing_supply_chain",
  "Robotics": "manufacturing_supply_chain",
  "Semiconductor": "manufacturing_supply_chain",
  "机器人": "manufacturing_supply_chain",
  "制造业": "manufacturing_supply_chain",
  "Ecommerce": "retail_consumer",
  "Consumer": "retail_consumer",
  "Fashion": "retail_consumer",
  "Marketplace": "retail_consumer",
  "跨境电商": "retail_consumer",
  "Cross-border": "trade_logistics",
  "Cross-border infrastructure": "trade_logistics",
  "Food logistics": "trade_logistics",
  "Healthcare": "healthcare_life_sciences",
  "healthcare": "healthcare_life_sciences",
  "数字医疗": "healthcare_life_sciences",
  "F&B": "food_hospitality",
  "酒店业": "food_hospitality",
  "Event Technology": "media_creative",
  "品牌战略": "media_creative",
  "Community": "community_nonprofit",
  "可持续发展": "community_nonprofit",
  "Climate": "community_nonprofit",
  "climate": "community_nonprofit",
  "Climate technology and enterprise software": "technology_internet",
  "Industrial climate technology": "manufacturing_supply_chain",
  "Mobility and enterprise AI": "technology_internet",
  "工业 AI 与气候科技": "manufacturing_supply_chain",
  "工业人工智能、气候科技与跨境企业软件": "manufacturing_supply_chain",
};

const generatedFixtureOrganizationSuffixes: readonly [string, IndustryIdCode][] = [
  ["餐饮", "food_hospitality"],
  ["科技", "technology_internet"],
  ["资本", "finance_investment"],
  ["伙伴", "professional_services"],
  ["社群", "community_nonprofit"],
];

export interface ContactPrimaryIndustryMigrationReport {
  actorId: string;
  applied: boolean;
  classified: number;
  preserved: number;
  scanned: number;
  unclassified: number;
  updated: number;
}

export function classifyLegacyContactIndustry(input: {
  industry?: unknown;
  organization?: unknown;
  provider?: unknown;
}): IndustryIdCode | undefined {
  const label = typeof input.industry === "string" ? input.industry.trim() : "";
  if (label && legacyIndustryMap[label]) return legacyIndustryMap[label];

  const organization = input.organization;
  if (
    input.provider === "generated-relationship-fixtures" &&
    typeof organization === "string"
  ) {
    return generatedFixtureOrganizationSuffixes.find(([suffix]) =>
      organization.endsWith(suffix),
    )?.[1];
  }
  return undefined;
}

export async function migrateContactPrimaryIndustries(input: {
  actorId: string;
  apply: boolean;
  now?: () => string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}): Promise<ContactPrimaryIndustryMigrationReport> {
  const records = await input.store.listRecords({
    collectionName: "contacts",
    lifecycleState: "active",
    userId: input.actorId,
    workspaceId: input.workspaceId,
  });
  const report: ContactPrimaryIndustryMigrationReport = {
    actorId: input.actorId,
    applied: input.apply,
    classified: 0,
    preserved: 0,
    scanned: records.length,
    unclassified: 0,
    updated: 0,
  };

  for (const record of records) {
    if (isIndustryIdCode(record.payload.primaryIndustryId)) {
      report.preserved += 1;
      continue;
    }
    const publicProfile =
      record.payload.publicProfile && typeof record.payload.publicProfile === "object"
        ? (record.payload.publicProfile as Record<string, unknown>)
        : undefined;
    const primaryIndustryId = classifyLegacyContactIndustry({
      industry: publicProfile?.industry,
      organization: record.payload.organization,
      provider: record.provider,
    });
    if (!primaryIndustryId) {
      report.unclassified += 1;
      continue;
    }
    report.classified += 1;
    if (!input.apply) continue;

    const updatedAt = (input.now ?? (() => new Date().toISOString()))();
    await input.store.upsertRecord({
      ...record,
      updatedAt,
      payload: {
        ...record.payload,
        primaryIndustryId,
        updatedAt,
      },
    });
    report.updated += 1;
  }

  return report;
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  loadLocalEnv();
  const email = argumentValue("--email");
  if (!email) {
    throw new Error("Usage: npm run contacts:migrate-primary-industries -- --email <account-email> [--apply]");
  }
  const authProvider = createConfiguredStorageAuthUserProvider();
  const accountProvider = createConfiguredStorageAccountSessionProvider();
  const configured = createConfiguredPostgresLiveRecordStore<Record<string, unknown>>();
  if (!authProvider || !accountProvider || !configured) {
    throw new Error("The configured live store is unavailable.");
  }
  const authUser = await authProvider.getUserByEmail(email);
  if (!authUser) throw new Error(`No account exists for ${email}.`);
  const actorId = resolveCanonicalAccountOwnerId({
    authUserId: authUser.id,
    graph: await accountProvider.readAccountSessionGraph(),
  });
  const report = await migrateContactPrimaryIndustries({
    actorId,
    apply: process.argv.includes("--apply"),
    store: configured.store,
    workspaceId: configured.workspaceId,
  });
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
