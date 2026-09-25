# V2 读取治理执行记录

2026-09-25，用户明确批准按 V2 方案执行。源码基线 `2ba858f1`；生产仍按既有 `46e438ea` 发布记录区分，本轮没有重新查云或部署。主线上的历史功能不因此进入生产。

## 已授权边界

代码实现、共享契约同步和本地 PostgreSQL/浏览器测试。生产配置、数据库迁移/回填、部署、手机安装及付费不在本轮执行范围。保留根 bridge 和其他用户既有未提交文件。

## 执行清单

- [ ] P0：完整请求增长基准（既有真实快照在 `9ba16055` 发布分支保留，V2 新增本地非空基准）。
- [x] P1a：统一摘要、明确 legacy/typed 能力、Web/App 客户端消费及范围保护（本地验收，不代表上线）。
- [ ] P1b：联系人窄分页和 Web loader；会话摘要与历史页；用途专用跟进分页。
- [ ] P2：客户端在途合并/缓存；writer 封闭后才开启服务器强版本缓存。
- [ ] P3：按来源增量/到期处理，回填对账后移除对应扫描。
- [ ] 验证：类型、契约、权限、增长、并发/时间边界与 graph change check。

## 兼容决定

统一摘要第一批在 legacy 模式直接返回两个窄计数；typed 生产者尚未封闭时明确返回 `notificationRead=refresh-required`、`notificationsUnread=null`，只允许客户端继续既有 typed 刷新，不读取被替代的 legacy 通知。不把未知计数写成零，不将 GET 刷新藏进摘要 reader，不冒称 typed 全链路已经有界。typed mode 每轮仍有第二个请求，待 P3 后才能消除。

## 验证记录

首个摘要测试先运行并因 handler 尚不存在而失败（TDD）。后续结果随实际执行追加；本文件不预写完成结论。

## 第一批实际实现

1. `/api/inbox/summary`：legacy 两个窄计数，typed 明确要求保留既有刷新。App 正常每轮一个请求，typed 两个；仅 404/405 回退旧部署接口，503/401/响应格式错误不触发更贵的回退。
2. App 同服务器/账号/会话的角标共享在途请求和 15 秒 timer，屏幕自己的刷新键不拆分资源；最后一个订阅离开时删除资源并取消请求。后台同步撤销，写入失效合并成一次后续重读，不并发堆积；失败退避，单次请求最长等待 15 秒。没有持久缓存私有计数。
3. Web 顶栏/面板计数改用摘要；保留请求前后的账号检查，并合并桌面/移动顶栏并发读取。Web 仍有两次 `/api/account/me` 校验，不能把 App 的完整请求基准冒充 Web 全链路成本。
4. `/api/contacts/page` 默认 30/最大 50；SQL 只输出卡片预览，签名游标绑定工作区、账号和筛选；拒绝篡改/跨账号游标，不静默重置。旧 `/api/contacts` DTO 和完整图服务不变。
5. `/api/contacts/summary` 独立统计；来源/状态/价值固定维度，标签最多 50 并明确 `hasMoreTags`。来源数量不能从当前页计算。
6. Web `/app/contacts` 及详情弹窗背景列表接同一服务。搜索和来源筛选走服务器；SSR 首屏不重复请求，下一页仅取卡片、不重算统计，每次只保留一页。请求 401/403 时隐藏旧私有卡片。
7. 无关键词且没有派生筛选时，先按权限/来源/游标选最多 31 个联系人，再展开这页关系信息。状态/标签/价值筛选仍对全体合法候选计算后分页，不错误地“只筛当前页”。无关键词时不计算证据搜索文本。

## 本地实测（不是 Neon 账单）

所有数据库连接显式指向 localhost，随机 schema 在 finally 删除。没有读取生产、跑云压测或修改云配置。这里的字节是数据库结果 JSON 序列化字节，不含 PG wire/TLS/连接建立。

| 读路径 | 本人数据规模 | 查询/返回行 | 返回 JSON 字节 | 本机耗时 |
|---|---:|---:|---:|---:|
| 联系人第一页，关闭缓存 | 101 | 1/1 | 13,015 | 约 20 ms |
| 同上 | 10,001 | 1/1 | 13,015 | 约 53 ms |
| 同上 | 100,001 | 1/1 | 13,015 | 约 444 ms |
| 联系人全局统计 | 100,001 | 1/1 | 146 | 约 1,785 ms |
| 完整摘要 handler，含持久账号/个人档案解析及两类计数 | 各 10,001 条消息和通知 | 4/4 | 1,177 | 未设延迟结论 |

