# Sprint W0026 — 执行总结

**结果：** completed。必需 SC 01–04 都有证据，功能已提交。
**分支：** `sprint/W0026-recommend-reason-fixture`（从 `chat-agent` 0dc7a08a 切出）；**功能 SHA：** `f1b82ea9`；合并 SHA 见登记表。
**PLANNER.md SHA256：** `19d6756a7f6b0dcb5583404763bad7bdc216c939cb07ad736a81f1958c97cd11`
**Generator：** Claude Opus 5.5，2026-09-29，run-01；档位 L。REPORT 由协调者按 Generator 交回的正文落盘。
**证据：** `~/orbit-sprint-evidence/web/sprint-W0026/run-01/`

## 已验证能做什么／仍不能做什么

- 能：verify-legacy（有目标、无计划）打开策略页，「下一步去哪」出现「验收用：跨境支付产品负责人圆桌」，理由是「匹配你的目标：『位做跨境支付的产品负责人』『找到一个愿意试点的合作方』」，两个词都原样出现在活动简介里。
- 能：verify-plan 打开策略页，出现「验收用：企业软件早期路演会」，理由是「对应你计划第 2 阶段：扩展：活动与引荐」。
- 能：两个账号各自 `--reset` 多次结果一致，非 verify 行指纹从头到尾不变。
- 协调者复验：3001 重启后用无头浏览器（1440）抽查两个账号策略页，理由文字与上面一致，控制台 0 错误（`coordinator-3001-{legacy,plan}.png`）。
- 不能：中文目标还是按整段切词，理由里的词读起来别扭。按 D13 本次不改，登记为新 Sprint 候选。

## 新增验收数据

| 账号 | 活动 id | 标题 | 开始（东京） | 命中的目标词 | 本人报名 |
| --- | --- | --- | --- | --- | --- |
| verify-legacy | `orbit-verify-goal-match-legacy` | 验收用：跨境支付产品负责人圆桌 | 今天 +14 天 19:00 | 位做跨境支付的产品负责人、找到一个愿意试点的合作方 | 0 |
| verify-plan | `orbit-verify-goal-match-plan` | 验收用：企业软件早期路演会 | 今天 +24 天 19:00 | 位早期投资人和、家试点客户 | 0 |

- 两场活动的主办方都是 verify-host，已发布，报名以 0 人激活为 canonical（`registration_migration_count=0`）。简介都写明「验收用合成活动……不是真实活动」。
- verify-plan 计划新增一条：`kind: event`、`status: recommended`、`phase: p2`、`suggestedWeek: 5`、`linkedEventId: orbit-verify-goal-match-plan`，meta 里有开始时间和地点。计划条目从 7 条变成 8 条。
- 交叉检查（`token-match-matrix.txt`，用现有 `matchedTokensForText` 跑）：四个有目标的账号 × 四场 verify 活动，只有上面两组对得上。推荐服务读回（`recommend-service-readback.txt`）：legacy 和 plan 各推荐 1 场，verify-event、verify-expired 为 no_match，verify-new 为 needs_goal。

## SC 表

| SC | 结果 | 文件 → SHA | 证据 |
| --- | --- | --- | --- |
| SC-W0026-01 两场未报名活动 + 计划条目 | 通过 | `scripts/seed-verify-accounts.ts` → f1b82ea9 | `db-readback.txt`（4 场 verify 活动；`membership_heads` 只有原来 2 条；计划 event 条目），`recommend-service-readback.txt` |
| SC-W0026-02 reset 幂等、指纹不变、W0018 数据不变 | 通过 | 同上 | `reset-after-verify-{legacy,plan}-{1,2,3}.json`、`reset-final-*.json`、`fingerprint-before/after.json`（digest 都是 `b594b525…a1b`） |
| SC-W0026-03 策略页两种理由，1440／375，控制台 0 错误 | 通过（Generator 在同配置临时 server :3002；协调者在重启后的 3001 复验 1440） | — | `verify-{legacy,plan}-strategy-{next,full}-{desktop-1440,mobile-375}.png`，`browser-check.json`（consoleErrors 为空，横向溢出 0），`coordinator-3001-*.png` |
| SC-W0026-04 tsc；未改动账号 reset 前后一致 | 通过 | — | `tsc.txt`（exit 0）；`reset-before-*.json` 对比 `reset-after-verify-{new,expired,event}.json`：accounts 一致（verify-event 只有名片批次 `created_at`=运行时刻不同） |

### SC-02 细节

