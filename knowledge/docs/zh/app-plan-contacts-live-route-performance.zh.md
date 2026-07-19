# Contacts Live 路由性能优化计划

本页是 Orbit Wiki 的中文阅读版，也是中文阅读入口。它不是新的权威副本；权威内容仍以原始来源、关联代码和测试为准。

## 页面元信息

| 字段 | 内容 |
| --- | --- |
| 原始来源 | `repos/orbits/docs/superpowers/plans/2026-07-02-contacts-live-route-performance.md` |
| 中文镜像 | `knowledge/docs/zh/app-plan-contacts-live-route-performance.zh.md` |
| 分类 | `implementation-plan` |
| 状态 | `historical` |
| 新鲜度 | `likely-current` |
| 负责人域 | `contacts` |

## 怎么读

这页主要提供历史背景。不要把它当成当前实现说明，当前行为应回到相关代码路径、主题知识页和更新后的设计文档确认。

已登记来源和关联代码，但后续改动仍需要重新核对。

下方“结构化阅读入口”按原文标题列出阅读顺序。

## 中文摘要

把 /app/contacts 及详情页 live 模式的冗余全图读取替换为按路由收敛的 focused graph 读取：为 contacts/connections/relationship-value provider 增加可选的 focused 方法并保留全图 API 兼容回退，详情路由增加 live-only 的共享图 fast path（一次加载、三处复用）。计划还记录了当时脏工作区草稿的分类处理和逐符号 GitNexus 风险闸门。

## 审计依据

这是一份 2026-07-02 的一次性性能优化实施计划（含每步测试断言与提交流程），并带有'未经用户明确恢复不得实施'的前置条件；实际查询形态应以 contacts/connections/analysis 的 live 服务、存储 provider 及 *-live-store 能力测试为准。

## 结构化阅读入口

- 第 1 节：联系人 Live 路由 Performance 实现 计划
- 第 2 节：源标题：Global Constraints
- 第 3 节：当前 Worktree Note
- 第 4 节：源标题：File Structure
- 第 5 节：任务 1: Baseline 和 Impact Gate
- 第 6 节：任务 2: 联系人 List Focused 阅读 测试
- 第 7 节：任务 3: 联系人 Detail Focused 阅读 测试
- 第 8 节：任务 4: Connection 和 关系 Value Focused 阅读 测试
- 第 9 节：任务 5: Add Focused 联系人 Provider API
- 第 10 节：任务 6: Add Focused Connection Provider API
- 第 11 节：任务 7: Add Focused 关系 Value Graph API
- 第 12 节：任务 8: 联系人 Detail 路由 Shared Graph Fast 路径
- 第 13 节：任务 9: Avoid High Impact 联系人 List 路由 Injection
- 第 14 节：任务 10: Documentation Updates
- 第 15 节：任务 11: 验证
- 第 16 节：任务 12: Stage, Detect, Commit
- 第 17 节：源标题：Self Review

## 保留的代码与命令证据

### 代码证据 1

```bash
pwd
git status --short --branch
git diff --name-only -- .
```

### 代码证据 2

```text
/Users/xzhao/Projects/orbit/repos/orbits
```

### 代码证据 3

```bash
npx gitnexus analyze
```

### 代码证据 4

```text
createStorageContactGraphProvider
createLiveContactsListSearchAndFilterService
runLiveContactsQuery
createLiveContactDetailTagStatusService
loadPayload
createStorageConnectionEvidenceProvider
createLiveConnectionEvidenceService
graphOrFailure
createLiveRelationshipValueScoringService
payload
createStorageRelationshipValueProvider
createConfiguredStorageRelationshipValueProvider
loadAppContactDetailRoute
```

### 代码证据 5

```ts
test("live contacts search reads only evidence needed for listed contacts", async () => {
  const workspaceId = "workspace:contacts-focused-list";
  const rawStore = createMemoryLiveRecordStore<Record<string, unknown>>();
  const listQueries: Array<LiveRecordListQuery & { returnedRowCount?: number }> = [];
  const store = {
    ...rawStore,
    listRecords(query: LiveRecordListQuery) {
      const rows = rawStore.listRecords(query);
      listQueries.push({
        ...query,
        recordIds: query.recordIds ? [...query.recordIds] : undefined,
        returnedRowCount: rows.length,
      });
      return rows;
    },
  };

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T12:00:00.000Z",
    store: rawStore,
    workspaceId,
  });

  const service = createLiveContactsListSearchAndFilterService({
    provider: createStorageContactGraphProvider({
      sourceLabel: "Focused contacts storage",
      store,
      workspaceId,
    }),
  });

  const result = await service.searchContacts({ query: "North Star Foods" });

  assert.equal(result.success, true);

  const evidenceQuery = listQueries.find(
    (query) => query.collectionName === "evidence",
  );
  assert.ok(evidenceQuery);
  assert.ok(evidenceQuery.recordIds);
  assert.ok(evidenceQuery.recordIds.length > 0);
  assert.ok(
    (evidenceQuery.returnedRowCount ?? 0) < defaultMockFixtures.evidence.length,
  );
});
```

### 代码证据 6

```bash
node --test --import tsx tests/capabilities/contacts-live-store.test.ts
```

### 代码证据 7

```ts
assert.deepEqual(contactQuery?.recordIds, ["contact-selected"]);
assert.ok(evidenceQuery?.recordIds);
assert.ok(evidenceQuery.recordIds.length > 0);
assert.ok((evidenceQuery.returnedRowCount ?? 0) < totalEvidenceCount);
```

### 代码证据 8

