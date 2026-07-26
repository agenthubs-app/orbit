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
