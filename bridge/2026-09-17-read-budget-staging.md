# BR-027 — 读取成本优化与独立免费测试环境

更新：2026-09-17。基线 `78a06c50`；本轮代码和记录同次提交。Web/API 读取改造第一批已在本地验证；App 不改契约、未切换连接；不是全量读取治理或云端业务验收完成。

## 已确认事实与环境决定

- 原项目 `orbit` / `wispy-smoke-15186904` 在 Neon 控制台明确显示月度 Free 限额暂停；此前项目网络传出为 7.59 GB，存储仅 61.49 MB。不能将组织合计流量当成 orbit 的项目用量，也不能据此把全部消耗归因于某次测试。
- 用户选择“同账号新建独立 Neon 测试项目”。已创建 `orbit-staging-20260917` / `orange-forest-30108072`，AWS Singapore、PostgreSQL 16、Free；Neon Auth 未开启，未升级、注册新账号或迁移到 Supabase。
- 新库默认分支 `production` / `br-restless-wind-az8p5o5s` **仅是新测试项目的分支名**，不是原应用 Production。原项目、Vercel Production 环境变量、旧测试记录、关系与密码均未修改。
- 只读实际 SQL 成功（227ms、1行）：数据库 `neondb`，版本 `16.15`，public 表数 `0`。因此“项目已创建且 SQL 可用”，不等于已迁移、seed、登录或联调成功。没有导入控制台自带示例表。
- [测试项目](https://console.neon.tech/app/projects/orange-forest-30108072/branches/br-restless-wind-az8p5o5s)。记录不包含凭据。

## 第一批读取改造

1. 联系人详情和行业修改授权：在 SQL 侧按 workspace、actor、contactId 选关系/私有详情 key，然后读取精确记录；保留历史 accountId 归属、owner 拒绝、生命周期版本/pending 与重复 canonical 冲突，不以取第一条掩盖重复。
2. Bootstrap/dashboard：SQL 显式字段投影，不传回未消费的大 payload；合并同一 provider、同一 actor 正在执行的重复查询，完成/失败后立即移除，不是跨请求永久缓存。保持原记录集合与计数，不直接加 LIMIT 隐藏数据。
3. 诊断：PG 与事务客户端可选 `ORBIT_PG_READ_METRICS=1` 或 callback，只记录查询类别/数、行数、估计 JSON 字节、耗时和失败标志；默认关闭，不记录 SQL、参数、正文、actor 或连接串，不追加数据库查询；observer 同步/异步失败不破坏业务查询。
4. `GET /api/contacts` 透传显式 limit/cursor，无 limit 的旧调用仍完整返回。尚未把所有 Web/App 列表改成分页消费。

## 验证与限制

- 所有自动化 SQL 测试使用本机独立 PostgreSQL，随机 schema，测试结束只删除自己的 schema。未用新旧 Neon 跑批量测试。
- 详情基准同一结果：旧实现 203行/3,709,006字节 → scoped 5行/2,409字节；无关数据从200条增至2,000条仍为5行/2,409字节。合成数据只是放大读取缺陷，不是现实用户节省率。
- 投影合成基准 84,959 → 5,899字节，完整返回6行。这里与诊断的字节均是驱动解码后 JSON 估计，非 Neon wire/billing；两种估计是否包含数组标点也不同，不应混作账单。
- Bootstrap/dashboard 仍返回全部匹配行，数据规模增大时传输会继续增长；这不是最终 SQL 聚合/首屏懒加载方案。旧内存/注入式 store fallback 仍保留原读取路径。
- 生成 fixture 首次严格顺序比较发现旧 SQL 同时间项无稳定 tie-breaker；补“全字段集合一致”与“独立排序键下严格顺序一致”两层验证，未假称旧排序稳定。
- 最终冻结组合回归 **310/310，零失败/跳过**，包含真实本地 PostgreSQL、生成 fixture、HTTP、页面、事务与活动测试；Web 完整 typecheck 与 diff-check 通过。早期并发合并红测试和并列排序差异日志保留。
- 图分析联系人入口与共享 PG 边界有 CRITICAL 风险，回归覆盖详情/行业/笔记/重复合并、生命周期、事务、活动与 bootstrap/dashboard。不因局部测试通过认定原生/Production 已验收。
- 证据目录：`/tmp/orbit-read-optimization.uMtWe9`；模块说明见 [联系人读取预算](../repos/orbits/features/contacts/READ_BUDGET.md)及 [PG 用量诊断](../repos/orbits/docs/operations/postgres-read-metrics.md)。

## 后续必要步骤（不要求购买套餐或历史真实数据）

### 2026-09-17 小数据环境进展

- 新 Neon 空库已用既有迁移链和新小型 initializer 一次事务导入成功：4 个真实可登录的合成账号、2 个 canonical 活动、3 个联系人/关系、1 个带日期的跟进任务、6 条证据；orbit_records 共 28 条，不导入压力/聊天/AI历史。主办方所有权与普通参与者拒绝反例通过，关系符合最新生命周期 preflight。
- 种子42,644 bytes、141次 SQL调用、返回JSON估计46,567 bytes；不等于 Neon 计费字节。本地重复初始化拒绝覆盖；云端没有执行删除、全库导出或全量测试。初始化硬限额与后续人工免费额度阈值见[小型测试环境操作规程](../repos/orbits/docs/operations/free-staging-budget.md)。
- 独立 Vercel 项目 `orbit-staging-20260917` / `prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt`；仅 Preview 配置新库、独立 Auth、workspace/live/读取诊断，无旧 Production 模型、邮件、Blob密钥。`vercel.staging.json` 不含定时/队列订阅，region sin1。模型与worker全流程不在本次启用范围。
- Vercel 初次默认 deploy 意外自动标记为本测试项目 Production，且未使用仅 Preview 的配置；已改为显式 `--target preview`，撤除首次不可用部署。旧 `orbit` Production 从未变更。后续不得只依赖省略 `--prod` 来保证 Preview。
- 本地小种子/生命周期/PostgreSQL投影回归18/18，零失败/跳过；Web build typecheck通过。新增脚本图影响 LOW（只影响新 CLI），不修改现有 Web/App 业务函数。全站读取治理未完成，不能用“小样本运行成功”替代规模上限验证。

下列列表保留完整后续范围；第1项小型 seed 已完成，其余以实际验证记录为准。

1. 已完成：新项目独立连接配置 → 既有迁移 → 最小合成测试数据/可登录账号 → 关系一致性与主办方权限检查；不覆盖旧 Production，不把缺历史真实数据当阻塞。
2. 优化版本接独立 Web/API 测试部署，App 使用同一测试 API；不要只换其中一个进程的数据库，后台 worker 也必须环境隔离。之后补报名/匹配/发布/交换/初始化跨端验收，模型费仅沿用此前剩余额度。
3. 联系人列表：先统一搜索语义，再实现 SQL 过滤/计数/全局筛选项及稳定分页，连同 Web/App 下一页消费一起改。旧 `search_text` 预过滤和 mapper 的关系摘要/下一步/证据搜索不等价；不能单用 search_text 冒充完全一致，也不能默认20条却没有下一页。
4. Bootstrap 拆最小身份/配置与业务懒加载；dashboard 改 SQL 聚合＋有界明细。保留现有统计、权限和 provenance，不以截断记录制造低流量。
5. 在测试环境短期开启诊断，检查每次用户操作的查询数/返回行/估计字节与 Neon 实际用量增量，再按证据决定缓存、索引及 worker 轮询频率。严禁为了验收反复跑云端全量扫描。

免费额度规则参考：[Neon 官方 FAQ](https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md)（项目级月流量、按账期恢复）；[Supabase egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)（免费额度仍有限，换供应商不解决过量读取）。不承诺免费套餐可无限承载正式业务。
