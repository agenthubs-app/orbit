# Community 模块

## 模块定位

Community 负责「加入 iOrbit 用户社群」卡片的素材与本人的社群加入记录（RW-06）。社群**不是活动**（D6）：不写 `event_ops_events`，不进活动目录、活动推荐过滤或报名规则。

## 期望行为

- 素材（群名、中性的一句话说明、群介绍正文、助手微信号、二维码）集中在 `features/community/config.ts`。用户未提供的项（当前：群介绍、微信号、二维码）逐项标 `placeholder`，界面显示「占位」标注（D4）；素材到位只改这个文件。
- 加入记录存 `orbit_records`：collection `communityMembership`，recordId `current`，payload `{ joinedAt }`。workspaceId 按 actor 分片（`<workspace>:community-actor:<actorId>`），并写 `userId`，每人只有一条、只能读写自己的。
- `GET /api/community/membership` 返回 `{ joined, joinedAt }`；`PUT` 即「我已加入」，幂等，`joinedAt` 保持第一次加入的时间。未登录 401；请求体里的任何身份字段都不采信。
- 活动页（`/app/events`）置顶社群卡片；iOrbit 概览「已报名活动」栏：未加入时第一条是社群入口，已加入时第一行显示「已加入社群」，真实报名活动仍最多两场。两页都由服务端读取加入状态，首帧即正确。
- W0006 引导第 4 步复用同一份记录：`joined === true` 即视为完成。

## Mock 行为

Mock 使用进程内内存存储（挂在 `globalThis`，dev 热重载后仍在），语义与 live 相同（原子插入、幂等），不访问数据库或网络。hybrid 未单独注册，按约定回落到 mock。

## 热拔插边界

页面和 API route 只通过 `features/community/service-factory.ts` 的 `resolveCommunityMembershipService` / `readCommunityJoinedForActor` 取服务。live 模式在数据库未配置时返回共享的 `NOT_IMPLEMENTED` 解析失败（API 以 503 envelope 返回），不回落到内存存储。
