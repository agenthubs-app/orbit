# Sprint 0013 — 账号语言与 App 三语基础技术准备

2026-09-15，只读审计与待审提案；没有启动 Generator，没有修改产品符号、账号记录或本地语言。用户已确认“默认跟随设备，手动选择按账号跨设备同步”，本页只补齐实现契约与文件边界，不重新询问该产品决定。批准前不得把本页当成已实现或已验收。

## 当前源码事实

1. 共享语言域已经固定为 `zh | ja | en`，位于 Web 真源 `shared/contract/language.ts` 与 `shared/domain/language.ts`；App 有同步副本。0013 必须复用，不新增第四份枚举。
2. `profile.preferredLanguage` 不能表示账号 UI 语言来源：存储读取、profile 读模型和稀疏更新分别在 `profile-live-record-provider.ts` 与 `live-service.ts` 用 `?? "zh"` 把缺失、非法和显式中文压成同一值。注册建档也没有“用户手动选择”标记。
3. Web 当前语言只来自 `x-orbit-lang`、全局 `orbit-lang` cookie/localStorage 或固定中文。它既不跟随设备/浏览器首选语言，也不绑定 actor；换账号可能继承前一账号的浏览器语言。
4. App 没有语言 Provider。`expo-localization ~57.0.1` 在 Expo 57 bundled modules 清单中，但未作为直接依赖声明；`I18nManager` 不是设备语言 API，`Intl.DateTimeFormat().resolvedOptions().locale` 也不作为权威设备语言来源。
5. 现有 `/api/profile` 具备 actor scope、`expectedUpdatedAt`、`mutationId` 与 PostgreSQL 事务回执，可安全做稀疏字段更新；但它锁的是整份 profile 版本，而且 profile 缺失时 language-only 更新会因没有 displayName 失败。

因此不能把旧 `preferredLanguage=zh` 自动迁成“手动中文”，也不能只在 App 加 AsyncStorage。前者会违反默认跟随设备，后者不能跨设备且会串账号。

## 待审方案

### A. 独立账号语言偏好记录与端点（推荐）

新增 actor-scoped `account_language_preferences` live record 和 `GET/PUT /api/account/language-preference`。读取契约为判别联合：

```ts
type OrbitLanguagePreferenceContract =
  | {
      mode: "system";
      language: null;
      updatedAt: string | null;
    }
  | {
      mode: "manual";
      language: OrbitLanguage;
      updatedAt: string;
    };
```

PUT 只接收 `mode/language/expectedUpdatedAt/mutationId`；`system` 必须带 `language: null`，`manual` 必须带支持语言。事务锁定 workspace+actor，保证同版本只一胜、同 mutation 同 payload 重放同回执、同 mutation 异 payload 冲突。它不依赖 profile/displayName，不会因姓名或关系目标更新产生伪冲突，也不需要为损坏/极旧账号伪造资料。

这是推荐方案：账号设置不借用资料字段，来源语义完整，测试可真正证明跨设备。代价是新增一份小型 service/provider/route/contract，而不是复用现有 profile PUT。

### B. 在 profile 增加显式 `languagePreference` 联合

保留旧 `preferredLanguage`，新增 `{mode: "system" | "manual", language}`，新的 UI runtime 只信新字段；没有新标记的旧记录一律解释为 system。继续用 `/api/profile` 的 CAS/幂等。

文件更少，但任何无关资料更新都会让语言保存 409，profile 缺失账号无法保存。若为了绕过而自动创建最小 profile，会改变 onboarding/身份事实，不在本 Sprint 自动采用。仅在接受这两个限制或另行批准 profile 创建策略时选择 B。

### C. 只用设备和本地缓存

不采用。它无法满足账号跨设备同步，也无法证明服务端回读；未按 actor+server 分区的 cookie/AsyncStorage 还会造成跨账号泄漏。

## 推荐方案 A 的解析与兼容规则

