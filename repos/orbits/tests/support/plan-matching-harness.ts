/**
 * W0010 人脉需求匹配的真实 PostgreSQL 测试夹具：每个用例一个随机 schema，建好名片 v2、计划、
 * 匹配、orbit_records 四组表，用完即删。只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机回环库，
 * 非回环地址直接失败（不是 skip），不打印连接串。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import {
  createBusinessCardIngestRepository,
  type BusinessCardIngestRepository,
} from "../../features/acquisition/business-card-ingest-v2/repository";
import type { BusinessCardStructuredExtraction } from "../../features/acquisition/business-card-cloud-ocr";
import type { PlanService } from "../../features/plans/contract";
import { runPlanMatchingMigrations } from "../../features/plans/matching-migrations";
import { createPostgresPlanMatchRepository, type PlanMatchRepository } from "../../features/plans/matching-repository";
import { runPlanMigrations } from "../../features/plans/migrations";
import { createPostgresPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { planInput, steppingClock } from "./plan-fixture";

export const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
export const databaseTest = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
export const WORKSPACE = "workspace:plan-matching-test";
export const ALICE = "actor:alice";
export const BOB = "actor:bob";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertLoopbackDatabaseUrl(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    assert.fail("ORBIT_EVENT_DATABASE_URL is not a valid URL.");
  }
  assert.ok(LOOPBACK_HOSTS.has(hostname), "ORBIT_EVENT_DATABASE_URL must point at a loopback PostgreSQL.");
}

interface SeedContact {
  id: string;
  actor: string;
  name: string;
  organization?: string;
  role?: string;
  primary?: string | null;
  secondary?: string | null;
}

/** alice 的联系人（行业由 W0013 在识别时补好）；bob 有一位自己的联系人。 */
export const SEED_CONTACTS: SeedContact[] = [
  { actor: ALICE, id: "contact:saas", name: "佐藤 健", organization: "Cloudline KK", primary: "technology_internet", role: "SaaS 事业部长", secondary: "technology_internet.enterprise_software" },
  { actor: ALICE, id: "contact:ai", name: "田中 美咲", organization: "Nexa AI", primary: "technology_internet", role: "研究员", secondary: "technology_internet.ai_data" },
  { actor: ALICE, id: "contact:vc", name: "鈴木 一郎", organization: "Sakura Ventures", primary: "finance_investment", role: "Partner", secondary: "finance_investment.venture_capital" },
  { actor: ALICE, id: "contact:none", name: "高橋 花子", organization: "Tokyo Trading", role: "渠道经理" },
  { actor: ALICE, id: "contact:other", name: "伊藤 翔", organization: "Misc", primary: "other", role: "Staff", secondary: "other.other" },
  { actor: BOB, id: "contact:bob-only", name: "Bob Contact", organization: "Bob Co", primary: "technology_internet", role: "CTO", secondary: "technology_internet.enterprise_software" },
];

export const NEED_SAAS = "日本 SaaS 企业的决策人";
export const NEED_INVESTOR = "早期投资人";

/** 一份有两条人脉需求（SaaS 二级行业、金融一级行业）和一件行动的计划。 */
export function matchingPlanInput() {
  return planInput({
    items: [
      { kind: "action", phaseKey: "p1", suggestedWeek: 1, title: "整理 20 家目标客户名单" },
      {
        criteria: {
          description: "能拍板采购 SaaS 的人",
          primaryIndustryId: "technology_internet",
          secondaryIndustryId: "technology_internet.enterprise_software",
          titleKeywords: ["事业部长", "CTO"],
        },
        kind: "network_need",
        phaseKey: "p1",
        title: NEED_SAAS,
      },
      {
        criteria: { description: null, primaryIndustryId: "finance_investment", secondaryIndustryId: null, titleKeywords: ["投资"] },
        kind: "network_need",
        phaseKey: "p2",
        title: NEED_INVESTOR,
      },
    ],
  });
}

export const EXTRACTION: BusinessCardStructuredExtraction = {
  addresses: [],
  certifications: [],
  contactPoints: [],
  departments: [],
  detectedLanguages: ["ja"],
  emails: [],
  fullName: "测试 太郎",
  nativeFullName: null,
  organization: "Orbit",
  romanizedFullName: null,
  title: null,
  website: null,
};

export interface MatchingHarness {
  pool: Pool;
  ingest: BusinessCardIngestRepository;
  matches: PlanMatchRepository;
  planServiceFor(actorId: string): PlanService;
}