增长数据含 1 条模板记录，故为 101/10,001/100,001。测试包含真正通过邀请/接受创建的非空会话，再扩展同账号历史。联系人增长基准没有大量连接/标签/证据；复杂筛选、搜索、大量关联的 CPU 不能套用上述耗时。

最初的卡片 SQL 虽然出站有界，但 10 万条时因全体中间投影超过本地 60 秒超时。已改为先选页并取消无用证据搜索中间结果，随后重测通过；没有靠缓存、延长超时或放宽预算让它变绿。

复现（Web 根目录，必须显式本地 URL）：

```sh
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 ORBIT_CONTACT_CARD_GROWTH=1 node --import tsx --test tests/performance/contact-card-growth.test.ts
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 node --import tsx --test tests/performance/inbox-summary-request.test.ts
```

已通过：App 角标/摘要/共享资源 41 项、契约同步 3 项、Web 联系人/API/路由组合 21 项、原联系人搜索/分页 30 项、真实浏览器卡片交互 1 项、Web 摘要及原收件箱行为 7 项。部分集合重叠，不相加宣称唯一总数。搜索测试第一次被其专用数据库名保护拒绝，使用它既定的本地 `orbit_cutover_test_20260917` 重跑后通过，没有修改保护或基线。

Web/App 完整类型检查通过。GitNexus 增量索引的 FTS 构建失败后已强制重建成功；提交前 all 与 staged 检查均执行，staged 43 文件/385 符号/25 流程，结构化结果无 partial/truncated/error，risk=critical。该风险覆盖公共顶栏和联系人路由；不因为 shared-axis 较低而降级。all 检查另包含用户原有 bridge 修改，未纳入提交。整个索引的动态调用/流程覆盖仍有固有限制，已对页面框架入口和测试入口补源码核对，不能把图当完整证明。

## 容量与发布门槛

- 月用量模型仍是 `活跃前台小时 × 240 次/小时 × 每次实际 PG 出站 × 用户数 × 天数 + 页面/写入/worker/测试/其他出站`。例如仅以 1,177 B JSON 估算，100 人每天前台 8 小时就是约 6.78 GB/月，还没算其他操作；这不是计费预测，但足以说明不能承诺无限用户留在 5 GB 内。
- 需要部署后小流量校准真实 wire/账单、前台停留时长及旧客户端占比；无实际观测不宣称项目月账单下降某个百分比。
- 游标签名用 `ORBIT_READ_CURSOR_SECRET`，或已有 `AUTH_SECRET`/`NEXTAUTH_SECRET`（至少 32 字节）。没有稳定共享密钥会显式失败，不生成每实例随机密钥。
- 新搜索继承已有经过等价测试的 Node/ICU/PG 运行时白名单。当前本地元组通过；不匹配时明确 503，提供清除搜索入口，不下载全图。目标生产元组必须验证/批准后才能发布此 Web 入口，不能因本机测试通过就声称生产搜索可用。
- 当前主线与生产隔离发布分支不同；仍需做有边界的 release backport，保留生产 typed 白名单和历史业务语义，不能直接发布主线的其他提交。

## 仍未完成 / 条件门

- P0 尚缺 Web 各完整路径、复杂联系人关联/搜索及 worker 基准、真实 wire 校准。历史联系人 1548→2064 行的预算失败归因已在上一轮完成，见旧执行记录和 `scripts/diagnostics/neon-egress-local-probe.ts`，不重复列为未完成。
- P1b 会话摘要/历史消息页已在第二批本地完成；Web 跟进任务页和首页摘要已在第四批迁移。旧 AI/信号/提醒的完整图用途及 App 联系人屏幕分页消费尚未迁移。新联系人契约已同步，但不能把契约同步当手机 UI 已迁移。
- 服务端版本缓存尚未开启：尚未证明全体 writer/权限/时间边界封闭。不得用 TTL 私有缓存绕过该条件。
- P3 尚未移除 typed GET 刷新，也没有停止维护链。事务增量与到期入口必须逐来源对账，不能在本批省流量后擅自删除。

