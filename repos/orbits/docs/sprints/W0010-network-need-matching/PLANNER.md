# Sprint W0010 — 人脉需求匹配

**Plan revision:** 2（2026-09-28 按 Codex review 修订）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RW-11（活动归属见 W0015）。**单一目标:** 名片批次确认完成时，服务端在同一事务写入一条匹配任务；任务先按一级／二级行业（W0013 在识别时补好）规则匹配，再调一次 AI 按公司、职位做第二轮；候选落库，三处入口共用一个确认组件读取；确认后生成「约 TA」行动；另提供手动关联。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时的 `chat-agent` HEAD；前序 Sprint 的 REPORT：W0007、W0009、W0013。
**进入条件:** W0007、W0009、W0013 completed。第二轮 AI 按 D5 **沿用名片识别现有计费方式，不另设累计上限**；每个批次最多一次调用（以 `(actor, batch)` 唯一），单张补录的联系人按 `(actor, 东京自然日)` 聚合为一次；每次真实调用记录 token 用量。

## 范围与文件

- 读取：`contacts/card-batch-0918/card-batch-ui.tsx`（`FinishedPanel` 约 611 行）、`use-card-batch.ts`（约 346–357 行的本地完成派生）、`app/api/contact-drafts/business-card/batches/v2/**/handlers.ts`（`createIngestV2ConfirmHandler`）、`features/acquisition/business-card-ingest-v2/repository.ts`（`reconcileBatchStateLocked` 约 387–407 行，现在完成时无任何回调）、`shared/domain/industries.ts`、`network-detail-modal.tsx`、W0007／W0009／W0013。
- 修改：`repository.ts`（批次转为 completed 的同一事务里写匹配任务 outbox 行）、`card-batch-ui.tsx`（`FinishedPanel` 之后读取候选，最多等 8 秒）、`network-detail-modal.tsx`（「关联到计划人脉需求」）、`iorbit-home.tsx`（今日要事新增「N 位新联系人可能对应你的计划」）、`iorbit-plan.tsx`（「待确认 N」角标）及测试。
- 新建：`features/plans/matching-migrations.ts`（`plan_match_jobs`：actor、batch_id 或聚合日、状态 pending/running/completed/failed、尝试次数；`plan_match_candidates`：job、联系人、需求、层级 rule/ai、状态 pending/accepted/dismissed；唯一约束防重复）；`features/plans/matching.ts`（规则打分：二级行业相同 = 强候选、一级相同 = 候选、行业缺失不参与；输入所有生效的人脉需求，只排除已关联同一联系人的，不引入「已填满」概念）；`features/plans/ai-matcher.ts`（通过 provider factory 注入，复用名片识别文本模型配置，`json_object` 输出，只接受本批联系人 id 与本计划需求 id）；`features/plans/match-worker.ts`（领取任务、规则层、AI 层、落候选；AI 失败时保留规则结果并标记，重试不重复计费）；触发有两条路：确认完成后审阅页调用 `POST /api/agent/plans/candidates/run`（带批次 id，按 actor 认领并在请求内执行，最多 8 秒），以及在 `features/operations/maintenance/configured-tasks.ts` 注册有上限的 `plan-match` 维护任务（每日 `/api/internal/maintenance` 扫描未完成任务，兜底用户关掉页面的情况）；`app/api/agent/plans/candidates/route.ts`（GET 读候选、POST 确认／忽略）；`iorbit-0918/plan-match-sheet.tsx`（共用确认组件）；对应测试。确认后调用 W0007 生成「约 TA」行动（定时间／起草邮件／记一次互动；起草邮件点击时才调 AI、止于草稿）。
- 排除：补行业（W0013）；历史联系人回填；活动归属询问（W0015）；重要度排序。

## 验收契约（最多五项）

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0010-01 | 批次最后一张确认时（含两张并发确认、批次重放）只产生一个匹配任务；单张补录按东京自然日聚合；任务落库后用户关闭页面，也会被维护任务执行（集成测试：不经浏览器直接调用维护任务完成 pending 任务） | repository 测试（并发、重放、跨日聚合）+ worker 测试 |
| SC-W0010-02 | 规则打分正确；AI 层只能返回本批联系人与本计划需求的 id，越界 id 丢弃；AI 失败或超时只保留规则结果；失败重试不再发起第二次计费调用；已关联的人不重复提示 | matching 纯函数测试 + ai-matcher／worker 测试（mock provider：正常、越界、超时、重试） |
| SC-W0010-03 | 审阅确认屏最多等 8 秒显示候选（逐条 是／不是），超时直接结束，候选改由今日要事与计划页角标提示；三处入口用同一组件，确认后联系人进入对应需求、本周新增「约 TA」行动并写进展记录；忽略后不再提示 | 组件测试（快返回、超时）+ 路由测试 |
| SC-W0010-04 | 接口与任务严格按 actor 隔离：读不到他人候选，不能确认他人批次或他人计划；联系人详情可手动关联到本人计划的需求 | 路由测试（他人批次、他人计划、他人联系人负例） |
| SC-W0010-05 | 不引入新的回归；真实调用可用 | card-batch、iOrbit、plan、network 相关测试；typecheck；一次全量基线对照；本地真实批次跑一次第二轮 AI 并记录 token |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner 哈希与基线；确认前序 Sprint 已 completed。
2. 对「修改」清单中的符号批量 GitNexus upstream impact；HIGH/CRITICAL 先报告，`UNKNOWN` 用文本搜索补查。
3. 按 SC 顺序写失败测试 → 最小实现 → 定向 GREEN；最多两轮本地修复。
4. 可见变化在浏览器桌面 1440 / 手机 375 各验证一次，截图存 `~/orbit-sprint-evidence/web/sprint-W0010/run-01/`（仓库外）。
5. 路径限定暂存 → `detect-changes --scope staged` → `sprint/W0010-network-need-matching` 提交 → REPORT → 合并回 `chat-agent` → 合并树复跑收口集。

## 最小测试与检查

- 档位：H（名片确认事务、新表、后台任务、写接口、跨用户隔离、付费调用）。
- 开发定向集：matching、ai-matcher、match-worker、candidates 路由、plan-match-sheet 组件测试（数据库测试用本地 `ORBIT_EVENT_DATABASE_URL` 并证明未 skip）。
- 操作链收口集：card-batch、iOrbit home、plan、network-detail-modal 测试文件；typecheck；一次全量基线对照。
- 不运行：App 端。

## 失败与交接

报告写明任务状态机、worker 触发方式、规则层与 AI 层各自命中数、每批 token 用量、重试不重复计费的证据；生产迁移需授权。
