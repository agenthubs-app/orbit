# Sprint 0035 — 全域失效检测与恢复契约

## 原需求、基线与批准

原需求：减少重复上传下载，保持云端／Web／App 一致；承接 R-11 消息恢复及全域离线读取规范第 5 节 0035 分工。固定规划基线 `2f862c9f84167408df09914acca521f528ae4185`。用户已批准 `docs/superpowers/specs/2026-09-16-universal-offline-read-design.zh-CN.md` 并要求分线规划；本次只修改规划文档、提交本线分支、等待管理线审查，不开始生产实现、不 merge/push。

[GOAL](GOAL.md)描述用户结果，[DESIGN](DESIGN.md)定义 C 线边界，[逐步实施计划](../../../../../docs/superpowers/plans/2026-09-16-sprint-0035-universal-recovery.md)提供文件、接口、RED/GREEN 和阶段提交。本文件是唯一 SC 契约；详细计划不能降低 SC。

## 进入条件与依赖

- 管理线审查本次计划，分配唯一 C 线 Generator、文件锁与 run-01，记录本 Planner SHA256、真实起始 HEAD；运行状态只由 Sprint README 登记。
- 0033 提供通过验收的 registry/manifest、各权威源 journal、域水位读取、认证 refresh 与撤权清理、分域 reset/分页/checkpoint API；0034 提供批准的 uploader 与 failure/conflict 状态。依赖固定 SHA 和合并树证据由管理线交接。
- 接口未就绪时可执行不依赖生产绑定的调度和 transport 测试；不得合并依赖未验收的 A 线接口，不得把测试 port 当作完成集成。
- 0037/38 的消息、通知权威记录经 0033 adapter 接入；0039/40 的真实 provider/push 缺口不能由 C 线关闭，也不阻塞无 optional transport 的正确性测试。

## 文件白名单

本轮只写本目录 `GOAL.md`、`DESIGN.md`、`PLANNER.md` 与根 `docs/superpowers/plans/2026-09-16-sprint-0035-universal-recovery.md`。

后续实施精确白名单以执行计划每个 Task 的 Files 为准：独立 `sync-invalidation` contract/schema、status service/route/tests、App recovery ports/bindings/transport/coordinator/budget/observability/tests；有限修改 `app/_layout.tsx` 与 `OrbitNotificationsCoordinator.tsx`。共享 contract 副本只能由 `npm run sync:contract` 生成。禁止修改 0033 cursor/registry 定义、加密表迁移、AuthSessionProvider 身份语义，以及 0034 outbox/receipt/alias/conflict 实现；绑定需求冲突交回拥有者。

排除：新增 provider SDK、部署、浏览器离线、AI 工具扩权、离线发送消息、外部副作用、把高频提示当数据、把聚合收件箱当权威源。根 Bridge/README 台账由管理线更新，执行线只交接内容。

## 验收契约（五项）

| SC | 必须可观察的结果 | 主要证据／实施映射 |
| --- | --- | --- |
| SC-0035-01 | registry 中每个已授权域有 content-free watermark 摘要，含授权新增／撤销、物理删除；未知域/版本与跨账号读取拒绝 | Task 1 PostgreSQL conformance + route 负例；遍历真实 registry，不限旧四域 |
| SC-0035-02 | 前台默认 15 秒检查，高频可 5 秒；100 次变更/提示合并，无变化不拉 delta，乱序不回退，运行中 dirty 必须补跑且同 scope 单飞 | Task 2 fake-clock storm/race 测试 + Task 6 同账号 Web→App |
| SC-0035-03 | 启动、长/短后台、断网恢复、manual、通知点击与杀进程后均能恢复；先鉴权清理再上传拉取；AI 历史预算停止为 partial，续传无重复页且不饿死消息 | Task 3/4/5 生命周期、预算与 Task 6 原生恢复 |
| SC-0035-04 | cursor/epoch reset 只清目标域，保留 drafts/outbox/conflict；auth revoke、账号/Base URL/workspace/角色切换使旧 timer/promise/callback 失效，无跨 scope 污染 | Task 3/4 races + 0033 真实加密数据库回归、Task 6 双账号/角色验收 |
| SC-0035-05 | 无 realtime SDK 仍在普通 PostgreSQL 通过完整链路；可选 transport 故障不影响 HTTP 恢复；观测不含隐私且性能未退化超过基线 10% | Task 1 provider conformance、Task 2 fallback、Task 5 redaction、Task 6 对比 0031 同场景 p95/请求数 |

## 验证、失败与提交

当前文档 D 档：链接/路径、自审、`git diff --check`、staged GitNexus detect_changes；不跑产品测试、不预写 REPORT。

后续实现 H/I 档：每 Task RED→最小 GREEN→直接消费者；每阶段路径限定 commit 前做 impact/detect_changes。收口两端全量与 typecheck 各一次、contract/schema 同步检查、Web production build/restart、iOS build 与同版本 Simulator 业务链；不以单测代替真实恢复证据。Python 一律 uv；费用继承 RULES 累计 $5 上限与既有账本，不重置预算；本线不需要模型付费调用。

权限泄漏、提示含正文、漏掉 rerun、丢页、误清 outbox、local-read 上传、跨 scope 回调均硬失败。单个域失败保留错误与 partial，不冒充完整；具体阻塞只限制其依赖。非预期测试失败按 RULES 5.3 最多两个修复轮次，不开启第二 Generator。无法获得真实环境时记录未验 SC，不能标 completed。

后续执行结束才写 REPORT，列固定功能 SHA、各 SC 证据、App/Web 版本、脱敏账号/数据库、transport、各域完整性、失败/未验、费用和剩余工作。管理线接收 Bridge 交接并按固定 SHA 合并验证；本次仅规划提交与暂停审查。
