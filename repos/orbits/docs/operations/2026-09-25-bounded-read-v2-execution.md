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

## 第五批：App 联系人列表消费分页

基于第四批提交 `e08a0806`。仅本地实现和验证，未安装 App、未部署 API。

- 主通讯录及 `/contacts/list` 改读卡片页，每页 30 人；下一页替换当前窗口，不累积全库。首载/筛选/手动刷新单独读取全局 summary，翻页不重复统计。页数和总人数明确区分，错误不回退旧全量接口。
- 账号、会话凭据、服务器及筛选绑定请求 scope；变化时重置首页并取消旧请求。登出、权限拒绝、无效响应立即隐藏原页面和总数，不读写私有离线快照。深度搜索仍须显式操作，不因翻页触发 AI。
- 原列表使用的关系价值标签此前没有进入卡片契约：新增最多 5 个去重枚举标签，并从 Web 源同步 App 契约/schema；旧响应缺字段按空数组兼容。姓名、组织、待初始化状态及原筛选语义保留；标签目录超过 50 项时明确说明只展示部分。
- 全局数使用 summary，不从 30 条推断。互斥的进展/待跟进条件保持空交集。分页游标不合法可返回第一页恢复，不静默重置/全量回读。

真实 Chromium 界面验证 65 人按 30/30/5 分页、搜索筛选、详情导航和既有交互；独立真实请求 hook 验证翻页只发一次页面请求、刷新回首页、账号切换与迟到响应隔离、403 清除、404 不降级及登出不请求。App 相关回归 105 项通过，新增登出检查另通过；Web 卡片真实 PostgreSQL/API/页面 6 项通过。两端完整类型检查、契约/schema 同步检查通过。

限制：关系搜索建议、旧 AI/worker 图、App 聊天正文尚未在这一批迁移；因此不能将联系人卡片收益当成整个 App 页面或项目月度账单收益。生产须先具有新页面 API 并通过既有运行时/权限发布门，再发布客户端；无兼容 API 的服务器将显示明确失败，不自动下载全量通讯录。另一端协议扩展仅 optional `valueTypes`，Web 新 reader 返回该字段、旧客户端可忽略；根 bridge 原有未提交交接内容未覆盖。

## 第六批：App 主收件箱会话摘要与消息窗口

第五批提交 `cc31f2a1`。本批消费第二批已有的 API，不新增 HTTP 契约；手机安装和生产发布仍未执行。

- 主收件箱列表每次 20 个会话摘要；下一页替换当前页，可以回第一页。列表没有 `messages` 数组，未读总数独立读现有窄 `unread-summary`，不拿当前页求和冒充全局数。“全部已读”在消息页明确改为“本页已读”，仅提交当前页已验证的尾消息 ID，通知页动作不受影响。
- `/inbox/[id]` 默认读最近 30 条完整正文，按服务器字节窗口可能少于 30 条；手动查看更早窗口，不累积全部历史。额外读该会话的单条摘要确认资格与未读状态；两种读取任一失败或资格不一致都不允许显示/操作旧内容。没有伪造含完整历史的旧 DTO。
- 15 秒前台刷新目标保留，当前窗口只做有界读取；未声称此时已经按消息变化增量同步。拉取较早窗口不推进/倒退已读指针；只有最新窗口且服务端报告未读时才提交当前尾消息。发送后、手动刷新和失效通知回最新窗口。
- 在窗口切换期间隐藏旧正文，但保留同账号同会话的本地未发送草稿；换号/换服务器/后台/失焦仍取消旧请求，迟到回复不能授权操作或触发新账号过期。读取失败不会触发全量会话 fallback。发送失败保留原幂等 ID 和输入，权限校验仍由服务器动作执行。
- 修复分页资源的内部作用域：除 client 身份外还绑定路径，避免下一页请求期间把上一页快照当成新页。错误优先于另一请求的 pending 状态，防止已知 403 被持续“加载中”掩盖。性能计时补登记摘要路径，不记录游标正文。

