# Orbit 多账号与活动主办方设计

> 状态：需求已确认，书面设计待最终复核
>
> 日期：2026-08-19

## 1. 目标

把当前以小雨单账号为主的本地数据升级为可真实登录、可隔离授权的多账号数据集，并为现有 16 个活动分配合法主办方。

最终数据包含 14 个唯一注册活动主办用户：小雨负责 3 个活动，另外 13 个注册用户各负责 1 个活动。其中 6 个用户已经是小雨的人脉，另外 7 个用户尚未进入小雨的人脉。数据库中既有的 `demo` 和 `Zhao Xin` 登录继续保留为独立用户，但不进入本次 14 位主办用户集合，也不获得小雨数据或活动主办权。

## 2. 核心领域约束

1. 每个活动的 `organizerActorId` 必须解析到一个已注册的 Orbit 用户账号。
2. 注册用户必须同时拥有 `auth_user`、`account` 和 `profile`，三者缺一时不能接收活动主办权。
3. `actor.id` 使用该用户的 canonical `accountId`。活动权限不得直接使用 Contact ID、Profile ID、邮箱或前端提交的用户 ID。
4. Contact 不是登录身份。现有联系人注册 Orbit 后，通过显式、可审计的账号关联与其原 Contact 记录连接。
5. “小雨的现有人脉”是两个注册用户之间的关系状态，不是另一种账号或主办方类型。
6. 外部主办方也必须先注册账号。未注册的人只能作为候选人，不能写入 `organizerActorId`。
7. 活动 owner 从 Event Core 的 `organizerActorId` 派生，不写入可撤销的普通角色记录。
8. 主办权转移必须通过显式 ownership-transfer 流程完成，不能静默覆盖数据库字段。

## 3. 复用现有认证存储

当前代码已经通过 PostgreSQL `orbit_records` 中的以下 collection 支持多个账号：

- `auth_users`：登录身份、规范化邮箱、认证方式和密码哈希；
- `accounts`：Orbit 业务账号，也是业务 Actor 的所有权边界；
- `profiles`：公开身份和业务资料。

本阶段不建立第二套并行登录数据库，也不把 14 个用户硬编码到认证逻辑。13 个新增测试账号必须通过现有 `AuthUserService.registerUser()` 注册，使密码经过 bcrypt cost 12 哈希，并由现有 account provisioner 创建 Account 与 Profile。

13 个新增账号注册完成后的不变量为：

```text
auth_user.id == account.id == actor.id
profile.id == "profile:" + auth_user.id
profile.accountId == account.id
```

这些 ID 当前可能具有相同字符串，但在领域上仍分别表示认证身份、业务账号和公开资料。

### 3.1 小雨的既有 Google 登录绑定

小雨不创建新登录，也不改用 `demo` 或 `Zhao Xin`。本次迁移将现有 Google AuthUser `agenthubs`（当前本地 ID 为 `user_mry5y200_58jpi8`）绑定到小雨既有的 canonical Account `account_orbit_generated`，并保留完整公开资料 `profile_orbit_generated_operator`。

绑定通过一条确定性的 auth-membership Profile 记录表达：其 payload `id` 等于 `agenthubs` AuthUser ID，`accountId` 等于 `account_orbit_generated`。这样现有 Session 解析会把 Google 登录映射到小雨原 Account，而不需要重写小雨已有数据的 owner ID。原公开 Profile 继续负责展示，membership Profile 只承担登录身份到 Account 的归属关系。

本地历史 Account 与公开 Profile 的 payload 已经正确，但两条 LiveRecord 的外层 `user_id` 为空。bootstrap 额外包含两项精确的 canonical ownership repair，只把这两个外层 `user_id` 设置为 `account_orbit_generated`；不得改变 Account/Profile payload、Profile 文案或其他元数据。冲突的非空 owner 必须 fail closed。

account provisioner 必须先识别完整、无冲突的既有 membership，再决定是否创建默认 Account/Profile，避免后续 Google 登录为 `agenthubs` 生成第二个影子 Account。若 AuthUser、membership、Account 或小雨原 Profile 的链路与上述选择不一致，迁移 fail closed。

