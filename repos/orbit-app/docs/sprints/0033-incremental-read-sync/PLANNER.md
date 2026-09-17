# Sprint 0033 — 全域离线读取契约

本文件是本Sprint唯一验收契约；[实施计划](../../../../../docs/superpowers/plans/2026-09-16-sprint-0033-universal-read.md)给出18个Task的精确路径、接口、逐步TDD与commit。设计依据为已批准[规范](../../../../../docs/superpowers/specs/2026-09-16-universal-offline-read-design.zh-CN.md)，概览见[GOAL](GOAL.md)和[DESIGN](DESIGN.md)。

## 原需求、基线与授权

- 原需求：用户批准的“云端权威＋本地持久镜像＋增量同步”；2026-09-16明确扩展到全部已授权原生读取入口。关联R-00/R-02历史AI、R-03资料、R-05/R-11通信、R-06人脉、R-08/R-09任务日程活动、R-13笔记、R-14跨端；不删除其余原需求。
- 规划基线：`2f862c9f84167408df09914acca521f528ae4185`。0032 completed/merged `00b81ab18`，报告中的加密与原生证据可作前序参考，不能证明新scope迁移。
- 已读Sprint RULES、README、Bridge status/handoffs及批准规范。README旧四域摘要和固定串行文字落后于本轮分线授权；由管理线更新全局登记，本线不越界写台账。0037/38权威源已交付，0039/40真实模型/Push限制仍开放，不把它们误判为结构化读取授权完成。
- 本轮只规划、仅提交下面四个文件，然后暂停等待管理线审查；不生产代码、不merge/push、不创建REPORT、不登记新Generator。规范页旧“待审”标签不触发重新问用户。
- README提示别的工作树曾执行0033；实施前管理线核实旧run、固定SHA和文件锁，复用或恢复原run，不能靠新版计划重开已结束Generator。

## 依赖与各线接口

0032身份/SQLCipher基础是前提。A线0033拥有local-read身份、registry、共享只读契约、分域scope与cursor、授权适配器、所有mirror-first消费者。0034消费读取身份与journal锁顺序，负责outbox/receipt/conflict和离线写分类；0035消费manifest/cursor与恢复屏障，负责status/invalidation调度；0036消费读取证据和独立AI capability，负责AI授权工具、Data Atlas和综合验收。0041在依赖的0033版本验收后集成或重放；首页共享hooks持锁串行处理。

阶段顺序：A覆盖(Task1) → B身份与存储(2–4) → C协议与registry(5–7) → D个人与人脉(8–9) → E通信/日程/AI历史(10–12) → F活动/Agent/聚合(13–15) → G资源/搜索/清理/验收(16–18)。独立阶段可分别提交；B/C/D线依据明确接口准备独立内容，但不能合并依赖尚未验收的0033实现。

## 白名单与排除

本次文档写入白名单：

1. `repos/orbit-app/docs/sprints/0033-incremental-read-sync/GOAL.md`
2. `repos/orbit-app/docs/sprints/0033-incremental-read-sync/DESIGN.md`
3. `repos/orbit-app/docs/sprints/0033-incremental-read-sync/PLANNER.md`
4. `docs/superpowers/plans/2026-09-16-sprint-0033-universal-read.md`

未来实现文件白名单为实施计划每Task明确列出的Create/Modify/consumer路径，source Read/Modify只允许必要授权/事务journal接线；所有既有符号编辑前impact，未列必要路径按RULES先登记用途与SC关系再实施。共享contract副本只能sync:contract生成，不手改或跨repo源码import。

排除：浏览器离线、新provider/OCR/AI调用、新增离线写入、发送邀请/消息/报名/角色修改的离线执行、0035 transport、0036 AI工具、复制第二套业务权威库、根台账/Data Atlas直接写入、用户未提交内容和未经授权的真实外部副作用。权限测试用已授权合成对象，不自动给真实账号扩权。

## 验收契约（最多五项）

| SC | 可观察行为 | 主验证、失败条件 |
| --- | --- | --- |
| SC-0033-01 | 有效租期离线冷启动读取；失效租期锁定，local-read无法在线写入，切scope不串数据 | Tasks2–4：auth/transport race与原生SQLCipher迁移/重启/擦除失败；任何跨actor/baseURL/workspace/epoch泄漏或绕写均失败 |
| SC-0033-02 | 所有domain经严格授权投影，bootstrap/delta/物理delete/grant/revoke/reset不漏记录 | Tasks5–6、8–15真实source事务与PostgreSQL并发；缺任一domain完整转移证据、只有sequence分配顺序或扩大IN列表均失败 |
| SC-0033-03 | 每页与cursor原子落盘，预算/崩溃可续，snapshot/asset严格受策略约束，单域重置保留草稿/outbox | Tasks3–7、16：断点/磁盘满/错误key/hash/epoch，SQLCipher真实资源at-rest；二进制明文或伪完成失败 |
| SC-0033-04 | 全部native列表/详情/子资源/搜索/聚合mirror-first；完整性状态真实，代际不误删 | Tasks1、7–17：逐入口render与inventory audit，unregistered=0且非mirror durable读取=0；不完整时显示empty、只验四域均失败 |
| SC-0033-05 | 同版本production Web/API与Simulator，同账号各业务族增改删/撤权、断网重启读取一致 | Task18逐domain矩阵、revision/tombstone、原生版本/Metro/服务SHA；缺运行对象只阻塞该证据，不标全Sprint完成 |

## 检查、风险与失败处置

规划D档：核对四文档一致、实际路径/新建标签/相对链接、占位扫描、`git diff --check`及GitNexus detect_changes，不跑产品测试/typecheck冒充实现。

未来H/I档：每Task RED→最小GREEN→完整定向文件及直接消费者，共享契约/身份/存储实际传递消费不得省略。本Sprint本地代码收口两端各一次全量/typecheck/contract sync，Web production build/restart及真实SQLCipher/Simulator仍是必需。环境错误不是RED，跳过不是通过。付费AI/OCR不属于本线验证，累计$5约束不重置。

高风险共享点明确列在实施计划：OrbitAuthSessionProvider/useOrbitAuthSession、createOrbitApiClient/request、createSyncLifecycle/loadSyncDatabaseKey、initializeLocalSyncDatabase/createLocalSyncRepository、readSnapshot/writeSnapshot/useApiResource及服务器认证/数据库事务入口。修改前用固定主仓库GitNexus impact并核对当前源码；HIGH/CRITICAL先报告，再验证隔离/并发/传递调用者。未收录不等于低风险，提示stale按规则重建。

遇到授权投影缺口、游标漏提交、物理删除/撤权复活、未完成伪空、密码学存储失败，暂停对应域及依赖，不扩大发布或宣布完成；保留安全锁定和草稿，继续无依赖已授权事项。迁移失败事务回滚，不清用户数据；缺外部账号/设备/权限只登记精确受阻验证。未知需求不以假API或无限catch-all掩盖。

## 提交与管理线交接

本轮仅提交四规划文档到本线分支，报固定SHA、文件列表、diff/GitNexus结果，随后按委派暂停。无需再次请求设计批准，不选择实施模式，不merge/push。

未来每阶段提交前diff-check与detect_changes、路径限定暂存；REPORT仅真实执行后记录RED/GREEN、各域与入口矩阵、native/runtime限制、固定SHA和下一线接口。Bridge/README/Data Atlas交接由管理线更新，管理线审查精确SHA后合并chat-agent并验合并树；未完成SC不得用计划、一次commit或测试数量替代。