验证：真实 Chromium 45 会话分页替换及全局 90 未读；60 消息窗口切换、草稿保留、读旧页遇到新未读不写回旧游标；真实请求生命周期、后台恢复、回执/重试、通知隔离、窄屏大字/暗色布局、计时器和角标回归。最终组合 244 项全部通过、无跳过，App 完整类型检查通过。另查看了实际渲染截图（包括 320 宽、双倍字号详情），未把截图写入仓库；可由 `APP_STYLE_SCREENSHOTS=1` 运行 `tests/ink-signal-inbox.test.ts` 重现。测试夹具更新为新接口的窄响应；旧详情发送路径的兼容回归继续保留。

尚未完成的独立路径：`RelationshipChatDetailScreen` 旧入口、关系搜索建议的有关系门控、旧 AI/worker 全图、typed 来源验证/精确未读和业务物化。建议文本虽固定，当前逻辑仅在账号有有效关系时显示；不能为了去掉图读取把无数据账号变成有建议。本批没有改这一门控。

后续门槛不变：typed 未通过来源授权/计数/生产者与到期覆盖前不扩大启用、不移除 GET refresh；服务器私有缓存未启用，writer/撤权/时间版本闭环尚未证明。十万关联任务的数据库 CPU 已暴露投影需求，仍需窄投影的写入/删除/回填设计与对账，不能用本轮传输收益掩盖延迟。生产运行时验证、实际消费版本、真实月度速率与是否发布是独立验收项，不由本地通过自动完成。

## 第七批：旧聊天详情入口消息窗口

第六批已提交 `d7a87c91`。继续迁移 `/chat/[id]`：只读最近 30 条消息窗口，查看更早记录替换页面，可回最新页；不再读取旧完整会话 DTO，不从窗口推算全局未读。该入口原本不自动标记已读，本批不新增已读写操作。

沿用服务端分页契约和严格 actor/会话/成员/资格校验，账号、凭据、服务器、会话和窗口绑定请求作用域。刷新或翻页过程中不展示旧正文；同账号同会话的草稿与失败请求幂等 ID 保留，失效时取消在途投递。403/404 不降级全量接口，恢复权限后须重新读取验证才能显示。提取结果的既有读取未优化，不将本批当作整个详情请求成本已固定。

TDD 先确认旧入口仍读取整份历史及保留撤权 UI 的两项失败，再修改实现。真实浏览器验证 65 条按 30/30/5 替换、草稿保留、旧窗口迟到响应隔离、403/404 无全量回退、发送单飞与回执匹配、身份切换取消；与主收件箱及资格检查合计 138 项通过、零跳过，App 完整 typecheck 通过。旧列表 `/chat` 仍需独立迁移，不能因为详情完成就声称旧入口全部完成。API/契约未变；没有安装手机、云端查询、部署或生产写入。

## 第八批：旧聊天列表摘要分页

第七批提交 `2e67e2f4`，其 GitNexus staged 检查 4 文件/26 符号、low、无 partial/truncated/error。旧 `/chat` 本批接入 20 条摘要分页，窗口替换、不累积历史、不下载消息正文。页内数字明确标为“本页对话/本页未读”，不冒充全局总数；主收件箱的独立全局未读不变。排序文案修正为与 SQL 一致的最近更新，AI 入口和详情导航保持。

请求绑定账号、凭据、服务器和页码，失效隐藏前页；没有私有持久快照和全量 fallback。新增真实请求浏览器测试先红后绿，验证 45 会话按 20/20/5 替换、返回首页和身份变更清除；聊天相关 17 项及宽入口的暗色、失败、空态、提取/投递 7 项均通过，App 类型检查通过。旧详情与新消息窗口的通用页面 fixture 已同步为窄契约。API/共享契约未变，不等于已安装或发布。

## 第九批：通知来源批量状态校验与读取策略补齐

第八批提交 `e95710d1`，staged 图检查 6 文件/28 符号、low，无 partial/truncated/error。本批通知工厂/服务影响提醒物化和 discovery，编辑前已按 HIGH 报告；不修改原有动作事务及逐条权威来源校验。

列表及精确未读计算按当前候选批次合并来源：task/schedule/note/contact/goal/旧 batch 一次最多 100 个去重 ID，SQL 内限定 workspace/owner/lifecycle，只返回 status/version/updatedAt，不读业务正文/操作历史。NULL wrapper、primitive、数组/对象版本等保留 JS 原语义；旧编码 payload 和 appointment/discovery/connection/reminder-plan/v2 batch 继续调用原领域规则，不缓存授权结论。相同 ID 的不同集合不混淆；输出数量不完整时 fail closed。详情和 accept/snooze/read 动作仍在原事务中重新校验，不复用列表结果。

