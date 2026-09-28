# Sprint W0012 — 执行总结

## 结果

- 已验证能做到：
  - 所有自动进展由各生产者幂等写入，重复触发只留一条、跨用户不串写：行动完成、联系人关联、建立联系（含手动 @）、活动报名、取消报名、活动参加、进入新阶段（SC-01）。
  - 手动进展可 @ 联系人或活动，只存结构化引用；@ 某人后其所在人脉需求变为「已建立联系」。东京时间每周一，iOrbit 导语换成上周小结（规则拼出，不调 AI），其余日子仍是今日导语；示例模式不读小结（SC-02）。
  - 四种触发（目标被改、阶段提前完成、已延后 ≥2 周的行动累计 3 条、周期到期）只提示「要不要重新分析」，不自动重做；重新分析每东京自然月 1 次，页面显示剩余次数，并发两次只成功一次（SC-03）。
  - 周期到期先显示回顾（完成行动、新认识人数、在哪些活动认识），再「制定下一份计划」，不占额度；事务失败不留半份新版本（SC-04）。
  - 一年期计划进入下一阶段时补充该阶段周级行动，只补一次、不占额度；到期后不再判定进入新阶段（SC-05，review 后补）。
  - 已有生效计划时，旧的 `POST /api/agent/plans` 返回 409 不写库；换版本只能走 `/api/agent/plans/reanalyze`（review 后补）。
  - 报名／取消同步到计划时忽略旧版本，另有每日对账任务补漏（review 后补）。
  - 顺带修复 W0015：活动归属读报名改用账号 id（与报名路由写入一致）；此前账号 id 与会话 id 不同时永远找不到候选。
- 仍未实现或未验证：
  - **浏览器验证没做**：本机账号没有计划，周一小结、提示条、到期回顾都需要真实计划数据才能看到；不写用户数据。
  - 「进入新阶段」只记当前这一段，中途跳过的阶段不补记。
  - 提示条的「先不用」只在本页生效，不持久。
  - `GET current` 每次多一个只读事务判定阶段，会增加少量数据库流量。

## 运行记录

- 结果：completed（浏览器验证缺失）
- Generator：子代理（Opus 5.5）／2026-09-28；Planner revision 2
- 分支 `sprint/W0012-long-term-tracking`；功能 SHA `8c087099`；合并 SHA 见登记表
- 档位 H；全量（review 修复前）5634 条 42 失败，新增 0；review 修复后再跑一次：5642 条 42 失败，新增 0
- 付费 AI 调用 0；无迁移（额度用 `plan_log` 幂等键 `reanalysis:<YYYY-MM>` 记录，唯一约束兜底）；push 未执行

## 验收结果

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-W0012-01 | pass | `plan-auto-log-producers`（每个生产者重复触发与他人计划负例）、`event-registration-plan-sync`（乱序、对账、终态）、`plan-phase-refinement`；PG 并发只写一条 |
| SC-W0012-02 | pass | `plan-weekly-summary`（周日 23:59:59.999 JST／周一 00:00 JST 的 UTC 输入、窗口首尾）；首页 57/57；@ 选择器组件测试 |
| SC-W0012-03 | pass | `plan-reanalysis`（月末 09-30T14:59:59.999Z→9 月、15:00Z→10 月，四种触发）；并发：内存、路由 [201,409]、PG；旧 POST 绕过 409 |
| SC-W0012-04 | pass | 服务／路由／组件测试；内存与 PG 注入失败，行数不变、额度未占 |
| SC-W0012-05 | pass | 一年期第 14 周只补一次、第 27 周另记一条；到期后首次读取不写任何东西 |

## 自动进展生产者与幂等键

| 生产者 | 位置 | 幂等键 |
| --- | --- | --- |
| 行动完成 | `service.updateItem`（W0007） | `item:<clientKey>` 命令回执 |
| 联系人关联 | `linkWithin`（W0010） | `link:<clientKey>`／`match:<candidateId>` |
| 建立联系 | `recordInteraction`（W0010）；手动 @（新） | `interaction:<clientKey>`；`mention:<noteId>:<needId>:<contactId>` |
| 活动报名／取消（新） | `markEventRegistration`，报名路由触发 + `plan-event-registration` 对账 | `event-registered:<item>:<version>`／`event-cancelled:<item>:<version>`，旧版本忽略 |
| 活动参加 | `markEventAttended`（W0015） | `event-attended:<item>` |
| 进入新阶段（新） | `enterCurrentPhase`：读取时惰性判定 + `plan-phase` 维护任务 | `phase-entered:<planId>:<phaseKey>` |

## 假设与额外阅读

- 「延后 ≥2 次」按逾期周数计：REQUIREMENTS 定义「到期未完成滚入当前周标『已延后 N 周』」，产品里没有手动延后操作。
- 「新认识人数」= 计划起始日之后新增的已确认联系人；读不到时退回计划里关联过的人数。
- 报名按账号 id 记录（报名路由写入口径）。

## review 处理

| 意见 | 判断 | 处理 |
| --- | --- | --- |
| 旧 POST 可绕过月度额度与到期限制 | 采纳（阻塞） | 已有生效计划时 409；换版本只走 reanalyze |
| 报名同步无补偿、乱序可倒退 | 采纳（阻塞） | 记录并比较报名版本；新增 `plan-event-registration` 对账任务（每次检查 ≤200、重放 ≤50） |
| 到期后仍进入最后阶段并补行动 | 采纳 | 到期返回 null，SQL 同口径 |
| 「延后 ≥2 次」实现成逾期周数 | 不采纳 | 见「假设」第一条 |
| 协调者复核发现：W0015 读报名用会话 id | 修复 | 改用账号 id，补两个 id 不同的回归测试 |

## 交接

- 新维护任务：`plan-phase`、`plan-event-registration`（加上 W0015 的 `plan-event-attendance`），随部署注册，无迁移。
- 新接口：`POST /api/agent/plans/reanalyze`、`GET /api/agent/plans/weekly-summary`。
- 回退：`git revert` 合并提交。