export async function withMatchingDatabase(run: (harness: MatchingHarness) => Promise<void>): Promise<void> {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `plan_match_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    max: 8,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  try {
    await admin.query(`create schema ${schema}`);
    const client = await pool.connect();
    try {
      await runBusinessCardIngestV2Migrations(client);
    } finally {
      client.release();
    }
    await runPlanMigrations(pool);
    await runPlanMatchingMigrations(pool);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for (const contact of SEED_CONTACTS) {
      const payload = {
        displayName: contact.name,
        id: contact.id,
        organization: contact.organization,
        role: contact.role,
        ...(contact.primary ? { primaryIndustryId: contact.primary } : {}),
        ...(contact.secondary ? { secondaryIndustryId: contact.secondary } : {}),
      };
      await pool.query(
        `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id,
           lifecycle_state, payload, created_at, updated_at)
         values ($1, 'contacts', $2, $3, 'manual', 'plan-matching-test', 'active', $4::jsonb, now(), now())`,
        [WORKSPACE, contact.id, contact.actor, JSON.stringify(payload)],
      );
    }
    const planRepository = createPostgresPlanRepository({ pool });
    const clock = steppingClock();
    await run({
      ingest: createBusinessCardIngestRepository({ pool, workspaceId: WORKSPACE }),
      matches: createPostgresPlanMatchRepository({ pool, workspaceId: WORKSPACE }),
      planServiceFor: (actorId) =>
        createPlanService({
          now: clock,
          references: createPostgresPlanReferenceValidator({ actorId, client: pool, eventCore: null, workspaceId: WORKSPACE }),
          repository: planRepository,
          scope: { actorId, workspaceId: WORKSPACE },
        }),
      pool,
    });
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
}

/**
 * 建一批已识别完成的名片（每张一面），返回批次与各张的条目。
 * `confirmAll` 依次（或并发）确认，每张写入给定的联系人 id。
 */
export async function extractedBatch(ingest: BusinessCardIngestRepository, actorId: string, cards: number) {
  const { batch, items } = await ingest.createBatch({
    actorId,
    idempotencyKey: `key:${randomUUID()}`,
    manifest: Array.from({ length: cards }, (_, index) => ({
      cardId: `card:${index + 1}`,
      clientDigest: `sha256:${randomUUID()}`,
      fileName: `card-${index + 1}.heic`,
      mimeType: "image/heic",
      rawSize: 1000 + index,
      seq: index + 1,
      side: "front" as const,
    })),
  });
  for (const item of items) {
    await ingest.markItemUploaded({
      actorId,
      batchId: batch.id,
      derivativeObjectKey: `obj/${item.id}.jpg`,
      derivativeSize: 500,
      imageDigest: item.clientDigest,
      itemId: item.id,
    });
  }
  await ingest.finalizeBatch({ actorId, batchId: batch.id });
  for (;;) {
    const claimed = await ingest.claimItems({ limit: 10 });
    if (claimed.length === 0) break;
    for (const item of claimed) {
      await ingest.submitExtraction({
        expectedVersion: item.version,
        extraction: EXTRACTION,
        itemId: item.id,
        leaseToken: item.leaseToken,
        reviewIssues: [],
        usage: null,
      });
    }
  }
  const detail = await ingest.getBatch({ actorId, batchId: batch.id });
  assert.ok(detail);
  return { batch: detail.batch, items: detail.items.sort((a, b) => a.seq - b.seq) };
}

export function confirmItem(
  ingest: BusinessCardIngestRepository,
  input: { actorId: string; batchId: string; itemId: string; contactId: string },
) {
  return ingest.confirmItem({
    actorId: input.actorId,
    allowFrom: ["extracted"] as const,
    batchId: input.batchId,
    async createContact() {
      return input.contactId;
    },
    itemId: input.itemId,
  });
}

export async function jobRows(pool: Pool) {
  return (
    await pool.query(
      `select id, actor_id, source_kind, source_key, batch_ids, contact_ids, status, ai_state, attempt_count, ai_usage,
              rule_hits, ai_hits, not_before
       from plan_match_jobs order by created_at, source_key`,
    )
  ).rows as Array<{
    id: string;
    actor_id: string;
    source_kind: string;
    source_key: string;
    batch_ids: string[];
    contact_ids: string[];
    status: string;
    ai_state: string;
    attempt_count: number;
    ai_usage: Record<string, unknown> | null;
    rule_hits: number;
    ai_hits: number;
    not_before: Date;
  }>;
}
