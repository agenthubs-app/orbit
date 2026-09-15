# Sprint 0013 — 执行总结

## 目标实现情况

- 本轮实现了中／日／英三语基础，账号、资料、首页、设置及其可达的密码重置、权限、API 设置主链路可按当前语言操作；姓名、公司、用户输入和服务端业务原文保持原样。
- 手动语言选择写入独立的 actor-scoped 账号偏好，不从旧 profile 字段推断，也不把设备自动语言反写到账号。设备 A 保存后，独立设备 B 的 Provider 通过服务端 GET 回读同一偏好；设备语言变化不能覆盖手动账号选择。
- 保存使用版本条件、mutation receipt、SERIALIZABLE transaction 和账号 advisory lock。并发只一胜、同 mutation 重放、异 payload 冲突、回执失败回滚和数据库序列化有限重试均有隔离 PostgreSQL 证据。
- 本地必需 SC 全部通过。未执行远程部署、生产账号或业务数据库写入；这些不属于本 Sprint 的本地完成声明。

## 运行记录

- 目标／原需求：R-12 基础与第一组页面；SC-0013-01～05。
- 结果：completed。
- run：run-01；Generator owner `/root`；2026-09-15 04:35～06:02 JST。
- Planner revision／SHA256：revision 2；`6f02d207f00b2e044a6a85c7073a5b905c47036cdff677ad457d993742e48ae8`。
- 基线 HEAD／承接的脏文件：`cdd82a31e`；仅保留用户未跟踪的设计 PNG/zip/目录、`repos/orbit-app/prototypes/` 和 `.gitnexus`，未纳入本轮提交。
- 被验收的最后功能 HEAD：`9d5c13622b45029ec8b96e09129ad05dd160497b`。
- 原环境／账号角色／设备：本地合成 actor、一次性 PostgreSQL 18 cluster、iPhone 17 Pro / iOS 26.4 Simulator / Expo Go；未使用生产账号。

## 改了什么与 commit 对应

| 功能／原因 | 实际文件 | commit SHA | 验证的 SC |
| --- | --- | --- | --- |
| 独立账号语言契约、GET/PUT、事务存储与回执 | `repos/orbits/shared/**/account-language-preference.ts`、`features/account-language/**`、`app/api/account/language-preference/**` 及测试 | `cc3930449` | 01、03、05 |
| App locale core、Provider、共享契约副本及账号／首页／设置首批消费者 | `app/_layout.tsx`、`src/i18n/**`、`src/api/language-preference.ts`、目标页面／view-model／测试 | `1bd99f737` | 01～05 |
| 可达账号操作与资料提取／建议三语补齐；独立 Context 限制测试和静态消费者依赖 | `src/i18n/OrbitLocaleContext.tsx`、password reset、permissions、Profile 及直接测试消费者 | `9d5c13622` | 02～05 |

## 验收结果

| SC | 结果 | 命令／场景与证据 | 结果及范围 |
| --- | --- | --- | --- |
| SC-0013-01 | pass | Provider 设备 A PUT→独立页面设备 B GET；服务／路由／真实 PostgreSQL 组合 | Provider 双设备文件 7/7；服务、路由和 PostgreSQL 13/13。未使用本地缓存冒充服务端回读。 |
| SC-0013-02 | pass | core/profile/view-model、账号／设置／首页、密码重置、权限与 Profile 完整文件 | 三语字典严格同键；受影响组合 157/157、Profile 166/166，业务原文保持 literal。 |
| SC-0013-03 | pass | 切号、旧 GET/ACK、快速二次选择、失败重试、409 刷新、脏稿保持 | Provider 7/7；页面／生命周期组合覆盖失焦、切号和输入保留。 |
| SC-0013-04 | pass | RNW 窄屏／宽屏／dark／1.6～2.0 字号；Simulator EN、JA 大字号冒烟 | 账户页面复验 55/55；原生页面可滚动、关键控件可达，无 runtime error 或关键裁剪。 |
| SC-0013-05 | pass | `npm test` 一次共享基础设施全量尝试、失败文件修复复验；0009 日期不变量 | 两次全量尝试的旧夹具失败如实保留；通知修复 26/26、Profile 166/166、受影响组合 157/157、日期 5/5，类型检查与 diff-check 通过。 |

## 最小验证与未运行项

| 命令／场景 | 版本／时间 | 退出码／结果 | 对应 SC |
| --- | --- | --- | --- |
| Web 服务／路由／PostgreSQL：3 个 account-language 文件 | `9d5c13622`，2026-09-15 | exit 0；13 pass、0 fail、0 skip | 01、03 |
| App `app-locale-account-sync.test.tsx` | `9d5c13622` | exit 0；7/7 | 01、03 |
| App core/profile/account/settings/home/password/permissions/notifications 组合 | 最后产品 diff | exit 0；157/157 | 02～05 |
| App `ink-signal-profile.test.ts` 完整文件 | 最后产品 diff | exit 0；166/166 | 02～04 |
| App 账号／设置／source 静态复验 | `9d5c13622` | exit 0；55/55 | 02、04 |
| 0009 日期不变量 | `9d5c13622` | exit 0；5/5 | 05 |
| `npm run typecheck`、`git diff --check` | `9d5c13622` | exit 0 | 02～05 |
| Expo Go 原生 EN／JA、大字号 | 最后产品 diff | 可启动、可滚动、无关键裁剪或 runtime error | 02、04 |

本 Sprint 为 H 档，执行过一次 App 全量触发。首次全量暴露旧测试边界：contact-pipeline 的 `__DEV__`、calendar/shell 的 router fixture、Profile 固定中文静态断言；修复边界后受影响文件通过。第二次全量仅剩 4 个 notification fixture 不认识新 Context／缺少 `useContext`；改为对 locale Context 做窄 mock 后完整 notification 文件 26/26。依 RULES §5.3 未第三次重复全量，不能把结果写成“最终全量通过”；以上受影响完整文件及消费者复验是最终证据。

未运行远程部署、生产业务数据库、真实个人账号或付费 provider。全部 provider key 在相关测试中清空，新增模型调用 0。

## 交接

- 0014／0015 可复用 `useOrbitLocale`、严格三语字典、literal 业务文本规则和账号偏好刷新；新增页面只迁移产品 chrome，不能翻译服务端原文或用户内容。
- App/API 最后功能版本分别为 `9d5c13622`／`cc3930449`。同账号偏好需要页面进入、前台或显式刷新读取，不声称实时推送同步。
- 一次性 PostgreSQL cluster `/tmp/orbit-account-language-cas.Yc9EXo` 已停止并逐项删除；没有活进程或测试数据遗留。
- GitNexus staged 扫描因当前索引未映射 App 子仓路径返回 0 个符号，未作为低风险证据；改用真实 diff 审查和上述直接消费者回归。
- 回退应按三个功能 commit 精确反向处理，不得清理用户未跟踪设计素材或 prototype。
- 下一步：按依赖顺序执行 0014，再执行 0015；二者共享字典锁，保持串行。