## 跨端交接

本端版本：基于 `2ba858f1` 的当前本地改动；Web/App 契约逐字同步。另一端影响：App 新版角标可自动探测摘要能力，旧后端 404/405 继续兼容；新后端无需强制更新所有手机。手机安装/热更新/原生运行环境均未操作。验证范围：本地 PostgreSQL、HTTP handler、真实 React 浏览器测试及类型检查；不包含线上验收和手机真机。

## 第二批：会话列表与正文窗口

第一批提交为 `bc3e1fc2`。本批新增 `/api/relationship-communication/conversation-summaries` 和已有 messages 路由的 GET；原 POST、完整历史旧协议保持兼容。

- 列表默认 20、最大 50 条，只返回最后一条预览与未读数；单次 SQL，不再为每个会话来回读取 binding/全文/read。
- 正文默认 30、最大 50 条，另按 96 KB 估算窗口限制大正文，至少保留一条合法完整消息；长消息页会少于请求条数并返回后续游标。不截断合法正文，异常超长存储返回明确错误。
- 每页在同一 SQL 快照检查参与者、有效双向 binding、qualification 和生命周期；游标签名绑定工作区、账号、资源与方向。实时分页不是可靠事件消费水位。
- Web 公共收件箱接新列表，选择会话后才读正文；翻早期页不倒退已读位置，发送失败保留内容及同一幂等 ID，401/403 清除私有显示。仅列表能力 404/405 回退旧部署，其他错误不全量重读。
- 标记已读改查目标消息身份，不再为了写一个 read marker 拉整段历史。多设备读指针单调性仍是后续事务化项目，不冒称本批解决。
- App 同步契约/schema，未把手机聊天屏幕迁移或安装列为完成。

本地非空真实邀请/接受后扩到同会话 10,006 条消息：列表 reader 1 SQL/1,540 B JSON；标记已读 4 SQL/5,499 B JSON。这里不含 HTTP 身份认证；完整 API 成本不能套用这两个数字。单会话增长已验证，多会话 COUNT CPU 和身份大档案尚需另外测量。

18 项 API/服务/权限/真实 Chromium 交互及兼容回归通过；Web/App 完整类型检查和 App 契约同步测试通过。浏览器测试曾因 about:blank 非安全上下文没有 randomUUID 失败，改用本地拦截 HTTPS 页面后验证真实发送重试，不改生产随机 ID 实现。新 Zod 元组在本仓库非严格空值设置下的推断差异通过运行时长度验证和显式二元组解决。

下一批核对发现：当前 `/api/tasks` 实际导出 canonical collection handler，不是旧 followup generation handler；首页使用 `relationship-lifecycle-facts-reader`，任务页当时仍使用 `loadRelationshipLifecycleTasks` 的默认旧 graph provider（第四批已迁移）。因此用途迁移必须从真实消费者入手，不能新增一个无人调用的 `/followups/page` 就宣布页面优化完成。旧推导建议和 canonical/lifecycle 实体仍需分别保持业务语义。

第二批提交 `039d440a`。提交前 GitNexus 强制重建成功，all/staged 变更检查已运行；staged 21 文件/149 符号，结构化结果无 partial/truncated/error。affected_count=0 不能解释成公共收件箱不受影响：此前 panel impact 为 CRITICAL，JSX/动态调用已有漏边，已按源码和浏览器行为回归。

## 第三批：身份窄投影与用户确认的跟进归属边界

### 身份读取

账户 provider 只让 SQL 返回 account/profile 映射器实际消费的字段，不返回 search_text、导入原件等无关内容。不改变身份选择、别名解析、缺省语言或公开 session 字段。没有截断用户档案字段，没有建立身份缓存。

完整摘要请求增添“账户与档案各 2 MB 无关字段 + 各 2 MB search_text”的同一固定夹具，优化前返回 8,001,227 B，优化后 1,177 B；4 查询/4 行，映射后的账户图完全相同。14 项身份/摘要/认证回归通过。这是刻意放大的本地固定数据实验，不是生产档案大小或 Neon 账单。实际保留的 headline 等字段仍可能很大，不能宣称任意身份数据都有绝对 4 KB 上限。

