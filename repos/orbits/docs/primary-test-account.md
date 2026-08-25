# 固定主测试账号

Orbit 的浏览器验收和主要产品流程统一使用一个稳定主体：

- 邮箱：`qa@orbit.test`
- 显示名：`Orbit QA`
- 密码：仅保存在本地 `.env.local` 的 `ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD`

执行 `pnpm db:seed:primary-test-account` 会保证账号存在、刷新本地测试密码，
并将关系网络、联系人、活动、任务、消息、通知、Agent、仪表盘与权限等场景
以幂等 upsert 的方式合并到该账号。脚本不会清空该账号已有记录，因此手工测试
产生的数据和不同 fixture 集会保留并集；重复执行也不会产生重复 fixture。

活动主办方、其他参会人和账号隔离测试仍保留独立辅助账号。它们代表真实的多人
和权限边界，不能合并为同一个 actor。`qa@orbit.test` 是日常主流程的默认操作者，
辅助账号只在验证多主体交互时使用。
