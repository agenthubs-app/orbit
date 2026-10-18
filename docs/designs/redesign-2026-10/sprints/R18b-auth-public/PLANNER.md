# Sprint R18b — 认证与公开入口

**Plan revision:** 2（2026-10-18；独立复核 S1、M1–M4、m 项由主会话按 RD-33 代定）。**模式:** existing-codebase / single-generator（C 线；执行：**Codex 主开发会话**）。**档位:** H。  
**单一目标:** 按 b1 / b7 改稿并补齐画板 → 接通 Web 落地页、App 欢迎页、两端认证四态与公开帮助 / 异常态 → 将版本接口接 live、保留关闭的强制更新开关 → 删除本线旧屏 → R31a / R31b 合入后做像素收口。  
**易读目标:** [GOAL.md](GOAL.md)。**基线:** 开工从 `origin/redesign` 更新 `line-c`；本文件的源码行号按编制时 `redesign` HEAD `1524d3667`，开工按符号复核。已知失败按 [README](../README.md) 最后一份登记与上游 REPORT 判断。  
**进入条件:** R18a 交付设置入口和占位；RD-31 / RD-32 / RD-33 生效。像素收口须等 R31a / R31b 合入。缺的 Web 1024 / 390 / 深色画板须先补进 b12，改稿与补画由主会话在 Sprint 复核时认可；不能拿尚未补出的画面声称已过门禁。  
**线内顺序:** R18a → **R18b** → R18c → R28。**提交:** C 线按路径小步提交，**不推送**；主会话独立复核后集成（RD-32）。

---

## 0. 给 Codex 的执行说明