本地放大 fixture（19 个业务对象各加 100 KB 无关正文，22 个来源引用）：独立来源校验 22 查询/2,110,061 B → 1 查询/2,904 B；完整列表及全局未读 31 查询/2,721,717 B → 5 查询/12,612 B，响应逐字段相同。该字节数为 SQL 返回 JSON 估计，不是 Neon 协议字节或生产月账单。201 个不同 ID 分成 3 次 SQL；所有简单集合、空/缺失/撤权/归档、版本变化、多页/历史/类别计数均对照旧校验。

回归首次有 2 项因空 public schema 失败、3 项因直接 URL 未配置跳过；没有计为通过。新增可复现隔离脚本，只接受本机 PostgreSQL，临时 schema 初始化真实表、子进程白名单环境（无云/模型凭据），结束清理自己的 schema。最终 33 项全部通过、无跳过：包括 PostgreSQL 并发 accept/幂等、延期、约谈显式提醒优先、discovery 撤销消息分析后去除私密摘录、日程实例取消与到期规则。Web 完整类型检查通过。

```sh
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 node --import tsx scripts/diagnostics/check-inbox-source-batches.ts
```

App 读取面审计发现迁移前接口和行号残留：同步新消费者登记，保留动态发送动作的已核实路径，删除已不存在的旧读取点；联系人 summary 的查询分隔符明确化，避免被误当动态 ID。窄私有读取仍登记 network-only，不授权离线缓存；静态 `/contacts/page` 优先于参数 `/contacts/:id`，同等具体度的冲突仍拒绝。读取审计/联系人生命周期 26 项通过；没有放宽未知路径。共享契约未变，根 bridge 进行中的交接文件保持原样。

限制：活跃未读来源仍需全部检查，不可用通知过多仍可能多次翻候选页；复杂领域和旧编码 fallback 未变成常数成本。业务 GET refresh、后台全量物化、旧 AI/signals 图、App 人脉跟进列表和生产运行时/实际月速率仍未全部完成。不能据此宣布 5 GB/月已经可保证或 P3 已完成。

## 第十批：App 人脉跟进真正分页

第九批已提交 `c586aa58`。新增 `/api/relationship-tasks/page`，默认 30、最大 50；App 待办页的人脉跟进改用此接口，open/completed 在 SQL 中过滤，不先下载全部再由手机筛选。旧接口和关系完成/下一步命令保留。列表必须同时有当前 actor 合法拥有的任务、关系及可解析联系人，与旧 App 列表对照；不能直接复用 Web 允许无关系任务的页面口径。

归属规则复用用户决定：任务/关系的行所有者必须是本人，关联 accountId 缺省/NULL 或一致；关联账号、无所有者、冲突字段不能授予访问。SQL 内重验后分页，游标签名绑定 workspace/actor/mode/协议/完整排序位置。更改关系归属后旧游标不再返回任务。返回 titlePreview/contactNamePreview，不下载正文、关系摘要、证据数组；进入原详情仍读权威完整内容。新端点拒绝重复/未知参数和非法上限，运行时/配置失败显示 unavailable，不回退全量图。

App 以 30/30/5 窗口替换而非累积；切换状态、账号、凭据、服务器重置第一页，迟到响应不能跨 scope 恢复内容；403 和错误 actor 响应隐藏旧页。返回任务页后刷新第一页，未 ready 时不请求，不写私有离线快照；列表没有把当前页数量当全局总数。新契约/schema 从 Web 同步，编译期 ContractMatches 和运行时严格校验同时保留。首次类型检查发现非 strict Web 对 nullable 键的推断差异，已显式保留必填 nullable 输出，未放宽运行时缺字段检查。

本地随机 schema 的真实 PostgreSQL 测试以旧 provider + `relationshipTaskSummaries` 为 oracle，覆盖 Unicode/空日期排序、两种状态、非法归属、缺失/冲突关联、游標篡改及跨账号/模式。约 100 条 → 10,068 条本人合法任务，30 条首窗 PG 返回 JSON 为 8,738 B → 8,741 B，均为 1 次查询；增长夹具另外包含每条 5 KB 标题。不是整个 API 请求或 Neon 月账单，也没有解决全局校验/精确计数的数据库 CPU 增长。

