# Orbits

This is the Git-maintained application repository built by the Orbit long-run harness.

The harness itself lives outside this repo at the project root.

## 本地测试账号

本地服务启动后，打开 <http://localhost:3000/app/account/login>：

| 项目 | 内容 |
| --- | --- |
| 邮箱 | `qa@orbit.test` |
| 密码 | `OrbitTest2026!` |
| 显示名称 | `Orbit QA` |

该账号仅用于本地开发和浏览器回归测试，已在本地 Postgres 的 live 模式下验证可登录。不要在生产或共享环境复用此密码。若本地数据库被重建，可在注册页用同一组信息重新创建账号。

## 活动运营 E2E 数据

活动运营链路使用固定 64 人的有效匹配队列，全部在截止前报名，并覆盖完整、部分和最小画像；另保留 6 条已取消生命周期记录，其中 3 条曾逾期报名，因此数据库共有 70 条报名历史，但活动目录和冻结/发布结果始终严格为 64 人。种子只重置该测试活动的作用域，可重复执行，不会伪造 AI 推荐或分桌结果。准备数据库、模型密钥、账号及完整浏览器验收步骤见 [活动运营 E2E 指南](./docs/event-operations-e2e.md)。