### 归属决定与执行

用户明确选择“归属信息一致才能查看，关联账号不允许查看”。落实为：

- 跟进任务/关系连接必须 `user_id === actorId`；payload.accountId 非空时也必须严格等于 actorId。数字/对象/数组不转字符串授权。
- 只有关联 accountId、所有者为空、所有者和关联账号冲突，均不可见。缺省关联字段但行所有者正确的旧任务仍可读；连接仍须通过原有业务字段验证。
- 新网页 facts SQL、旧 followup graph PostgreSQL 分支及内存/fallback provider 一致收紧；decoder 也拒绝与请求 actor 不符的所有者证明。公共 scope reader 的 legacy-notifications 分支没有被顺带改权限。
- 跟进详情/操作仓库的 assertOwner 同时检查 payload.accountId 冲突，避免列表拒绝而详情仍可读。两者使用同一个验证入口；事务在拒绝后不执行写入。
- 本次没有取消通过合法、本人拥有的关系连接读取关联联系人摘要的既有授权；它不授予查看对方跟进任务的权利。其他联系人/消息共享协议不在这次跟进规则修改范围。
- 不运行生产数据修复，不为无主记录猜测所有者，不把旧数据自动重归属。

先写否定测试实际失败，再修实现：association-only 行曾被返回；详情中的冲突 task 曾未被拒绝。现已通过对应断言。更新原测试中明确要求 owner/account OR 和空所有者放行的断言，保留这些反例数据，改为验证拒绝。另修正一项既有过期测试：configured 旧 provider 早已改成 1 次 scoped SQL，测试还模拟 4 次 collection 查询；现在模拟真实查询参数，不放宽失败断言。

本地跟进 scope、真实 PostgreSQL facts、首页/任务页、API 与生命周期服务组合 57 项通过；详情仓库与初始化 PostgreSQL 组合 32 项通过；Web 完整类型检查通过。GitNexus 强制重建后执行 all/staged 检查，staged 12 文件/19 个图可识别变更符号，结构化结果无 partial/truncated/error；affected=0 不推翻前述 CRITICAL 调用影响和动态图漏边，已补相应真实路径测试。本次没有上线；后续分页必须以这次确认的权限为准。

## 第四批：Web 跟进任务页与首页摘要

基于 `1ff1cfeb`。本批只改 Web 代码与本地测试，未部署、未连接 Neon、未改共享 HTTP 契约或安装手机。旧完整图和生成建议服务仍保留原契约；没有给公共图强行 LIMIT。

### 实际入口与业务边界

- `/app/tasks` 的服务器 loader 改用 `lifecycle-task-pages`：当前/历史/无法关联三组各 30 条，以签名游标继续；总数在 SQL 内按全体合法数据统计，与页内容分开聚合、同一快照输出。不是把 30 条当全部。
- 使用普通服务器页面导航，不增加无人消费的 HTTP 端点。每次翻页重新认证并重新校验归属；只保留三组的当前窗口，不在浏览器累积全量数据，不在 hydration 后再次读取。每次导航仍会重算全局统计，这部分数据库 CPU 没有被缓存。
- 游标绑定 workspace/actor/分组/协议，使用与已有新分页相同的稳定密钥来源；跨人、跨工作区、跨分组和篡改均拒绝。失败显示 unavailable，可回第一页；不退回全量 provider。
- SQL 复用原 facts 的权限和字段投影 CTE；业务有效性、缺失关联/冲突分类、同编号冲突 fail-closed、合法相同任务重复记录的数量均保留。联系人/组织/标题只返回明确命名的预览字段，不传全文、来源/证据数组或私有笔记。
- 首页默认改为 `lifecycle-home-summary`，只传排名最前 3 条及全局分组计数；按同一 snapshot 的逾期、产品时区七天窗口、无日期分类。历史/无法关联仍统计但不放进当前提醒。没有取分页前 30 条再充当完整首页统计。
- 日期校验保持严格 ISO 与毫秒精度，覆盖时区偏移、24:00、超长小数截断及窗口边界；页外非法当前任务日期仍使来源 unavailable。历史/无法关联的日期不被误用来阻断当前提醒。
- 排序仍沿用已验证的 Node/ICU/PG 元组，其他元组 fail-closed。**目标生产运行时未验证，这是发布门，不是已具备上线条件。** 与联系人搜索一样，不能自动发布到不同运行时后再假装兼容。