验证：新增 PG/API 4 项通过；App 真实 Chromium、任务编辑幂等/回执、旧待办操作和读取策略合计 58 项通过，无跳过。最终 schema 同步后新增 8 项两端复测通过，Web/App 全量 typecheck 通过。读取面审计 unregistered/invalid 均为 0。截图已查看，仅本地浏览器验证，不冒充手机安装或原生验证。

```sh
# Web cwd
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 node --import tsx --test tests/services/relationship-task-page-postgres.test.ts tests/api/relationship-task-page.test.ts
# App cwd
env -i PATH="$PATH" node --import tsx --test tests/relationship-task-pages.test.ts tests/relationship-task-pages-interactions.test.ts tests/relationship-lifecycle-interactions.test.ts tests/ink-signal-tasks.test.ts tests/tasks-unification-interactions.test.ts tests/offline-read-inventory.test.ts
```

发布门：服务端须先具有新端点，稳定签名密钥和已验证的 Node/ICU/PostgreSQL 排序运行时；现有本地白名单仍不能直接视为生产已验证。旧服务器的 404 明确失败，不静默回退。未部署、未迁移云数据库、未更新手机；根目录 bridge 的已有未提交交接保持原样。P2 私有缓存、P3 逐来源变化/到期和其生产门仍未完成。

## 第十一批：到期投递后的可靠通知工作项与后台窄消息候选

第十批已提交 `ac43c747`。按来源推进 P3 的第一步：canonical 站内提醒投递成功时，原事务写入专用 projection work。复用原 wake 的到期、取消、改期和投递 fencing；不新增外部发送，不用通知格式错误阻塞原本合法的提醒。独立消费者每批 25（最多 50），claim/lease/退避/8 次死信，投影和完成同事务。旧 worker、超时 lease、重复消费不能覆盖新 generation；新来源变化与正在处理的旧工作并发仍留下新工作。

发现并修复新实现的同毫秒漏洞：原先用 plan.updatedAt 等价判断，真实 create → delivered → reschedule → delivered 保持同一时钟时不能登记第二次变化。测试先失败，再改为明确字段指纹（不作为排序游标）；旧 lease 被新 generation 压住，SQL 窄字段读取与 producer 计算一致。

行 owner、entity account/owner 一致及对应投递 fence 必须通过；关联账号不能凭 account 字段访问。worker 只读取当前 plan 和 delivery 的允许字段，超大有效字段在 SQL 内拒绝，未知私密大字段不传出。1 万无关同 owner 历史计划不增加这两次来源查询返回：本地两条来源全 payload **4,000,896 B → 1,175 B**，2 次查询；这是放大 fixture 的来源读取，不是完整请求/账单。10 万已完成 work 时 idle 领取仍返回 0 项。

另一个可独立使用的优化：后台 typed message materialize 原来下载完整 message payload，实际仅用 messageId / conversationId / sentAt。现改为 SQL 窄投影，保留原成员候选过滤、顺序、50 条限制、cursor 及 delivery ledger 去重，真正发送前的权威授权/正文读取不变。本地 50 条各含 200 KB 无关正文/历史的候选 **10,008,001 B → 5,101 B**；65 消息走 50/15/50 重放仍只建立 65 个投递意图。旧时间 cursor 尾页复位仍存在，本批不冒称消息已可靠增量化。

新开关 `ORBIT_CANONICAL_INBOX_PROJECTION=1` 默认关闭，schema 不由运行时自动安装。新来源 worker 没有证明旧 GET refresh 等价：旧到期物化包含 scheduled/failed，周期日程还依赖窗口补齐；历史回填的 Push 抑制也没完成。因此保留所有旧 refresh，没有自动回填，没有启用缓存、扩大 typed rollout 或修改生产。具体迁移、暂停及切换检查见 [发布门与复现说明](2026-09-25-canonical-inbox-projection-rollout.md)。

GitNexus 编辑前对共用 inbox service/repository 为 HIGH，已告知；图上 wake/dispatch/窄候选入口为 LOW，但动态维护入口仍用实际 PostgreSQL 回归覆盖。共享 upserter / transaction helper 提取仅为让投影与完成共用事务，原 action 权限/事务/幂等不变。未修改 API/契约/App；根 bridge 未提交交接不覆盖。本批没有完成全部 P3，不把默认关闭的能力计入生产流量收益。

