# Sprint 0013 — 已批准实施范围补充

2026-09-15。此补充依 `docs/sprints/RULES.md` 第 0、6、10 节复用用户在 2026-09-14 已记录的“全部获准”，把 `PLANNER.md` revision 2 的候选路径补成可执行边界，不改变 SC-0013-01～05。当前采用 `TECHNICAL_PREPARATION.md` 的方案 A；不再等待 A/B 决策。

## 服务端与共享契约

允许新增或修改：

- `repos/orbits/shared/contract/account-language-preference.ts`
- `repos/orbits/shared/api-schema/account-language-preference.ts`
- `repos/orbits/features/account-language/contract.ts`
- `repos/orbits/features/account-language/live-service.ts`
- `repos/orbits/features/account-language/service-factory.ts`
- `repos/orbits/features/account-language/storage/account-language-live-record-provider.ts`
- 如事务职责需要独立：`repos/orbits/features/account-language/storage/account-language-mutations.ts`
- `repos/orbits/app/api/account/language-preference/handlers.ts`
- `repos/orbits/app/api/account/language-preference/route.ts`
- 上述 service、storage、route 的定向测试及一次性 PostgreSQL 测试支持文件。

当前 `orbit_records.collection_name` 是自由字符串、payload 是 JSONB，主键已经包含 workspace/collection/record；不存在中央 collection registry。因此 `account_language_preferences` 与私有 mutation receipt collection 不需要新增数据库 schema migration。0013 只复用现有 `ORBIT_RECORDS_SCHEMA_SQL`；若后续事实与此审计矛盾，再暂停真正的迁移动作。

生产 PUT 必须运行在 SERIALIZABLE transaction 内，以 workspace+actor advisory lock 保护 preference 与 receipt：同版本并发只一胜，同 mutation+同 payload 重放原回执，同 mutation+异 payload 冲突，receipt 写失败整体回滚，40001/40P01 有界重试。通用 unconditional upsert 或进程内锁不能替代这份证据。

## App 基础设施与消费者

允许新增或修改：

- `repos/orbit-app/package.json`、`package-lock.json`：直接声明 Expo 57 匹配的 `expo-localization`。
- `repos/orbit-app/app/_layout.tsx`
- `repos/orbit-app/src/i18n/locale-core.ts`
- `repos/orbit-app/src/i18n/OrbitLocaleProvider.tsx`
- `repos/orbit-app/src/i18n/messages.ts`、`zh.ts`、`ja.ts`、`en.ts`
- `repos/orbit-app/src/api/language-preference.ts`
- `npm run sync:contract` 生成的 `src/api/contract/account-language-preference.ts` 与 `src/api/schema/account-language-preference.ts`
- `src/screens/profile/AccountAuthScreen.tsx`、`AccountScreen.tsx`、`ProfileScreen.tsx`
- `src/screens/home/HomeDashboardScreen.tsx`
- `src/screens/settings/SettingsScreen.tsx`
- `src/components/OrbitTabBar.tsx`
- 这些页面直接依赖的 account-auth、account-session、home-dashboard、today-tasks、profile view-model；仅为三语 UI 和保持现有数据语义所需。
- 本 Sprint 新语言 core、账号同步、长内容测试，以及 Planner 已列的四组页面、0009 日期不变量和必要直接消费者回归。

如果账号／设置主链路的真实可达操作仍残留固定中文，可追加 password reset、permissions、API settings、LoadingState 与 ErrorState 的精确消费者；追加只用于 SC-0013-02/04，不扩大到 0014/0015 页面。

## 不在本补充内

- 不从旧 `profile.preferredLanguage` 推断手动选择，不迁移、清除或覆盖旧 profile 字段。
- 不把设备自动语言反写到账号；不使用未按 server+actor 分区的本地缓存冒充跨设备证据。
- 不翻译姓名、公司、活动标题、地点、聊天、用户输入或服务端原文。
- 不提前翻译 0014 的人脉／名片／活动链路或 0015 的 AI／事项／消息链路。
- 不部署、不修改密钥、不操作业务数据库；PostgreSQL 并发验证只使用明确命名的一次性本地 cluster/schema。
