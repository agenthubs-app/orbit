# Orbit 数据整理与上线准备

## 当前执行计划（2026-09-16 用户确认后修订）

用户已明确：没有真实历史业务数据，只有可重建的 mock/fixture。2026-09-16 最新授权是先把现有云端 Demo 数据复制到 Neon Production，供正式网址和 App 测试，正式对外上线前再清理全部测试数据。运行时使用 live 服务和云端持久化；数据来源仍标为 fixture，不冒充真实用户历史。旧源库连接、历史备份恢复、历史迁移 manifest 和源库迁移 dry-run 全部不适用，不再作为前置条件。本文后面的旧迁移方案仅保留为历史讨论；执行以本节为准。

| 顺序 | 必须完成的工作 | 当前状态与验收标准 |
| --- | --- | --- |
| P0-0 | 固定共同环境 | 当前切换目标为 Neon Production `br-shy-rain-b3281a9u`，保留测试 workspace `workspace:orbit-demo-fixtures`；正式网址 `https://orbit-puce-kappa.vercel.app`；App 仅经同一 HTTP API，不直连 Neon。 |
| P0-1 | 校验并整理 mock 的身份、引用和时间 | 13 个主办方重复身份已对齐，26 条旧 account/profile 可恢复停用；主账号 66 contacts/66 有效 connections/66 当前 tasks，14 重复任务撤销、384 重复关系和 66 旧分析可恢复停用。正式 lifecycle preflight 为 0 issues、canonical projection 66；保留历史 evidence 和原日期语义，不覆盖用户修改。未来测试活动独立新增。 |
| P0-2 | 可重复初始化并回读 | 13 个公开活动激活审计已补齐，重复激活保留基线不变；64 个活跃报名、6 条取消历史。Production 已完成 56 张业务表原子复制与逐表 SHA-256 回读：共 9,217 行（其中 orbit_records 8,703），迁移账本未覆盖。8,365 仅为旧生成 fixture 子集。 |
| P0-3 | 登录及主办方/参与者流程 | Production 主办方登录/后台 64 人、独立参与者账号拒绝进入后台通过。新增活动报名→取消→重新报名复用同一报名 ID；刷新保留原始回答。主测试登录 `demo-owner@orbit.example.test` 经 auth-membership 使用既有主账号，浏览器读到 66 位联系人。 |
| P0-4 | Web ↔ App 双向回读 | App `.env.local` 已固定 Production API；Web 已读到迁入的 App client 测试任务。当前原生验收受本机 Swift 6.2.1 与 expo-modules-jsi 的 `weak let` 编译错误阻塞（15 errors）；Expo Go 缺少 ExpoAsset；App 浏览器版受跨域限制。没有降低生产保护，也不声称原生双向已通过。 |

只保留上述必要工作。AI 派生结果不能冒充人工事实；测试数据通过独立 workspace 和原 provenance 保持可辨识。已结束活动保留结束语义，可报名场景应另有明确的测试活动和时间窗口。正式接收真实用户数据之前必须清理测试 workspace（包含测试时新增数据）、确认业务空库并配置正式 workspace 与备份；本次不提前执行清理。

