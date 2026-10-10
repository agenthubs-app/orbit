/**
 * R22 SC-R22-08：在本机测试库里造一份「已确定的 v2 计划」（资金调达模板：几个人已经话过、一个类型已跳过、
 * 一场活动已参加），给 R23–R25 的界面验收用。
 *
 * 用法（只对本机回环库；不读 .env，连接串由命令行环境变量给出）：
 *   ORBIT_SEED_DATABASE_URL=postgres://localhost/orbit_test node --import tsx scripts/seed-plan-v2.ts \
 *     --actor <actorId> [--workspace workspace:default] [--goal-id seed-goal-1]
 *
 * 安全：连接串的主机必须是 localhost / 127.0.0.1 / ::1，数据库名不能含 prod / neon / staging；
 * 生产（VERCEL_ENV=production）直接拒绝。会先跑计划与 AI 账本的迁移（本机），重复执行只建一份（同一 goal-id 幂等）。
 */
import { Pool } from "pg";

import { runNetworkAnalysisMigrations } from "../features/network-analysis/migrations";
import { runPlanMatchingMigrations } from "../features/plans/matching-migrations";
import { runPlanMigrations } from "../features/plans/migrations";
import { createPostgresPlanV2Repository } from "../features/plans/v2/repository";
import { createPlanV2Service, type CreatePlanFromDraftInput } from "../features/plans/v2/service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../shared/storage/migrations";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertSeedTarget(url: string, env: Readonly<Record<string, string | undefined>> = process.env): void {
  if (env.VERCEL_ENV === "production") throw new Error("seed-plan-v2 never runs in production.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("ORBIT_SEED_DATABASE_URL is not a valid URL.");
  }
  if (!LOOPBACK.has(parsed.hostname)) throw new Error("seed-plan-v2 only writes to a loopback PostgreSQL (localhost / 127.0.0.1 / ::1).");
  if (/prod|neon|staging/iu.test(parsed.pathname)) throw new Error("seed-plan-v2 refuses a database whose name looks like production or staging.");
}

function argument(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required.`);
}

export function seedDraft(goalId: string): CreatePlanFromDraftInput {
  const type = (key: string, allocation: number, targetCount: number, shortLabel: string, emoji: string, roleSituation: string) => ({
    allocation,
    countRule: "3 問のうち 2 問以上を聞けたら「話せた」です。",
    emoji,
    introRoutes: [],
    key,
    questions: ["いまの判断基準は何ですか？", "最初に見る数字は何ですか？", "ほかに会うべき人はいますか？"],
    recognizeHints: [],
    roleSituation,
    shortLabel,
    shortLabelId: key,
    slot: key,
    targetCount,
    why: "このタイプの人と話すと、次の Step の判断材料がそろいます。",
  });
  return {
    content: {
      allocationReasons: ["テンプレート「資金調達」の既定のままです。"],
      basis: [],
      citations: [],
      conclusion: "先に数字と資料を固め、先輩起業家の紹介で VC 3 社と並行して話す。",
      diagnosis: "数字は伸びていますが、リード候補がまだいません。",
      event: { allocation: 10, targetCount: 2 },
      personTypes: [
        type("cfo", 10, 1, "CFO 経験者", "📊", "シリーズ A 前後の資金調達を、CFO として 1 回以上まとめた人"),
        type("funded_founder", 15, 3, "調達経験のある起業家", "🧗", "3年以内にシリーズ A を調達した、技術系スタートアップの創業者"),
        type("angel", 10, 2, "エンジェル投資家", "👼", "製造業や SaaS に個人で投資している、元起業家のエンジェル"),
        { ...type("vc_partner", 30, 3, "VC パートナー", "🏦", "シリーズ A のリードを取れる VC のパートナー"), primaryIndustryId: "finance_investment" as const, secondaryIndustryId: "finance_investment.venture_capital" as const },
        type("cvc", 15, 3, "CVC 担当者", "🏢", "製造業 DX に出資している、事業会社 CVC の投資担当"),
        type("lawyer", 10, 1, "弁護士（投資契約）", "⚖️", "スタートアップの投資契約を多く見てきた弁護士"),
      ],
      steps: [
        { doneCriteria: "ピッチ資料と事業計画を CFO 経験者 1 人に見てもらう", key: "step-1", personTypeKeys: ["cfo"], title: "数字と資料を固める", why: null },
        { doneCriteria: "調達経験のある起業家 3 人から、VC の紹介を 2 件もらう", key: "step-2", personTypeKeys: ["funded_founder", "angel"], title: "先輩起業家に紹介を頼む", why: null },
        { doneCriteria: "VC パートナー 3 人と面談し、1 社と DD に進む", key: "step-3", personTypeKeys: ["vc_partner"], title: "VC と並行して話す", why: null },
        { doneCriteria: "CVC 担当者 3 人に事業の相性を聞く", key: "step-4", personTypeKeys: ["cvc"], title: "CVC を後から加える", why: null },
        { doneCriteria: "投資契約を弁護士に確認してもらう", key: "step-5", personTypeKeys: ["lawyer"], title: "契約をまとめる", why: null },
      ],
    },
    creationKey: `seed:${goalId}`,
    goalId,
    goalKind: "fundraising",
    goalText: "シリーズA 資金調達（3億円）",
    manualEditAvailable: true,
    premise: [{ guessed: false, key: "purpose", label: "目的", source: "background", value: "製造業 DX の SaaS を伸ばせる体制にする" }],
    purposeLevel: 3,
    purposeText: "製造業 DX の SaaS を伸ばせる体制にする",
  };
}

async function main(): Promise<void> {
  const url = process.env.ORBIT_SEED_DATABASE_URL;
  if (!url) throw new Error("Set ORBIT_SEED_DATABASE_URL to a local test database (this script never reads .env).");
  assertSeedTarget(url);
  const actorId = argument("actor");
  const workspaceId = argument("workspace", "workspace:default");
  const goalId = argument("goal-id", "seed-goal-1");
  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL).catch(() => undefined);
    await runPlanMigrations(pool);
    await runPlanMatchingMigrations(pool);
    await runNetworkAnalysisMigrations(pool);
    const service = createPlanV2Service({ repository: createPostgresPlanV2Repository({ pool }), scope: { actorId, workspaceId } });
    const { created, plan } = await service.createPlanFromDraft(seedDraft(goalId));
    if (created) {
      const id = (key: string) => plan.content.personTypes.find((type) => type.key === key)!.itemId;
      await service.award({ itemId: id("vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "seed-contact-vc-1", idempotencyKey: "seed-vc-1" } });
      await service.award({ itemId: id("vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "seed-contact-vc-2", idempotencyKey: "seed-vc-2" } });
      await service.award({ itemId: id("funded_founder"), planId: plan.planId, request: { anonymous: true, basis: "self_report", idempotencyKey: "seed-founder-anon" } });
      await service.skip({ idempotencyKey: "seed-lawyer-skip", itemId: id("lawyer"), planId: plan.planId });
      await service.recordEventAttendanceForPlans({ eventId: "seed-event-cfo-night", title: "CFO Night Tokyo" });
    }
    const detail = await service.detail(plan.planId);
    console.log(JSON.stringify({ created, planId: plan.planId, score: detail?.score.total, workspaceId }));
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("seed-plan-v2.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