- 服务端没有独立偏好记录时返回 `mode=system, language=null, updatedAt=null`。旧 profile 的任何 `preferredLanguage` 均保留原值但不推断 UI 来源、不批量回填、不清除。
- App 使用 Expo `getLocales()` 的优先序，取首个 languageCode 为 zh/ja/en 的 locale；`zh-Hans` 与 `zh-Hant` 本轮都映射 zh。没有支持值或读取异常时使用明确的产品 fallback zh，并把设备读取异常暴露给设置页。
- Web 未登录时从明确 query/session cookie 或 `Accept-Language` 选择；登录后账号 manual 优先。旧全局 cookie 只能当当前浏览器会话显示选择，不能静默升级为账号 manual。
- 有 manual 时设备语言变化只更新 `deviceLanguage`；有效语言不变。system 模式下回前台重读设备语言，但不把它写进账号。
- scope 至少包含 `baseUrl + actorId + cookieHeader`。切号、登出或换服务器立即取消旧 GET/PUT、清掉前账号 manual 作用域并按新账号读取；旧 401/409/成功回执不得发布。
- 首次读取失败使用设备语言，并显示“账号偏好未确认”。同账号已确认值刷新失败时保留该值并标记未同步；可以复用现有按 server+actor+path 的成功 GET snapshot，不能用全局语言缓存冒充服务端事实。
- 选择语言只更新 Provider 状态，不用 `key={language}` 重挂载应用树。因此登录邮箱/密码、资料草稿、首页搜索词、选中日期和导航目的保持不变。
- 用户保存中再次选择时，旧 ACK 只推进服务器 baseline，不能覆盖新选择。结果未知用原 mutationId/原 payload 重试；409 先 GET，新值已等于意图可确认，否则保留选择并基于新版本创建新 mutationId。
- 字典只处理 Orbit 自有 UI key。姓名、公司、活动标题、地点、聊天、用户输入和服务端原文逐字显示，禁止 `t(serverText)`。

## Provider 与字典边界

App 根层顺序：

```text
OrbitApiBaseUrlProvider
└─ OrbitAuthSessionProvider
   └─ OrbitLocaleProvider
      └─ OrbitTimeZoneProvider
```

Provider 对外最少暴露：

```ts
{
  language: OrbitLanguage;
  deviceLanguage: OrbitLanguage;
  source: "device" | "account" | "session-unsynced";
  syncState: "loading" | "idle" | "saving" | "error" | "conflict";
  t(key, values?): string;
  setLanguage(language | "system"): Promise<void>;
  retryLanguageSave(): Promise<void>;
}
```

`messages.ts` 定义稳定 key/参数类型，`zh.ts`、`ja.ts`、`en.ts` 必须同构且全量；view-model 接收 language/translator，未迁移消费者默认 zh，使 0014/0015 可以逐页迁移而不复制字典。日期值继续由 0009 的 timeZone/纯日期规则决定，只改变 label/formatter locale，不能因切语言改变 `selectedDateKey`、绝对时刻或 DST 解释。

## 推荐方案 A 需要补入的精确范围

### Web/API 与共享真源

- `repos/orbits/shared/contract/language.ts`
- `repos/orbits/shared/api-schema/account-language-preference.ts`
- `repos/orbits/shared/i18n/orbit-language.ts`
- `repos/orbits/features/account-language/contract.ts`
- `repos/orbits/features/account-language/live-service.ts`
- `repos/orbits/features/account-language/storage/account-language-live-record-provider.ts`
- `repos/orbits/features/account-language/service-factory.ts`
- `repos/orbits/app/api/account/language-preference/handlers.ts`
- `repos/orbits/app/api/account/language-preference/route.ts`
- `repos/orbits/app/(app)/app/orbit-language-core.ts`
- `repos/orbits/app/(app)/app/orbit-language-context.tsx`
- `repos/orbits/app/(app)/app/orbit-language-server.ts`
- `repos/orbits/app/(app)/app/layout.tsx`
- `repos/orbits/proxy.ts`
- 对应 service/storage/route/Web runtime 测试。

