# Sprint 0117 — 看板在手机上算（看板 D3）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 「看板读取方案」D3（`docs/designs/2026-09-27-data-architecture/dashboard-design.html` 第 7 步；第 10 步决定 3「放进一个明确允许共用的目录，并调整那条共用规则」）。
**单一目标:** App 看板与联系人分析读本地数据自行计算，与服务器结果逐项一致；计算代码单一来源。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0116 合并后的 `chat-agent`（开工时追加提交号）。
**进入条件:** 0116 已完成（联系人、关系、来源、详情状态在手机上）；看板所需的待办已在本地（0076 起）。**注意**：看板计算用的是万能表 `events` 集合（按 `user_id`），与 0115 下发的活动专用表不是同一份数据——本 Sprint 需把看板用到而手机上还没有的类别（至少 `events` 集合）按 0113 说明书登记同步。

## 已查明的事实（2026-09-27）

- 服务器：0101 的 SQL 读取器 `features/dashboard/storage/dashboard-read-model-postgres-reader.ts`（总数、短列表 5 条、分布、职位计数）；0102 的快照 `dashboard-snapshot.ts`（缺口、机会的时间无关部分，`DASHBOARD_SNAPSHOT_SCHEMA_VERSION`）；缺口 `live-distribution-service.ts`、机会 `live-opportunity-service.ts`（0102 已拆成「核心计算 + 渲染」）。对照测试 `tests/services/dashboard-sql-read-model-postgres.test.ts`、`dashboard-snapshot-postgres.test.ts`（JS 版为标准答案）。
- App：`DashboardScreen`（6 个 `useApiResource`：`/api/dashboard`、summary、opportunities、network-gaps、distributions、`/api/audit/provenance`）；`ContactsDashboardScreen`（`GET /api/mobile/contacts-dashboard`，schema `mobile-contacts-dashboard.ts`，含 AI 分析报告与 `roleCounts`）。
- 共用规则：`repos/orbit-app/scripts/sync-contract.mjs` 从 `orbits/shared` 复制 `contract/`、`api-schema/`（全部）与 `domain/`（仅 `industries.ts`、`language.ts`，:29）；`tests/domain-sync.test.ts:9` 固定这两个文件；`contract-sync`、`api-schema-sync` 要求逐字节一致且只能 `./` 相对导入。0097 曾因把运行时代码放进契约目录而撤回；Li-QY 采用「两端各一份」。

## 范围与文件

1. **共用目录与规则**：新建一个明确允许共用运行时纯函数的目录（例如 `orbits/shared/compute/`），同步脚本与测试同时放行该目录（逐字节一致、只允许相对导入、禁止 IO/网络/服务端依赖的静态检查）；现有 `domain` 限制不变。
2. **纯函数**：把总数、短列表、分布、缺口、机会的计算抽成不依赖服务器的纯函数放入共用目录；服务器（JS 标准答案、快照计算）改用它们，结果不变。
3. **补齐本地数据**：把看板用到的 6 类中尚未同步的（至少万能表 `events` 集合）登记为同步类别（归属 `user_id`，字段白名单只含计算所需）。
4. **App**：看板与联系人分析读本地副本（待办、联系人、关系、来源、详情状态、`events`）调用纯函数计算；AI 分析报告仍从服务器取；断网显示「截至」。
5. **对照测试**：同一份数据上 App 纯函数结果 = 服务器 SQL 结果 = 快照结果（沿用 0101/0102 的边界数据）。
- 排除：网页端改动（网页继续用服务器方案）；新的统计项。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0117-01 | 三方对照测试逐项一致（含空数据、门槛边界、软删除、多账号） | 测试（先 RED） |
| SC-0117-02 | 共用目录规则：同步脚本只放行该目录；目录内出现 IO/网络/服务端依赖或非相对导入时测试失败；`domain` 限制不变 | 规则测试 RED→GREEN |
| SC-0117-03 | App 打开看板与联系人分析时不请求看板计算接口（AI 报告除外） | App 测试 + 网络记录 |
| SC-0117-04 | 飞行模式下 phoneweb 与 Simulator 显示看板与联系人分析，数字与联网时一致，标明「截至」 | 截图 |
| SC-0117-05 | 服务器结果不变（0101/0102 对照测试仍通过）；两端全量、typecheck 通过；棘轮不增加 | 摘要 |

## 测试

- 档位 H（跨端共用代码 + 同步规则）。开发集：看板对照测试、同步规则测试、App 看板屏幕测试；收口：两端全量。

## 失败与交接

报告写明共用目录的规则与后续放入代码的要求。
