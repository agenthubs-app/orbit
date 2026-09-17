# 联系人读取边界与本地验收

2026-09-17：数据库额度耗尽不能通过客户端少显示几条来解决；必须在 SQL 返回应用服务之前限定读取范围。

## 详情与行业修改

- 配置化 PostgreSQL provider 注入 `createPostgresContactScopeRecordReader`：先按 workspace、actor、contactId 查出关系和私有详情记录的 key，再复用原 store 与 mapper 读取所需记录。
- 保留 `user_id = actor OR payload.accountId = actor` 的历史关系归属规则；私有详情仍只允许 `user_id = actor`。不截取“第一条关系”掩盖 canonical 重复冲突。
- 生命周期状态、pending/ready、异常版本拒绝、私有 tags/notes 和行业修改权限保持既有语义。无 actor 不发查询。
- 行业修改授权也用精确关系 key，不再为了检查一个联系人读全部关系。
- 内存/注入式旧 provider 保留兼容路径。单个联系人自身的大量历史备注仍是完整详情，不声称所有历史子列表已分页。

## HTTP 分页入口

`GET /api/contacts` 现在向既有服务传递显式 `limit` 和 `cursor`。无 limit 的旧客户端保持完整结果，不悄悄截断；无效 limit 返回原契约错误。仅接通参数不表示所有 Web/App 列表已自动分页。

## 可重复验收（不连接 Neon）

设置 `ORBIT_LIFECYCLE_TEST_DATABASE_URL` 为显式的本地测试 PostgreSQL，然后运行：

```sh
node --test --import tsx tests/services/contact-scoped-read-postgres.test.ts tests/api/contact-list-pagination-route.test.ts
```

每次测试新建随机 schema，只删除自己的 schema，不清库。详情测试先在原实现复现 200 条无关记录随详情一起返回的问题，再验证 scoped reader：相同结果由 203 行 / 3,709,006 字节降到 5 行 / 2,409 字节；无关记录增加到 2,000 条后仍为 5 行 / 2,409 字节。该数字是合成数据下查询结果 JSON 大小，不是 Neon 协议流量、计费口径或真实用户节省率。

断言还覆盖历史 accountId 归属、陌生账号拒绝、无 actor 零查询、行业权限以及重复 canonical connection 报错。现有生命周期/联系人/API 组合回归 209 项通过，云端验收另行记录。

## 免费开发路径

本地 PostgreSQL 用于迁移、真实 SQL、权限、事务、回归和负载放大验证；Web 与 App 仍通过同一 API，不能把本地测试称为 Production/Neon/云端 worker 已验收。Neon 额度恢复或明确选定独立云测试环境后，再补同版本云端联调。
