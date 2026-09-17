# Sprint 0064 — Phone Web 展示活动报名修复契约

## 批准、基线与分工

关联用户“所有的活动都是这个状态”及随后“去做吧”，关联 R-04、0050 与既有 Phone 展示域。此前只读诊断实际确认：公开目录十三场均为 canonical/published；十二场缺配置，event_signup_01 配置仍是八月十八日，而公开活动是十月二十五日。Phone release-0063 仍含旧“暂不可操作”，缺已交付的0050状态说明。

主线基线 `9dc41bd1e80d1129206b001ae6640907b3e41b9a`。唯一 Generator 为既有 B 任务 `01a0a879-e8fe-77e3-b748-bd78005aecc8`，GPT-5.6 Sol / medium，唯一 run-01，在独立 Sprint worktree 编写必要的受控修复工具及测试。ROOT 编制本契约，独占主线 Git、索引、真实数据库与验收账号。既有 Phone 协调任务仅机械消费已交付版本并构建、交接发布产物；不成为第二实现者，不重开0050/0063，不启动 Reviewer/Evaluator。

## 对象、行为与安全边界

- 唯一真实目标：本机 PostgreSQL `orbit_phoneweb_20260916`，工作区 `workspace:phoneweb-demo`，精确 ID 为 event_01 至 event_10、event_signup_01、event_signup_02、event_signup_03。工具必须默认只读预览，拒绝未知目标、重复/缺失活动、日期或配置版本不匹配、错误工作区和冲突。
- 正式公开目录日期不变。沿用既有 canonical 展示活动的相对报名规则，资料截止在开始前十分钟，报名截止在开始前五分钟。缺失配置的必需非报名字段复用已存在的展示配置模板，不启动任何分析/推荐任务。既有配置只追加新版本；其他非报名配置应保留，若其活动相关时刻也与目录日期脱节，则按原相对偏移对齐并在预览中明确列出。
- 十二场新增配置、旧八月配置修复，在一个有锁及版本前置检查的事务内完成；任何一场失败整体回滚。保留旧配置版本、活动内容和日期、主办方、membership/profile/answers、通知、AI 对话等。重复执行不能再追加相同配置或覆盖他人更新。留脱敏前后摘要及必要配置快照，可按精确 heads 版本回退；不删除业务历史。
- 修复工具不得加载 `.env`、自动迁移或 bootstrap，不提供新公开 API，不绕开用户报名路由的身份/权限。真实执行由 ROOT 单独持有窗口；Generator 只使用 ROOT 指定的隔离测试库或 fixture，不能访问321xx、5432业务库、Main3000、Metro8082或公网。
- Phone 发布机械消费主线已交付0050及其必要固定依赖，保留当前既有0059～0063功能与 browser-origin 认证桥接；不可将整个旧 Phone 分支合回主线或覆盖当前公网产物。新目录构建 Next 与 Expo Web，预览正确后才能切原32100/32110，原ngrok入口不变，release-0063完整保留。
- 不调用付费模型、OAuth adapter、全局通知刷新、匹配worker、Push或0033 Phase B/C/D生产协议；沿用唯一累计 $5 账本，不改账本/预算/provider flags。读取报名状态使用 `questions=false`。真实正常用户操作若触发模型，先核实能以现有已发布题目完成且不新增付费调用；不得静默跳过费用约束。

## 文件范围与验证

允许新建本域修复模块于 `repos/orbits/features/events/registration/` 或 `event-operations/`，受控入口 `repos/orbits/scripts/repair-phoneweb-registration-windows.ts`，对应 `repos/orbits/tests/` 测试；Generator 先在 checkpoint 登记具体路径。既有配置 contract/repository/seed 只读复用，除非最小接线确有必要且先补 impact 与范围记录。禁止更改通用 auth/store/client、DDL、migration、共享契约和 App 页面源码。ROOT 更新本 Sprint 文档、README、必要 Bridge 交接；Phone 机械消费单独记录固定来源、消费树、构建和实际服务字节，不改已冻结产品契约。

新增符号先 GitNexus upstream impact，UNKNOWN 以真实 caller 补查；HIGH/CRITICAL先告警。写入工具按 H 档：TDD覆盖目标隔离、dry-run零写、版本冲突、批次失败回滚、保留资料和幂等。操作链收口完整受影响测试及 Web types；本地代码收口受影响 Web I 一次，已获准旧59失败/206skip按名称对照，不报全绿、不重复无关 App 全量。

| SC | 必需可观察结果 | 主要证据 |
| --- | --- | --- |
| 64-01 | 预览明确列十三个目标及日期/版本差异；错库/工作区/不完整或冲突输入 fail-closed | 行为 RED→GREEN 与真实只读预览 |
| 64-02 | 原子追加配置及 heads，冲突/中途失败全回滚，重复操作无新增写；历史资料不变 | 隔离真实 PostgreSQL 完整测试、ROOT限定真实修复前后快照及幂等回读 |
| 64-03 | 十三场活动正式报名窗口与公开日期一致，不再一律不可操作，限制有准确原因 | 已登录同 Phone QA 域正式 GET questions=false 与实际页面 |
| 64-04 | 正常用户路由实际完成报名/取消/再次报名，确认失败不假成功，独立重读一致 | ROOT单 owner 真实页面及 API 证据，保留/恢复原验收对象状态 |
| 64-05 | 功能/报告提交并合入 chat-agent/push；Phone前后端新构建/原入口实际新字节、健康且可回退 | fixed-tree官方gate、适用types/I、生产BUILD与entry SHA、远端SHA及发布回执 |

## 交接与失败

执行遵 RULES，开始前冻结 Planner SHA256、实际 worktree/base/status 并登记 run-01。同因失败最多两次必要本地修复；不克隆原 Sprint 或重开 Generator。交接列实际路径、RED/GREEN、完整定向及真实 PG结果、旧I失败、最后功能/报告 SHA、剩余改动、工具 dry-run/apply/rollback步骤、未验 SC 与 budget 原字节摘要。真实发布/数据库证据不足保持未完成，ROOT继续已授权独立部分，不以代码提交当完成。结束后才写 REPORT。
