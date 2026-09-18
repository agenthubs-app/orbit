# 旧任务的增量同步兼容

旧版顶层 `TaskDTO` 不包含 `accountId` 或 `ownerUserId`，归属保存在
`orbit_records.workspace_id/user_id`。读取页先核对数据库的全部候选行与已认证范围，
包括 `limit + 1` 查询中用于判断下一页的 lookahead 行，再截取当前页，
再映射旧任务；payload 若显式提供任一归属字段，必须与已验证 actor 一致。
缺省字段可兼容，冲突、null 和错误类型仍拒绝，不能用 payload 覆盖行归属。

旧数据的创建／更新时间包含 PostgreSQL 六位小数秒。同步时间校验允许
1–6 位小数秒并保留原始字符串，不截断精度，不改写数据库。七位及以上、
缺时区和不可解析时间仍拒绝。日历校验按输入的本地年月日检查每月天数，
遵循四年／百年／四百年闰年规则，不用 UTC 转换后的日期判断本地日期。
因此不存在的二月二十九／三十日和四月三十一日会被拒绝。
原有枚举、引用和证据校验保持生效。

回归覆盖位于 `tests/services/incremental-sync-legacy.test.ts`。运行时检查
只读取专用数据库副本，不修改主库。旧数据可映射不代表 Simulator、离线恢复
或游标重置验收已完成。

## 2026-09-16 审阅修复验证

使用 Node 22，在本 Web 仓库执行以下组合。`ORBIT_SYNC_TEST_DATABASE_URL`
由外部 runner 在进程内注入，指向每次新建的独占本地测试数据库，不能指向主库。

```sh
node --import tsx --test tests/services/incremental-sync-legacy.test.ts tests/services/incremental-sync.test.ts tests/services/sync-migrations.test.ts tests/api/sync-route.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json
```

- 独立 RED：18 项中 6 项失败，分别为四个日历溢出案例和两个跨范围 lookahead。
- GREEN：新增目标测试 18/18；完整组合 54/54（原 46 项加 8 项），失败／跳过均为 0。
- 测试 runner 核验 owner 后以 `template0` 新建测试库；结束时测试 schema 数为 0，
  复核 OID／owner／唯一 marker 后删除该库，删除成功。未保存连接凭据到证据中。
- TypeScript 完整类型检查退出码为 0。
- 克隆只读逐条验证 145/145，其中旧任务 80/80；同一生产 reader 直接查询完整页
  返回 145 条、1 页、成功。没有改写记录，也没有跳过无效记录后计为成功。

本机外部 runner 与脱敏计数证据位于
`/Volumes/ORICO/Dev/MacMovedData/orbit-s0033-runtime-lWrybw`：
`test-repair.mjs`／`repair-tests.json`、`verify-legacy-green.mjs`／`legacy-green.json`、
`verify-full-review-read.mjs`／`review-full-read.json`。读取探针用 Node 22 的
`--import <本仓库>/node_modules/tsx/dist/loader.mjs` 执行对应 `.mjs`；
连接信息仅从受限私有运行文件加载，输出仅包含计数、布尔与哈希。

## 个人日程的公开字段边界

`personal_schedule` 流中的 `kind=personal` payload 必须符合既有
`shared/api-schema/personal-schedule.ts` 严格 schema；该文件与 App schema
逐字一致。authority schema 的 `evidenceIds` 默认值不属于公开个人日程契约，
不能随同步投影增加，否则 App 会在同步成功后拒绝整份个人日程列表。
个人日程只输出基础字段和可选的 `endsAt/location`；会议及活动原有投影不变。

新增 `tests/services/incremental-sync-personal-schedule.test.ts`：两个个人日程
兼容断言先 RED，会议证据字段回归通过；修复后三项全部 GREEN。完整 Web 组合
在前述命令中加入该文件后为 57/57，零跳过，独占测试库清理成功。
真实副本只读返回 149 条变化，唯一个人日程通过 App 原 strict schema 及
`personalScheduleList` consumer，计数均为 1；没有附带 `evidenceIds`。
该只读验证的外部脚本／证据为 `verify-personal-repair.mjs`／
`personal-repair-live.json`，连接信息不进入输出。

App 在对应仓库用 Node 22 执行下列检查，测试 41/41、零跳过，类型检查退出码 0；
Web 完整类型检查也通过。

```sh
node --import tsx --import ./tests/helpers/register-render-hooks.mjs --test tests/personal-schedule-editor.test.ts tests/personal-schedule-list-sync-interactions.test.tsx tests/personal-schedule-interactions.test.tsx tests/incremental-sync-coordinator.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

此修改不改写数据库或 revision。已经缓存旧投影的客户端需要重新 bootstrap
才能取得新投影；运行验收须单独验证重置后可见，不能把普通无变化 delta 当作修复生效。
