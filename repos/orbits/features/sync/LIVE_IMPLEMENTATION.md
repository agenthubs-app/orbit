# 旧任务的增量同步兼容

旧版顶层 `TaskDTO` 不包含 `accountId` 或 `ownerUserId`，归属保存在
`orbit_records.workspace_id/user_id`。读取页先核对每条返回行与已认证范围，
再映射旧任务；payload 若显式提供任一归属字段，必须与已验证 actor 一致。
缺省字段可兼容，冲突、null 和错误类型仍拒绝，不能用 payload 覆盖行归属。

旧数据的创建／更新时间包含 PostgreSQL 六位小数秒。同步时间校验允许
1–6 位小数秒并保留原始字符串，不截断精度，不改写数据库。七位及以上、
缺时区和不可解析时间仍拒绝；原有枚举、引用和证据校验保持生效。

回归覆盖位于 `tests/services/incremental-sync-legacy.test.ts`。运行时检查
只读取专用数据库副本，不修改主库。旧数据可映射不代表 Simulator、离线恢复
或游标重置验收已完成。