- 第 2、3 次 reset 的 `accounts`、`purgedRows` 和指纹结论逐字一致。第 1 次的 purgedRows 不同，是因为它清掉的是第一版（缺 canonical 激活）留下的数据，见「偏差 1」。收尾那次 reset（`reset-final-*`）的清理量和稳定值相同，说明看页面没有写入数据。
- W0018 依赖的数据不变：各账号目标文字（已读回）；`orbit-verify-event-upcoming` 仍是 verify-plan 报名（rsvped，计划条目为 registered）；`orbit-verify-event-today` 仍是 verify-event 报名；verify-plan 原来 7 条计划条目都在（含「约 林玫」），新条目只是追加。
- 改前改后 verify 行数（fingerprint 的 verifyRows）：event_ops_events 2→4，event_event_versions 2→4，event_aliases 4→8，event_ops_configurations 和 configuration_heads 各 2→4，event_ops_audit_log 4→6，plan_items 20→21；membership／profile／outbox 不变。orbit_records 109→105，这是改动前的库里有页面操作留下的 verify 行，被基线 reset 清掉了；新代码不写 orbit_records。

## 偏差

1. **第一版种子会让公开活动目录报错（已修，同一提交）。** 活动行默认是 `registration_migration_state='legacy'`，只建活动不报名的话，公开目录（`features/events/core/public-catalogue.ts` 的 `itemsFor`）读不到参与人数摘要，就会抛 `missing participant summary`。结果整个目录不可用，所有账号的「下一步去哪」都显示「来源暂时不可用」。修法：新增 `seedUnregisteredEvent`，建活动（`seedPublishedEvent`）后用空列表调用 `activateCanonicalRegistrations(eventId, [])`，和已报名活动走同一路径，只是 0 人。本机库大约有 15 分钟处在坏状态，之后已经 reset 修好。第一版的证据留在 `attempt1-missing-summary/`。
2. **3001 验收 server 在执行期间已损坏。** `.next-verify/dev/routes-manifest.json` 缺失，`/app/contacts/new` 已在 500。Generator 的重启被权限拒绝，改用 `verify-server.sh` 同样的环境变量在 3002 起临时 server（distDir `.next/w0026-verify`，主机名 `w0026.localhost`），验证后已停止、删除 distDir、还原 Next 自动改的 `tsconfig.json`。协调者随后重启 3001 并复验。
3. 截图用 Playwright 临时脚本拍，跑完已删除。

## 假设与额外阅读

- 额外读（只读）：`features/events/public-goal-recommendations-runtime.ts`、`features/events/core/public-catalogue.ts`（`itemsFor`）、`features/events/event-operations/catalogue-summary.ts`、`postgres-repository.ts` 的 `listCatalogueSummaries`、`canonical-registration-repository.ts` 的激活流程、`app/(app)/app/agent/home-dashboard-route-service.ts` 里吞错误的那段、`scripts/verify-session-cookie.ts`、`scripts/verify-server.sh`。都是为了查清偏差 1、2。
- GitNexus：`seedEvent`、`seedAccount`、`seedPlanInProgress` 的 upstream 都是 CRITICAL，但第 1、2 层只有本脚本的 `seedAccount`／`main`；第 3 层是文件级节点带出来的无关噪声。`detect-changes --scope staged`：1 个文件，风险 low，受影响流程 0，非 partial／truncated。
- 活动 id 故意不用 `orbit-verify-event-*` 前缀：账号清理用正则匹配 id，新 id 若包含别的账号的活动 id，reset 那个账号时会被误删。
- verify-plan 的新条目放在 p2（没有人脉需求），所以理由写阶段标题；放在 p1 会写成「认识 认识 2 位……」。

## 测试

- L 档：脚本没有单测，也不新建。验证方式是实际跑种子（reset ×3、fingerprint、读回）和 `npx tsc --noEmit -p .`（exit 0）。没有跑全量，也没有 PG 测试。付费 AI 调用 0 次。

## 观察项（新 Sprint 候选）

- 中文目标分词：整句成段，只切标点和空格；长度 ≥2 的纯数字也会成词。
- 手机 375 宽度下，策略页「下一步去哪」的活动行被封面块和日期块挤占，标题和理由成了每行 2 字的窄列（`verify-plan-strategy-next-mobile-375.png`）。现有布局问题。
- `loadHomeDashboardSnapshot` 和 `createPublicGoalRecommendationsService` 都会把目录异常吞成「来源暂时不可用」，不留日志；只要有一场已发布但没激活 canonical 的活动，整个公开目录就不可用，这个约束比较脆。

## 未提交与回退

- 未提交：无。
- 回退：`git revert f1b82ea9` 前先对 verify-legacy、verify-plan 各跑一次 `--reset`（回退后新活动 id 不在 `eventIds` 里，reset 删不掉它们），或手动删除 `orbit-verify-goal-match-*` 相关的 verify 行。