验证：新工作项/实际投递/来源窄读/消息候选 5 项及原 canonical wake 26 项通过，另通知来源/并发动作/日程/discovery 33 项通过，共 64 项、无跳过；Web 完整 typecheck 通过。首次合跑误用了 audit 库名，原 canonical 测试的固定库名安全断言拒绝，未算通过；改为其指定的本地 cutover 测试库后 31 项全通过，复现命令已修正。整批图检查因共用通知事务链为 CRITICAL，保留实际回归与默认关闭的上线门，不能以单入口 LOW 稀释整体风险。

## 第十二批：私人联系人严格归属，包括合法关系引用

基于 `b669a133`。用户明确回答“禁止，只能查看本人拥有的联系人”。**本节取代第三批中“合法本人关系可以读取外部联系人摘要”的旧保留项**：联系人行所有者必须等于 actor，payload.accountId 缺省/NULL 或相等；关联账号、本人拥有的关系/任务/通知引用都不能代替联系人所有权。没有明确所有者、归属冲突、数组/数字伪造关联字段均拒绝。合法双方会话仍按有效绑定与成员资格授权，本批不把聊天改成仅消息所有者可见。

落实范围：联系人 SQL 卡片/摘要/旧分页、详情及行业编辑、内存 fallback、名片写入服务的联系人查找、关系证据的账号读取、跟进 SQL facts/旧图、legacy 通知关联联系人、日程关联候选，以及 bootstrap/dashboard 的联系人聚合与计数。内部窄投影保留用于复核的 accountId；移除“来自分页 reader 就默认有权”的旁路。详情行业更新不再扫描关系来寻找替代授权。

回归先红后绿：新增 `tests/services/contact-owner-boundary.test.ts` 保留“B 拥有联系人、A 拥有合法关系”的明确反例；SQL、内存、列表总数、聚合、HTTP GET/PATCH 都拒绝，拒绝修改前后存储一致。再发现 bootstrap/dashboard 仍会返回行 owner 与 accountId 冲突的数据，同样先复现再修正。原测试的合法成本夹具改成明确本人所有，不减少数据量；原 alias-only 访问断言改为拒绝，负例没有删除。联系人归属撤销后，旧人脉任务游标也不能继续显示该任务。

验证（全部本地、清空云凭据、随机隔离 schema）：

- 权限、SQL 读取、业务能力、聚合、真实 HTTP 入口和会话路由组合 **78 项通过，0 跳过**。
- bootstrap/dashboard 的本地 PostgreSQL 投影 **5 项通过，0 跳过**。首次合跑因该测试要求专用库名而跳过了 1 项；改用其指定的 `orbit_lifecycle_r1_20260917` 后补跑，不将跳过算通过。
- lifecycle 增长测试 **6 项通过，0 跳过**。101 / 10,001 / 100,001 条任务及各自关联对象，单页分别 11,491 / 11,493 / 11,494 B；十万组约 12.1 秒。归属收紧后传输边界仍成立，数据库计算成本仍增长。
- Web 完整类型检查通过；没有共享 HTTP 形状变更、App 文件修改或手机验证。

核心反例及增长复现：

```sh
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 node --import tsx --test tests/services/contact-owner-boundary.test.ts tests/services/contact-detail-lifecycle-guard-postgres.test.ts tests/services/event-relationship-contact-detail-postgres.test.ts
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 ORBIT_FOLLOWUP_PAGE_GROWTH=1 node --import tsx --test tests/services/lifecycle-task-pages-postgres.test.ts
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost:5432/orbit_lifecycle_r1_20260917 node --import tsx --test tests/capabilities/bootstrap-dashboard-egress-bounds.test.ts
```

兼容与发布：老客户端响应形状不变，但不再看到无主/跨所有者旧联系人，这是明确批准的权限变化；不会自动替这些记录改归属。Web/App 列表、相关任务及聚合会同步减少这类项目。没有部署、Neon 读写/迁移、生产数据修复或删除；根 bridge 的已有未提交交接保持原样。

剩余事项仍独立记录：普通 canonical `/api/tasks` 的 list 与人脉跟进分页不是同一入口，仍需迁移实际消费者，不能将第十批当作所有任务列表均已完成；P3 可靠变化/到期第一来源仍默认关闭，尚不能删除旧 refresh；生产运行时、旧客户端实际使用量、真实 Neon 月速率及发布尚未验收。本批不把本地授权修复当成全部四项或线上治理完成。

