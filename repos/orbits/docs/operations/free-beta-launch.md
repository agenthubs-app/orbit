# Orbit 免费封闭测试上线任务表

更新日期：2026-09-06。目标：先让少量测试用户通过稳定公网地址使用 Web/API，再接入 iOS。

当前状态：本地生产构建已通过；完整数据库备份与本地恢复演练已通过；全量回归仍在整顿，尚未部署到远程，也未迁移远程数据库。

## 1. 执行顺序与验收门槛

| 阶段 | 工作 | 验收标准 | 当前状态 |
| --- | --- | --- | --- |
| 0 | 保存已有工作 | 已有代码、设计、文档按内容提交 | 已完成，基线 `76b062d02` |
| 1A | 修复生产构建 | Node 22 下生产编译、应用及运维脚本类型检查、静态页面生成通过 | 已完成 |
| 1B | 本地生产模式冒烟 | 健康检查、登录页、私有页面/API 认证、开发页面隔离通过 | 已完成 |
| 1C | 回归基线整顿 | 定位并处理全量测试失败；明确测试库与产品数据边界 | 进行中，两批分别修复 5 项、14 项回归；最新显式隔离库全量运行仍有 31 项失败 |
| 2 | 本地数据库备份与恢复演练 | 只备份 `public`，验证归档、恢复及表数据一致性 | 已完成本地快照恢复验证；切换前须重新备份 |
| 3 | 创建远程 PostgreSQL | Supabase 免费项目、维护连接和运行连接就绪 | 未开始 |
| 4 | 数据迁移 | 迁移所有应用表；逐表和逐 collection 校验；保留可恢复备份 | 未开始 |
| 5 | 生产环境配置 | 独立认证密钥、Google OAuth、AI、数据库、CORS 和正式域名配置 | 未开始 |
| 6 | Netlify 部署验收 | OpenNext 打包成功；远程登录、业务读取、账号隔离、AI 流式回复通过 | 未开始 |
| 7 | 后台任务 | 单次限时任务执行、幂等、失败记录与调度验证 | 未开始 |
| 8 | iOS 接入 | 正式 API 地址、密码/Google 登录、核心页面及历史记录验证 | 未开始 |
| 9 | 封闭测试放行 | 上述阻塞关闭，备份、额度监控、回滚流程就绪 | 未开始 |

## 2. 本轮已完成的构建修复

- `app/api/mobile/contacts-dashboard/route.ts` 只导出合法的 Next.js 路由字段。依赖注入和错误映射移到同目录 `handler.ts`。
- 成功分支使用 `result.success === true`，兼容当前非 strict TypeScript 配置下的联合类型收窄；认证、actor 和响应结构不变。
- 行业迁移脚本先保存已检查的组织名称，再在回调里匹配后缀，消除 `unknown.endsWith` 类型错误。本轮未执行真实数据迁移。
- `next.config.js` 将文件追踪根目录固定在应用目录，避免受开发机主目录的其他 lockfile 影响。
- `.nvmrc` 和 `netlify.toml` 声明 Node 22；验证版本为 `22.23.2`。
- 生产构建使用 `tsconfig.build.json`，继承现有编译选项，只排除 `tests/`；应用、共享代码、运维脚本仍接受类型检查。
- `npm run typecheck` 保留原来的全量检查。没有启用 `ignoreBuildErrors`，也没有删除或放宽既有测试。

生产与全量检查分开是范围划分，不代表测试债务已解决。正式发布仍受 1C 门槛约束。

## 3. 已执行的验证

| 检查 | 结果 |
| --- | --- |
| Node 22 `npm run build` | 通过，包含 TypeScript、43 个静态生成任务和构建追踪 |
| 人脉总览 schema、服务、路由，CORS，行业迁移单测 | 16/16 通过 |
| 生产健康接口 | HTTP 200，`mode=live` |
| 生产登录页 | HTTP 200 |
| 未登录访问移动人脉总览 API | HTTP 401 |
| 生产开发页面隔离测试 | 57 个开发路径均返回 404 |
| 生产私有页面/API 边界测试 | 私有页面跳转登录，API 返回 401 |
| Node 22 首轮全量测试（默认环境） | 2,238 项：2,174 通过，45 失败，19 跳过 |
| Node 22 首批显式隔离库全量测试 | 2,238 项：2,191 通过，46 失败，1 跳过；模式与默认环境不同，不能直接比较失败数 |
| Node 22 第二批显式隔离库全量测试 | 2,238 项：2,206 通过，31 失败，1 跳过；与首批使用相同连接覆盖方式 |
| Node 22 第三批显式隔离库全量测试 | 2,238 项：2,215 通过，22 失败，1 跳过；本轮修复 9 项，未改变连接覆盖方式 |
| 全量 TypeScript | 103 项错误，全部位于测试代码；低于已有 110 项上限，但仍需逐步清理 |
| TypeScript ratchet 与语法检查 | 2/2 通过，确认应用代码零类型错误且测试语法无错误 |

