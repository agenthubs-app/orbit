# Sprint 0026 — App 身份消费者审计

## 结论

App 现在明确区分两种身份：`auth.user.id` 是认证系统返回的原始登录主体；`auth.accountId`／`auth.actorId` 是认证后从 `GET /api/account/me` 的 `account.id` 取得的业务账号。业务 owner 校验、actor-scoped 缓存／草稿／回执和以账号为参与方的联系人通信均使用 canonical identity。

`/api/account/me` 失败、未登录、缺少 `account.id` 或返回空值时，Provider 保持关闭状态。实现不会退回 raw `user.id`，也不会从待办、日程、笔记或联系人记录猜测 owner。

## 已迁移的消费者

| 类别 | 消费点 | 迁移理由 |
| --- | --- | --- |
| 认证边界 | `AuthSessionProvider` | 登录／恢复后读取 canonical account；上下文同时保留 raw user 与 canonical account。 |
| 本地隔离 | `useApiResource`、账号语言、首页、联系人需求、收件箱角标 | 快照、刷新 generation 和 actor-scoped 响应必须跟随业务账号切换。 |
| 待办 | 列表、详情、日期写入、关系任务工具、owner view-model | 服务端任务的 `accountId`／`ownerUserId` 是业务账号字段。 |
| 个人日程 | 列表、详情、写入回执 | personal schedule contract 以 canonical `accountId` 为 owner。 |
| 笔记 | 列表、详情、新建、编辑、联系人详情入口 | note v2 的 owner、草稿 scope、建议回执和联系人关系均以 canonical account 为边界。 |
| AI 与人脉 | AI 首页／会话、prefill／send intent、人脉主页／详情／需求排序、首页 | producer 与 consumer 必须使用相同 actor scope，避免 raw ID 与 account ID 不等时丢失一次性意图。 |
| 消息与邀请 | 聊天列表／详情、收件箱、邀请接受页 | relationship communication 服务实际使用 `actor.accountId` 作为参与账号；邀请补漏提交为 `3385369dd`。 |

## 有意保留 raw `auth.user.id` 的消费者

审计以 `rg 'auth\.user\?\.id|auth\.user\.id' app src` 复核；最终剩余九处，均不是本 Sprint 的业务 owner 校验。

| 文件／组件 | 保留理由 |
| --- | --- |
| `app/(app)/events.tsx`、`app/events/[id].tsx` | raw ID 仅作为登录会话变化的 route generation 依赖；业务数据读取仍由认证 API 和 `useApiResource` 的 canonical snapshot actor 保护。 |
| `EventRegistrationScreen`、`EventExperienceScreen` | 现有活动流程把该值用作当前认证会话的竞态／失效 scope；服务端权限仍从认证 actor 建立，不把客户端值作为 owner 授权。Sprint 0026 不改变活动报名契约。 |
| `BusinessCardIngestStartScreen`、`BusinessCardImportScreen` | 本地图片、picker 和导入作业的迟到响应按认证 session subject 隔离；这两个流程在服务端返回的 batch 中读取 canonical owner，不用该 raw 值批准联系人写入。 |
| `BusinessCardBatchScreen` | 源码已有明确边界：session subject 只隔离请求；认证 batch 提供 canonical owner。确认仍校验 batch owner、版本和回执。 |
| `AccountAuthScreen`、`PasswordResetScreen` | 登录、注册、找回和重置密码属于认证主体生命周期；raw ID 只用于作废旧请求／界面 scope，不是业务记录 owner。 |

## 验证反例

- raw `userId` 与 canonical `accountId` 不同：Provider 同时暴露两者，业务链使用 canonical owner。
- 两者相同：保持兼容，不产生第二套身份。
- 账号接口失败、未登录、缺字段或空 ID：fail closed。
- 待办同时校验 `accountId` 和 `ownerUserId`；外部 owner 不投影为可见详情。
- actor／base URL 切换：快照、草稿、AI intent、消息和邀请的旧响应不能进入新 scope。