1. **地点与沟通。** 在 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-c`（`line-c`）执行；开工 `git pull --rebase origin redesign` 并检查工作树。Codex 主开发会话可在线内分工，但共享文件不得同时改。主会话（Claude）通过 `/Volumes/ORICO/Dev/worktrees/orbit/_runs/talk-codex.sh` 联系你；每轮最后回复汇报 SC、提交号、通过 / 失败摘要、请求与下一步。别在 `redesign` 或其他线的 worktree 实施本 Sprint。
2. **阅读。** 本文件与 GOAL；[README](../README.md) 的 RD-16、RD-24～33 和通用规则 10–13；[HOW-TO](../HOW-TO-START-A-FEATURE-SPRINT.md) §0–10；[HANDOFF](../HANDOFF-TO-FEATURE-SPRINTS.md) G01–G26、R18-03～09；[DEFERRED-A](../DEFERRED-A.md)、[旧屏归属](../screen-ownership.md) 的账户 / 公开页行；[决定表](../maintenance/2026-10-12-decisions.md) D14、D55、D56、§9-2、§20、§38；[IMPLEMENTATION-PLAN](../../IMPLEMENTATION-PLAN.md) 的公开页与 D-23；[R18a PLANNER](../R18a-account-mypage-settings/PLANNER.md) §2、§3、§8；两端 `AGENTS.md` 与 `repos/orbits/scripts/visual/README-redesign.md`。RD-32 已修订旧 GitNexus 规则，本 Sprint 以读代码、文本搜索、全量测试与门禁评估影响。
3. **提交与边界。** 只提交 §1 的本线文件，按路径提交并核对 `git show --stat HEAD`；不 `git add -A`，不推送。提交前从 `origin/redesign` rebase；`b12` 冲突保留其他线的块、本线追加末尾；契约快照冲突重生，不手工拼。共享契约只加不改，同步 App 副本与源同提交。D 线壳改动在检查点 M5 按路径单独提交，不混入 R20a 未提交改动，也不夹在 C 线提交里。
4. **代定与停点。** §2 的代定照做并在 REPORT 写出处；新矛盾按 RD-33 跳过受影响小项，记录「待主会话代定」（选项、推荐、影响 SC），继续独立项。需要改非本线文件时写「请求」。Neon、生产库、部署、生产变量、真实 OAuth、TestFlight 留「待用户授权」，不执行。一个画面最多 3 轮；全量新失败修 2 次仍不清楚，停止扩大改动并报失败用例。组件库未合入时只完成结构 / 数据 / 行为，列「待组件库」门禁清单。
5. **证据与交接。** `REPORT.md` 按 HOW-TO §10 记录每条 SC 与交接表结果；`preflight-checklist.md` 逐屏给五项结论；截图、日志、triptych 放 `~/orbit-sprint-evidence/redesign/R18b/run-01/`。REPORT 另列「改稿与补画」「请求」「待主会话代定」「待用户授权」「未过与重比」「交接表追加（四栏原文）」「文档更新请求」「越线自查」。README / HANDOFF / DEFERRED-A / 决定表 / screen-ownership 由主会话合并，请求写 REPORT，不碰汇总文档。

## 1. 本线归属 / 不许碰（RD-31）

**C 线可改（开工核对 R18a 最新提交，保持 R28 的导出接口向后兼容）：**

- **Web 公开与认证（`repos/orbits/`）：** `app/page.tsx`、`app/(app)/app/page.tsx` 的公开 / 会话路由；根级 `app/{help,terms,privacy}/page.tsx`（不要求登录）；`app/(app)/app/account/{login,signup,forgot-password,reset-password,mobile-google}/**` 与 `app/(app)/app/account/auth-0918/**`（替换后删）；本线公开 404 / 维护路由及页面私有组件、样式、文案（新建 `app/(app)/app/orbit-2026/auth-public/**`）。旧落地 `app/(app)/app/{orbit-landing-0918.tsx,orbit-real-landing-page.tsx,orbit-landing-route-view-model.ts,orbit-reference-styles.tsx}` 列入 §7 SC-13 的归属 / 清理清单；后两者有跨线引用，按清单条件处理。`/app/account` 的账户管理与导出 / 退会归 R18c，不动。
- **App 认证与公开（`repos/orbit-app/`）：** `app/index.tsx`、`app/[...legacy].tsx`（本 Sprint 归 C 线，主会话通知 D 线）、`app/account/{login,signup,forgot-password,reset-password,mobile-google}.tsx`；公开 `app/help.tsx`、`app/legal/{terms,privacy}.tsx`（不包 `withOrbitPrivateRoute`）；`src/screens/profile/{AccountAuthScreen,PasswordResetScreen}.tsx` 与本线欢迎 / 帮助 / 异常屏；`src/view-models/{initial-route,account-auth}.ts` 仅做兼容调整；`src/i18n/{ja,zh,en}/account.ts` 只加键，公开文案可建本线域并在汇总文件只追加。不要改 R28 的 onboarding 页面。
- **设置入口与支持配置：** App `app/settings/{help,terms,privacy}.tsx`、Web `app/(app)/app/settings/{help,terms,privacy}/page.tsx` **仅跳转公开路由**，替换 R18a 的 `[section]` 占位；静态段优先测试归本 Sprint。新建 `repos/orbits/shared/config/support.ts`，`supportEmail: null` 起步；如 App 需要副本，按共享同步规则同提交。
- **版本：** `repos/orbits/app/api/app/version/route.ts`、`features/redesign-contracts/{service-factory,handlers}.ts` 的本线条目、服务端环境变量读取模块、`shared/contract/account.ts` / `shared/api-schema/account.ts` 的可选字段；App 启动版本消费与强制更新页面。新增独立 `app-version` live 能力，`account-lifecycle` 继续 mock 给 R18c；不建表、不迁移。Web 新版浮条由 C 线交契约、页面状态与演示证据，壳呈现位置需要 D 线单独改。
- **设计与门禁：** `b1-*.html` / `b7-account-misc.html` 仅 §9 指定文案就地改；`b12-missing-states.html` **只在末尾追加** R18b 画板；新建 `scripts/visual/views/{web,app}-R18b.json`、对应两端 `attribution-redesign-R18b*.json`、本目录 `preflight-checklist.md` / `REPORT.md`。路由登记、审计计数和三份旧屏允许清单只改本线条目；共享汇总文件只追加自己的行。

**不许碰（如需改写 REPORT 请求）：** A 线 App / Web UI 组件、token、visual 工具与 kit；B 线人脈、邀请业务和其他公开 `o/[slug]` 页面；D 线 App **根** `app/_layout.tsx`、`src/components/{OrbitTabBar,TabPageBar,ShellTopBar,AppScreen}.tsx`、`src/view-models/{app-navigation,shell-state}.ts`、Web `orbit-2026/shell/**` 与 `shell-routes.ts`；R18c 的 `/account`、`/api/account/{exports,deletion-request,session}`、账号管理屏；R28 onboarding；E 线 iOrbit；生产配置与根目录汇总文档。App `app/index.tsx` / `app/[...legacy].tsx` 本 Sprint **归 C 线**，不再列 D 线不许碰项。`app/(app)/app/page.tsx` 里已登录重定向仍由本线按既有规则保留，不能因此改 D 线导航壳。R17 的公开主办页套用 b1 顶栏另交 R17，不越线改。

**D 线单独请求 / 单独提交（R18-03，M1 / M5）：** 在 `redesign-d` 的检查点 M5 改根 `app/_layout.tsx` / `ShellTabBar`：**只在已登录时显示底栏**，会话确认中、未登录欢迎 / 认证 / 密码重置、强制更新与公开异常屏都不显示；`ToastProvider.hasTabBar` 与真实可见状态一致，登录后一级页仍显示。按路径单独提交并测会话切换 / 转场，绝不混入 R20a 未提交改动；提交号写 R18b REPORT。Web 新版浮条若必须挂壳也在 D 线另交。C 线先交状态与复现，不直接编辑壳；D 线未交时继续 C 线独立项。

**本线环境：** Web 3400，`ORBIT_NEXT_DIST_DIR=.next-line-c`；Metro 8084；本地库 `orbit_line_c` / 隔离测试库；设计稿 3420；iOS 模拟器独立 `Orbit Line C`，按 UDID 操作。`.env.local` / `.env.development.local` 仅本地配置，不提交。**所有 Python 命令先 `uv venv`（如需）并用 `uv run`**。不连 Neon / 生产。

## 2. 主会话代定（2026-10-18，RD-33；用户回来可逐条推翻）

1. **公开与会话入口。** 未登录 `/` 与 `/app` 共用 b1 #0 的公开落地体验；**已登录 `/` 和 `/app` 都跳 `/app/home`**，带安全 `next` 的登录 / 注册完成后优先回目标。App 首次未登录到 b1 #1 欢迎，已登录或深链直达既有目标。拒绝外域 `next`，保留 `/i/<code>` 的邀请回跳；取消登录回公开入口。
2. **旧认证改造。** b1 #2–#9 和 #60 是功能基准。Web 落地页上开启登录 / 注册 / 忘记密码 / 重置密码弹层，公开路由深链可直达相同状态；App 用全屏状态。两端注册页「同意条款」文字链接公开的条款 / 隐私页。旧英文弹窗与硬编码浅色样式在新链路接通后删除；Google 登录沿已有 `mobile-google` broker，保留取消 / 错误 / 成功出口。
3. **b1 文案与现有数据。** 落地页「最多 3 个目标」与 `PLAN_V2_GOAL_LIMIT = 2` 冲突，改画板为「最多 2 个」，不扩数据上限。b1 引导页 `b1-onboarding-cards.html:1701`、`:1731` 的「1〜3個まで」归 **R28** 改稿与回归，本 Sprint 只在 REPORT 请求并交主会话；不越线编辑引导画板。暗色 #60 只有 Web 错误态，其余深色按 token 和同构补画。
4. **帮助内容与联系。** b7 #52–#61、#75、#82 里 FAQ 以静态、可搜索 / 展开的条目实现；Pro / 付费条目按 D55 / D56 去掉。新建 `shared/config/support.ts`，`supportEmail` 初始为 `null`；为 null 时显示「準備中」，隐藏复制、邮件和反馈发送入口，绝不显示设计稿示例邮箱。得到用户授权并填入地址后，复制与邮件 App 入口才启用；反馈没有站内后端，不显示「已提交」。Gmail 仅 `gmail.metadata.readonly`，FAQ 不承诺读正文或保存草稿。正式邮箱列 DEFERRED「待用户授权（发布门禁）」。
5. **公开法务与设置跳转（S1）。** Web 根级 `/help`、`/terms`、`/privacy` 不要求登录；App 公开 `app/help.tsx`、`app/legal/{terms,privacy}.tsx` 不包 `withOrbitPrivateRoute`。R18a 的设置占位改静态段，只跳到这些公开路由。条款 / 隐私正文先显示「公開前に掲載」，不伪造法律文本；正式正文列 DEFERRED「待用户授权（发布门禁）」。注册页同意文字链接公开法务路由；可达和发布就绪分别验收。
6. **404 与维护（M2 / M4）。** App `app/[...legacy].tsx` 由 C 线改：已知旧地址沿用迁移表，**未知路由进 404，不再经 `resolveInitialRouteHref` 静默落 `/home`**；Web 未知路由也有 404。维护仅由版本接口可选 `maintenance: { active: true, until?: string }` 明确信号触发，普通 503 与离线都不是维护。`until` 有效才显示恢复时间；b7 虚构 ETA /「离线可继续」卡无真实能力时删掉。404 有回首页 / 帮助出口，错误页不吞可恢复上下文。
7. **独立版本能力（M3 / M4）。** `GET /api/app/version` 新增 **`app-version` live** 能力，`account-lifecycle` 保持 mock 留 R18c。现有契约只加可选 `enforceMinimum?`（缺省 false）、`maintenance?` 和 `webBuildId?`；政策来自**服务端环境变量**，`webBuildId` 来自 `VERCEL_GIT_COMMIT_SHA`，不建表 / 迁移；`Cache-Control: no-store`（满足 ≤300 秒）。App 只在 `enforceMinimum === true` 且低于最低版本时阻止进入；未配置、无网时安全放行并记诊断。首次正式发布前不启用。Web 比较当前页面构建 ID 与接口 `webBuildId`，两者都有且不同才显示可关闭的新版本浮条；不能按 Git SHA 字典序比较新旧。
8. **旧屏与像素。** 先补 Web 1024 / 390 / 深色画板，再做界面；单张补画在 b12 末尾，标题 `W-R18b-*` / `A-R18b-*`，用标题而非会漂移的 index 定位。补画与原稿矛盾按最新已定规则改稿，REPORT 标「主会话代定」。旧落地组件列 §1 / SC-13 的删除清单；`OrbitReferenceStyles` 仍被其他页用时只解除本线引用，事件 view model 的跨线引用先迁移 / 交接再删除。缺画板不能以近似实现通过像素门禁。
9. **底栏（M1 / M5）。** 根 `app/_layout.tsx:27,95–106` 挂 `ShellTabBar`；`app/index.tsx` 默认走 `/home`，确认会话期间会被 `mainTabForPath` 判为 Tab 页。D 线在检查点按路径单独提交「只有已登录显示底栏」及 toast 位置回归，不混入 R20a 未提交改动；C 线负责入口状态、复现与验收。

## 3. 交接条目与通用口径 → SC

| 交接项 | 本 Sprint 处理 / 转出 |
| --- | --- |
| R18-03、README R09 A2 | 根布局的底栏由 D 线检查点 M5 按路径单独提交，不混入 R20a；SC-01、SC-12、SC-15 复现与回归。 |
| R18-04、公开页 D14 / 决定表 §9-2 | Web 落地、登录背景照 b1 重画；SC-02、SC-03、SC-14。R17 `o/[slug]` 的公开顶栏交 R17，不改其业务页。 |
| R18-05 | R18a 已隐藏设置的 Pro；本 Sprint FAQ 去付费条目，SC-09。 |
| R18-06 | `/api/app/version` live、启动检查与默认关闭开关：SC-11、SC-12；导出 / 退会明确转 R18c。 |
| R18-07 | R18a 已做招待代码入口；旧英文注册弹层改新弹层，邀请 `next` 安全回跳：SC-04、SC-06。 |
| R18-09 | R18a 的未同步修改注销动作表只做回归，SC-13；不重复实现。 |
| 归属表账户 / 公开页行 | 旧认证 / 落地文件清理与路由登记：SC-13；C 线接 App `index.tsx` / `[...legacy].tsx`，SC-04 / 10；R18c `/account`、R28 引导保持归属。 |
| 主会话 S1 / R28 转出 | 三个 Web 根级与三个 App 公开路由、注册同意文字、设置跳转：SC-03 / 08；b1:1701 / :1731 的「1〜3個まで」交 R28：SC-16 的文档请求。 |
| 主会话 M3 / M4 / 发布门禁 | `app-version` 独立 live、可选字段、显式维护与构建 ID：SC-10～12；支持邮箱、法务正文未授权列 DEFERRED「待用户授权（发布门禁）」：SC-08 / 09 / 16。 |
| G01–G04、G10–G17、G21–G24、G26 | 公共页不挂登录后壳（G14）；登录后设置页继续用壳插槽 / scope；App 二级页用现有背景、顶栏和 `UiText`；底栏由 D 线处理。token、危险色、次要文字、语言 cookie / 外观按通用规则：SC-02～10、SC-14。G04 / G23 / G23b 组件问题标「待组件库」，不私改 kit。 |
| G05–G09、G25 | §9 预检、演示世界只读 fixture、全尺寸 / 主题门禁与三轮上限：SC-01、SC-14。 |
| G18–G20 | 503 只在确无功能时显示合适空态、契约宽进、旧屏允许清单只减：SC-11、SC-13。 |
| README 合回前首次发布版本项 | 本 Sprint 只交可开关实现和关态证据；启用留首次正式发布，SC-12 / REPORT「待用户授权」。 |

## 4. 已查清的事实（`1524d3667`；实施时按符号重查）

1. **Web 根与认证（`repos/orbits/`）。** `app/page.tsx:10–30` 根页目前渲染 `OrbitLanding0918`，虽传 `authenticated`，仍须按 §2 改为已登录跳 `/app/home`；`app/(app)/app/page.tsx:9–18` 已登录已重定向；`app/(app)/app/account/login/page.tsx:65–99` 仍是旧落地背景 + `AuthModal`。`app/(app)/app/account/auth-0918/auth-modal.tsx:25–69` 处理弹窗，`:75` 起有旧硬编码样式。直接删之前查其引用及账号 / 邀请 / 引导回跳。
2. **App 路由（`repos/orbit-app/`）。** `app/index.tsx:5–6` 调 `resolveInitialRouteHref`；`src/view-models/initial-route.ts:364–367` 默认 `/home`，`:66` 把 `mobile-google` 映到 `/account/login`；`app/account/mobile-google.tsx:3–4` 目前重定向登录。`src/screens/profile/AccountAuthScreen.tsx:47` 起是登录 / 注册 / 找回三个 mode，`:151` 重置请求、`:175` 注册、`:197` 登录、`:234` Google；`src/screens/profile/PasswordResetScreen.tsx:15` 起处理新密码。`src/view-models/account-auth.ts:127` 规范化 `next`，`:156–177` 注册后进登录再去 onboarding；别用新欢迎页打断邀请 / onboarding 深链。
3. **会话 / 注销（`repos/orbit-app/`）。** `src/api/AuthSessionProvider.tsx:113–127` 有未同步修改 ActionSheet，`:611–624` 注销逻辑已存在。R18-09 主体在 R18a，不在此重写。
4. **底栏根因（`repos/orbit-app/`）。** **根 `app/_layout.tsx:27,95–106`** 导入并挂 `ShellTabBar`，`ToastProvider.hasTabBar` 也只看 `mainTabForPath` / 键盘；`app/index.tsx:5–6` 默认经 `src/view-models/initial-route.ts:364–367` 进 `/home`，会话确认期间 `src/components/OrbitTabBar.tsx:71–76` 的 `mainTabForPath` 判为 Tab 页而显示底栏。D 线须加登录状态条件，并让 toast 偏移一致。
5. **Google broker。** App `repos/orbit-app/src/api/AuthSessionProvider.tsx:530` 起调用移动 Google broker；Web `repos/orbits/app/(app)/app/account/mobile-google/page.tsx:8–49` 与同目录 `mobile-google-auth.tsx:6–42` 是回跳端。完成 / 取消 / 拒绝时保留 `next`，不能以浏览器回退猜状态。
6. **版本契约与 mock（`repos/orbits/`）。** `app/api/app/version/route.ts:1–3` 目前导出 mock handler；`shared/contract/account.ts:28–37` 要求 `minSupportedAppVersion` / `latestAppVersion`；`shared/api-schema/account.ts:26–28` 验 semver；`features/redesign-contracts/handlers.ts:198` 提供 mock；`features/redesign-contracts/service-factory.ts:16,35` 含 `account-lifecycle` 但 live 列表不含它。只新增 `app-version` live，不能一键放行 R18c 接口。编制时未找到 App 版本消费者。
7. **旧路由与共享旧组件。** `repos/orbit-app/app/[...legacy].tsx:37` 将任意匹配的旧路径传给 `resolveInitialRouteHref`，未知路径最终由 `initial-route.ts:367` 落 `/home`。Web `repos/orbits/app/(app)/app/orbit-reference-styles.tsx` 仍被任务、设置、活动等页引用；`orbit-landing-route-view-model.ts` 的 `OrbitLandingEventView` 仍被首页 / 活动 / 公共事件页引用，删除前需跨线迁移。R18a 将建 `settings/[section]` 占位；静态跳转段须有优先测试。Web `orbit-2026/shell/shell-routes.ts:9–25` 排除 `/app/account`，公开页与认证页不挂已登录壳。
8. **画板与事实冲突。** b1 #0–#9、#60 与 b7 #52–#61、#75、#82 是本线原始画板；b7 有 Pro、Gmail 草稿、反馈「发送成功」、维护恢复时间等超出现有事实的示例。`repos/orbits/features/plans/v2/types.ts:38` 限 2 个目标；`docs/designs/redesign-2026-10/b1-onboarding-cards.html:1701,1731` 的引导「1〜3個まで」另交 R28；`repos/orbits/features/integrations/service-factory.ts:29` 只见 Gmail 元数据只读权限；`repos/orbits/features/auth/password-reset-smtp.ts:29–30` 重置邮件链接有效期 30 分钟。依 §2 改稿并测试相应行为。

## 5. 契约、数据与状态

- **认证状态机。** `public → login | signup | forgot → reset-requested | reset-form → authenticated / recoverable-error`；Web 弹窗路由和 App 全屏显示同一后端行为、字段校验与错误语义。`next` 只接受站内相对路径，保留邀请 `/i/<code>`；错误 / 取消返回原状态并保留用户可安全保留的输入。密码不记日志 / URL；重置令牌只用于请求，成功后清除，过期提供重新发送入口。
- **版本响应（`app-version` live）。** 复用现有 `minSupportedAppVersion` / `latestAppVersion` semver，**只加可选** `enforceMinimum?: boolean`（缺省 false）、`maintenance?: { active: boolean; until?: string }`、`webBuildId?: string`；App 宽进读取，旧响应仍有效。版本、开关与维护态从**服务端环境变量**读取，`webBuildId` 从 `VERCEL_GIT_COMMIT_SHA` 读取，不建表 / 迁移；未配置或非法配置须安全放行并产生可见诊断，不用 mock 常数伪装 live。接口不依赖登录，`Cache-Control: no-store`；测试覆盖开关关 / 开、低于 / 等于最低、无网 / 非法配置、`maintenance.active` 真 / 假 / 缺失、普通 503、`webBuildId` 有 / 无。`account-lifecycle` 保持 mock。
- **公开帮助与法务数据。** FAQ 为本地静态条目（问答、分类、搜索关键词），没有后台写接口。`shared/config/support.ts` 的 `supportEmail` 先为 `null`；空值显示「準備中」并隐藏复制 / 邮件 / 反馈发送按钮，有值才显示真实地址并允许用户主动打开邮件 App。条款 / 隐私先显示「公開前に掲載」；支持邮箱与正式法务正文均列 DEFERRED「待用户授权（发布门禁）」。公开路由不做登录判断；404 / 维护态的「返回」按会话及来源决定，不循环进错误页。
- **演示数据。** b1 / b7 比对用只读 fixture：未登录、有会话、错误密码、重复邮箱、已发送邮件、过期 / 已用令牌、Google 取消 / 成功、维护 / 离线、版本可更新 / 必须更新。真实 OAuth、生产邮件、线上版本政策不在门禁中调用。

## 6. 画板、补画与预检（HOW-TO §8）

| 画面 ID | 原始画板 | 功能 / 实现目标 | 需补画与门禁 |
| --- | --- | --- | --- |
| W-R18b-01 | b1 #0 | Web 公开落地（未登录 `/` / `/app`；已登录 `/` 进 `/app/home`） | 1440 浅原板；1024 / 390 / 深色补 b12，完整页面。 |
| A-R18b-01 | b1 #1 | App 欢迎 / 开始 | iOS 浅原板；深色补 b12。 |
| W-R18b-02～05 | b1 #2～#5、#60 | Web 登录错误、注册、找回、过期重置；#60 登录错误深色 | 各状态 1024 / 390 与缺失深色补 b12；弹层连背景整屏。 |
| A-R18b-02～05 | b1 #6～#9 | App 登录、注册后邮件、发送邮件、设新密码 | 浅原板；各态深色补 b12。 |
| A-R18b-06～10 | b7 #52～#56、#75 | App ヘルプ、反馈、404、维护、强制更新；#75 帮助深色 | 缺失深色补 b12；改稿 §2 的文案。 |
| W-R18b-06～10 | b7 #57～#61、#82 | Web ヘルプ、联系、404、维护、新版浮条；#82 帮助深色 | 各态 1024 / 390 与缺失深色补 b12；浮条带真实页面背景。 |
| W/A-R18b-11 | b7 帮助 / b1 公开样式延伸 | Web `/help|terms|privacy`、App `/help` 与 `/legal/{terms,privacy}` 公开路由；设置静态入口仅跳转，注册同意文字可点 | 新路由若无原板，在 b12 按既有样式补；「公開前に掲載」单独截图，发布门禁未完成。 |

**第一步改稿 / 补画，单独设计提交。** b1 #0 的「3 目标」改 2；b1:1701、1731 的引导「1〜3個まで」**只交 R28**，不在本 Sprint 改；b7 FAQ 的 Pro 与 Gmail 超权能文案、邮箱 null「準備中」、法务「公開前に掲載」、反馈成功态、维护虚构 ETA / 离线卡按 §2 修改。每处注释「2026-10-18 主会话代定 · R18b」并记旧 / 新文案。b12 末尾一组追加全部缺失的断点、深色、必需中途态；按现有设计的 1024 / 390 断点、token 与新文案画，不改变其他线画板。开工 `--list` 复核标题和 index，门禁配置用标题。设计服务例：`uv run python -m http.server 3420 -d docs/designs`（先确保 uv 环境），用后关闭。`compare-redesign.mjs --list` 必须服务运行时调用。

**预检逐屏五项。** 先生成 `views/web-R18b.json` 与 `views/app-R18b.json`，以 `node scripts/visual/board-preflight.mjs --design-base http://localhost:3420/redesign-2026-10/ --suite scripts/visual/views/web-R18b.json --md ../../docs/designs/redesign-2026-10/sprints/R18b-auth-public/preflight-checklist.md`（App 同理，分别保存结果后汇总）运行；逐画面记①画板尺寸 / 数字自洽，②每个数据 / 交互的真实来源，③token / kit 值及缺口，④文案与行为冲突和改稿依据，⑤宽度、主题、中途态是否齐全。先检原稿，改稿 / 补画后再检；失败项写明处理或 `待主会话代定`，**未完成五项的画面不写 UI**。编制时曾试跑代表性原稿预检，浏览器启动超时，未取得有效结论；实施时必须重跑，不视为通过。

| 编制时预检组 | ①数字 | ②数据 / 交互来源 | ③token | ④冲突 | ⑤宽度 / 主题 / 中途态 |
| --- | --- | --- | --- | --- | --- |
| b1 #0–#1 落地 / 欢迎 | 工具待重跑 | 会话、入口与目标数已有代码；`next` 要走现有安全解析 | 待工具比 kit | #0「3 目标」须改 2 | Web 缺 1024 / 390 / 深色，App 缺深色；补 b12 |
| b1 #2–#9、#60 认证 | 工具待重跑 | 登录、注册、重置、Google broker 已有接口；错误与邮件用 fixture | 待工具比 kit | 旧英文弹窗 / 浅色写死；重置 30 分钟与稿上文案核对 | Web 只有错误深色 #60，其余缺宽度 / 深色；App 缺深色 |
| b7 #52–#61、#75、#82 公开辅助 | 工具待重跑 | FAQ 静态；邮箱 null 与法务占位已定；维护须 `maintenance.active`，版本须 `app-version` | 待工具比 kit | Pro、Gmail 草稿、反馈成功、维护 ETA / 离线卡须改稿 | Web 缺 1024 / 390 / 多数深色；App 除帮助 #75 外缺深色 |

这张表是开工前的**缺口登记，不是预检通过记录**。实施者必须把每个 W/A ID 拆到 `preflight-checklist.md`，补出工具数字、token 与来源，失败项处理完才开相应 UI。

**门禁。** Web 1440 / 1024 / 390 × 浅 / 深；App iOS 模拟器浅 / 深。Web 截完整页，App 截真实屏；先 `--style-diff`，迭代用 `--only` / `--changed`，收口跑全量，保留原始画板、实现、triptych、raw 与 `--grid`。所有超阈值带在 `attribution-redesign-R18b.json` / `-app.json` 逐条记 `[data]` / `[raster]` / `[contrast]`（contrast 限已登记替换）；整屏 raw 记录并以规则 §20 / RD-29 判定。每屏最多 3 轮。组件库缺口列「待组件库」并交接重比，不当作通过；无法归因的带列「未过」。开发专用 `design=` / 状态开关只能在开发构建出现，正式构建测试守住。

## 7. 验收契约（16 条；每条 REPORT 留操作链 + 证据）

| SC | 操作链与可观察结果 | 证据 |
| --- | --- | --- |
| **SC-R18b-01 开工 / 预检** | 更新 `line-c` → 查基线、R18a / R31 状态 → 两端逐屏预检 → 改稿 / 补画单独提交；D 线拿到底栏与浮条请求。缺项不能直接开做相应 UI。 | 基线命令摘要、预检逐屏表、画板索引、设计提交号、D 线请求。 |
| **SC-R18b-02 Web 落地** | 未登录开 `/` 与 `/app` → b1 #0 落地；点登录 / 注册 → 对应新弹层；**已登录开 `/` 或 `/app` → `/app/home`**；宽窄 / 浅深内容相同且可键盘操作。 | 两入口的会话路由测试、截图 W-01 全矩阵。 |
| **SC-R18b-03 Web 认证四态** | 登录错误 → 原表单留邮箱且错误可读；**注册可提示邮箱已存在**，注册同意文字可点 `/terms`、`/privacy` 且返回不丢状态；**找回密码不提示邮箱是否存在**，发送确认一致；有效 / 过期令牌开重置 → 成功返回登录 / 过期可重新发送；刷新 / 直链仍在正确态。 | Web 行为 / 枚举防护测试、公开法务链接、W-02～05 截图。 |
| **SC-R18b-04 App 欢迎 / 认证** | 首次未登录启动 → 欢迎 → 登录 / 注册 / 忘记 → 请求重置 → 新密码；注册同意文字可点公开 `/legal/terms` / `/legal/privacy` 并返回表单；取消回欢迎，错误有出口；有会话或深链不再重复欢迎；公开态无底栏。 | 模拟器操作录像或截图、公开法务链接与路由状态测试、A-01～05 门禁。 |
| **SC-R18b-05 重置与邮件边界** | 有效、过期、已用、错误 token 与 30 分钟 TTL 各走一次；找回密码对已注册 / 未注册邮箱**同样响应且不提示存在与否**，注册流程则可提示邮箱已存在；连续请求 / 重发按现有后端约束；密码不进 URL / 日志。 | API / 表单的分流程枚举防护测试与脱敏日志摘要。 |
| **SC-R18b-06 深链 / 邀请回跳** | 未登录打开 `/i/<code>` 或受保护站内目标 → 认证 → 回目标；异常 `next`（外域、协议相对、编码绕过）被拒；注册 → 登录 → onboarding 与邀请按既有 `profileContinuationPath` 顺序执行。 | 两端路由表测试、邀请实走记录。 |
| **SC-R18b-07 Google mobile broker** | App 点 Google → Web broker → 成功回 App 原目标；用户取消 / 授权失败 → 回登录并可重试，不丢安全 `next`；普通 Web Google 入口维持现有能力。 | broker mock / 深链测试、模拟器成功与取消记录。 |
| **SC-R18b-08 公开帮助 / 法务与设置跳转** | 未登录直开 Web `/help`、`/terms`、`/privacy` 与 App `/help`、`/legal/terms`、`/legal/privacy` 均能阅读；App 不包 `withOrbitPrivateRoute`。从 R18a 设置静态段进入只跳对应公开页，不落 `[section]`；返回回设置。条款 / 隐私显示「公開前に掲載」并登记发布门禁；注册同意文字可点。 | 未登录直链、静态段优先与注册链接测试、两端截图、DEFERRED 请求。 |
| **SC-R18b-09 FAQ / 联系反馈** | 搜索 FAQ → 按标题 / 关键词过滤，展开 / 收起与空结果可用；`supportEmail === null` 时显示「準備中」且无复制 / 邮件 / 反馈发送按钮；配置真实邮箱后复制值与显示一致，联系 / 反馈由邮件 App 打开，取消不显示已发送；Pro / Gmail 草稿虚假承诺不出现。 | FAQ、null / 有值两态单测，两端操作，b7 改稿与 A-06～07 / W-06～07 截图。 |
| **SC-R18b-10 404 / 维护** | 未知 App 路由经 `[...legacy].tsx` → 404，不静默 `/home`；已知旧路由仍迁移；Web 未知路由也到 404，可回安全首页 / 帮助。版本接口仅 `maintenance.active === true` → 维护页，可选有效 `until` 才显示 ETA；普通 503 / 断网均不报维护，恢复后有出口。 | 已知 / 未知路由与维护信号真 / 假 / 缺失测试、A-08～09 / W-08～09 矩阵。 |
| **SC-R18b-11 live 版本接口** | 未登录 `GET /api/app/version` 走独立 `app-version` live，服务端环境变量提供合法 semver；仅增可选 `enforceMinimum?`（缺省 false）、`maintenance?`、`webBuildId?`，后者来自 `VERCEL_GIT_COMMIT_SHA`；`Cache-Control: no-store`，无表 / 迁移。非法或缺失配置安全放行并有诊断；`account-lifecycle`、R18c exports / deletion 仍 mock。 | 契约宽进、接口 / capability / 缓存头与环境缺省测试、响应样例、无迁移检查。 |
| **SC-R18b-12 强制更新 / 新版浮条** | `enforceMinimum` 缺省或 false：旧版本可进 App；true 且低于最低：强制更新页、升级出口、不能绕过；等于最低 / 无网可进。Web 当前页面构建 ID 与接口 `webBuildId` 均存在且不同时提示新版，可关闭且不循环，缺任一 ID 不显示；不按 SHA 字典序比较。维护信号另按 SC-10；底栏在更新页隐藏，回正常页出现。正式环境开关保持关闭。 | 版本 / 构建 ID 矩阵单测、模拟器 A-10 / Web W-10 截图、D 线壳提交与关态证据。 |
| **SC-R18b-13 旧屏与 R18a 回归** | 新链路接通 → 删除 `account/auth-0918/**`、`orbit-landing-0918.tsx`、无外部运行时引用的 `orbit-real-landing-page.tsx` 及允许清单本线行；`orbit-landing-route-view-model.ts` 列入删除清单，先核首页 / 活动跨线引用，未迁移完不得删，REPORT 逐一交接；`OrbitReferenceStyles` 若仍被别处用只解除本线引用、不删共享文件。旧地址走新状态；R18a 注销动作表、R18c `/account`、R28 onboarding 未退步。 | 四个旧模块引用搜索、保留 / 删除理由、legacy / route-parity / 审计结果、注销操作记录。 |
| **SC-R18b-14 像素收口** | R31a / R31b 合入后跑 §6 全矩阵；每张看 triptych、raw、带归因；设计稿无 / 待组件库 / 未过逐条列，不能混入通过计数。 | views、截图对照页、归因 JSON、门禁摘要与重比清单。 |
| **SC-R18b-15 导航 / 可访问回归** | 根布局里 `ShellTabBar` **只在已登录时显示**，会话确认中 / 未登录 / 密码重置 / 强制更新无底栏，`ToastProvider.hasTabBar` 与显示一致；已登录一级页有底栏。Web / App 公开页不挂私有壳；键盘焦点、错误提示、返回、语言 / 深色切换贯穿认证与帮助。 | D 线 M5 按路径独立提交号、R20a 未提交文件未混入的 `git show --stat`、路由 / 可访问测试与截图。 |
| **SC-R18b-16 全量与交接** | 两端 typecheck、lint、全量测试对比基线零新增失败；逐条核 R18-03～09、G 项；REPORT 写不完成项的具体依赖和下一执行者，支持邮箱与正式法务正文列 DEFERRED「待用户授权（发布门禁）」，b1:1701 / :1731 的 3 目标文案交 R28；按路径提交，不推送。 | 命令、通过 / 失败数与用例名、`git show --stat`、REPORT 交接表 / DEFERRED 原文请求。 |

## 8. 执行顺序与里程碑

1. **SC-01：** 同步 C 线、确认 R18a 占位与 D 线壳当前状态；列画板、五项预检；改稿和 b12 补画单独提交。产品矛盾只按 §2 已代定部分处理，新矛盾记录并继续独立屏。
2. **契约先行：** SC-11 独立 `app-version` live、服务端环境变量与 no-store 测试；SC-05 / SC-06 安全回跳与重置边界；`supportEmail: null` 配置。本线私有 fixture 与共享 App 副本同提交。先让两端共享稳定状态，再做 UI。
3. **认证主链：** SC-02～04、07；新页面与旧入口并行接好后删旧；每条操作链通过再提交。把 R18-03 / 新版浮条请求交 D 线，在检查点 M5 独立提交，绝不混入 R20a 未提交改动。
4. **公开与异常：** SC-08～10、12；R18a 设置占位改为公开路由跳转、FAQ、邮箱 null / 法务占位、`[...legacy]` 404、显式维护、强制更新。正式法务正文和邮箱列 DEFERRED 发布门禁，继续其他屏。
5. **收口：** SC-13 / 15 路由、旧屏、底栏回归；R31a / R31b 已合入再 SC-14 像素全矩阵；SC-16 全量与 REPORT。每个里程碑测试失败先修再依赖下一步，不能把跳过项写成已过。

## 9. 失败、越线与交接

- **具体停点：** 设计稿缺口 / 新产品取舍 → 只停受影响画面、写「待主会话代定」；D 线壳未交 → 认证与版本非壳部分继续，底栏 / 浮条门禁列依赖；R31 组件未合入 → 结构与行为完成，像素列「待组件库」；法务正文 / 支持邮箱未获用户授权 → 保留已定的「公開前に掲載」/「準備中」态，DEFERRED 列「待用户授权（发布门禁）」；生产启用 / OAuth / 真实邮件 →「待用户授权」。不因单项停整个 Sprint。
- **REPORT 交接：** 给 D 线根 `app/_layout.tsx` 的底栏复现 / `app/index.tsx` 与 `[...legacy].tsx` 已归 C 线的通知 / M5 单独提交号、Web 浮条状态；给 R18c `app-version` 独立 live 与仍 mock 的 `account-lifecycle`；给 R28 安全 `next`、注册后 onboarding 顺序、b1:1701 / :1731「1〜3個まで」改稿请求；给首页 / 活动线 `orbit-landing-route-view-model.ts` 尚存跨线引用及迁移请求；给 R17 公开顶栏规范；给主会话 README R18、HANDOFF R18-03～07、DEFERRED-A 的支持邮箱 / 法务正文「待用户授权（发布门禁）」两行、旧屏归属、决定表 §C-2（本 §2 代定）、b12 补画认可、未过 / 重比清单的更新请求。四栏逐行写原文，不自行改汇总文件。
- **最终回复给主会话：** SC 通过 / 未通过清单、C / D 线各提交号、测试与像素摘要（每个屏宽 / 主题 raw、超阈值归因）、`待主会话代定` / `待用户授权` / `请求`、下一步。不推送，不把首次发布开关标为已启用。