生产冒烟服务使用临时本地端口，验收后已关闭。当前证据不覆盖远程 Netlify 运行、Google 真实授权、已登录业务流程或远程数据完整性。

## 4. 下一批回归问题

下表是失败分组，不是已确认的根因。逐项区分实现缺陷、测试数据前提和过时断言；不能直接删测试或提高阈值。

| 优先级 | 范围 | 代表测试 |
| --- | --- | --- |
| P1 | 数据库迁移、事务与测试库前提 | `event-canonical-membership-*.test.ts`、`event-profile-contract-repair-*.test.ts`、`postgres-live-record-storage.test.ts` |
| P1 | 账号归属、联系人读取和活动报名 | `app-contacts-dashboard-account-scope.test.ts`、`app-contacts-subroutes-live-route-services.test.ts`、`app-event-registration-guide.test.tsx`、`app-register-live-route-services.test.ts` |
| P1 | 共享契约与非测试代码类型边界 | `contract-surface.test.ts`、`orbit-typecheck-ratchet.test.ts` |
| P2 | AI 草稿及语言、联系人展示和活动图片 | `ai-email-draft-service.test.ts`、`orbit-agent-gemini-live.test.ts`、联系人详情与活动页面测试 |
| P2 | 页面清单、导航与视觉约束 | `full-product-functional-audit.test.ts`、`product-surface-manifest.test.ts`、`auth-state-consistency.test.ts`、`orbit-scale-ratchet.test.ts`、`orbit-z-scale.test.ts` |

数据库相关回归应先建立专用测试数据库，避免把当前小雨演示数据当作可重复的测试前提。备份必须先于任何修复性数据写入。

### 2026-09-06 首批回归修复

- 3 项旧版数据库测试原先直接连接日常数据库，并要求迁移版本不超过 v11；当前数据库已是 v15，因此测试前提已经失效。现在在唯一临时 schema 中执行真实的 v1-v11 迁移，保留缺少 v12 台账时拒绝 apply、先检查就绪状态再解析 manifest、CLI dry-run/apply 不写入数据的断言。
- 测试夹具在初始化前注册清理回调，即使建表或测试断言失败，也会关闭连接并删除自己创建的 schema；不会降级、删除或复制主库数据。
- v11 CLI 只读测试先创建独立的活动、canonical membership、participant profile 和 legacy registration，确认快照涉及的每张业务表非空，再验证 dry-run 和被拒绝的 apply 都完整保留这些记录。
- 完整迁移台账测试不再把最新版本写死为 v13，仍验证 v12 只执行一次，以及不可变性、约束、事务回滚和重复执行。
- 通用记录迁移测试不再假设只有 3 次 SQL 调用，逐一核实每项迁移的名称和 checksum 都发送给 SQL client，防止新增迁移被漏执行。
- CLI 测试环境显式设置 `NODE_ENV=test`，修复 4 项类型错误；全量 TypeScript 从 113 降至 109 项错误，全部在测试目录内，现有 110 项上限未放宽。全量类型检查仍非零错误，不等于已经清空类型债务。
- 首批相关 PostgreSQL 和 CLI 回归 15/15 通过，未修改生产代码。

未解决的数据库测试前提：profile-contract-repair 测试要求本机已有“24-target reviewed fixture”的历史修复台账；本次盘点 `public.event_ops_data_repair_runs` 为 0 行。后续应生成独立、确定性的修复样本，不能向日常数据库植入测试缺陷，也不能把这些测试静默跳过。

全量回归必须只覆盖数据库连接变量到测试副本，不要在测试父进程统一加载整份 `.env`；否则其中的 live 模式会改变原本使用 mock 的测试。各测试原有的 `loadLocalEnv()` 和模式选择应保留。

显式隔离库全量运行耗时约 139 秒，保留默认模式，仅为该进程覆盖 3 个数据库连接变量；结果为 2,191 通过、46 失败、1 跳过。相比首轮，18 个原先跳过的用例被启用。部分测试直接假设连接未配置（如 account/permission/event factory），另一些只删除 `ORBIT_EVENT_DATABASE_URL`、未清理备用连接变量（如 chat unavailable）。这些环境前提必须显式化后才能建立可比较的全量基线；本次没有把它们记为已修复，也没有取消测试。source-reader 并发一致性和 outbox lease 测试也在这次全量运行中失败，需单独复现以区分业务缺陷与并发时序问题。