具体 live-record collection 注册位置与 service-factory 装配由 Generator 开始前依据现有 account/profile 模式锁定；若需要数据库 schema migration，停止并单列审批，不用测试内存实现冒充跨设备持久化。

### App 基础设施与当前页面

- `repos/orbit-app/package.json`、`package-lock.json`、必要时 `app.config.ts`：直接声明 Expo 57 匹配的 `expo-localization`。
- `app/_layout.tsx`
- `src/i18n/locale-core.ts`
- `src/i18n/OrbitLocaleProvider.tsx`
- `src/i18n/messages.ts`、`zh.ts`、`ja.ts`、`en.ts`
- `src/api/language-preference.ts`
- 由 `npm run sync:contract` 生成的 `src/api/contract/language.ts` 与新增 schema 副本。
- 现有 Planner 中账号认证、资料、首页、设置四个 screen；并补实际可达的 `AccountScreen.tsx`、`OrbitTabBar.tsx` 及它们直接使用的 account-auth/account-session/home/profile/today view-model。
- 账号/设置子链路若纳入“原有操作”，还需 password reset、permissions、API settings 及 Loading/ErrorState 的精确消费者；不能只翻译入口而留下操作页固定中文。
- `tests/app-locale-core.test.tsx`、`app-locale-account-sync.test.tsx`、`app-locale-long-content.test.tsx`，以及同步契约、现有四页面和 0009 日期不变量回归。

此范围超出现有 Planner 白名单；批准方案后先把最终路径和测试写入 `APPROVED_SCOPE_ADDENDUM.md`，再启动唯一 Generator。

## 验收矩阵

| 场景 | 必须观察到 |
| --- | --- |
| 无记录，设备 ja/en/zh | 每台设备采用自身支持语言；不产生 PUT。 |
| 设备 A 手动 ja，设备 B 同 actor | B 通过服务端 fresh GET 采用 ja；本地缓存不能替代证据。 |
| manual ja 后设备改 en | deviceLanguage 变 en，有效 language 仍 ja。 |
| 选择跟随系统 | 服务端保存 system/null；另一设备采用自己的 locale。 |
| actor/server/cookie 切换 | 前账号文案/保存状态立即失效，迟到 GET/PUT/401/409 不发布。 |
| 503/结果未知/409/伪回执 | 保留选择与各页面草稿；重试身份符合幂等与版本规则，不假成功。 |
| 切换语言时有脏稿 | 邮箱、密码、资料、首页搜索、选中日期、next/返回目标逐字不变，零隐式业务写入。 |
| 三语业务数据 | 姓名、公司、活动、地点、消息及服务端错误原文不被翻译或改写。 |
| 320pt + fontScale 1.6/2.0 | 三语关键控件不裁切、不横向溢出、触点不低于既有 44/50pt，末项可滚动触达。 |
| 日期/时区 | 三语下业务日期键、绝对时刻与 DST 结果一致，仅显示语言变化。 |

## 当前风险与待审决定

GitNexus 在索引刷新后显示相关语言解析、profile storage/update 与 `/api/profile` 影响为 LOW，但根 Provider、tab bar 与多个页面是全局消费者，0013 仍按 H 档执行，不能按图谱的低风险降低测试。

2026-09-15 的改动前基线已经用空白 provider key 重跑：App 账号、资料、设置与首页四组测试共 258/258 通过，0 跳过；Web 语言与 profile 五组测试中 22/22 个可执行用例通过，另 14 个 PostgreSQL 并发/事务用例因未配置一次性数据库 socket 而明确跳过。后者不算通过，采用方案 A 后必须在可用 PostgreSQL 上补跑独立偏好记录的 CAS、幂等、回滚和 actor 隔离测试。

需要用户审阅的唯一实质选择是：采用推荐 A（独立账号语言偏好记录/端点），还是接受 B 的整份 profile 版本冲突与无 profile 限制。产品语言范围、默认跟随设备、手动按账号同步和三语页面范围均已确认，不再重复询问。
