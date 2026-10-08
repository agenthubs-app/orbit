# Sprint W0015 — 活动归属询问

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-11（活动归属，Q26A）。**单一目标:** 名片**扫描上传时间**（名片条目 `createdAt`，不可变）落在用户已报名活动开始日当天或次日（东京时间）时，审阅页顶部询问是否在该活动认识；确认后在联系人上记下「认识于该活动」（独立字段，不覆盖 OCR 来源 `source`）、计划中活动项标「已参加」并写进展记录。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：W0007、W0010。
**进入条件:** W0007、W0010 completed。

## 范围与文件

- 读取：`card-batch-0918/card-batch-ui.tsx`、`use-card-batch.ts`、名片确认 handlers、联系人来源字段（`met`／source 所在位置，开工时 impact 定位）、`features/events/registration/runtime.ts`（`readRuntimeEventRegistrationStates`）、W0007 plans 服务、W0010 匹配任务。
- 修改：审阅 UI（顶部询问）、确认 handler（写来源活动）、plans 服务（活动项「已参加」+ 日志，幂等）、W0010 匹配任务（该活动关联的需求优先）及测试。
- 新建：`features/plans/event-attribution.ts`（时间窗口判定：以名片条目 `createdAt` 为准，已报名活动开始日当天或次日，东京时间；多个候选活动时按开始时间最近）；`app/api/agent/event-attribution/candidates/route.ts`（按 actor 读取本人报名状态，并从权威活动目录取标题与开始时间，返回候选；确认提交时服务端重新校验候选）；联系人 payload 新增 `metEventId`／`metEventTitle`（新建与合并两条路径都写，合并时只补空值）；对应测试。
- 排除：活动签到系统；非报名活动的归属。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0015-01 | 仅当名片扫描时间（条目 `createdAt`）落在已报名活动开始日当天或次日（东京时间）时出现询问，默认勾选，可取消；扫描后数日才确认也按扫描时间判定；多个候选时取最近的一场 | event-attribution 纯函数测试（前一天、当天、次日、第三天、次日扫描数日后确认，UTC 输入）+ 候选路由测试（他人报名不可见）+ 组件测试 |
| SC-W0015-02 | 确认后联系人记下 `metEventId`，OCR 来源 `source` 保持不变；合并到已有联系人时只补空值；取消勾选则不写；提交的活动 id 不在服务端重算的候选里时拒绝 | confirm handler 测试（新建、合并、非法活动 id） |
| SC-W0015-03 | 本人生效计划中对应活动项变为「已参加」并写一条幂等进展记录；无计划或计划里没有该活动时只写联系人来源 | plans 服务测试（重复确认只写一次、他人计划负例） |
| SC-W0015-04 | W0010 匹配时与该活动关联的人脉需求排序靠前 | matching 测试 |
| SC-W0015-05 | 不引入新的回归 | card-batch、plan、matching 相关测试；typecheck；一次全量基线对照（改动确认写入） |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0015/run-01/`（仓库外）。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0015-event-attribution` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：H（名片确认写入、计划写入）。
- 开发定向集：event-attribution、confirm handler、plans 服务、matching 测试。
- 操作链收口集：card-batch、plan 相关测试文件；typecheck；一次全量基线对照。
- 不运行：App 端。

## 失败与交接

报告写明时间窗口规则与时区证据、来源字段位置。