复跑前曾因父进程加载整份 `.env` 导致 mock 用例切换为 live，该次运行已中止，不计入上表。修复后的显式隔离库运行仍未通过，阶段 1C 和正式发布门槛继续保持阻塞。

### 2026-09-06 第二批回归修复

- 4 项“未配置数据库”测试现在明确清空三种连接变量，并在测试结束后恢复。保留原有失败状态，额外核实 account/permission 的准确错误码。相关 32 项测试在三种连接都存在、三种连接都不存在的两种环境下均通过。
- 8 项报名回归不再依赖日常数据库中的演示活动。两个测试文件各建独立 schema 和 workspace，写入真实 Event Core head/version、ID alias 和 public-code alias；覆盖未来已发布活动、已结束活动、草稿活动和无效邀请码。日期相对执行时间生成，避免日历推进后样本过期。
- 报名样本显式禁用三种 AI API key，并拦截 `fetch`、断言外网调用次数为 0。17 项报名测试全部通过，结束后 `registration_catalogue_*` schema 数量为 0；未改日常活动记录或实际报名逻辑。
- 2 项联系人页面旧断言误要求直接使用 Auth.js user ID。改为明确要求先解析 canonical account actor，再以 `actor.id` 读取联系人或介绍记录，且禁止回退到原始 session user ID；账户归属、跨账户隔离和页面组合相关 25 项测试通过。没有修改认证实现。
- 通过 await mock service 结果和 Next.js 的 redirect error 类型守卫，消除另 6 项测试类型错误：109 降至 103。没有加入 `any`、关闭检查或放宽门槛。
- 相同隔离库配置下，全量结果为 2,206 通过、31 失败、1 跳过，约 85 秒。本轮明确修复 14 项；outbox lease 用例这次通过但此前失败，尚未归类为已修复。
- 独立复核进程因本机权限错误未能启动；已进行本地差异审查及上述执行验证，不声称获得了本轮独立审查结论。

剩余 snapshot-reader 失败已单独复现：样本调用 `registerCanonicalParticipant` 时触发 `EVENT_REGISTRATION_PROFILE_EDIT_DEADLINE_PASSED`，其配置固定为 2026-08-20，尚未执行到并发一致性断言。后续应修正整个样本时间线，不应放宽生产截止日期校验。24-target profile-repair 历史台账依赖、AI 草稿、活动生命周期展示、共享契约和页面审计失败仍待处理。

### 2026-09-06 第三批回归修复

- snapshot-reader 的交互报名样本改用 PostgreSQL 当前时间推导未来活动窗口，活动 head/version 和运营配置保持一致。保留历史导入记录的固定时间、生产截止规则及并发快照断言；相关 4 项测试通过。
- profile-contract-repair 的 apply 和 CLI 测试不再查询日常数据库的历史修复台账。每次在唯一临时 schema 中执行真实迁移，生成 2 个活动、26 份报名及 legacy 记录，再注入 24 份空答案缺陷；另外 2 份正常资料作为不应修改的对照。
- 保留 9 个事务写入阶段的故障注入回滚、同 run/同 plan 并发、SQLSTATE 重试及重试耗尽、配置/审计/版本/生命周期/来源/回答漂移、修复后合法编辑的重放，以及 adaptive/legacy 回答、缺省镜像、再次取消和 admission 来源保留断言。9 项 apply/CLI 测试通过，未降低目标数量或跳过测试。
- CLI dry-run 也改用独立样本，仍验证只读和敏感输入不泄露。样本准备失败时会关闭连接并清理自身 schema；不会向主库注入缺陷。
- 补充正常资料的 head/version 完整快照断言后，最终定向复跑 13/13 通过，运行前后的测试 schema 清单一致，没有新增遗留 schema。
- 全量结果为 2,215 通过、22 失败、1 跳过，约 81 秒。全量 TypeScript 仍有 103 项测试错误，生产代码及本轮修改文件无类型错误；没有提高已有上限。
- 独立初审未发现问题；补充断言的复审指出只检查当前版本会漏掉误追加的历史版本，已改为对正常资料的所有版本及 head 分别做完整快照。主库 48 张表的行数和全行摘要按原备份算法复核一致；没有进行主库修复、远程上传或部署。

阶段 1C 仍未通过。剩余 22 项涉及 AI 草稿/trace、活动 seed 与生命周期展示、联系人展示、共享契约、页面清单审计及导航/视觉约束；其中跨客户端契约和 harness 审计需遵守各自的修改边界，不能通过放宽断言解除发布门槛。