GitNexus 绑定根仓库 `orbit`（`/Users/li/work/orbit`，基线 `b669a133`），编辑前共享联系人 provider 为 HIGH，已说明会影响详情、搜索、笔记/日程引用；新增聚合入口补做 impact。UNKNOWN 常量/测试入口由源码引用和真实测试补核，不当作无影响。强制重建后 all/staged 原始检查均无 partial/truncated/error；staged 25 文件、58 个可识别符号。图报告 low/0 个流程不能抵消权限语义变更和动态漏边风险，验收依据同时包含上述 89 项本地回归。

## 第十三批：普通待办独立卡片分页与 Web 正式入口

基于 `caf9bd8a`。新增 `/api/tasks/page`，默认30/最多50条；SQL 内同时按 workspace、行所有者、task.accountId/ownerUserId 检验本人归属，再进行状态、relationship 范围及标题/备注搜索、全局计数和签名游标分页。排序协议显式使用 C 字节序：待办按 dueAt/plannedDate/无日期在后、updatedAt 倒序、ID 正序；完成列表按 updatedAt 倒序、ID 正序。游标签名绑定 actor/workspace/status/scope/query/v1，不能跨账号或筛选复用。

列表只返回240字符标题、120字符地点和本人联系人摘要；备注、活动历史和完整业务 payload 不传出数据库。联系人名字也必须行 owner/accountId 一致；外部联系人、冲突 accountId、数组伪造 accountId、撤权或缺失都返回 null，不借任务关系授权。非规范 enum 数组明确拒绝，不继承旧 decoder 的 String(array) 意外容错；未改旧详情/写入格式，也未修复或迁移存量数据。其他日期/归属/完成字段/重复、逆序和越权历史测试与旧 service.list 结果集对照。超长引用 ID 返回微小错误，不先返回页面再失败。

Web `/app/tasks` 已真实消费新接口：30条窗口替换，搜索在服务器覆盖全部任务，切换筛选回首页，完成/恢复/创建后重新读取，失败隐藏旧列表。迟到旧搜索不能覆盖新结果。保留旧 `/api/tasks` 供旧客户端，不以截断旧接口伪装兼容；详情和动作不变。新增独立 TaskCard/TaskPage 契约、严格运行时 schema 及实际编译期 ContractMatches，App 副本经 sync:contract 生成。

本地 PG16 随机 schema、隔离环境、无云凭据：65条大备注任务 → 10,062条 → 100,062条时，30条首窗 PG 返回 JSON 为 **11,039 → 11,042 → 11,043 B**，每次1条 SQL。新增九万条和验证在本机执行；不是 Neon 协议/账单字节，不代表数据库 CPU 恒定：全局计数、搜索和历史有效性仍在数据库内处理全部候选。22项数据库/真实 handler/Web 组件/原详情与动作回归通过，零跳过，Web全量类型检查通过。

```sh
env -i PATH="$PATH" ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://li@localhost/orbit_neon_audit_20260925 node --import tsx --test tests/services/task-page-postgres.test.ts tests/pages/web-task-pages.test.tsx tests/api/task-page.test.ts tests/pages/web-tasks-workspace.test.tsx tests/pages/web-tasks-client.test.ts tests/pages/web-tasks-retry.test.ts
```

跨端交接：本端为 caf9bd8a 后本批；App 此批仅同步契约，尚未消费新普通任务页。核实 native 已使用 lease/domain-page 本地镜像，支持浏览器镜像时 Web App 也复用镜像；不能笼统说手机每次下载 `/api/tasks`。仍须治理 online-only fallback 的全量读取、TasksScreen 的全联系人附带请求、RelationshipTaskTools 的旧建议入口，并保留镜像的授权/增量同步机制。Today 汇总和建议列表另有全量路径，本批未替换。新端点要求稳定签名密钥与 PG und-x-icu；当前只验证本机运行时，没有发布或手机安装，生产真实用量仍待验收。

## 第十四批：App 普通待办窗口与本页联系人名字

