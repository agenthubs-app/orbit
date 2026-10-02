/**
 * W0048a SC-W0048a-01：人脉分析快照读取的单次返回字节（本机实测）与 1000 人月出站折算（D39 口径）。
 *
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机回环库（非回环直接失败），在随机临时 schema 里建表（含严格
 * sync_revision，与生产一致），造一个测试账号（默认 200 位联系人、50 条 memo、一份含 3 条人脉需求的计划），
 * 用 mock 生成器（0 次付费调用）写一份快照，测完删除 schema。
 *
 * 计量口径与生产 `ORBIT_PG_READ_METRICS` 相同：每条语句返回行的 JSON 字节之和（近似 Neon 出站，不含协议开销）。
 * 不含页面已有的资料读取（`getProfile`，与分析页其余部分共用）与示例期判定，单列说明。
 *
 * 运行：ORBIT_EVENT_DATABASE_URL=postgresql://…@localhost:5432/orbit_test npx tsx scripts/measure-network-snapshot-traffic.ts [--contacts=200]
 */
import { createNetworkAnalysisRuntime } from "../features/network-analysis/runtime";
import { createMockSnapshotGenerator } from "../features/network-analysis/snapshot-generator";
import { ALICE, insertActivePlan, withNetworkDatabase, WORKSPACE, type NetworkHarness } from "../tests/support/network-analysis-harness";

const CONTACTS = Number(process.argv.find((arg) => arg.startsWith("--contacts="))?.split("=")[1] ?? 200);
const USERS = 1000;
const DAYS = 30;
const NOW = new Date("2026-10-02T03:00:00.000Z");

async function measure<T>(harness: NetworkHarness, run: () => Promise<T>) {
  harness.meter.statements.length = 0;
  harness.meter.bytes = 0;
  harness.meter.perStatement = [];
  const value = await run();
  const top = [...harness.meter.perStatement].sort((a, b) => b.bytes - a.bytes).slice(0, 6);
  return { bytes: harness.meter.bytes, statements: harness.meter.statements.length, top, value };
}

const mb = (bytes: number) => Math.round((bytes / 1e6) * 100) / 100;

async function main() {
  await withNetworkDatabase(async (harness) => {
    const industries = ["technology_internet", "finance_investment", "manufacturing", "trade_logistics"];
    for (let index = 0; index < CONTACTS; index += 1) {
      // 姓名不含 id（真实姓名不会等于记录 id；校验器会丢弃把原始 id 写进文字的块）。
      const name = `${["佐藤", "田中", "Chen", "Kim"][index % 4]} ${String.fromCharCode(65 + (index % 26))}${String.fromCharCode(97 + Math.floor(index / 26))}`;
      await harness.addContact(ALICE, `c${index}`, {
        displayName: name,
        primaryIndustryId: industries[index % industries.length],
        publicProfile: { seniorityLevel: ["director", "manager", "vp", "individual_contributor"][index % 4] },
        region: { city: "Tokyo", countryCode: "JP" },
      });
    }
    for (let index = 0; index < 50; index += 1) {
      await harness.insertRecord({
        collection: "contact_detail_states", id: `detail:c${index}`, userId: ALICE,
        payload: { actorId: ALICE, contactId: `c${index}`, notes: [{ body: "在展会上聊了合作，对方在找日本渠道伙伴。".repeat(2), createdAt: "2026-09-20T00:00:00.000Z", kind: "memo", noteId: `note:live-contact-detail-update:m${index}` }] },
      });
    }
    await insertActivePlan(harness.pool, ALICE, { needs: [{ id: "n1", title: "SaaS 决策人" }, { id: "n2", title: "早期投资人" }, { id: "n3", title: "日本渠道伙伴" }] });
    const runtime = createNetworkAnalysisRuntime({
      client: harness.client,
      generator: createMockSnapshotGenerator(),
      now: () => NOW,
      readCurrentPlan: async () => null,
      readProfile: async () => ({ goal: "认识日本 SaaS 决策人", profileSection: { profile: { relationshipGoal: "认识日本 SaaS 决策人" }, state: "ready" } }),
      workspaceId: WORKSPACE,
    });
    const firstOpen = await measure(harness, () => runtime.service.readView(ALICE, "zh"));
    const generation = await measure(harness, () => runtime.service.runWorker(ALICE));
    const fresh = await measure(harness, () => runtime.service.readView(ALICE, "zh"));
    await harness.addContact(ALICE, `c-new-1`);
    const stale = await measure(harness, () => runtime.service.readView(ALICE, "zh"));
    const httpBody = Buffer.byteLength(JSON.stringify({ data: fresh.value, success: true }), "utf8");
    const monthly = (bytes: number, perDay: number) => mb(bytes * perDay * USERS * DAYS);
    const result = {
      account: { contacts: CONTACTS, memos: 50, needs: 3 },
      perRead: {
        firstOpen: { bytes: firstOpen.bytes, statements: firstOpen.statements },
        fresh: { blocks: fresh.value.blocks.length, bytes: fresh.bytes, httpBodyBytes: httpBody, statements: fresh.statements, top: fresh.top },
        stale: { bytes: stale.bytes, statements: stale.statements },
        generation: { bytes: generation.bytes, statements: generation.statements, status: (generation.value as { status: string }).status, top: generation.top },
      },
      monthlyMb: {
        open1PerDay: monthly(fresh.bytes, 1),
        open3PerDay: monthly(fresh.bytes, 3),
        generationUpperBound1PerDay: monthly(generation.bytes, 1),
      },
      notes: [
        "readView 每次：资料版本三条小查询（图版本、时间线＋计划、强度来源戳）+ 判定计数一条 + 视图一条 + 当日用量一条。",
        "不含页面已有的 getProfile 与示例期判定读取（与分析页其余部分共用）。",
        "generation 是 worker 一次生成的读取（联系人 ≤200、批量时间线、档位、写入），只在版本变化且达阈值时发生；上限按每人每天 1 次估。",
      ],
    };
    console.log(JSON.stringify(result, null, 2));
  }, { syncRevision: true });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
