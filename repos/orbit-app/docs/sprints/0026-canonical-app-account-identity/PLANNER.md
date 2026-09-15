# Sprint 0026 — App canonical account identity

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在[登记表](../README.md)。
**原需求:** 2026-09-15 追加 C 线 Sprint；修复 raw Auth.js user ID 被当作业务 owner ID。
**单一目标:** 让 App 只从认证账号接口取得 canonical account ID，并把三条 owner-scoped 业务链与本地隔离边界接到该身份。
**易读目标:** [GOAL.md](GOAL.md)。**批准补充:** [APPROVED_SCOPE_ADDENDUM.md](APPROVED_SCOPE_ADDENDUM.md)。
**基线:** 根 HEAD `34f95a20a1953b824444b61a5d691d95a070f165`；已有未跟踪设计图、prototype、`output/`、`tmp/` 与 `.gitnexus` 不写、不暂存。

## 进入条件与依赖

- 用户已经批准设计、Sprint 编号和实施；C 线串行持有当前主集成工作区。
- Web `GET /api/account/me` 已通过认证 actor 将原始登录主体映射到 canonical `account.id`；App 已有 endpoint 常量与认证 cookie，可直接读取。
- 编辑每个既有函数／组件前运行 GitNexus upstream impact；HIGH／CRITICAL 先报告风险。新增纯函数在首次接入前对调用方做 impact。
- 按 TDD 先用失败测试锁定不等 ID、同 ID、身份失败、foreign owner 和不从业务记录推断五类行为。

## 范围与文件

- 新建：`src/api/canonical-account-identity.ts` 及对应测试。
- 修改：`src/api/AuthSessionProvider.tsx`、`src/hooks/useApiResource.ts`。
- 待办：`src/screens/tasks/TasksScreen.tsx`、`TaskDetailScreen.tsx`、`RelationshipTaskTools.tsx`、`src/view-models/today-tasks.ts`，及直接测试。
- 个人日程：`src/screens/schedule/PersonalScheduleList.tsx`、`PersonalScheduleScreen.tsx`，及直接测试。
- 笔记：`app/notes/index.tsx`、`app/notes/[id].tsx`、`app/notes/new.tsx`、`app/notes/[id]/edit.tsx`，及直接测试。
- AI 回执配对：`app/ai/[id].tsx`；只有在 producer／consumer actor scope 必须一致时修改 `src/screens/ai/AiScreen.tsx`。
- 文档：本目录、`docs/sprints/README.md`、`bridge/status.md`、`bridge/handoffs.md`。
- 排除：Web/API 业务实现、数据库、活动报名语义、账号语言语义、联系人／聊天 owner 模型全面迁移、部署和生产数据。

若 RED 或 impact 证明直接消费者位于上述白名单外，只可加入精确的直接测试或消费者文件，并在 REPORT 记录原因；不得批量替换全部 `auth.user.id`。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0026-01 | 登录校验成功后读取 `/api/account/me`，保留 raw `user.id` 并暴露 canonical `accountId`／`actorId`；缺失、失败或错误形状时不回退、不猜测。 | identity parser／provider RED→GREEN；不等 ID、同 ID、失败与缺字段夹具。 |
| SC-0026-02 | 待办列表、详情、日期修改回执使用 canonical owner；foreign owner 继续被拒绝。 | task scope/detail/date 定向测试及两类 actor 反例。 |
| SC-0026-03 | 个人日程列表、详情和写入回执使用 canonical owner；foreign owner 继续被拒绝。 | personal schedule 定向测试及真实 Simulator 回读。 |
| SC-0026-04 | 笔记列表、详情、新建、编辑、建议与草稿 scope 使用 canonical owner；账号／服务器切换不串数据。 | notes view-model／交互／草稿／建议定向测试及 Simulator 回读。 |
| SC-0026-05 | actor-scoped 快照和 AI 预填成对使用 canonical identity；raw-ID 消费者审计完成，App 全量通过且当前 Web/API 健康。 | `auth.user.id` 审计表、App typecheck／全量、契约同步、Web health、当前 iOS build 与三链截图／日志。 |

## 一次 Generator 的执行顺序

1. 登记 run-01、Planner hash 与文件锁；保存基线，保留全部用户未跟踪内容。
2. 写 identity parser／provider RED，最小实现 canonical identity；定向通过后接 actor-scoped snapshot。
3. 分别写待办、个人日程和笔记的 RED，再接屏幕与回执；task detail 增加显式 owner 校验，不放宽现有 view-model。
4. 审计所有 `auth.user.id`，只修 producer／consumer 不一致或 owner-scoped 边界；跑受影响组合、typecheck、契约同步和 App 全量。
5. 在当前 Web/API 与指定 Simulator 验收三条链；运行 GitNexus detect_changes，提交功能，再写 REPORT／Bridge／README 并独立提交报告。

## 最小测试与检查

- 档位：H + I。身份 Provider、缓存隔离和三个主要业务域共享同一上下文，必须在本地代码收口时跑 App 全量；真实问题发生在登录 Simulator，必须做 I 阶段。
- 开发定向：identity/provider、snapshot、tasks、personal schedule、notes、AI intent 的完整测试文件；RED 必须能看到 raw user 被错误拒绝的旧行为。
- 收口：`npm run typecheck`、`npm run sync:contract` 后 clean diff、`npm test`；当前原生 iOS build／Simulator 三链。
- Web：不改服务端源码；只确认当前 production health 和认证账号响应的 canonical 字段，不把旧证据当新运行。
- 不运行 Web 全量或重建：本 Sprint 不改 Web/API。若检测到 Web 源码变化则本条失效，必须按 Bridge 规则生产构建、重启和受影响测试。

## 失败与交接

账号接口暂时不可用只阻塞真实 SC-05，不阻止本地测试与静态审计。任何 owner 兼容都不得用 raw ID fallback 解除；若现有业务接口实际返回不同 owner 语义，记录具体端点和对象后另开契约修复，不在这里降低安全边界。