第十三批提交 `f21bcd9e`；其22项Web/PG、6项契约同步、两端完整类型检查通过，staged图检查21文件/132符号、medium、无partial/truncated/error。以下为该版本之后的跨端增量，不是生产发布。

App普通待办统一暴露30条窗口。native及可用的浏览器本地镜像保留lease/domain-page机制、已有离线展示和写后同步确认，仅在本地筛选/排序后显示一页；**没有宣称本地数据库已经按页读取**。online-only浏览器改读`/api/tasks/page`，不再全量下载普通任务。两种来源均提供全局open/completed数，翻页替换、切筛选/账号/凭据/服务器回首页；旧账号、旧页迟到响应、错误actor/筛选回执和403不显示旧条目，不写私有快照，不降级旧全量接口。浏览器失去镜像能力后不把local offset传给服务器签名游标。

列表使用明确的TaskListEntry投影，不伪装完整TaskItem。卡片新增可选completedAt（由SQL返回实际完成时间），保留旧卡片部署兼容，不从updatedAt捏造完成时间。完成/恢复回执仍校验账号、ID、目标状态和较新版本，native仍等待镜像确认；操作幂等与详情接口未替换。

新增`GET /api/contacts/labels?id=...`：最多30个请求ID、单ID最多2048字符、JSON ID集合最多8192字节，超界明确失败、不截断；一条SQL按workspace/行owner/accountId/lifecycle/ID匹配，只返回各120字符姓名/机构。无主、关联账号伪造、跨owner及撤权不返回名字，关系引用不授予访问。App只读取当前页引用的ID，没有`TasksScreen → GET /api/contacts`全量请求；账号、凭据、服务器、页码或ID集合变化清除旧名字。返回错误actor或未请求ID也失败。没有将名字摘要当联系人详情或缓存授权结论。

选择其他联系人改为显式打开搜索/分页选择器，覆盖当前页外本人联系人；点击选项后再次精确读取其当前授权名字，失败/撤权时禁止AI草稿并显示重试。已有本页任务选择、取消、手动编辑再发送、联系人与任务独立跳转保持。名字请求属于online-only，离线任务列表仍可读，但不能拿过期名字当当前联系人授权。

验证：本地PG/API7项通过，含1万无关联系人增长、归属冲突和边界拒绝；新完成时间字段后，普通任务65/10,062/100,062条的首窗为**11,628/11,631/11,632 B**、各1 SQL。与App全量浏览器测试并发的首轮在插入九万fixture时触发15秒statement_timeout，保留失败记录；未放宽限制，浏览器全量结束后独立复跑通过。数字仍仅为PG返回JSON，不是Neon账单。两端完整类型检查通过。

App完整测试曾运行3,609项：3,566通过、43失败、0跳过，**不标全量绿色**。本批相关的旧task-list源码锚点、两个屏幕fixture已改为真实新分页数据；源断言只用于平台解析/接线，实际30+1窗口、四类筛选、完成/恢复、幂等、账号切换、名字撤权、页外搜索另有Chromium验证。App-wide点击高度断言仅容许0.001px浮点误差（实际CSS44px被浏览器报告43.99993896484375），没有缩小按钮或跳过断言。全量其他失败仍需逐项核对：角标/收件箱及联系人旧fixture、路由对齐缺口等，不能自动归为无关或当作已验收。

发布依赖：服务端须先具备task-page、contact-labels、稳定游标签名与相容PG运行时，随后发布App；尚未部署、安装手机、读取Neon或改云配置。shared契约/schema由Web同步，已有根bridge未提交内容未覆盖。本批未关闭：RelationshipTaskTools为旧建议仍调用全量`/api/tasks`、Today及其他旧消费者、P3逐来源可靠变化/到期、生产真实消耗与发布验收。不能把普通待办主体分页当作整个任务相关页面已恒定成本。

最终本批App专项合跑88/88、零跳过；另宽入口待办/跟进/大字4/4、两端完整typecheck通过。全量43项失败是此前完整测试的事实，后续专项通过不冒充已重新全量绿色。可复现的新增入口验证为`task-page-source-lifecycle.test.ts`、`contact-labels-lifecycle.test.ts`、`task-list-bounded-source.test.ts`、`tasks-unification-interactions.test.ts`；后端为`task-page-postgres.test.ts`、`contact-labels-postgres.test.ts`及对应API测试，均已收进仓库，不依赖临时脚本。
