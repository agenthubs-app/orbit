# Sprint 0028 / run-01 执行报告

- 状态：`completed`（固定 D SHA 已合并到 `chat-agent`，精确合并树验证通过）
- Generator：D 线 `/root`
- 开始／结束：2026-09-15 16:20–19:17 JST
- Planner revision：1；SHA-256 `ffeb99d13b5a3704dd9893fe28fd36687651ce87b7384e11b261df343153dd45`
- 规划提交：`c66761eea`；0026 合入基线：`c0d0ac094`（包含 `f5f595df4` canonical identity）；主体功能：`6dd44b94a`；视觉／Dynamic Type 修复：`7df4819a2`
- 档位：H + I；未部署、未写生产数据库、未调用付费 provider。

## 交付行为

Web／共享契约新增 `spokenLanguages`、LinkedIn／X 字段、80 个可见字符的 bio、两组各 5 个稳定标签，以及 `bio/offering/seeking` 建议目标。资料保存继续使用 actor、`expectedUpdatedAt` 和 `mutationId`；actor-scoped PostgreSQL provider 在事务内完成 CAS、receipt 和有限 serialization retry。建议采用／忽略各自持久化且可幂等重放，只返回草稿 patch，不自动 PUT profile。

App 把原单页编辑拆成 `/profile/edit`、`/profile/more`、`/profile/tags`、`/profile/suggestions` 和 `/profile/preview` 五个 private route；它们共享按 API origin＋canonical actor 隔离的 edit session。只有主编辑页保存；409／503 保留同一请求和草稿，切换账号或服务器不串稿。主页、设置和账号页按八张 Ink & Signal 图使用真实账号、统计、通知、语言、workspace 和既有路由。

公共投影由共享 contract 的显式 projector 统一：允许公开身份、简介、标签、语言和公开偏好，排除生日、默认跟进节奏、私密 handles、suggestion provenance 和内部字段。预览本人时消息／加入人脉按钮为 disabled，零写入。

## 实际范围补充

为保持全 App 路由与兼容测试同步，除 Planner 字面白名单外更新了 `tests/app-wide-route-coverage.test.ts`、`tests/mobile-route-access.test.ts`、`tests/notifications/merged-notification-lifecycle.test.ts`、`tests/profile-screen-source.test.ts`。`ProfilePagePrimitives.tsx`、`profile-page-model.ts` 和 `useProfileEditSessionScreen.ts` 位于已批准的 profile 局部视觉／session helper 边界；`app/account.tsx` 是 Planner 明列的必要路由接线。未修改全局 `AppScreen`、`OrbitTabBar`、主题 token、通用 API client、Auth provider 或导航基础设施。

根 `orbit-d177` GitNexus 索引刷新两次未完成（一次 native worker idle timeout、一次人工中止挂起），因此功能 staged 检测返回 `No changes detected`，不能用作低风险证明。为继续履行 impact 门槛，本轮建立 fresh App-only `orbit-app-d177` 索引；各页面为 LOW，共享 `ProfileSection` 为 HIGH、`ProfilePageFrame`／`ProfilePrimaryButton` 为 CRITICAL，blast radius 限于五个新 profile 页面并由 227 项定向、2829 项全量和五页原生复验覆盖。最终文档 staged 检测返回 6 files／20 symbols／0 processes／LOW。

## 自动化与构建

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Web 0028 定向（默认环境） | 55 项：41 pass、14 skip、0 fail | `repos/orbits/build/harness-logs/sprint-0028-web-targeted-final-2.log` |
| Web profile PostgreSQL | 14/14 pass | `repos/orbits/build/harness-logs/sprint-0028-web-profile-postgres.log` |
| Web typecheck | exit 0 | `repos/orbit-app/build/harness-logs/sprint-0028-web-typecheck-final.log` |
| Web production build | exit 0 | `repos/orbit-app/build/harness-logs/sprint-0028-web-production-build.log` |
| App 0028 最终定向 | 227/227 pass | `repos/orbit-app/build/harness-logs/sprint-0028-app-targeted-final-3.log` |
| Dynamic Type RED→GREEN | RED 复现 22 个裁切文本；GREEN 10/10 | `repos/orbit-app/build/harness-logs/sprint-0028-app-dynamic-type-green.log` |
| App typecheck | exit 0 | `repos/orbit-app/build/harness-logs/sprint-0028-app-typecheck-dynamic-type.log` |
| App 最终全量 | 2829/2829 pass，0 fail、0 skip | `repos/orbit-app/build/harness-logs/sprint-0028-app-full-final-dynamic-type.log` |
| iOS build／安装 | Build Succeeded；0 error、0 warning | `repos/orbit-app/build/harness-logs/sprint-0028-ios-build.log` |

