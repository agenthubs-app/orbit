# Sprint 0106 — App 新用户引导（设计案 → 实现）

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 用户 2026-09-27 决定：网页 `/profile/onboarding` 补到 App。该网页功能由 Li-QY 实现（提交 e167ca834、767160762、eadf3bd39），设计案须与其网页版对齐，并供其审阅。
**单一目标:** App 新用户引导与网页等价（同一接口、同一完成判定），资料未完成的用户登录后进入引导。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0105 合并后的 `chat-agent`（开工时追加提交号）。
**进入条件:** ① 设计案经用户批准（SC-0106-01）；批准前只允许做只读调查与设计案，不改产品代码。② 付费 AI 调用（自我介绍初稿）计入 $5 累计账本，本 Sprint 运行时验证最多 6 次。

## 已查明的事实（2026-09-27）

- 网页：`repos/orbits/app/(app)/app/profile/onboarding/page.tsx`（登录检查、`resolveBusinessCardCaptureAvailability()`）→ `onboarding-0918/`：`onboarding-model.ts`（`ONBOARDING_STEPS = profile, goals, persona, intro, import`，另有 welcome 与 home/network 预览视图）、`onboarding-flow.tsx`、`onboarding-client.ts`、`onboarding-card-import.tsx`。
- 接口：`GET/PUT /api/profile`（保存后校验回执并回读）；`POST /api/contact-drafts/business-card/scan`（扫自己名片自动填姓名/公司/职位）；`POST /api/profile/intro-draft {language}`（进入 intro 且简介为空时自动生成，重生成上限 `INTRO_REGENERATE_LIMIT`）；`POST /api/profile/seek-suggestions`（网页已导入但无调用点）；导入步骤复用名片批量导入 v2 `/api/contact-drafts/business-card/batches/v2/**`。
- 各步保存字段：profile = birthDate、displayName、organization、primaryIndustryId、role、secondaryIndustryId；goals = relationshipGoal（由目标、重点、周期组合）；persona = offering、seeking、topics；intro = bio、headline；import 仅名片批量导入。
- 完成判定 `repos/orbits/features/profile/onboarding.ts:14-23`（policyVersion 1）：displayName 非空、一级/二级行业有效、birthDate 有效。网页闸门 `proxy.ts:106-131` + `profile-onboarding-route-policy.ts`（`/app` 下 GET/HEAD；豁免账号页、资料页、continue、引导页、admin/access、login-admin）。
- App 现状：无引导路由；`/profile/continue` → `/profile?complete=1&next`；登录后 `src/view-models/account-auth.ts:177` 对未完成资料跳 `/profile?complete=1&next`；`ProfileScreen.tsx` 显示缺失字段并打开编辑器；无全局闸门。0101 已把「无 next 时」登录默认页改为 `/home`。
- App 契约 `src/api/profile-detail-contract.ts:11-15` 已镜像 4 个完成字段。
- 新增原生路由会同时触发 `tests/app-wide-route-coverage.test.ts`（显式清单 58 项 + `integratedFeatureRoutes`）与 `docs/designs/2026-09-08-app-wide-style/README.md` 的路由表，两处都要登记。

## 设计案必须回答（SC-0106-01）

1. 流程与视觉：5 步 + 欢迎页在手机上的布局；与网页版逐步对照（同字段、同校验、同文案来源）。
2. 何时进入引导：登录后资料未完成 → `/profile/onboarding`（取代 `/profile?complete=1`）？已有 `next` 时完成后跳回 `next`？是否像网页一样对其他页面加全局闸门（建议：只在登录后与 `/profile/continue` 入口引导，不加全局闸门，避免把老用户锁在外面），由用户拍板。
3. 名片：扫自己名片与导入人脉在 App 上复用哪些现有屏幕/能力（App 已有名片拍摄与批量导入入口），相机权限与失败处理。
4. 自我介绍初稿：生成时机、重生成上限与网页一致；失败/超时的界面。
5. 与 Li-QY 网页版的差异清单（如有）与理由。

## 范围与文件（批准后）

- 读取：上面列出的网页文件、App `ProfileScreen`、名片相关屏幕、`account-auth.ts`、`profile-continuation-route.ts`。
- 修改/新建：App `app/profile/onboarding.tsx`（新路由）及 `src/screens/profile/onboarding/*`；`account-auth.ts` 与 `profile-continuation-route.ts` 的跳转；路由覆盖清单与 README 路由表；三语文案。
- 排除：网页端任何改动；新增服务端接口（全部复用现有接口，若确需新接口，停下报告）；`seek-suggestions`（网页也未使用）。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0106-01 | 设计案（artifact）经用户明确批准，含上面 5 个问题的答案 | 批准记录（日期、原话） |
| SC-0106-02 | 新注册账号在 App 登录后进入引导；逐步保存并回读；中途退出后重进从未完成步骤继续；完成后进入 `next` 或首页 | App 测试 + phoneweb/Simulator 录屏或截图 |
| SC-0106-03 | 保存失败、网络断开、AI 初稿失败时界面给出可重试的错误，不丢已填内容 | 失败注入测试 |
| SC-0106-04 | 同一账号在 App 完成引导后，网页不再被闸门拦截，网页资料页显示相同内容（反之亦然） | 跨端回读证据 |
| SC-0106-05 | route-parity 不再报 `/profile/onboarding`（0107 未完成时仍会报 `/events/[id]/live`，属预期）；路由覆盖清单与 README 同步；两端全量、typecheck 通过 | 摘要 |

## 测试

- 档位 H（登录跳转、资料写入为共享路径）。开发集：引导视图模型与屏幕测试、`account-auth` 跳转测试、`profile-continuation-route`；收口：App 全量一次；orbits 未改则复用最近证据。
- 运行时：本地生产构建的 Web/API（端口 3100）+ phoneweb + Simulator，新注册的 QA 账号（用后删除），中/英/日各走一次主流程；付费调用计数写入报告。

## 失败与交接

设计案未批准则本 Sprint 保持 planned，协调者先做后续不依赖它的 Sprint。报告列出与网页版的差异、付费调用次数、测试账号清理记录。
