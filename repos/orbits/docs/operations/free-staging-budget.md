# 免费套餐的小型云端测试环境

后续增量：用户已批准围绕主账号扩充到30位联系人／10个活动，使用独立的只追加脚本及预算，不放宽下文空库初始化保护。详见[主测试账号与数据集](main-test-dataset.md)；下文2活动／3关系是原初始化快照。

2026-09-17；运行时代码基线 `cc26744d`。本环境只用合成数据，不依赖历史真实数据库或备份。

## 默认边界

- Neon：`orbit-staging-20260917` / `orange-forest-30108072`，独立项目，Free、PG16、新加坡。默认分支名 `production` 不表示原正式环境。
- Workspace：`workspace:orbit-small-staging-20260917`。
- Vercel：独立项目 `orbit-staging-20260917`，只发 Preview。旧 `orbit` Production 的数据库、数据和配置不动。
- 正式域名是 `https://www.orbitailink.com`（另有 `orbitailink.com`），只读核实绑定 `orbit` Production；不要将该域名指向本测试项目。
- 测试入口：[Preview 登录](https://orbit-staging-20260917-ktlfo1sjb-liqys-projects-33c8ddec.vercel.app/app/account/login)；[主办方后台](https://orbit-staging-20260917-ktlfo1sjb-liqys-projects-33c8ddec.vercel.app/app/events/10000000-0000-4000-8000-000000000001/operations)。账号 `organizer@orbit.example.test`；另外有 `participant.a@orbit.example.test`、`participant.b@orbit.example.test`、`empty@orbit.example.test`。密码读取私有配置的 `password` 字段，不能从正式账号复用。
- 新环境只配置自己的数据库、Auth secret、workspace、live 模式及读取诊断。**不复制正式模型、邮件、Blob 凭据**。
- 用 `vercel.staging.json` 发布，配置不包含 cron 或 Queue 订阅。当前是人工触发的低流量验收环境，不宣称云端 worker / AI 全流程已启用。

## 小数据而不是截断业务结果

4 个可登录账号：主办方、参与者 A、参与者 B、空白账号。主办方实际拥有 2 个 canonical 活动（一个发布、一个草稿），不是只有主办方名字。

3 个联系人和 3 条私有关系：待跟进、有明确目标的进行中、已归档；1 个有日期的跟进任务；6 条来源证据。共 28 条 orbit_records，另有活动、版本、别名、运营配置与报名规则等必要规范表记录。活动时间按初始化日加 14 天生成，过期后应显式创建新活动，不自动反复改期。

不导入批量历史活动、压力参与者、三个月日程、聊天历史、重复 AI artifacts、任务 attempts 或模型生成结果。原大型 fixtures 保留在代码中供本地回归，不导入云端；**本轮没有删除旧 Production 或用户本地数据**。

## 初始化与保护

私有配置由机器外置文件提供，格式为 `{"databaseUrl":"…","password":"…"}`，权限 0600；禁止提交仓库、截图或写入日志。当前私有目录 `/Users/li/.config/orbit/staging-20260917/`。

```sh
# 默认 dry-run：纯内存构建，不访问数据库
node --import tsx scripts/setup-minimal-staging.ts --config=/absolute/private/credentials.json
# 本地专用空库 orbit_staging_20260917
node --import tsx scripts/setup-minimal-staging.ts --config=/absolute/private/credentials.json --apply
# 只允许源码白名单内的新测试 Neon endpoint；非空 public schema 拒绝覆盖
node --import tsx scripts/setup-minimal-staging.ts --config=/absolute/private/credentials.json --cloud --apply
```

迁移与数据在一个事务内完成，失败回滚。脚本不读取 `.env.local`、不使用其他 DATABASE_URL、不提供强制覆盖或清库开关。账号经真实 auth service 创建/密码验证，关系通过最新生命周期 preflight，主办方 capability 正例和普通参与者拒绝反例在提交前验证。

硬限额：最多 80 条通用 seed 记录、128 KiB 序列化种子包、800 次初始化 SQL 调用、2 MiB 驱动解码后的返回 JSON；超过预算抛错并回滚。返回字节检查发生在该次查询返回后，不能撤销已发生的流量。此预算**只保护初始化命令**，不等于全站、账期或 Neon wire/billing 的硬限额。

本次实际：42,644 bytes seed、141 次 SQL 调用、46,567 bytes 返回 JSON估计。0 模型请求、0 外部通知、0 自动后台任务。

补查后通过既有 canonical activation 函数初始化已发布活动的空报名基线：另外7次SQL调用、434 bytes返回；不是伪造历史报名。初始化脚本已包含该步骤。Preview 实际登录、主办方后台加载运营配置、目录只显示1个已发布活动（草稿不公开）通过；19/19本地定向回归、build typecheck通过。运行时版本仍为 `cc26744d`，后续提交仅修改初始化/测试/操作文档，不需重复消耗构建额度。

已知边界：公开活动详情仍有旧展示占位（20席、匿名 Organizer 昵称），实际本次报名 policy 为8席；这是现有 Web 展示映射未接完整 canonical/policy，不是要增加12个假参与者或改数据库容量来迁就页面。该展示缺口需单独按契约修复后再标记详情全量验收。本次只验证登录、目录、主办方运营后台，不把公开详情占位、AI、worker或原生标记闭环。

## 后续操作必须遵守

1. 批量回归、压力和反例全部本地 PostgreSQL；云端只做必要的单次冒烟，不运行全量 fixtures、全库导出或循环重试。
2. 每轮云端前查看 Neon 项目用量；先写本轮动作、预期请求和返回量。到免费月流量的 50% 停止批量测试，80% 暂停非必要云端验证；这是人工操作阈值，不是已实现监控自动断路器。无额度信息时只推进本地工作。
3. 不安装“保活”、心跳轮询或无限 worker。启用真实 AI/Queue 前，单独配置测试密钥、单次任务上限、重试与剩余预算；不继承正式凭据。
4. 只清理确定归属本测试 workspace 的合成数据，先检查引用及必要版本记录；不可按名称相似全库删除，不删除角色、账号、来源证据或不可变审计链来凑数。
5. App 只切换到本测试 API，不能直连数据库；本轮没有切换 App 配置。Preview 的 Vercel 访问保护可能需要额外授权方式，未解决前不能标记原生联调完成。

后续读取优化仍包括完整 SQL 分页与两端消费、bootstrap 最小化、dashboard SQL 聚合；不要用静默 LIMIT 伪造低流量或完整结果。