默认 Web 定向的 14 项 skip 只在 `ORBIT_PROFILE_TEST_SOCKET_DIR` 缺失时发生。它必须指向形如 `/tmp/orbit-profile-cas.<alphanumeric>` 的一次性 PostgreSQL Unix socket 目录；测试明确拒绝业务数据库环境变量。本轮建立 `/tmp/orbit-profile-cas.D0028A` 后，14 项跨连接 CAS／首次创建／receipt replay／回滚／serialization retry／actor isolation／HTTP conflict 全部通过。

Web 全量尝试为 3380 项：3128 pass、57 fail、195 skip。57 项均为仓库既有的独立 PostgreSQL／迁移／恢复／事件测试环境前置缺失，例如 `ORBIT_EVENT_DATABASE_URL` 和本地 migration smoke database；D 线 profile 定向为 0 fail，专用 PostgreSQL 14/14 已补齐。该全量结果不写成通过。

App 首次全量暴露 15 项：12 项超时／并行波动在失败文件独立矩阵通过；3 项为新增路由、notification harness 和 public projection 源断言兼容缺口，修复后 29/29，随后全量 2828/2828。更多资料视觉修复后的全量出现 Inbox `wide-dark` 点击 1.5 秒超时，同文件独立复验 12/12。第一次 Dynamic Type 全量重跑在 Playwright 创建 `/tmp` artifact 时因 `ENOSPC` 中断；释放本任务 DerivedData 并把 `TMPDIR` 移到 ORICO 独立目录后，从头重跑为 2829/2829。

## 生产运行与跨端证据

- 最后一次 Web／shared 修改后重新 production build，停止旧 31019 进程并以当前 D 产物启动 `http://127.0.0.1:31019`；`web-health.json` 为 `live/ok`，记录功能 HEAD `6dd44b94a`。
- Web 浏览器登录态通过正式 `/api/profile` 写入 bio、两组标签、语言、LinkedIn／X 和私密生日；Simulator 同一账号回读。脱敏证据：`web-to-app-profile.json`。
- Simulator 将 role 保存为 `D-line QA Lead` 后，同一 production HTTP API／同一账号 session 回读版本 `2026-09-15T09:13:45.988Z`，并保留上述字段。Playwright 控制在刷新页时停滞，因此 App→Web 使用相同生产 API 的认证 session 读取；证据 `app-to-web-profile.json`，不声称完成了可见浏览器刷新。
- stale version PUT 返回 409／`CONFLICT`；第二 actor 回读独立资料且没有 D 线私密字段。证据：`web-stale-409.json`、`secondary-actor-profile.json`。
- iPhone 17 Pro Simulator（iOS 26.4）安装当前 D 源码构建，bundle 使用 8083，App base URL 为 `http://localhost:31019`。八屏截图、Web-rendered 初检、大字号冷启动截图和 accessibility tree 位于 `build/harness-state/evidence/sprint-0028/run-01/`；逐项结论见根 `design-qa.md`。

## SC 结果

- SC-0028-01：pass。主页、设置、账号与真实状态／路由、空／错态、窄屏、大字号、深色和三语均覆盖。
- SC-0028-02：pass。共享 session、80／5／5、子页返回、保存 CAS／幂等、失败保稿、actor／origin 隔离均通过。
- SC-0028-03：pass。采用／忽略持久化、重放、批量部分失败、抽取待复核与零自动 profile PUT 均通过。
- SC-0028-04：pass。单一公开投影、私密字段负断言、disabled CTA、未保存草稿预览、大字号冷启动和 VoiceOver tree 均通过。
- SC-0028-05：pass。当前生产 Web/API、当前 App build、同账号双向版本回读、409、另一 actor、八屏视觉及最后构建门槛均完成。

上述 D 分支结果与主线收口证据共同满足 Sprint 完成门槛；发布仍由 BR-006 单独验收。

## 主线收口

- 固定最终 SHA `d37d6545d` 已由 merge commit `314aedd7c` 合并到 `chat-agent`；该 merge 的第二父提交正是固定 SHA。
- 精确合并树的 profile 目标矩阵 237/237、App 全量 2860/2860、App typecheck 均通过。全量首次暴露的 3 个 Inbox workspace 旧交互断言先稳定 RED，按 Sprint 0030 当前默认 Inbox 契约更新测试后独立 44/44 GREEN，再从头全量通过；没有为此修改 Inbox 产品行为。
- 当前主线 iOS generic Simulator build 为 `BUILD SUCCEEDED`；依赖库与迁移后的 DerivedData stale-path 有警告，无构建错误。两台已启动的 iOS 26.4 Simulator 已安装并启动 `app.agenthubs.orbit` 当前主线包。
- 当前主线 Web 已重新 production build，旧 3000 进程已替换；`GET /api/health` 返回 200、`live/ok`。这些是本地共同环境证据，不代表远程部署或实体设备发布。

## 已知边界

同步仍是进入页面／focus／显式 refresh，不是实时推送。更多资料保留合同已有的 email、phone 和介绍方式，标签／建议只展示真实候选，设置／账号省略没有后端的能力；这些是有依据的实现差异。未检查远程部署、实体设备、生产数据库、真实简历／名片 provider 或生产账号。