### 本地冷读实测

以下是专用 reader 的 PG 返回 JSON 字节，不含完整 Web 页面认证、其他栏目、协议/TLS，更不是 Neon 账单。所有缓存关闭、数据库 localhost、测试 schema 随机隔离并清理。

| 数据 | 旧 facts | 新任务页 | 新首页跟进摘要 |
|---|---:|---:|---:|
| 101 个本人任务，共用少量关联 | — | 10,499 B | 1,293 B |
| 10,001 个本人任务，共用少量关联 | 5,861,764 B | 10,501 B | 1,297 B |
| 100,001 个本人任务，共用少量关联 | 未重复跑旧全量 | 10,502 B | 1,299 B |

一万条同夹具的任务页返回量降低约 99.82%，首页跟进摘要降低约 99.98%。这些数字只适用于本地合成夹具的该 reader。

另独立增加每条任务各自关联的联系人/关系：101 / 10,001 / 100,001 个任务，对应联系人 102 / 10,002 / 100,002 和连接 101 / 10,001 / 100,001。任务页分别 11,491 / 11,493 / 11,494 B。再加同规模其他账号数据，输出和字节保持相同。

发现并修复了一次真实性能失败：一万组关联时，复杂 JSON 条件把 CTE 估算到 1 行，三个 Nested Loop 反复扫描全部中间结果，超过原 60 秒 SQL 超时。改为一次查询内构建只含必要字段的紧凑 ID 查找对象，再按 ID 解析任务关联；不是跨请求缓存，不保存授权结论。未延长 SQL 超时、关闭安全校验或放宽预算。复测一万组约 1.57 秒，十万组约 12.94 秒。EXPLAIN ANALYZE 的可复现入口见下方环境开关。

**数据库计算成本仍未固定**：十万任务、少量关联时，任务页约 3.7 秒、首页约 4.5 秒；十万独立关联约 13 秒。全局完整性校验、精确计数和中间投影仍随本人数据增长，SQL 内查找对象也消耗内存。按 V2 4.2，这已经构成评估窄 `followup_read_items` 的证据，但新表仍需生产者/删除/回填覆盖，不能直接放一个私有 TTL 缓存宣称根治。

### 验证与复现

新增 PostgreSQL 6 项通过（含大规模、归属反例、游标、页外重复冲突、字段类型矩阵、百万字标题、时间边界）；相关既有读取/首页默认链路/归属和真实 Chromium 导航 61 项通过，无跳过。默认链路的测试桩已从全量 facts 换成真实调用的新 summary 工厂，保留独立进程的 action → facts 链路检查。测试源码均入仓库，不依赖 `/tmp` 脚本保存证据。

```sh
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 ORBIT_FOLLOWUP_PAGE_GROWTH=1 ORBIT_FOLLOWUP_EXPLAIN=1 node --import tsx --test tests/services/lifecycle-task-pages-postgres.test.ts
env -i PATH="$PATH" ORBIT_W5_F_TEST_DATABASE_URL=postgresql://li@localhost/orbit_w5_f_test ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 node --import tsx --test tests/services/relationship-lifecycle-facts-reader-postgres.test.ts tests/pages/web-tasks-relationship-lifecycle.test.tsx tests/pages/app-home-facts-followup-reader.test.ts tests/pages/app-agent-home-dashboard-entry.test.ts tests/pages/lifecycle-pages-browser.test.ts tests/services/followup-owner-boundary.test.ts
```

另一端影响：无共享 HTTP 契约变动，App 仍用原协议；不能将 Web 页面优化算成手机或旧 AI/worker 已迁移。根目录 bridge 台账原有未提交内容保持不变。

Web 完整类型检查通过。GitNexus 强制重建后 all/staged 检查通过，staged 13 文件/138 个可识别变更符号，原始结果无 partial/truncated/error。affected=0 仍受动态/框架入口漏边限制，已用真实 PostgreSQL、默认首页调用链和浏览器导航补证，不能解释为没有页面影响。
