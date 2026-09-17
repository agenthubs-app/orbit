# Production 合成数据测试环境（2026-09-16）

- 状态：Web 已发布；App `consumer_ready`，原生共同环境验收未完成。
- 授权：用户明确要求 mock 作为 Production 运行数据供测试，正式上线前再清空；不再等待不存在的历史源库或备份。
- 环境：`https://orbit-puce-kappa.vercel.app` → Neon `orbit` / Production `br-shy-rain-b3281a9u` → `workspace:orbit-demo-fixtures`。运行模式 live；App 只经 HTTP API。本机 App `.env.local` 已指向该入口，不提交凭据或本地配置。
- 数据导入：空目标、schema/约束/迁移账本比较通过；56 张业务表共 9,217 行原子复制并逐表 SHA-256 校验。保留原 ID、版本、权限和审计；此数字是导入时快照，不是后续测试写入后的动态总数。
- 主办方：13 个登录身份与静态投影已合并，补齐登录 profile 缺失字段，26 条重复 account/profile 可恢复停用；84 个 active account。没有更改密码或 Google 主身份。资料总数不等于人数，主账号另有 auth-membership 投影。
- 活动：原 13 场公开历史活动保持原时间；另建 `event_demo_cloud_flow_20261018` / `DEMO20261018`（10 月 18 日 14:00–16:00 JST），明确为测试/无真实会务。运营门禁经正式主办方 UI 保存。

## 验证及版本

- 第一版 Production `dpl_13gDiBRfLgooS6DN1AEjnFkHVEjS` Ready：主办方凭据登录、64 人后台目录；独立参与者浏览器进入同后台被拒；App client 先前创建的同一 task 在 Production Web 回读。
- 当前修复版 Production `dpl_5JaVX9ko5phE3T4cdFTGcmmcMFxs` 已绑定正式别名；参与者取消成功、刷新后仍为已取消，保留原始回答。
- 新活动：参与者回答两题、报名成功、刷新后保留原始回答；AI 派生画像与报名原始事实分离。
- 取消后重报已验证，canonical membership versions 1/rsvped → 2/cancelled → 3/rsvped 保持同一 source_registration_id。
- 主工作区增加 `demo-owner@orbit.example.test` 合成 credentials 登录，经既有 auth-membership 指向 `account_orbit_generated`；原 Google 身份不变。正式浏览器已登录并在 `/app/contacts` 读到 66 位联系人。此测试登录必须在正式清理时一并撤除。
- 运行源码提交 `b7e1f43e6`；关系 fixture 投影脚本及测试提交 `1f9cca960`。后者已直接应用到 Production 数据，不改变 Web 运行源码，不需要新部署。没有修改 App 业务源码或共享 HTTP 契约。
- 实测取消请求失败，定位为 Web 发送空 POST 而版本化接口要求 JSON。现页面发送 `intent=cancel` 和 `expectedRegistrationVersion`，不改 API 或 App 契约；组件回归先失败后通过。19 项相关测试及 Web typecheck、production build 通过。修复部署和最终取消结果见执行计划。
- App 原生环境：Expo Go 报缺少 ExpoAsset；项目自身 iOS 构建失败于 expo-modules-jsi `weak let`，当前 Xcode Swift 6.2.1，15 errors。源码依赖未修改；浏览器运行版跨域失败，没有禁用生产保护。
- GitNexus query/impact/detect-changes 进程均 SIGSEGV，不能作为已通过的图分析；已补源码调用点审查和定向测试。
- 后续关系 fixture 整理已在 Production 提交：662 条定向更新，66 联系人/66 有效关系、66 当前任务/14 dismissed 历史，384 重复关系和 66 旧分析可恢复停用；原 evidence 保留。正式生命周期 preflight 从 1,192 条问题降为 0，canonical read projection 66、重放无更新；Web 列表/详情刷新通过。46 项定向回归、typecheck 通过。这是 fixture 专用投影，不是通用真实用户迁移。

## 精确未完成项

1. 当前原生 App → Production API 的完整双向业务验收，需要兼容当前依赖的原生构建环境；此前本地其他 Sprint 的成功不替代当前证据。
2. 其余 mock 跨域关系语义及真实 worker 场景按原计划继续，不以记录总数或单一活动报名代表全链路通过。已确认 Vercel 队列及 maintenance pass 不含 event-operations worker；需落实云端持续执行入口后才能声明后台匹配全流程可用，不能靠开发机器长驻代替云服务。
3. 正式接收真实用户前，清理整个测试 workspace（包含测试时新增记录）、切换正式 workspace、验证空业务库并落实备份。此次未提前全库清理。

敏感快照和测试凭据仅保留本机 `/Users/li/.config/orbit/` 的受限文件；文档、Git、App bundle 中均不存连接串或密码。