## 4. 账号与联系人关联

6 位现有人脉注册后，新增 actor-link 事实，将小雨关系空间里的 Contact 与对方账号连接：

```ts
interface ContactActorLink {
  ownerActorId: string;   // 小雨的 actor ID
  contactId: string;      // 小雨已有的 Contact ID
  linkedActorId: string;  // 对方注册后的 account/actor ID
  state: "active" | "revoked";
  linkedAt: string;
  evidenceIds: readonly string[];
}
```

该关联必须满足：

- 同一 `ownerActorId + contactId` 最多有一个 active link；
- 同一 `ownerActorId + linkedActorId` 最多对应一个 active Contact；
- 关联不改变 Contact 的归属，也不会把对方的私有 Profile 数据复制给小雨；
- 解除关联不删除用户账号、Contact 或历史活动；
- 7 位非人脉主办方没有小雨侧 Contact，也没有 active ContactActorLink。

## 5. 16 个活动的固定分配

分配清单是稳定、可审计的 migration manifest。所谓“随机分配”只发生在首次选人阶段；清单一旦确认，重复运行必须得到同一结果。

### 5.1 小雨运营的 3 个活动

| Event ID | 活动 |
| --- | --- |
| `event_02` | 日中 AI 业务自动化 PoC 圆桌 |
| `event_08` | AI 创业者之夜 |
| `event_signup_02` | 东京 AI 实施伙伴报名会 |

### 5.2 小雨现有人脉主办的 6 个活动

| Event ID | 活动 | 已有 Contact | 匹配依据 |
| --- | --- | --- | --- |
| `event_01` | 东京入境餐饮增长会 | 魏宇航 `contact_090` | 社群组织者，具备东京餐饮试点资源 |
| `event_03` | 跨境电商渠道拓展会 | 伊藤香織 `contact_005` | 市场负责人，具备跨境电商实务能力 |
| `event_04` | 种子投资人与创业者面谈会 | 高橋智子 `contact_003` | 投资合伙人，具备种子项目筛选经验 |
| `event_05` | 华人商业社群赞助会 | 袁子墨 `contact_085` | 社群市场负责人，关注活动赞助合作 |
| `event_06` | 半导体与制造峰会 | 吉田彩 `contact_066` | 社群组织者，关注半导体供应链资源 |
| `event_09` | D2C 品牌海外拓展沙龙 | 前田祐介 `contact_027` | 投资合伙人，具备 D2C 跨境物流与支付经验 |

这 6 人都必须先完成注册，再创建 ContactActorLink，最后接收活动主办权。

### 5.3 尚非小雨人脉的 7 位注册主办方

| Event ID | 活动 | 注册用户 | 角色与机构 |
| --- | --- | --- | --- |
| `event_07` | FinTech Tokyo Mixer | 中島美咲 | Tokyo FinTech Network 社群负责人 |
| `event_10` | Tokyo Fashion Design Week Mixer | 森川玲奈 | Tokyo Fashion Council 项目负责人 |
| `demo-event-1` | Climate founders dinner | Daniel Kim | Climate Founders Japan 创始人社群主理人 |
| `demo-event-2` | Storage pilot operator breakfast | 石井拓真 | Infra Operators Guild 运营负责人 |
| `event:manual:founder-investor-salon` | Founder investor salon | 陈嘉宁 | East Asia Venture Circle 投资人与社群组织者 |
| `event_signup_01` | 关西跨境商务报名会 | 山本直樹 | Kansai Global Business Association 项目负责人 |
| `event_signup_03` | 日中投资人与创业者报名沙龙 | 周雨晨 | Japan-China Innovation Network 社群负责人 |

这 7 人同样拥有完整 AuthUser、Account 和 Profile，但不创建小雨侧 Contact 或 ContactActorLink。

## 6. 测试账号注册与凭证安全

本地开发提供幂等的 organizer-account bootstrap 命令：