## 5. 后续数据库迁移要求

上一轮审查发现主连接指向本地 PostgreSQL。迁移前重新确认连接目标和当前数据量，不沿用旧统计作为迁移验收结果。

1. 盘点 `public` 下的表、行数、关键 collection、扩展和迁移版本。
2. 生成完整 `public` schema 的 PostgreSQL custom-format 备份，保存在已忽略的备份目录，限制文件权限，并记录校验和。
3. 在独立临时数据库验证恢复，校验主外键约束、逐表数量和关键记录。
4. Supabase 分别提供维护连接与 transaction pooler 运行连接；保存到本地忽略的环境配置或平台密钥管理，不写进文档、Git 或聊天。
5. 对空远程库先建立 schema，再恢复数据；恢复流程必须先做兼容性试验，不能直接重复创建 Supabase 自带对象。
6. 不迁移本地 `profile_repair_operator_cli_*` 等测试 schema。
7. 不使用现有 `sync-cloud-records.ts` 做上传：它的方向是云端到本地。
8. 暂停切换期间的写入，完成最后一次备份、迁移与校验后统一切换 Web/API。

### 已完成的本地恢复演练

- 时间：2026-09-06，源库 `orbit_events`，PostgreSQL 18.3。
- 范围：只导出 `public`，共 48 张表，其中 15 张非空；`orbit_records` 8,855 行，active 8,177 行。排除 6 个遗留 `profile_repair_operator_cli_*` schema，没有删除这些旧 schema。
- 归档：根工作区已忽略目录 `.artifacts/db-backups/20260906T104748487Z/public.dump`，custom format，900,794 字节；文件权限 `0600`，本次备份子目录 `0700`。
- SHA-256：`c7cacf9892c59526d5aae914714f8470a1371ed216445c0a4bdf6057423492aa`。
- 恢复库：`orbit_beta_verify_20260906t104748487z`。使用 `--exit-on-error --single-transaction --no-owner --no-privileges` 恢复，48 张表的行数及全行内容摘要全部一致，758 个约束的定义和验证状态全部一致。
- 首次恢复因空数据库自带 `public` schema 与归档中的 `CREATE SCHEMA public` 冲突而回滚；确认新副本没有表后，仅删除副本的空 `public` 并重试成功。主库未执行这项操作。
- 详细逐表校验结果在同目录 `verification.json`，同为 `0600`；归档和校验文件都未提交 Git，也未上传。
- 本轮测试期间另行只读复核源库，48 张表的行数和全行摘要仍与备份校验结果一致。
- 恢复库后续用于回归测试，不再视为长期只读副本；需要干净状态时，从保留的归档恢复到新的临时库。此演练不替代 Supabase 目标库的权限、版本和平台对象兼容性验证。

## 6. Netlify 配置准备

应用目录下已添加 `netlify.toml`，构建命令为 `npm run build`，发布目录为 `.next`，Node 版本为 22。

从应用目录执行 CLI；如果使用根仓库的远程构建，将站点 Base directory 设置为 `repos/orbits`，再核实实际读取的配置文件。

以下步骤尚未执行：Netlify 账号关联、OpenNext 适配器打包、环境变量配置、上传、域名和线上验证。普通 `next build` 成功不等于 OpenNext 打包成功。特别检查现有 `proxy.ts -> auth.ts` 的认证依赖是否满足平台 Middleware 限制。

需要在平台密钥管理中配置数据库连接、workspace、独立 `AUTH_SECRET`、Google OAuth、AI 密钥及模型、worker secret，以及精确的公开域名和 CORS origin。仅 iOS 的 API base URL 可以放入 `EXPO_PUBLIC_*`。

私有组织仓库的免费连接权限应在账号中实际验证；必要时使用 CLI 手动部署，不更改仓库公开性。

## 7. 免费服务与功能边界

- 目标架构沿用已选方案：Netlify Web/API + Supabase PostgreSQL + 现有 DeepSeek。
- 账号创建时再次核实免费额度、地区、休眠、服务条款和备份能力；本文件不把免费服务视为有 SLA 的正式生产资源。
- 无限循环 Worker 不直接部署为 Serverless Function。调度改造完成前，界面不能承诺尚未启用的自动提醒或自动执行。
- iOS 的公网测试依赖生产 API；外部分发和推送还需要对应的 Apple/Expo 配置。

参考：[Next.js 自定义 TypeScript 配置](https://nextjs.org/docs/app/api-reference/config/typescript#custom-tsconfig-path)、[Netlify Next.js 支持与限制](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)。
