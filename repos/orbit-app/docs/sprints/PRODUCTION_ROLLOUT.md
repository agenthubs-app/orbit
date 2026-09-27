# 生产上线清单（Sprint 0099 起）

本页汇总从 Sprint 0099 起，每个 Sprint 上生产时需要人工执行的步骤。**这里列出的每一步都要用户确认后才执行**。协调者和子代理只在本地库、测试库上执行，不连接生产库，也不部署。

每个 Sprint 的完整上线说明见各自的 REPORT。本页只保留顺序和要点。新的 Sprint 合并后，由协调者追加到本页。

## 总顺序原则

1. **先迁移、后部署**：先让生产库具备新表、新列、新索引，再部署会用到它们的代码。个别步骤要求反过来，下文单独注明。
2. **删除类操作**一律按这个顺序做：只读统计 → 导出备份 → 执行 → 再统计，确认结果为 0。
3. **会改变旧版 App 行为的配置**，要等新版 App 发布之后再打开。

## 已合并、待上线

| Sprint | 步骤 | 前置 / 注意 |
|---|---|---|
| 0099 请求小票 | ① 对生产库执行 `npm run db:migrate:live`，建 `orbit_read_receipts`；② 部署；③ 查看前几张小票的 `status_code`、`response_bytes`、路由方法是否为空（Vercel 上的 Node http 诊断事件没有验证过） | 先部署后迁移也可以，但表建好之前每个请求都会打一条警告；紧急关闭设 `ORBIT_READ_RECEIPTS=0` |
| 0099 修复（`ec308129a`） | 随 0104 一起部署：只修了 dev 编译，不改变生产行为 | — |
| 0100 汇总、对账、报警 | ① `db:migrate:live`，建 4 张表（和 0099 同一条命令）；② **先把管理员手机上的 App 更新到 0104 之后的版本**；③ 配置 `ORBIT_READ_COST_ADMIN_ACCOUNT_IDS`，填生产环境 agenthubs 账号的编号；④ 可选：配置 `NEON_API_KEY`、`NEON_PROJECT_ID`，然后看对账表 `neon_status` 是否为 `ok`；⑤ 可选：配置 `AXIOM_TOKEN`、`AXIOM_DATASET` | ②③ 的顺序不能反：旧版 App 碰到未知通知类型时整个收件箱会解析失败，0104 已经修好 |
| 0101 看板改由数据库算 | 确认 Neon 有 ICU 排序规则：`select 1 from pg_collation where collname='und-x-icu'` | 没有 ICU 时结果仍然正确，只是读得多，日志会出现 `dashboard_activity_collation_missing`；建议尽快发新版 App（带 `roleCounts`） |
| 0102 看板快照 | ① 只读确认生产 `orbit_records` 有没有 `sync_revision` 列；② 有的话执行 `npm run db:migrate:dashboard-graph-version`，大表建议手工改成 `create index concurrently`；没有的话等 0108（0108 的迁移已包含这个索引） | 没有这一列时代码会自动退回整图计算 |
| 0103 AI 轨迹 | **部署前**执行一次 `npm run db:migrate:agent-run-targets`，给旧行补上所属运行编号；只做 UPDATE，数据多时分批。旧代码不依赖这一列，所以先回填没有副作用；部署后再回填，会有一段时间旧运行看不到自己的动作和回执（Codex 审阅意见） | **0111 在生产执行之前，这一步必须已经完成** |
| 0121 Codex 审阅修复 | ① **部署前**对生产库执行 `npm run db:migrate:live`：给 `orbit_read_cost_reconciliation` 加两列 `neon_attempts`、`neon_retry_after`（`add column if not exists`，只加列，可重复执行）；② 部署；③ 可选：要启用 Neon 对账，除 `NEON_API_KEY`、`NEON_PROJECT_ID` 外**新增 `NEON_ORG_ID`**（v2 用量接口必填），且账号须是 Launch / Scale / Agent / Business / Enterprise 套餐，否则记为 `unavailable`（`plan_unsupported`）；配置后，最近 13 天里失败或未配置的日期会自动补取（每天最多 6 次，间隔 1、2、4、8、16 小时）；④ 部署后查看管理页：读取量报警改回设计原规则，小接口翻倍也会报警，报警可能比以前多；⑤ `ORBIT_READ_RECEIPTS_SAMPLE_RATE` 现在也作用于后台任务和未归属读取 | ① 必须先于部署：新代码写这两列，列不存在时读取量汇总任务会失败（其他功能不受影响）。**AI 人脉分析报告会一次性全部显示「需要更新」**：版本号改为同时绑定关系图和关系目标等资料，旧报告的版本号不再相等，用户重新生成一次即可。旧 App 兼容：服务端对没有声明 `capabilities=roleCounts` 的请求返回完整联系人列表，所以服务端与新 App 的发布顺序不限；旧 App 仍在使用期间，这个接口会多读完整联系人列表。Agent 账本分页依赖 0103 的目标回填（见上行），不需要新迁移 |
| 0104 旧 chat 退役 | 部署后先执行 `npm run db:cleanup:legacy-chat` 预演看行数；确认后再执行 `-- --apply --confirm-remote=<workspace id>` | 不执行不影响功能 |
| 0108 同步流水号 | ① **先部署**含 `0376a895d` 的代码（笔记、待办、个人日程的写入都先取提交顺序锁；库里还没有严格版时锁是无害的空锁），确认三类写入正常；② 只读检查：`ORBIT_DATABASE_TARGET=cloud npm run db:migrate:sync-revision -- --check`（只打印状态，不写库），或 REPORT 第 11 节的只读 SQL；③ 低峰执行 `npm run db:migrate:sync-revision -- --batch-size=1000`（加列、分批回填、触发器、NOT NULL 用 NOT VALID + VALIDATE、索引 CONCURRENTLY，可重复执行）；④ 再 `--check`，应为 `state":"strict"`、`nullRevisions` 为 0；⑤ 冒烟：新建笔记、待办、日程各一条，都返回 201 | **顺序不能反**：先迁移而线上还是旧代码，三类写入全部报 55P03。回滚：`--rollback=relax`（写入不再要求锁，仍分配流水号），最后手段 `--rollback=disable`；两档之后重跑迁移都能回到严格版。本迁移已包含 0102 的 `db:migrate:dashboard-graph-version`，不必单独执行。已发布的 App 会把三类数据整类重抄一次（同步页 schema 升到 2），数据量很小 |
| 0123 已知失败清理 | 无迁移；约见面接口并发编辑时，输的一方从 500 变为 409 `APPOINTMENT_CONFLICT` | 客户端按冲突处理、重读后重试 |
| 0126 全局回归修复 | **部署前**只读确认：`select collversion from pg_collation where collname='und-x-icu'` 应为 `153.136`；然后部署 | 去掉 Node 25.6.0 钉死后，首页关系跟进、关系待办分页在 Vercel 的 LTS Node 上恢复工作；collversion 不符时这三个读取器按设计拒绝服务。联系人搜索快路径改为检查 Unicode 版本 |

## 后续 Sprint 预告（合并后在上表补充具体命令）

| Sprint | 预计的生产步骤 |
|---|---|
| 0109 | 只读统计关系沟通五类集合的生产行数；建三张表并搬迁数据（可重复执行）；旧集合保留 |
| 0111 | 保留期任务随部署自动运行；存量清理：预演统计 → 导出备份 → 删除 → 再预演，确认为 0 |
| 0113 | 活动专用表加 `sync_revision` 并回填；通用 upsert 行为改变（不再清空主人） |
| 0114 | 补写主人：预演 → 导出备份 → 执行 → 再预演；**要在 0116 上线之前完成** |