- dry-run 输出待创建、已存在、冲突和跳过的账号；
- apply 调用正式注册服务，不直接拼接密码哈希或绕过 account provisioner；
- 测试邮箱使用不可投递的 `*.orbit.example.test` 域名；
- 本地测试密码只从 `ORBIT_DEMO_ORGANIZER_PASSWORD` 读取；
- 密码不得写入源码、manifest、日志、测试快照或设计文档；
- 命令在 production 环境默认拒绝运行；
- 已存在邮箱必须核对 display name 和账号链路，冲突时 fail closed，不接管原账号。

生产环境不批量生成用户密码。真实主办方必须通过正常注册、OAuth 或后续邀请激活流程建立账号。

## 7. 数据迁移顺序

1. 备份当前 PostgreSQL 数据库。
2. 应用 Event Operations schema migration，确保 Event Core 和权限表完整。
3. 精确确认 `agenthubs` Google AuthUser 与小雨现有 Account/Profile，创建 review-gated membership 绑定。
4. dry-run 注册 13 位新主办方，检查邮箱和身份冲突。
5. apply 注册，验证 14 位目标主办用户全部具有完整身份链，并确认 `agenthubs` 没有影子 Account。
6. 为 6 位现有人脉创建 ContactActorLink；验证 7 位外部用户没有小雨关系。
7. 根据固定 manifest 生成 Event Core owner backfill plan。
8. 人工核对 event count、plan hash 和 owner mapping 后 apply。
9. 验证每个账号登录后只能看到自己负责的活动或被明确授权的活动。
10. 运行 Web、API、数据库和 iOS 契约测试。

任何一步失败都不得继续执行后续 ownership 写入。重复执行必须幂等，不得创建重复账号、Profile、联系人关联或 Event owner 版本。

## 8. 登录、授权和隐私边界

- 客户端只提交登录凭证并携带 Session，不提交可信 `actorId`。
- 服务端将 Session user 解析为 Account-backed Actor。
- 活动运营中心按当前 Actor 的 owner/role capability 查询。
- 主办方可管理自己的活动，但不能读取小雨的联系人、AI 历史、通知或其他私有工作数据。
- 小雨可以看到 6 位已有人脉的联系人关系，但不能因此获得对方活动的 owner 权限。
- 7 位非人脉主办方只作为公开活动主办用户出现，不得自动进入小雨联系人列表。
- 公共活动页面显示主办方经过许可的 Profile 字段，不暴露内部 Actor ID、登录邮箱或认证方式。

## 9. 管理边界

本阶段的“管理登录人员”指数据库可持久化、可查询、可审计多个登录账号，并提供受控 bootstrap/verification 工具。它不包含通用用户管理后台、查看密码、代用户登录或批量重置凭证。

如后续增加 `/app/admin/users`，必须先设计独立的平台管理员授权，不能因为用户拥有某个活动或处于同一 workspace 就获得全局账号管理权限。

## 10. 验收标准

- 目标数据中有 14 个唯一注册主办用户和 16 条活动 owner 映射；`demo`、`Zhao Xin` 等非主办用户不计入该集合。
- 每个主办用户都有一条有效 AuthUser、Account 和 Profile。
- 3 个指定活动的 owner 是小雨。
- 6 个活动的 owner 是已通过 ContactActorLink 关联的小雨现有人脉。
- 7 个活动的 owner 是注册用户，但在小雨关系空间中没有 ContactActorLink。
- 任何 Contact ID、Profile ID 或邮箱都没有被直接写入 `organizerActorId`。
- 13 个新增账号可通过正式凭证认证建立 Session；小雨沿用 `agenthubs` Google 登录并解析到 `account_orbit_generated`，错误凭证不能登录。
- 每个账号的活动中心只返回其拥有或被授权的活动。
- 公共活动 API 返回可展示的主办方资料，但不泄露内部身份字段。
- dry-run/apply 可重复执行，第二次执行不产生额外数据。
- migration plan 的 event count、owner mapping 和 hash 与审核清单一致。

## 11. 非目标

- 不在本阶段实现邮件投递、找回密码或批量邀请发送。
- 不自动把 7 位外部主办方加入小雨人脉。
- 不为每个活动创建一个重复用户；小雨一个账号可以拥有 3 个活动。
- 不允许用 fixture-only Contact 或任意字符串绕过用户注册。
- 不建立与现有 AuthUserService 并行的第二套认证系统。
