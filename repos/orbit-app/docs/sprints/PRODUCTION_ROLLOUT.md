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
| 0102 看板快照 | ① 只读确认生产 `orbit_records` 有没有 `sync_revision` 列；② 有的话执行 `npm run db:migrate:dashboard-graph-version`，大表建议手工改成 `create index concurrently`；没有的话等 0108 | 没有这一列时代码会自动退回整图计算 |
| 0103 AI 轨迹 | **部署前**执行一次 `npm run db:migrate:agent-run-targets`，给旧行补上所属运行编号；只做 UPDATE，数据多时分批。旧代码不依赖这一列，所以先回填没有副作用；部署后再回填，会有一段时间旧运行看不到自己的动作和回执（Codex 审阅意见） | **0111 在生产执行之前，这一步必须已经完成** |
| 0121 Codex 审阅修复 | 合并后补充：Neon 用量接口所需的密钥与套餐；旧 App 能力声明带来的兼容顺序 | — |
| 0104 旧 chat 退役 | 部署后先执行 `npm run db:cleanup:legacy-chat` 预演看行数；确认后再执行 `-- --apply --confirm-remote=<workspace id>` | 不执行不影响功能 |

## 后续 Sprint 预告（合并后在上表补充具体命令）

| Sprint | 预计的生产步骤 |
|---|---|
| 0108 | **同步流水号的生产安全迁移**：先部署「所有写入取锁」的代码，再执行迁移（加列、回填、触发器、索引）；回填分批执行；附回滚步骤 |
| 0109 | 只读统计关系沟通五类集合的生产行数；建三张表并搬迁数据（可重复执行）；旧集合保留 |
| 0111 | 保留期任务随部署自动运行；存量清理：预演统计 → 导出备份 → 删除 → 再预演，确认为 0 |
| 0113 | 活动专用表加 `sync_revision` 并回填；通用 upsert 行为改变（不再清空主人） |
| 0114 | 补写主人：预演 → 导出备份 → 执行 → 再预演；**要在 0116 上线之前完成** |
