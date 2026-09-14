# 已验证的关系沟通

`relationship-communication` 提供授权账号之间的邀请、绑定与真实站内消息。它使用独立的
`/api/relationship-communication/**` 路径，不改变 `/api/contact-invitations` 和
`/api/chat/conversations` 的草稿／本地预览语义。

## 身份与邀请

- 联系人所有者从资格接口读取 `unregistered | pending | conflict | confirmed | revoked |
  expired | forbidden`，客户端字段不参与资格判定。
- 创建邀请只返回可复制或系统分享的七天有效链接，不主动发送邮件、短信或站内消息。
- 数据库只保存 token 的 SHA-256 哈希。接受邀请要求已登录账号的邮箱与邀请邮箱一致，
  并要求显式提交 `confirmed: true`。
- 成功接受后生成稳定的绑定、资格版本和双方共享会话。撤销绑定会推进资格版本，使旧版本
  的发送请求失败。

## 消息与已读

- 会话列表、详情、发送和已读路由都从服务端认证会话取得当前账号，只向参与账号返回数据。
- 发送要求 `Idempotency-Key` 和当前 `qualificationVersion`。消息 ID 由会话、发送账号和
  request ID 稳定派生；重复请求回读同一条消息。
- 服务端持久化并回读匹配消息后才返回 `delivered`。App 还会校验发送账号、会话、资格版本
  和正文；任何不匹配都保留输入并显示失败。
- 已读记录按账号和会话分别存储。0008 发布接口和数据形状，0012 负责客户端生命周期和
  badge 验收。

## 存储与验证

实现复用 `orbit_records`，分别使用 invitations、bindings、conversations、messages 和 reads
collection，不需要数据库迁移。跨端响应定义在
`shared/contract/relationship-communication.ts`，由 App 的 `sync:contract` 命令生成副本。

服务测试覆盖邀请预览、邮箱隔离、显式接受、撤销、幂等投递和参与者边界；live-store 测试
使用隔离 workspace，在 PostgreSQL 中完成双账号收发、关闭并重开存储、已读和撤销，再清理
该 workspace 的测试记录。
