# 密码恢复部署与验收

忘记密码入口申请一次性链接，进入 `auth_users` 记录内的持久化队列。申请不报告邮箱是否存在，也不把排队说成送达。OAuth-only 账号继续使用原登录方式。

## 配置

- 现有 live Postgres 连接和 workspace；沿用 `orbit_records`，不需要新表。
- `AUTH_SECRET`：至少 32 字符，所有 Web/worker 实例一致。已有部署应保留原值；更换会使现有会话与待投递链接不可用。
- `ORBIT_PUBLIC_ORIGIN`：用户实际访问的 HTTPS origin，不含路径/query/hash。开发时允许 localhost HTTP。链接不使用请求 Host，防止重置地址被替换。
- 首选沿用 party-app SMTP：`SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`ACCESS_EMAIL_FROM`，可选 `ACCESS_EMAIL_REPLY_TO`。只通过本地程序直接传递配置值，不回显密钥。
- 可选 Resend：`ORBIT_AUTH_RESEND_API_KEY`、`ORBIT_AUTH_MAIL_FROM`。SMTP 配置完整时优先使用 SMTP。

发送接口依据 [Resend 官方 API](https://resend.com/docs/api-reference/emails/send-email)。此配置仅供事务性密码恢复邮件使用，不授权 Agent 发送联系人消息。

本版本在 Vercel 使用原生 Queues：申请先写数据库，再等待不含邮箱/令牌的唤醒消息入队，成功后才返回 202；入队失败返回可重试的 503。`vercel.json` 的 `queue/v2beta` trigger 将消费者设为平台私有函数。每次消费最多投递一封，再检查数据库是否仍有未过期的 pending/sending 任务；未来重试时间和未释放租约不会被误认为完成。消息保留 35 分钟，超过链接有效期；发送次数仍由数据库状态控制，正常失败最多 5 次。Vercel OIDC 自动认证，无新增静态密钥。

非 Vercel 环境保留 Next `after()` 首次投递，需常驻 worker 或实际调度器。受 `CRON_SECRET` 保护的 `GET /api/auth/password-reset/worker` 仍支持运维补偿；Preview 原生 cron 不运行。队列接口依据 [Vercel 官方文档](https://vercel.com/docs/queues/quickstart)。SMTP 使用 TLS 和固定 Message-ID，但 SMTP 不提供严格幂等：投递后崩溃可能导致重复邮件，链接仍只可消费一次。

启动：`node --import tsx scripts/run-password-reset-worker.ts`。生产进程管理器必须持续运行该命令、失败重启并收集退出/重试日志。禁止把 worker 仅作为一次部署命令运行。

## 行为

- 凭证由 32 字节密码学随机值生成；验证仅存 SHA-256，待投递明文用 AUTH_SECRET 派生的 AES-GCM 密钥加密。
- 链接位于 URL fragment，避免进入请求日志和 Referer。有效期 30 分钟；每账号每分钟最多更新一次，重新申请作废旧链接。
- worker 通过 `FOR UPDATE SKIP LOCKED` 领取任务、60 秒租约恢复崩溃任务，失败退避重试最多 5 次。Resend 幂等键绑定同一个凭证，避免投递成功但回写失败造成重复发送。
- 改密与消费凭证在同一条件 UPDATE 中完成；并发提交最多成功一次。改密后 Web 与移动端 Auth.js 会话通过原始签发时间校验失效。
- 新密码最低 8 字符，UTF-8 最多 72 字节（bcrypt 边界）；不返回 hash、凭证或 provider 错误正文。

消费者仅记录 `password_reset_delivery_tick`、`result`、`pending`，不记录邮箱、令牌、消息内容或环境变量。可使用 Vercel 按该事件名过滤日志验证自动重试，不需要拉取部署密钥。

## 上线验收（缺少证据不得标为完成）

1. 一次性测试账号申请邮件，确认实际邮箱收到且链接打开本站；检查 202 只表示受理。
2. 相同链接并发提交只有一次成功；过期/错误/重放链接均不能改密。
3. 原密码失败，新密码成功；重置前 Web 与移动端 Cookie 均无法继续访问私有数据。
4. 暂停 worker 后申请，重启仍可投递；模拟供应商失败可重试，重复 worker 不重复领取；删除或替换申请后旧 worker 不覆盖新状态。
5. 未配置或数据库故障返回可恢复失败，不显示“邮件已发送”；测试未知邮箱与 OAuth-only 邮箱响应一致。

本地适配器测试不代表外部邮件送达或部署进程已运行。真实投递只使用用户授权的测试邮箱。
