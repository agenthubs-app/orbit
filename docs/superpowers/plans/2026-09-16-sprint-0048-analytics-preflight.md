# 0048 活动分析配置预检实施计划

> 本仓库RULES优先：一个Generator，不调用用户禁用的brainstorming/executing-plans，不新增Reviewer，不重开0043。

**Goal:** 尚无配置时立即返回准确配置说明，不先读取无关snapshot而500。

**Architecture:** 复用真实read-model和既有typed handler，将缺row/roiRow判断移到snapshot SELECT之前。已配置分支和权限门禁保持不变。

**Tech Stack:** TypeScript、Node test runner、PostgreSQL、Next production、Expo Simulator。

**Spec:** `repos/orbit-app/docs/sprints/0048-analytics-configuration-preflight/AUDIT-DESIGN.md`；唯一契约同目录PLANNER。

## Global Constraints

- 不补表/配置，不授权真实migration，不改角色。
- 一次Generator、每局部最多两repair、ROOT管理暂存/merge/push与设备服务锁。
- 原累计AI/OCR $5不重置，本线无需provider调用。
- Web源更新后生产重建重启；缺原生请求身份不能作PASS。

### Task 1：补真正RED并最小调整检查顺序

**Files:** Modify `repos/orbits/features/events/event-analytics/read-model.ts`、`repos/orbits/tests/services/event-analytics-configuration.test.ts`。

**Interfaces:** 消费createEventAnalyticsReadModel、EventAnalyticsReadModelError、EventOperationsSqlExecutor；产出保持既有公开接口，仅改变无roiRow分支不读snapshot。

- [ ] 写完整测试新场景：沿现有executor fixture，aggregate返回1行，ROI返回0行；检测snapshot查询时抛PG42P01模拟实际缺表。保留exact workspace/event参数断言。

```ts
let snapshotReads = 0;
const executor: EventOperationsSqlExecutor = {
  async query<TRow>(sql: string, values?: readonly unknown[]) {
    assert.deepEqual(values?.slice(0, 2), ['workspace:configuration-test', 'event:unconfigured']);
    if (sql.includes('event_analytics_roi_snapshot_heads')) {
      snapshotReads++;
      throw Object.assign(new Error('missing snapshot table'), { code: '42P01' });
    }
    const rows = sql.includes('registrations_active') ? [{}] : [];
    return { rowCount: rows.length, rows: rows as TRow[] };
  },
};
const model = createEventAnalyticsReadModel({ runtime: {
  workspaceId: 'workspace:configuration-test',
  client: { ...executor, async close() {}, async transaction(operation) { return operation(executor); } },
} });
await assert.rejects(model.readOrganizerAggregate({ eventId: 'event:unconfigured' }),
  (error: unknown) => error instanceof EventAnalyticsReadModelError
    && error.code === 'EVENT_ANALYTICS_CONFIGURATION_REQUIRED');
assert.equal(snapshotReads, 0);
```

- [ ] `(cd repos/orbits && node --test --import tsx tests/services/event-analytics-configuration.test.ts)`完整RED须命中一般PG错误而非typed错误，不能只模拟全部query零行。
- [ ] impact readOrganizerAggregate/createEventAnalyticsReadModel实际符号后，在ROI result读取后立刻取得row/roiRow并执行既有两个判断，再读取storedRoi；其余已配置返回完全不动。

```ts
const row = result.rows[0];
const roiRow = roiResult.rows[0];
if (!row) throw new Error('Event analytics aggregate query returned no row.');
if (!roiRow) throw new EventAnalyticsReadModelError('EVENT_ANALYTICS_CONFIGURATION_REQUIRED');
const storedRoi = await readEventAnalyticsRoiSnapshot(transaction, input.runtime.workspaceId, eventId);
```

- [ ] 同完整configuration测试GREEN，加完整`tests/api/event-analytics.test.ts`与`tests/services/event-analytics-snapshot.test.ts`确认错误meta与已配置行为；不新增泛化PG exception mapper。

### Task 2：真实隔离PG反例与已配置消费

**Files:** Create `repos/orbits/tests/services/event-analytics-unconfigured-postgres.test.ts`，消费既有`event-analytics-read-model-postgres.test.ts`以及operations/records/appointments migrations。

**Interfaces:** 与既有真实PG fixture同样Pool/createEventOperationsPostgresClient/runtime/唯一schema；新反例只在ROOT明确独立cluster运行，缺目标应失败，不skip。

- [ ] 创建与既有fixture同型唯一schema，schema名由randomUUID产生且只由本测试持有；消费ROOT明确隔离cluster的`ORBIT_EVENT_DATABASE_URL`，启动前验证DB名、Unixsocket与workspace receipt，不加载MAIN env。无明确隔离URL断言失败，不skip。运行operations、ORBIT_RECORDS_SCHEMA_SQL、appointments schema，只故意不运行analytics migrations、不saveConfiguration。
- [ ] catalog确认snapshot heads absent、configuration head此event为0，再调真实readOrganizerAggregate；断言既有CONFIGURATION_REQUIRED（最初旧树抛42P01），scope与零业务写可由query observer验证。finally只drop本随机schema，查询确认无残留，cluster生命周期交ROOT。
- [ ] 同隔离cluster运行完整已配置`event-analytics-read-model-postgres.test.ts`（该文件自loadLocalEnv须按既有isolated-env loader阻断MAIN载入）；两文件均零skip才视为真实PG检查完成。不能改test loader/本机库凑绿色。
- [ ] Web typecheck一次、direct consumer完整文件、diffcheck/stageddetect、路径限定功能commit；H全量只在此本地收口运行一次，旧失败与局部修复如实记录。

### Task 3：主线与原生同目标闭环

**Files:** 真实结束后Create `repos/orbit-app/docs/sprints/0048-analytics-configuration-preflight/REPORT.md`。ROOT更新全局台账/Bridge及Git。

**Interfaces:** 既有analytics aggregate GET/配置reason与App分析route。执行前解析实际App路由，不沿0043错误标题推断目标。

- [ ] ROOT冻结SHA集成、重建重启MAIN production并记录health/BUILD_ID/API origin；独立正式原MAIN账号登录，account/me确认canonical identity，exact event_02 aggregate503及reason，不配置实际活动、不改Phone演示库。
- [ ] 主8082/DA主包在唯一设备窗口打开相同精确活动，捕获actual目标path/APIorigin/canonicalactor与配置说明；若无法证实精确native identity标missing，不靠expected manifest/无关标题截图通过。
- [ ] 复核401/403/安全404不改权限、无provider/业务写，写真实REPORT/冻结SHA；ROOT机械合入chat-agent、精确测试、普通push/独立remote一致。Core/public生命周期、注册正例和本地SQLCipher告警仍分别开放。
