# Orbit AI 云端读取边界

Orbit AI 的读取权限由 `features/orbit-ai/data-query/permission-registry.ts` 独立声明。它与客户端离线 registry 无继承关系：客户端可离线读取某个数据域，不会开启对应 AI 能力；AI permission 也不会给客户端增加数据权限。

每次读取同时检查当前服务器注入的 actor、workspace、authorization epoch、AI capability 和领域源授权。模型输入不能携带身份字段。未知工具、schema 版本、字段和过滤条件一律拒绝。

13 个查询工具只返回各自 permission 中的字段，以及 `id`、`revision`、`updatedAt`、`evidenceIds` 四类 canonical 元数据。领域 adapter 必须先显式构造 DTO，再由严格 schema 复核；不能将完整数据库记录交给投影函数做排除式过滤。

AI visibility manifest 从这份 permission registry 派生声明，仅用于 provider 出站审查和审计。它不是客户端离线权限来源，也不会携带本机 pending change、设备草稿、身份 scope、provider token、隐藏提示词或原始 provider payload。

分页 cursor 使用服务端 key 做 HMAC-SHA256，并绑定 actor、workspace、authorization epoch、工具、schema/registry 版本、规范化过滤条件和源 snapshot。有效期最多 15 分钟，且不会超过当前读取授权的到期时间。源 adapter 为每行提供不透明 continuation position；发生条数或字节裁剪时，cursor 从最后实际返回行继续，避免跳过已经读取但没有返回的记录。每页读取后再次检查 scope 与领域授权。