当前 Production：`dpl_5JaVX9ko5phE3T4cdFTGcmmcMFxs`，[正式测试站](https://orbit-puce-kappa.vercel.app)。运行源码对应 `b7e1f43e6` 的激活审计、主办方身份对齐和 Web 取消修复；构建、typecheck 与该轮 19 项组合通过。以前的 Preview 仅保留为历史，不是当前统一测试入口。测试账号密码仅在本机受限文件 `/Users/li/.config/orbit/demo-fixtures.env`，主登录、主办方及参与者账号都使用该测试密码。

本轮追加完成：关系投影代码 `1f9cca960`，662 条更新先备份后事务提交、回读零问题，正式 Web 列表/详情复验通过；46 项定向回归和 typecheck 通过。备份：`/Users/li/.config/orbit/production-test-2026-09-16/pre-relationship-consolidation.json`。此次仅追加 seed/验证脚本和云端测试数据整理，Web 运行源码未变，无需为该数据更新重新发布。GitNexus query/impact/detect-changes 仍 SIGSEGV，已补源码和定向测试，不能声称图分析通过。

并行测试增量（2026-09-16）：Luna max 子代理分别核查活动 worker、App 与 Production 数据，主代理执行 Web 实操。发现 iOrbit/个人日程页使用 raw 登录主体而非 canonical 账号；个人日程已写入但 UI 回执报错；66 条关系待办仍是 legacy 数据格式，被当前 tasks reader 过滤。它们均是当前 P0 未完成项，先修身份入口与任务投影，再验收 AI 只读查询。此前 lifecycle preflight 0 issues 不代表 tasks API 可读；笔记与任务提醒链路还缺有效测试实例。新建 canonical 任务的保存、完成、恢复、刷新与跨账号隔离已通过。详细结果和证据见 [并行测试报告](2026-09-16-production-parallel-test-report.md)。

后续队列：上述 Web/数据缺口可以独立处理；原生 App 同环境验收需要兼容当前 Expo 依赖的原生构建环境；活动后台生成验收需要持久云端 worker。当前 Vercel 队列清单与 maintenance task 清单均未包含 event-operations worker，不能把 Web 发布成功视为后台匹配生成已可持续运行，也不以开发机器长驻冒充云服务。Web 已可测试但不代表主流程全部通过。清空测试数据、正式 workspace、备份策略与凭据轮换留到真实上线前，不提前执行。

## 历史方案与执行记录（以下前置条件已由上述计划取代）

## 文档定位

- **整理日期**：2026-09-15
- **来源**：`docs/designs/2026-09-15-product-follow-up-backlog.md` 中的 P0-01～P0-04 及相关验收项
- **目的**：把“数据怎么整理、线上怎么接、上线前怎么验证”单独抽出来，作为下一步讨论和执行入口
- **注意**：本文是准备方案，不代表当前线上已经接通，也不替代代码、测试和运行时证据；P0-2 隔离演练的执行证据见 [P0-2 迁移演练记录](2026-09-15-p0-2-migration-rehearsal.md)
- **新增架构决策**：业务数据最终统一存放在一个云端数据库；如果现有 Neon 连接已验证可用，优先继续沿用 Neon，否则再评估 Supabase。Neon 与 Supabase 不做业务双写。

## 初次预检与 P0-0 更新记录（2026-09-15）

本节保留 P0-0 之前的预检事实，并以文末的 P0-0 执行记录和独立的 [P0-1 最小矩阵](2026-09-15-p0-1-data-authority-matrix.md) 为当前状态依据。不要把下面“初次预检”中的本地配置结论误认为 P0-0 完成后的最终状态。

初次核查只做了工作区内的只读检查；完成 Neon 项目配置后，又通过 Neon 控制台和本地 `pg` 执行了只读连接 / schema 检查。全程没有打印或读取完整连接串、密码或 token。

已确认：

- 初次预检时，`repos/orbits/.env.local` 的 `ORBIT_EVENT_DATABASE_URL` 指向 `127.0.0.1` 本机 PostgreSQL；P0-0 后已切换为 Neon pooled 连接。
- `ORBIT_LIVE_DATABASE_URL`、`ORBIT_DATABASE_URL`、`ORBIT_CLOUD_DATABASE_URL`、`ORBIT_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_URL` 在当前 `.env.local` 中仍未配置；当前统一入口是 `ORBIT_EVENT_DATABASE_URL`。
- `repos/orbits/shared/storage/live-database-config.ts` 会按 `ORBIT_EVENT_DATABASE_URL → ORBIT_LIVE_DATABASE_URL → ORBIT_DATABASE_URL` 的顺序选择数据库连接；当前首选变量的实际目标已切换为 Neon。
- `repos/orbits/scripts/sync-cloud-records.ts` 的注释仍把 `ORBIT_EVENT_DATABASE_URL` 描述为本地库，并要求另提供 `ORBIT_CLOUD_DATABASE_URL`；这只是历史同步工具说明，不是当前业务已完成云端统一的证据，也不是本轮迁移入口。
- App 的工程边界已经明确：App 通过 `repos/orbits` 的 HTTP API 访问业务数据，不直接读写 Postgres、Supabase 或 `orbit_records`。
- Bridge 当前记录仍显示远程数据库迁移、环境配置、部署和公网 App 接入未完成或未核实。
- 本机有 PostgreSQL 进程监听 `127.0.0.1:5432`，但 `pg_isready` 未通过，不能把“端口监听”当成“数据库已可用”。
- 本地 Web/API 的 `http://127.0.0.1:3000/api/health` 当前无法连接，当前没有可用于跨端验收的运行中 Web/API 服务。

状态矩阵：

| 检查项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| App → Web/API | 已确认 | App 工程规则和 README 明确只通过 HTTP API 访问 |
| Web/API → 数据库解析顺序 | 已确认 | `ORBIT_EVENT_DATABASE_URL → ORBIT_LIVE_DATABASE_URL → ORBIT_DATABASE_URL` |
| 初次预检的本地数据库配置 | 已确认（历史记录） | P0-0 前 `.env.local` 指向 `127.0.0.1`；当前已切换 Neon |
| 本地 PostgreSQL 可用性 | 未通过 | 5432 有监听，但 `pg_isready` 未通过 |
| 本地 Web/API 可用性 | 未通过 | 3000 端口健康检查无法连接 |
| Neon 云端连接 | 已确认（只读） | P0-0 已通过本地 `pg` 连接 `neondb.public`；当前业务表为 0 |
| Supabase 云端连接 | 未确认 | 只有历史同步脚本 / 设计文档，没有当前有效连接证据 |
| Web/App 共用云端数据 | 未验证 | 尚无运行中的 Web/API + App 跨端回读证据 |
| 远程迁移 / 部署 | 未确认 | Bridge 记录明确保留为开放项 |

初次预检结论：当时 App → Web/API 的访问边界已明确，但本地 PostgreSQL / Web/API 未通过健康验证，云端权威数据库尚未得到接通证据。随后已完成 P0-0：创建独立 Neon `orbit` 项目、切换工作区服务端连接配置，并以只读 `pg` 查询验证 `neondb.public` 可连接且当前无业务表；当前仍未执行 migration、迁移或运行时跨端回读。

因此，当前可以进入 P0-1 数据权威梳理，但仍不能进行业务迁移、双写或把本地连接验证标记为上线完成。P0-1 的当前交付物见 [P0-1 最小矩阵](2026-09-15-p0-1-data-authority-matrix.md)。P0-2 隔离 schema 演练已在后续完成，但不改变“尚未进行业务数据迁移和正式切换”的结论。

## P0 顺序结论：先做最小确认，再做数据整理

不是先把所有服务接通，也不是先把数据直接搬到云端。P0 应按以下顺序执行：

| 顺序 | P0 动作 | 目的 | 不应做的事 |
| --- | --- | --- | --- |
| P0-0 | 确认 Neon 项目和连接可用 | 确认目标、权限、schema 可见性和连接方式确实存在 | 不迁移、不双写、不修改生产数据 |
| P0-1 | 梳理数据和权威来源 | 明确哪些数据要迁移、哪些是重复数据、谁是唯一事实来源 | 不因为看到本地表就默认它们都应原样上云 |
| P0-2 | 建立 Neon 隔离环境 / 分支并执行迁移演练 | 验证 schema、稳定 ID、用户归属、权限和回滚 | 不直接在生产库试迁移 |
| P0-3 | 迁移经过确认的数据并切换 Web/API | 让 Web/API 开始读写 Neon | 不保留同一业务数据的无规则本地 / 云端双写 |
| P0-4 | 做 Web ↔ App 跨端回读验收 | 证明两端实际使用同一套云端事实 | 不把本地页面能打开当成上线完成 |

这里的“先确认”是**最小可行确认**，不是要求先完成全部上线：

- Neon 项目确实存在；
- 能在安全环境中验证连接；
- 能读取目标 schema / migration 状态；
- 知道 Web/API 将使用哪个连接变量；
- 能创建隔离的测试数据库或分支。

完成 P0-0 后即可进入 P0-1。数据盘点可以立刻开始，但在 P0-0 完成前只能做源码、当前本地 schema 和运行配置的盘点，不能做真实云端迁移。

## 一、先明确目标

上线前要回答清楚四个问题：

1. **数据在哪里**：数据库、Web、App、AI 服务和外部服务分别保存或读取什么。
2. **谁说了算**：每类数据只有一个权威来源，不能让 mock、本地缓存和线上数据库同时充当事实来源。
3. **谁能读写**：用户、Web、App、AI 工具和主办方角色分别能访问哪些数据。
4. **怎么证明上线可用**：用真实测试账号从注册走到活动、联系人、I ORBIT、日程 / To-do，并能刷新回读。

本轮不先扩张功能，先把云端数据事实、账号边界和主流程跑通。

目标架构：

```text
Web ─┐
     ├─> 同一套 Web / API ──> 唯一云端数据库（Neon 或 Supabase）
App ─┘
```

App 不直接连接 Neon / Supabase，不在 App 端另建一套业务数据库；本地数据、mock、fixture 和缓存只能用于开发、测试或读取缓存，不能作为线上业务事实。

## 二、数据盘点表

第一步不是改 schema，而是把当前真实存在的数据和读写路径列出来。

| 数据域 | 需要盘点的内容 | 需要确认的事实 |
| --- | --- | --- |
| 人脉 | 联系人、公司、邮箱、手机号、关系信息、Memo、名片来源 | 谁创建、谁修改、是否可能重复、是否绑定 Orbit 账号 |
| 活动 | 活动详情、开始 / 结束时间、报名状态、报名人数、报名问题、匹配资料 | 活动状态由谁计算，报名结果和人数从哪里读取 |
| 日程 | 约见、会议、日期、时间、时区、提醒 | 是独立记录，还是从 Memo / To-do 派生 |
| To-do | 标题、完成状态、截止时间、提醒、来源 | 与日程、首页和 I ORBIT 的关系是什么 |
| 用户资料 | 姓名、行业、职位、自我介绍、语言、活动匹配资料 | 哪些注册必填，哪些活动前补充，哪些允许公开 |
| AI 派生数据 | 摘要、匹配理由、分析报告、建议、沟通草稿 | 生成依据、来源版本、失效条件、是否需要用户确认 |
| 账号与权限 | 普通用户、主办方、交互用户、管理员 / 服务账号 | 身份如何识别，数据按谁隔离，哪些外部服务需要授权 |
| 云端存储 | Neon 或 Supabase 中的业务数据、迁移和备份 | 当前已接通哪一个，Web/API 是否唯一连接，App 是否只经 API 访问 |

### 每个数据域都要补齐的字段

- 数据对象名称和稳定 ID；
- 当前存储位置；
- 创建方和修改方；
- 读写 API 或服务入口；
- 所属用户 / 组织 / 活动；
- 静态字段与动态字段；
- 是否由 AI 生成；
- 是否允许跨模块读取；
- 删除、失效、撤销和重新生成规则；
- Web、App、数据库之间的同步方式。

## 三、建议的数据分类

以下分类来自讨论，是整理数据时的工作假设，开始实现前要用现有代码和数据库逐项核对。

### 1. 稳定基础数据

例如用户姓名、行业、职位、基本联系人信息。特点是变化少、应由用户或明确的业务写入修改，不应被 AI 随意覆盖。

### 2. 动态业务数据

例如报名状态、报名人数、日程、To-do、Memo 和活动状态。特点是会持续变化，必须有明确的权威写入路径，并能在刷新后回读。

### 3. AI 派生数据

例如匹配理由、摘要、建议和沟通草稿。特点是可以失效或重新生成，必须记录：

- 使用了哪些输入；
- 输入的版本或更新时间；
- 何时生成；
- 由哪个能力生成；
- 是否已被用户确认；
- 信息变化后是否需要重算。

### 4. 外部同步数据

例如 Google OAuth、未来的 Google Calendar / Apple Calendar 和邮件日程。特点是需要单独处理授权、撤销、同步方向、冲突和失败重试，不应直接与内部数据混成一个无来源的记录。

## 四、上线前要做的系统接通

### 4.1 云端数据库与统一后端

这是本计划中最重要的数据架构决定：

- **优先方案**：如果当前 Neon 已经接通并能用真实环境验证，则继续把 Neon 作为生产业务数据库；
- **备选方案**：如果 Neon 只是历史尝试、当前系统实际使用 Supabase，则统一切换到 Supabase；
- **禁止状态**：Neon、Supabase、本地数据库同时保存同一类业务数据并互相写入。

需要明确的访问边界：

- Web / API 负责连接云端数据库；
- App 只通过 Web / API 访问业务数据；
- 数据库连接串、service role key 等敏感凭据只放在服务端环境；
- 本地 Postgres、mock、fixture 和本地缓存不作为线上业务权威；
- 所有关键写入都要能从 API 返回并在另一端刷新回读。

需要核对并记录：

- 当前 Neon 项目 / 数据库是否真实存在并可连接；
- 当前 Web / API 实际使用的是 Neon 还是 Supabase；
- schema、migration、seed 和备份策略在哪里维护；
- 线上、测试、开发环境是否使用不同数据库；
- 是否存在从本地数据库、mock 或旧云库读取数据的旁路；
- 迁移现有数据时如何保留用户、联系人、活动、报名、日程和 To-do 的稳定 ID 与归属关系。

### 4.2 正式服务运行环境

- 确认线上 Web / API 使用正确的云端数据库连接；
- 确认线上服务读取的是云端正式数据而不是 mock / fixture；
- 确认 To-do 和日程不会继续分散在另一套代码或另一套事实来源中；
- 记录迁移、初始化数据和回滚方式；
- 为关键读写保留可追踪的错误信息和验证结果。

### 4.3 Google 登录和外部服务

- 检查 Google OAuth Client、回调地址、环境变量和部署环境是否一致；
- 验证 Google 登录后是否创建 / 找到正确的 Orbit 用户；
- 验证新用户首次登录是否进入基础资料补充；
- 明确哪些外部服务是上线必需，哪些可以暂时关闭；
- 每个外部服务记录授权范围、密钥存放位置、失败表现和撤销方式。

### 4.4 AI 服务

- 明确哪些数据会发送给 AI 服务；
- 区分读取上下文、生成结构化结果和生成草稿；
- AI 只能通过受控工具读取授权范围内的人脉、活动、日程和 To-do；
- 生成结果必须能回到输入来源，不把模型回答直接当作数据库事实；
- 未配置 AI 服务时，要有清晰的失败状态，不能静默使用假数据。

### 4.5 文字与图片数据

讨论结论倾向于：文字数据统一写入选定的云端数据库，暂不优先实现复杂的本地 / 云端双存储。名片图片、OCR 原文和来源仍需单独确认存储、保留期限、访问权限和删除规则。

这不是“所有数据都公开上传”的授权。上线前仍需明确：

- 哪些数据可以发送到云端 / AI provider；
- 哪些数据只允许当前用户读取；
- 图片是否长期保存；
- 删除联系人时是否同步删除名片和 OCR 数据。

## 五、测试账号和数据准备

需要至少准备四类可重复使用的测试身份：

| 身份 | 作用 | 必须覆盖的场景 |
| --- | --- | --- |
| 普通测试用户 | 验证主用户流程 | 注册、资料、浏览活动、报名、日程、To-do |
| 主办方账号 | 验证活动数据来源 | 创建 / 管理活动、报名人数、活动状态 |
| 交互用户 | 验证双用户关系 | 活动匹配、添加人脉、已注册联系人交互 |
| “小雨”测试账号 | 复现指定登录和业务场景 | 直接登录、已有数据、跨模块回读 |

账号准备要求：

- 每个账号的角色、数据归属和登录方式可复现；
- 测试数据不与真实生产数据混用；
- 能明确哪些记录是测试创建的；
- 账号密码、token 和 OAuth secret 不写入仓库；
- 测试结束后可以清理或隔离测试数据；
- 不用 fake 组织者或随机拼接的数据代替真实角色验证。

## 六、推荐的下一步执行顺序

### 第 0 步：冻结本轮上线范围

先确认本轮只保证：

`登录 → 基础资料 → 浏览活动 → 报名 → 添加 / 查看人脉 → I ORBIT 读取上下文 → 日程 / To-do`

暂不把外部 Calendar 双向同步、连续名片扫描、小组件和商业化限制作为上线阻塞项。

**输出物**：一页范围确认，列出“本轮必须通”和“本轮不做”。

### 第 1 步：确认 Neon 项目和最小连接能力

先确认本轮目标固定为 Neon，再查明当前环境是否真的可以连接。不能因为计划里写了 Neon，就假设当前代码已经接通 Neon。

必须形成结论：

- Neon 项目是否存在且属于当前工作环境；
- 是否可以在不暴露密钥的情况下验证连接；
- schema / migration 是否可读取；
- Web / API 的实际连接配置；
- 能否创建隔离测试分支或测试数据库。

**输出物**：Neon 连接确认记录 + 环境变量名称清单 + schema / migration 状态；不记录密码或完整连接串。

P0-0 已完成目标数据库和最小连接能力确认；Web/API 运行时切换和 Web/App 跨端回读属于后续 P0-3 / P0-4，不在本步骤提前宣称完成。

#### P0-0 执行记录（2026-09-15）

本次先完成不涉及远程写入的工作区侧预检：

| 检查项 | 结果 | 证据 / 解释 |
| --- | --- | --- |
| Neon CLI / 登录上下文 | 未发现 | 本机没有 `neonctl` 或 `neon` 命令；工作区也没有 Neon 项目配置 |
| 当前数据库连接变量 | 已切换 Neon | `repos/orbits/.env.local` 的 `ORBIT_EVENT_DATABASE_URL` 已配置为 Neon pooled 连接；没有使用 `NEXT_PUBLIC_` 暴露给客户端 |
| Web/API 连接解析 | 已确认规则 | `shared/storage/live-database-config.ts` 按 `ORBIT_EVENT_DATABASE_URL` → `ORBIT_LIVE_DATABASE_URL` → `ORBIT_DATABASE_URL` 解析 |
| 数据库驱动 | 已确认 | `repos/orbits/package.json` 使用通用 `pg`；没有发现 Neon 或 Supabase 客户端依赖 |
| Supabase 相关文档 | 仅为未来提供方说明 | `LIVE_IMPLEMENTATION.md` 明确写的是 future live providers，不能作为当前 Supabase 已接通的证据 |
| Neon 远程连接 | 已完成 | 本地 `pg` 只读查询成功，返回数据库 `neondb`、schema `public`；连接未执行写入 |
| Neon schema / migration | 已完成初步确认 | 新建项目当前非系统表数量为 0；尚未执行 Orbit schema / migration |
| 隔离分支 / 测试数据库 | 已完成基础环境 | 已创建独立 `orbit` 项目，区域为 AWS Asia Pacific 1（Singapore），当前分支为 `production`；正式迁移前仍需建立迁移演练分支 |

**P0-0 当前结论**：已完成。已创建独立 Neon `orbit` 项目，并将本地服务端配置切换到 Neon pooled 连接；只读连接验证成功，数据库为 `neondb`、schema 为 `public`，当前非系统表为 0。代码具备通用 PostgreSQL 连接边界，但 Web/API 尚未重新启动并完成运行时健康验证，Web/App 也尚未完成跨端回读，因此不能把 P0-0 误写成“业务已上线”。

**安全边界**：连接串只保存在本地忽略的环境配置中，没有写入文档、聊天或 Git；本次没有迁移、建表、seed、建分支或双写。

## P0-1 最小必要梳理

上一版的完整审计清单保留作长期治理参考，但不全部作为首次接入 Neon 的阻塞条件。P0-1 先只解决上线主链路必须回答的问题：**数据在哪里、谁能读写、哪一份是唯一事实、迁移后 Web/App 是否仍能读写**。

当前 P0-1 只覆盖这 7 个核心域：

1. 账号与 canonical identity；
2. 用户资料；
3. 活动与报名；
4. 人脉与关系；
5. Tasks / To-do；
6. 个人日程与预约；
7. I ORBIT 需要读取的上下文。

以下内容暂不作为首次迁移阻塞项：连续名片扫描和 OCR 全链路、外部 Calendar 双向同步、推送设备历史清理、完整 AI 历史治理、分析报表、所有旧兼容 API、全部后台 worker 的深度审计。它们仍需登记，但放到后续专项，不阻塞 P0-2 的第一次迁移演练。

### P0-1 的六个必答问题

对上面每个核心域，只需先填一行：

| 必答项 | 要确认的内容 |
| --- | --- |
| 当前来源 | 当前真实数据来自哪张表 / 哪个 `orbit_records` collection / 哪个本地或外部来源 |
| 唯一权威 | 哪一个来源是唯一事实；mock、缓存、推荐结果不能冒充权威 |
| 写入入口 | Web/API 的真实写入 route 和服务；App 只记录对应 API，不单独连库 |
| 读取入口 | Web 页面、App API contract、I ORBIT 读取入口 |
| 归属权限 | `actor/account/workspace` 归属，以及本人、主办方、参与者等最小权限边界 |
| 迁移处理 | 迁移、重建、暂不迁移，或存在冲突需要阻塞 |

P0-1 不要求现在整理每一个字段、每一个后台 route 或每一条历史日志；但这六项不能留空。

### P0-1 的最小验收

- 7 个核心域全部完成上述六项；
- 没有同一事实同时由本地库、Neon、客户端状态或两个 collection 作为写入权威；
- 能列出一次迁移需要执行的表/collection 和明确不迁移的来源；
- 能为每个域设计一条“Web 写入 → App 读取”的回读用例；
- 能指出至少一个安全回滚点：迁移前备份/快照、迁移演练分支或可重复导入脚本。

达到这些条件即可进入 P0-2。剩余完整审计项在首次迁移演练通过后继续补齐，不再反向阻塞整个项目。

## P0-1 完整审计参考（后续补充）

以下方法用于后续治理和上线前补全，不是当前第一次 Neon 接入的前置条件。

### 1. 先冻结盘点边界和证据

盘点开始时先固定：代码 commit、Web/API 运行版本、App 版本、当前 workspace、数据库连接目标、时间点和账号范围。所有数据库查询只读，所有业务数据导出都脱敏；不把密码、token、OAuth 凭证、连接串或完整个人正文写入盘点文件。

本仓库的代码关系图需要作为调用链补充证据，但当前 `.gitnexus/meta.json` 的索引 commit 为 `b4dfc4f`，HEAD 已是 `5dbc83d`；刷新 GitNexus 时因环境无法访问 npm registry 未完成。因此本轮先使用源码、已有 authority registry、Bridge 交接和测试/运行手册交叉核对，不能把当前旧索引当作完整调用图。

### 2. 按六类存储面逐项盘点

不能只查 PostgreSQL。每个存储面都要有“发现方法、结果、是否迁移”的记录：

| 存储面 | 本项目重点 | 必须确认 |
| --- | --- | --- |
| PostgreSQL 结构 | `orbit_records`、`event_ops_*`、关系生命周期、事件核心/体验/分析、预约、名片摄入等迁移 | schema、表/索引/约束/触发器、migration 版本、实际表与代码差异 |
| `orbit_records` 逻辑集合 | accounts、auth users、profiles、contacts、connections、tasks、notes、`personal_schedule_items`、notifications、pushDevices、AI/agent/audit/outbox 等 collection | collection 名、record ID、workspace/user 归属、生命周期、payload 字段版本、软删除和审计关系 |
| 本地客户端存储 | App SQLite `api_snapshots`、SecureStore 设备标识、旧 AsyncStorage、浏览器缓存/localStorage 禁止项 | 这是缓存、设备身份还是业务事实；是否可清除；是否需要迁移或重新注册 |
| 文件和二进制 | 名片/头像/附件/上传临时文件、blob 或外部对象存储 | 实际位置、引用 ID、过期策略、迁移后 URL/权限是否仍有效；不能把二进制只当 JSON 字段处理 |
| mock/fixture/seed | `shared/mock`、测试夹具、seed scripts、测试账号和事件样本 | 仅测试数据还是历史业务数据；不得把 mock 当生产事实，也不得把测试账号直接迁移为正式账号 |
| 外部服务和密钥 | OAuth、Calendar、OCR、AI、通知、推送、邮件、外部联系人/导入 | 迁移的是授权关系/外部 ID 还是密钥；密钥一律重新配置或轮换，不复制到 Neon |

### 3. 按数据域建立“来源—写入—读取”闭环

对每个数据域至少沿以下路径各走一遍：

`Web 页面 / App 页面 → App API client / Web route → service / provider → repository / live record store → PostgreSQL 表或 collection`

同时反向检查：

`worker / queue / scheduler / webhook / external callback → 写入入口 → 读取投影 → Web/App 消费者`

每条记录必须保留具体文件路径、route、函数/服务名和测试证据，不只写“由后端处理”。尤其要检查没有页面入口的 internal route、worker、queue、cron、migration CLI 和后台补偿逻辑。

### 4. 以现有 authority registry 为第一版基线，再做反向找漏

当前已有的 [Data authority registry](../../repos/orbits/docs/architecture/data-authority-registry.md) 可以作为基线，但不能直接视为完整清单。它明确了：

- notes → `orbit_records/notes`；
- tasks → `orbit_records/tasks`，task suggestions 是派生/候选，不是已确认任务；
- relationship followups → `orbit_records/tasks` 的关系过滤投影；
- schedule → `orbit_records/personal_schedule_items`，旧 `orbitScheduleItems` 仍是兼容来源；
- push devices → SecureStore 设备标识 + `orbit_records/pushDevices`，旧单数 API/旧设备标识仍需清理；
- AI provider context → 临时、受权限和字段 allowlist 约束的上下文，不是业务权威库。

反向找漏要从所有迁移、repository、live provider、route、worker、测试 SQL、seed 和 App contract 中提取实际出现的表名、collection 名、外部 ID 和本地存储键，再与 registry 做集合差异。差异必须归类为“已登记域、合法投影、兼容旧源、测试专用、未登记待决”，不能静默忽略。

### 5. 建立数据域权威矩阵

P0-1 的主交付物不是一张表名清单，而是以下矩阵。每一行对应一个可被用户或系统改变的事实：

| 数据域 | 业务事实 | 当前权威存储 | 目标 Neon 表/collection | 写入入口 | 读取入口 | owner / workspace | 权限与可见字段 | 版本/幂等/删除 | 投影/缓存 | 迁移分类 | 未决项 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

至少覆盖这些域：账号与 canonical identity、资料与语言偏好、人脉/关系/跟进、备注、任务、个人日程/会议/预约、活动目录与报名、活动运营/匹配/签到、名片与导入草稿、消息/聊天/邀请、通知/提醒/推送设备、AI 会话/记忆/动作/回执、审计/来源/provenance、队列/outbox/worker 状态、外部 integration 授权和文件附件。

### 6. 给每类记录做迁移分类

盘点后每条记录只能落入以下一种分类：

1. **迁移**：用户可见、不可重建、且已确认权威的数据；保留稳定 ID、owner、workspace、时间和生命周期。
2. **重建**：可从 canonical 事实重新生成的 dashboard、推荐、分析、通知计划、缓存和 read model；不搬历史派生结果，除非业务明确要求保留。
3. **兼容后淘汰**：如旧日程 collection、旧 push device/API；先证明零冲突/零孤儿，再保留一个兼容窗口。
4. **重新绑定**：外部 Calendar/OAuth/OCR/推送/对象存储只迁移安全的外部引用和授权状态，密钥必须重新配置或轮换。
5. **不迁移**：mock、fixture、临时任务、测试 schema、本地快照、日志、过期上传和无法证明归属的数据。
6. **阻塞待决**：来源冲突、owner 不明、ID 不稳定、权限无法证明、字段含义不清或存在敏感数据风险。

### 7. 用四个方向做完整性检查

在矩阵完成后，不依赖单一清单，做四次交叉核对：

- **存储反查**：每个实际表、collection、索引、文件引用、本地键都必须映射到一个数据域或明确标记为系统/测试/淘汰。
- **写入反查**：每个 `POST/PUT/PATCH/DELETE`、worker、queue、scheduler、webhook、migration CLI 都必须指向一个权威写入入口；不能存在绕过 service 的第二套写入。
- **读取反查**：每个 Web 页面、App API contract、AI query、dashboard/read model 都必须注明来源、权限、缓存和刷新条件；不能把客户端快照标成事实来源。
- **权限反查**：每个域都要验证 actor、account、workspace、organizer/admin、participant/private 等边界；匿名/public 读取与本人私有字段分开记录。

### 8. 完整审计完成门槛（后续）

满足以下条件才算完成 P0-1：

- 数据域、实际表/collection、Web route、App contract、worker/queue、外部服务之间没有未解释的差异；
- 每个核心事实只有一个 canonical writer 和一个明确 canonical store；
- 所有 legacy、projection、cache、fixture、secret、binary asset 都已标注，不会被误迁移；
- 每个域都有 owner/workspace/权限、稳定 ID、版本/幂等、软删除/生命周期、时间和时区规则；
- 本地数据与 Neon 空库的 schema 差异已记录，但尚未在 Neon 生产分支 apply；
- 每个“待决”项都有具体负责人、阻塞证据和下一步动作；
- 能据此生成 P0-2 的迁移演练清单、校验 SQL、回滚步骤和跨端回读用例。

**后续治理输出物**：`data-inventory` 数据域清单、authority matrix 权威矩阵、storage/route dependency map 数据流图、migration classification 迁移分类表、permission/provenance 清单、未决项与证据索引。首次 P0-2 演练只要求先完成上方的最小 P0-1 矩阵；完整治理输出物在演练通过后继续补齐。

### 第 2 步：梳理数据和权威来源

在 P0-1 中，按第二节的数据域逐项查当前代码、API、本地 schema、目标 Neon schema 和运行时配置，记录：

- 当前存储位置；
- 真实读写入口；
- mock / fixture 入口；
- Web / App 消费方；
- 现有权限检查；
- 当前已知缺口。

每类核心数据只指定一个 authoritative source。例如报名状态不能一部分以客户端状态为准、一部分以数据库为准。

**输出物**：已形成 [P0-1 最小矩阵](2026-09-15-p0-1-data-authority-matrix.md) 和 [P0-1 数据库基线快照](2026-09-15-p0-1-database-baseline-snapshot.md)，至少包含“数据域、目标 Neon 表 / 存储、写入入口、读取入口、owner/权限、ID/版本/删除、迁移决定、未决阻塞”。

### P0-1 精简执行版：保留必须项

上面的章节是完整审计框架，不要求一次性把所有历史细节查完。为了尽快进入迁移演练，P0-1 先只保留以下最小闭环；其余内容作为上线前或对应功能上线前的补充审计。

本轮必须回答：

| 必须项 | 只回答什么问题 |
| --- | --- |
| 业务核心数据 | 账号/资料、人脉/关系、活动/报名、任务、日程/预约，以及本轮要上线的聊天/AI 数据是什么 |
| 存储位置 | 每类事实当前在哪个 PostgreSQL 表或 `orbit_records` collection；是否还有本地缓存或 legacy 来源 |
| 唯一权威 | 哪一个存储是 canonical；哪些只是 projection、缓存、推荐、mock 或兼容读取 |
| 写入/读取入口 | 核心 Web/API route、service/repository，以及 App 使用的 API contract |
| 归属与权限 | actor/account/workspace/organizer/participant 的 owner key 和最小可见范围 |
| 数据安全属性 | 稳定 ID、版本/幂等、软删除/状态、时间/时区；是否含 token、隐私正文或二进制引用 |
| 迁移决定 | 迁移、重建、暂不迁移或阻塞；每个阻塞必须有具体原因 |
| 基线证据 | 本地来源数量/范围与 Neon 空库 schema 差异；不导出完整业务正文 |

本轮暂不展开：逐一审计全部 API route、所有历史 legacy、完整 AI visibility 字段、非 P0 功能的外部服务合规细节、测试数据重建和二进制全量搬迁。它们只需要被标记为“后置 / 不迁移 / 是否影响本轮”，不阻塞最小矩阵。

精简版只要求交付一张矩阵：

`数据域 | canonical store | 当前写入入口 | 当前读取入口 | owner/权限 | ID/版本/删除 | 迁移决定 | 未决阻塞`

只要本轮核心数据逐行填完，且没有两个未解释的权威来源，P0-1 就可以结束并进入 P0-2。若发现来源冲突、用户归属不明、ID 无法稳定映射、权限无法证明或包含不应迁移的秘密，则该行标记为阻塞，不能用“先迁移再看”绕过。

### 第 3 步：建立 Neon 隔离环境并迁移演练

- 在 Neon 建立隔离分支或测试数据库；
- 执行 schema / migration 演练；
- 验证稳定 ID、actor / workspace 归属、权限和回滚；
- 先迁移一小组脱敏测试数据，再做完整迁移计划。

**输出物**：迁移演练记录、差异报告、回滚步骤和数据校验结果。

#### P0-2 执行记录（2026-09-15）

已在 Neon `orbit` 项目创建独立分支 `p0-2-migration-rehearsal-2026-09-15`（`br-curly-shadow-b31lyn7s`），父分支为 `production`，类型为 schema-only，不继承父分支数据，并设置 1 天自动清理。随后执行了仓库现有的核心、活动体验、活动分析、预约、名片摄入 v2 migration，并完成完整 `scripts/migrate-web-runtime.ts` 入口重跑。

验收结果：`public` 非系统基础表 61 张；五组迁移账本分别为 15、1、1、4、5 个版本；所有非账本业务表均为 0 行，未导入 seed 或业务数据。各分阶段入口和完整入口均可幂等重跑。详细表清单、空数据核对和回滚边界见 [P0-2 迁移演练记录](2026-09-15-p0-2-migration-rehearsal.md)。

因此 P0-2 的 schema/migration 演练通过；业务数据迁移、Web/API 切换和 Web/App 跨端回读仍属于后续 P0-3/P0-4。production schema-only apply 已在 P0-3 前置检查中完成，但不等同于业务数据迁移或正式上线。

### 第 4 步：切换 Web/API 并验证跨端读写

按“Neon → Web / API → App API 访问 → OAuth → AI / 外部服务”的顺序接通，每接通一层都做最小验证。

至少验证一次：Web 写入 Neon → App 通过 API 读取；App 通过 API 写入 Neon → Web 刷新读取。

**输出物**：环境变量名称清单、Neon 连接验证、服务健康记录、跨端读写回读记录、OAuth 验证、AI provider 验证。

#### P0-3 前置检查记录（2026-09-16）

已完成当前 Neon production 只读连接、production schema-only apply、迁移账本/零业务行验收、预览 `/api/health` 检查和 Web 类型检查；production `neondb.public` 当前有 61 张非系统表，尚无业务数据。完整证据见 [P0-3 正式切换前置检查](2026-09-16-p0-3-preflight.md)。

本轮没有把预览 health 或 schema-ready 误写成“正式上线”：现在 production deployment 已完成且 health/只读业务 API 已验证，但源库最新快照、分域迁移 manifest、正式备份恢复、业务数据迁移和 Web/App 双向回读仍未完成。

补充核查发现，Vercel `orbit` 已恢复 production deployment，正式 alias 为 `https://orbit-puce-kappa.vercel.app`；`/api/health` 返回 `mode=live`，只读 `/api/events/public` 返回 200 和空事件集。旧的 Preview/历史 alias 不再作为上线证据。

已将运行时配置写入 Vercel Production，并修正 `ORBIT_PUBLIC_ORIGIN`、`ORBIT_MODULE_MODE`、`ORBIT_FEATURE_MODE`、`ORBIT_EVENT_DATABASE_URL` 和 `CRON_SECRET`；production deployment 已发布并通过线上验证。

补充确认：本地存在两套可重建 mock/export 数据，以及 Web runtime 的 `defaultMockFixtures`。在补齐主办方账号、活动运营生命周期和 canonical Event Core 投影后，独立 Demo 实际校验为 8,365 条记录。它们可用于独立 Neon 测试/演示环境，不可冒充历史源库数据直接灌入 Production；详细数量和边界见 [P0-3 预检记录](2026-09-16-p0-3-preflight.md)。

已完成独立演示链路：在 Neon `orbit` 下创建 `orbit-demo-fixtures-2026-09-16` 分支（`br-cold-term-b31l12kv`），将可重建 fixture 写入 workspace `workspace:orbit-demo-fixtures`，并通过主办方账号、活动运营生命周期和 canonical Event Core backfill 校验 8,365 条记录。当前 Demo 具有 14 个 organizer、16 条 published canonical event rows、13 条公开活动、64 个活跃报名和 6 条取消历史；公开活动目录和 `event_signup_01` 的 owner / membership 已从 Neon 回读确认。最新 Preview 为 `https://orbit-19l2tw77g-liqys-projects-33c8ddec.vercel.app`，deployment `dpl_GonZxG6jitQL78axr6oWwz5wWYM8` 状态为 Ready。该链路只用于测试和演示，Production 仍保持业务数据为空，不能把它当作历史源库迁移结果。

### 第 5 步：建立隔离测试账号和云端测试数据

在选定的云端测试数据库或隔离 schema 中创建普通用户、主办方、交互用户和“小雨”账号，再用明确的数据归属建立活动、联系人、报名和日程数据。不要把本地 seed 当成线上已存在的测试数据。

**输出物**：不包含密码的测试账号清单、角色关系图、云端测试数据初始化步骤。

### 第 6 步：跑完整主流程并记录证据

每一步都记录输入、服务端结果、页面显示和刷新后回读。重点确认：

- Google 登录不绕过资料流程；
- 活动状态和报名人数来自一致的服务端事实；
- 报名完成后显示“已报名”；
- I ORBIT 只读取当前用户有权访问的数据；
- 日程 / To-do 在跨模块读取后仍属于正确用户。

**输出物**：端到端验收报告，包含账号角色、环境版本、测试记录、失败项和截图 / 日志证据。

### 第 7 步：上线判定

只有以下条件全部满足，才可以把这一轮标记为“上线准备完成”：

- 数据权威来源已确定；
- 正式数据库和线上服务连接已验证；
- OAuth 和必要外部服务已验证；
- 测试账号和数据可重复创建；
- 主流程成功跑通并能刷新回读；
- 已知失败项有明确的阻塞等级和负责人；
- 未把本地验证结果误写成远程生产已上线。

## 七、上线前最小验收清单

- [ ] 已明确生产只选 Neon 或 Supabase 其中一个作为云端权威数据库。
- [ ] Neon（如沿用）或 Supabase 的实例、环境和连接方式已记录并实际验证。
- [ ] 已用不暴露密钥的方式验证云端数据库连接、schema 和当前 Web/API 实际使用的数据库。
- [ ] 本地 PostgreSQL 健康检查通过，或已明确本地验证改用隔离云端环境。
- [ ] Web/API 健康检查通过，并使用已确认的数据源启动。
- [ ] Web / API 连接云端数据库，App 只通过同一套 API 访问。
- [ ] Neon、Supabase、本地数据库之间不存在同一业务数据的无规则双写。
- [ ] 人脉、活动、日程、To-do、用户资料和 AI 派生数据均有权威来源。
- [ ] mock / fixture 不会在上线环境静默替代正式数据。
- [ ] Google OAuth 配置完整，回调和部署环境一致。
- [ ] 新用户首次登录会补充必要的基础资料。
- [ ] 普通用户、主办方、交互用户和“小雨”账号可重复使用。
- [ ] 测试数据与真实生产数据隔离。
- [ ] 活动状态至少支持未开始、可报名、报名截止、已报名、已结束。
- [ ] 过期活动不能报名，未来可报名活动不能被错误阻止。
- [ ] 报名后详情、列表、人数和刷新回读一致。
- [ ] To-do / 日程只有一个事实来源。
- [ ] I ORBIT 的数据读取经过权限边界，不直接绕过服务层读库。
- [ ] AI 派生结果带输入来源、生成时间和失效 / 重算规则。
- [ ] 外部服务未配置或调用失败时，用户能看到真实失败状态。
- [ ] 线上验证证据与本地验证证据分开记录。

## 八、现在最需要做的三个决定

为了继续推进，先不讨论全部 30 项产品待办，只需要确定：

1. **本轮上线是否按最短闭环执行**：登录、资料、活动报名、人脉、I ORBIT、日程 / To-do；外部 Calendar 和小组件暂缓。
2. **是否确认 Neon 作为唯一云端数据库**：当前建议确认 Neon；如果 Neon 项目或连接不可用，再重新评估 Supabase，但不同时维护两套业务库。
3. **是否确认 P0 顺序**：先完成 Neon 最小连接确认，再做数据权威来源矩阵，之后才做迁移演练和 Web/App 跨端验收。

## 九、与原待办的对应关系

本文对应原文中的：

- P0-01：上线与数据架构梳理；
- P0-02：准备完整测试账号与测试数据；
- P0-03：重新跑完整注册到使用流程；
- P0-04：修复活动报名逻辑；
- 端到端验收清单中的线上部署、OAuth、数据库、权限和跨端回读要求。