```bash
node --test --import tsx tests/capabilities/contact-detail-live-store.test.ts
```

### 代码证据 9

```ts
assert.deepEqual(connectionQuery?.recordIds, ["connection-selected"]);
assert.ok(evidenceQuery?.recordIds);
assert.ok((evidenceQuery.returnedRowCount ?? 0) < totalEvidenceCount);
```

### 代码证据 10

```ts
assert.deepEqual(connectionQuery?.recordIds, ["connection-selected"]);
assert.ok(evidenceQuery?.recordIds);
assert.ok((evidenceQuery.returnedRowCount ?? 0) < totalEvidenceCount);
```

### 代码证据 11

```bash
node --test --import tsx tests/capabilities/connection-live-store.test.ts tests/capabilities/relationship-value-live-store.test.ts
```

### 代码证据 12

```ts
readContactGraphForList?(
  input?: ContactsListSearchFilterInput,
): Promise<LocalRemoteContactGraph>;

readContactGraphForContact?(
  contactId: string,
): Promise<LocalRemoteContactGraph>;
```

### 代码证据 13

```ts
const graph = provider.readContactGraphForList
  ? await provider.readContactGraphForList(input)
  : await provider.readContactGraph();
```

### 代码证据 14

```ts
const graph = provider.readContactGraphForContact
  ? await provider.readContactGraphForContact(input.contactId.trim())
  : await provider.readContactGraph();
```

### 代码证据 15

```ts
readContactGraphForList(input?: ContactsListSearchFilterInput) {
  return readFocusedContactGraph({ mode: "list", input });
}

readContactGraphForContact(contactId: string) {
  return readFocusedContactGraph({ mode: "contact", contactId });
}
```

### 代码证据 16

```bash
node --test --import tsx tests/capabilities/contacts-live-store.test.ts tests/capabilities/contact-detail-live-store.test.ts
```

### 代码证据 17

```ts
readConnectionEvidenceGraphForConnection?(
  connectionId: string,
): Promise<LiveConnectionEvidenceGraph>;
```

### 代码证据 18

```ts
const graph = connectionId && provider.readConnectionEvidenceGraphForConnection
  ? await provider.readConnectionEvidenceGraphForConnection(connectionId)
  : await provider.readConnectionEvidenceGraph();
```

### 代码证据 19

```bash
node --test --import tsx tests/capabilities/connection-live-store.test.ts
```

### 代码证据 20

```ts
readRelationshipGraphForConnection?(
  connectionId: string,
): Promise<LiveConnectionEvidenceGraph>;
```

### 代码证据 21

```ts
readRelationshipGraphForConnection(connectionId: string) {
  return connectionProvider.readConnectionEvidenceGraphForConnection
    ? connectionProvider.readConnectionEvidenceGraphForConnection(connectionId)
    : connectionProvider.readConnectionEvidenceGraph();
}
```

### 代码证据 22

```ts
const graph = provider.readRelationshipGraphForConnection
  ? await provider.readRelationshipGraphForConnection(input.connectionId)
  : await provider.readRelationshipGraph();
```

### 代码证据 23

```bash
node --test --import tsx tests/capabilities/relationship-value-live-store.test.ts
```

### 代码证据 24

```ts
assert.equal(graphLoads, 1);
assert.equal(model.routeState, "success");
assert.ok(model.contactPayload);
assert.ok(model.connectionPayload);
assert.ok(model.valuePayload);
assert.ok(model.assessment);
assert.ok(model.evidenceTimeline);
```

### 代码证据 25

```bash
node --test --import tsx tests/pages/app-contact-detail-live-route-services.test.ts
```

### 代码证据 26

```ts
resolveModuleMode(mode) === "live"
```

### 代码证据 27

```bash
node --test --import tsx tests/pages/app-contact-detail-live-route-services.test.ts
```

### 代码证据 28

```text
loadAppContactsRouteViewModel
```

### 代码证据 29

```text
Live storage keeps the full graph method for compatibility and uses focused graph reads for list/detail paths when the provider supports them. Focused reads filter evidence by referenced ids so unrelated evidence rows are not loaded for route payloads.
```

### 代码证据 30

```text
In live mode, the route loads one focused contact graph and adapts that graph into the existing contact detail, connection evidence, and relationship value services. Mock and hybrid modes continue to use the normal service composition path.
```

### 代码证据 31

```bash
node --test --import tsx tests/capabilities/contacts-live-store.test.ts tests/capabilities/contact-detail-live-store.test.ts tests/capabilities/connection-live-store.test.ts tests/capabilities/relationship-value-live-store.test.ts tests/pages/app-contacts-live-route-services.test.ts tests/pages/app-contact-detail-live-route-services.test.ts
```

### 代码证据 32

```bash
npm run lint
```

### 代码证据 33

```bash
npm test
```

### 代码证据 34

```bash
git diff --check
```

### 代码证据 35

```bash
rg "measure|query count|SQL reads|/app/contacts" scripts tests docs -n
find . -maxdepth 4 \( -iname "*measure*" -o -iname "*perf*" -o -iname "*profile*" \)
```

### 代码证据 36

```bash
git diff --stat
git diff --name-only
```

### 代码证据 37

```text
gitnexus_detect_changes(scope: "staged")
```

### 代码证据 38

```bash
git commit -m "perf: focus contacts live graph reads"
```

### 代码证据 39

```bash
git status --short --branch
```

## 源文档正文

源文档正文主要不是中文。中文镜像不直接机翻全文，避免生成一份看似同步、实际难以审计的副本；阅读时先看本页摘要、审计依据、标题入口和代码证据。需要逐段核对时，请打开上方原始来源。
