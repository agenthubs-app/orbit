# BR-032 — Web 大目标 4「人脉真分析」完成：对 App 的影响（App 本轮未改）

- 创建/更新日期：2026-10-03（W0055 收口时创建）
- 总状态：source_ready（Web 已合并到 `chat-agent`；App 只收到各 Sprint 同一提交里的机械同步副本，界面与 typecheck 未验证）
- 优先级：P2
- 发起角色：Web
- 下一责任方及是否已接单：App 线（未接单）
- web_status：W0043～W0055 已合并到 `chat-agent`（大目标 4 合并后 SHA 见下表与「更新历史」）；生产迁移、生产开关、生产回填均未执行，等待用户授权
- app_status：未改 App 逻辑；`repos/orbit-app/src/api/{contract,schema,compute}` 只有 `npm run sync:contract` 写出的副本
- verification_status：收口时在 `repos/orbit-app` 跑 App 四个 *-sync 测试 10/10 通过；App 界面、App 其他测试与 App typecheck 未运行
- 依赖/阻塞：无（App 侧验证是关闭条件，不阻塞 Web）
- 设计/实现/发布授权来源（如适用）：`repos/orbits/docs/sprints/REQUIREMENTS.md` 大目标 4（D41～D46），各 Sprint PLANNER／REPORT

## 变化与证据

- 用户可见的旧行为 → 新行为（Web）：人脉页的分析从调试英文与空壳，变为按目标的结构／机会／洞察三标签、按站内记录自动推出的关系档位（新认识／有往来／核心／待唤醒）、联系人聚合时间线与 memo、计划接 DeepSeek（生产仍为 mock，待开关授权）、CSV／vCard／活动导入。App 端界面不变。
- Web 页面/服务/HTTP 路径及方法：`/app/contacts`（所有人脉，档位列与洞察一句）、`/app/contacts/dashboard`（概览驾驶舱与 `?tab=structure|opportunities|insight`）、`/app/contacts/pipeline`；接口 `GET /api/network/snapshot`、`POST /api/network/snapshot/recompute`、`GET /api/contacts/page?tiers=1`（Web 专用参数）等。
- App 页面/消费点：`/api/mobile/contacts-dashboard`（新增可选字段，见下）；`/api/contacts/needs-matches`（`ContactNeedsMatchesScreen`，**原样保留给 App**：Web 已改用计划匹配器 RN-08，网页端 0 使用，由 `repos/orbits/tests/pages/web-contact-needs-retired-gate.test.ts` 锁住；`features/contact-needs` 与路由不删）。
- Web/App SHA：各 Sprint 合并 SHA —— W0043 `738f13ae`、W0044 `7fd27123`、W0045 `ecf43849`、W0046 `8584caff`、W0047 `9b779e2a`、W0048a `f710ca5a`、W0048b `d6866b0b`（修复合并 `f4007c11`）、W0049 `85e0707b`、W0050 `afc97c35`、W0051 `477b3031`、W0052 `7b416b46`、W0053 `b7e86d99`、W0054 `ccba83f4`、W0055（合并后由协调者补记）。大目标 4 开工基线 `00703fde`。
- 同步副本与执行同步的提交（D46①，均为 `npm run sync:contract` 机械复制）：
  - W0044 `be2676f5`／`dfda6f92`：`src/api/contract/followups.ts`（只改注释）、`src/api/compute/tokyo-calendar-days.ts`（新增）
  - W0045 `68c9b55f`：`src/api/contract/business-card-batch.ts`、`src/api/schema/business-card-batch.ts`、`src/api/compute/seniority-group.ts`（新增）
  - W0046 `d9882c32`：`src/api/contract/relationship-timeline.ts`（新增）、`src/api/contract/index.ts`
  - W0047 `417a33c5`：`src/api/contract/relationship-strength.ts`（新增）、`src/api/compute/dashboard-{aggregate,distribution,distribution-contract}.ts`、`src/api/schema/mobile-contacts-dashboard.ts`
  - W0049 `53dbad30`：`src/api/compute/dashboard-{distribution,distribution-contract,graph}.ts`、`src/api/schema/mobile-contacts-dashboard.ts`
  - W0051 `7dea7a8c`／`867a2e7d`：`src/api/contract/{contact-insight,contact-card-page,index}.ts`、`src/api/schema/{contact-insight,contact-card-page}.ts`
  - W0043、W0048a、W0048b、W0050、W0052、W0053、W0054、W0055：未改 `shared/{contract,api-schema,compute,domain}`，无 App 副本变化
- 响应字段/Schema/枚举变化（全部为可选新增，旧 App 忽略即可）：
  - 名片批次：`seniorityLevel`、`regionCountryCode`、`regionCity`（W0045）
  - 联系人详情 PATCH 响应：`savedNoteId`；`RelationshipTimelineResult.total`；新类型 `ContactMemoNoteInputContract`（W0046）
  - `NetworkDistributionAnalyticsPayload.relationshipTierDistribution`（W0047，App 本地计算给空数组、不读）；强度契约 `RelationshipStrength`／`RelationshipTierCounts`／`RelationshipStrengthState`
  - 人脉分布：`seniority`、`region`、`secondary` 等维度与 3 个图联系人可选字段（W0049）
  - 卡片 DTO：`insightPreview?: {zh,en}`（W0051，只在 Web 请求时附带）；新契约 `ContactInsight` 系列类型
- 请求参数、对象 ID、actor/角色、幂等/版本条件：`/api/contacts/page` 的 `tiers=1` 只由 Web 发送，App 不带时响应逐字段不变（W0047 golden 测试）。
- 刷新、缓存、异步任务与失败处理：强度为读时重算的缓存（非同步集合，不写 `connections`）；快照、洞察、导入补全由维护任务 `network-snapshot`、`contact-insights`、`contact-import` 在后台池额度内处理。
- 旧 App 兼容策略：所有新增字段为可选；`needs-matches` 接口保留。

## 验收结果

- 命令、cwd、运行环境、exit code、通过/失败/跳过：cwd `repos/orbit-app`，`node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/contract-sync.test.ts tests/api-schema-sync.test.ts tests/compute-sync.test.ts tests/domain-sync.test.ts` → exit 0，10 通过／0 失败／0 跳过（W0055，2026-10-03；输出在 `~/orbit-sprint-evidence/web/sprint-W0055/run-01/app-sync-tests.txt`）。
- Web 写 → App 回读：未运行。
- App 写 → Web 回读：未运行。
- 冲突、失败、权限与异步场景：未在 App 侧验证。
- 原生 UI/浏览器验证：未运行（App 界面本轮未改）。
- 未检查范围：App 端界面、App *-sync 以外的测试、App typecheck；App 本地计算仍无真实关系强度（C-6）；`shouldNormalizeTaskToToday` 仍把逾期任务显示为今天（W0044 观察项）。
- 可客观判断的关闭条件：App 线确认界面与 `npx tsc --noEmit` 对已同步副本无回归后，由协调者把本条标 `verified`。

## 更新历史

- 2026-10-03 Web（W0055）：创建。下一责任方 App 线。
