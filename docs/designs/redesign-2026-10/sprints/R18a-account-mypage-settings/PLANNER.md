# Sprint R18a — 账户：マイページ与設定

**Plan revision:** 2（2026-10-18 按独立复核 S1–S2、M1–M8、m 级全部修订；「主会话代定 · 补充」已并入 §2，RD-33）。**模式:** existing-codebase / single-generator（负责：乙；执行：**Codex 主开发会话**，C 线）。**档位:** H。
**单一目标:** 先改稿（Pro / NFC / 完成度 / 連携文案 / 閲覧格）并补 Web 1024 / 390 与深色画板 → 补齐マイページ / 設定需要的数据与只加不改的契约 → 两端マイページ、公開プロフィール、编辑与标签、設定（連携、iOrbit が使う情報、言語と外観、権限、意味検索）、更新の提案按设计稿重写 → 删旧屏、Web 去掉旧 agent 设置模块与临时「主催」页签 → 组件库合入后过像素门禁。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 开工时 `line-c` 从 `origin/redesign` 拉出的 HEAD（编制时 `75ace0f03`），行号按符号重新定位；已知失败以 README「骨架登记表」最后一行与各 Sprint 收口记录为准。
**进入条件:** RD-31 / RD-32 / RD-33 已定；本文件 §2「主会话代定」已生效。改稿与补画（§9.1）由本 Sprint 第一步起草，主会话在 Sprint 结束后的复核里认可，门禁以改后 / 补画的画板为准。D 线的左栏高亮改动（§0 第 2 条、代定 19）先于 R18a 门禁提交。**像素收口在 R31a / R31b 合入之后**（RD-31）。
**线内顺序:** C 线 R18a → R18b（认证与公开）→ R18c（数据权利）→ R28（引导）。
**提交方式:** 在 C 线 worktree 按路径提交，**不推送**（见 §0）。不跑 GitNexus（RD-32）。

---

## 0. 给 Codex 的执行说明

1. **执行者与工作目录**：本 Sprint 由 Codex 主开发会话执行，可以在线内开并行 worker（每个 worker 只改自己那组文件，最后由主开发会话合并、跑测试、提交）；主会话（Claude）通过 `/Volumes/ORICO/Dev/worktrees/orbit/_runs/talk-codex.sh` 联系你。工作目录 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-c`（分支 `line-c`）。除第 2 条外，所有命令都在这里跑，不要进 `/Users/xzhao/Projects/orbit` 或其他线的 worktree。开工先跑 `git -C /Volumes/ORICO/Dev/worktrees/orbit/redesign-c pull --rebase origin redesign`，确认工作区干净（这一步也会拿到 B 线已提交的 b5 改稿）。
2. **开工时先在 D 线做一行壳改动（代定 19）**：D 线也由同一个 Codex 主会话负责。在 `/Volumes/ORICO/Dev/worktrees/orbit/redesign-d`（`line-d`）里改 `repos/orbits/app/(app)/app/orbit-2026/shell/shell-routes.ts`：`/app/profile`（不含 `/app/profile/onboarding`、`/app/profile/continue`）映射为 `settings` 高亮（现在 :45 映射为 `me`），加对应路由测试，**单独提交**（`fix(shell): …`，不推送），在 R18a REPORT 写提交号。R18a 门禁依赖它；C 线里不改这个文件。
3. **阅读顺序**（只读和自己相关的段落，先 grep 定位）：
   1. 本文件全文，再读 [GOAL.md](GOAL.md)；
   2. [`../README.md`](../README.md)：RD-05、RD-16、RD-24～RD-33、「骨架通用规则」10–13、「合回前总验收」里提到 R18 的三行；
   3. [`../HOW-TO-START-A-FEATURE-SPRINT.md`](../HOW-TO-START-A-FEATURE-SPRINT.md) §0–§10（§2 壳插槽、§3 新契约、§4「尚未实现」、§5 跨人依赖空态、§6 文案、§7 路由登记、§8 像素门禁与画板预检、§9 只加不改）；
   4. [`../HANDOFF-TO-FEATURE-SPRINTS.md`](../HANDOFF-TO-FEATURE-SPRINTS.md)：「通用口径」G01–G26、§R18（全部）、§R17 的 R17-03 / R17-04、§R13 / R14 的 R13-02、§R30 的 R30-06；
   5. [`../screen-ownership.md`](../screen-ownership.md) 的「账户」行（App 两行 + `profile/suggestions`；Web `/app/profile`、`/app/settings`）；
   6. 决定表 `../maintenance/2026-10-12-decisions.md` 的 D18、D55、D56、§15-1（只画真实存在的）、§20、§38（补画做法）、§50（意味検索 lite）；
   7. 两端 `AGENTS.md` 的「redesign 开发规则」，以及 `repos/orbits/scripts/visual/README-redesign.md`（`--list`、`--extract-board`、画板预检、提速、App 门禁）；
   8. [`../R17-host-operations/PLANNER.md`](../R17-host-operations/PLANNER.md) 「像素 SC」与「补画」两节（补画画法与编号的样板）；
   9. [`../R20a-task-todo-calendar/PLANNER.md`](../R20a-task-todo-calendar/PLANNER.md) §7 / SC-12（Google 连接与 `returnTo` 白名单，R18a 使用）；
   10. [`../R31a-app-components-pixel/PLANNER.md`](../R31a-app-components-pixel/PLANNER.md) §3–§4、[`../R31b-web-components-pixel/PLANNER.md`](../R31b-web-components-pixel/PLANNER.md) 对应节（组件会新增哪些参数；本 Sprint 只用、不改组件）。
4. **提交规则**：
   - 只提交本线归属的文件（见 §1），一律按路径提交：`git commit -m "<type>(R18a): …" -- <文件…>`，提交后 `git show --stat HEAD` 核对；不要用 `git add -A` / `git commit -a`，也不要把文件长时间留在暂存区。
   - 每次提交前 `git pull --rebase origin redesign`；`b12-missing-states.html` 末尾和别的线同时追加导致冲突时，两边的块都保留、本线的块放最后；`.snapshot.json` 冲突时重新生成（`node scripts/contract-snapshot.mjs --write`），不要手工合并。
   - 改了 `repos/orbits/shared/**` 的同步目录，就在 App 跑 `npm run sync:contract`，副本和源放在同一个提交；契约提交以 `contract:` 开头，并写「App 需要同步」。
   - 小步提交：每个 SC（或 SC 里一个完整的子步骤）测试转绿后提交一次；改稿与补画单独一个提交（`design(R18a): …`）。
   - **永远不推送**（不跑 `git push`、不开 PR）。由主会话复核后推到 `redesign`（RD-32）。
5. **不要提问，跳过并记下**（RD-33）：遇到产品取舍、设计稿矛盾、缺画板、要偏离设计稿的情况，不要停下来问人，也不要自己发挥。把那一项跳过，写进 REPORT「待主会话代定」（写清是什么、有几个选项、你推荐哪个、影响哪些 SC），然后接着做别的。§2 已经代定的事项照做，不再上报。
6. **停止条件**（满足任意一条就停在那一项，写进 REPORT，再做其他能做的部分）：
   - 需要改「不许碰」的文件：写进 REPORT「请求」，不要动（第 2 条的 D 线改动是唯一例外）。
   - 需要连 Neon、生产库、部署、生产环境变量、真实 Google OAuth 或 TestFlight：不做，写进 REPORT「待用户授权」。
   - 同一个画面门禁改了 3 轮还不过：写进「未过」清单，不再耗轮次。
   - 全量测试出现新失败，修 2 次还没修好：停止扩大改动，写清失败用例名和你的判断。
   - **结构、数据、逻辑全部做完时，R31a / R31b 还没有合入 `origin/redesign`**：不要开始像素收口。REPORT 写「等组件库」，列出待跑的门禁清单（§9.2），然后结束。
   - 付费 AI（例如「AI で整える」、求めていること候选）：测试一律用 mock；只在某个功能必须真调用才能验证时，在本机用已有 key 调用，每次调用都记进 REPORT（次数、用途、token 数）。
7. **REPORT 与证据**：REPORT 写在 `docs/designs/redesign-2026-10/sprints/R18a-account-mypage-settings/REPORT.md`，画板预检写在同目录 `preflight-checklist.md`；截图和日志放 `~/orbit-sprint-evidence/redesign/R18a/run-01/`。REPORT 的结构按 HOW-TO §10 第 3 步，另加「改稿与补画清单」「请求」「待主会话代定」「待用户授权」「交接表追加（逐行四栏原文）」「文档更新请求」「越线自查」几节。README 登记表、HANDOFF、DEFERRED-A、决定表、`screen-ownership.md` **不要改**（其他会话正在改），要改的内容（含决定表 §C-1 的条目原文）写进 REPORT「文档更新请求」，由主会话合入。

## 1. 本线归属的文件 / 不许碰的文件（RD-31，复核逐条查越线）

**本线归属（可改 / 可删 / 新建）**
- **App 路由**：`app/(app)/profile.tsx`、`app/profile/{edit,preview,tags,more,suggestions}.tsx`、`app/settings.tsx`、`app/settings/**`（含新建 `integrations.tsx`、`iorbit.tsx`、`[section].tsx`）、`app/account/permissions.tsx`。**不含** `app/profile/{onboarding,continue}.tsx`（R28）、`app/account.tsx` 与 `app/account/{login,signup,forgot-password,reset-password,mobile-google}.tsx`（R18b / R18c）。
- **App 屏幕与数据**：`src/screens/profile/` 下 `ProfileScreen.tsx`、`EditProfileScreen.tsx`、`ProfilePreviewScreen.tsx`、`ProfilePublicView.tsx`、`ProfileTagPickerScreen.tsx`、`ProfileMoreScreen.tsx`、`ProfileSuggestionsScreen.tsx`、`ProfilePagePrimitives.tsx`、`profile-page-model.ts`、`useProfileEditSessionScreen.ts`、`AccountPermissionsScreen.tsx`；`src/screens/settings/{SettingsScreen,AppearanceOptions,ApiSettingsScreen,ApiSettingsScreen.web}.tsx`；新建 `src/screens/me/**`（含本线私有的 integrations 客户端 `src/screens/me/integrations-api.ts`）；`src/data/profile-edit-session.ts`（**R28 也会用，只能向后兼容地改**）。
- **Web 页面**：`app/(app)/app/profile/page.tsx`、`app/(app)/app/profile/profile-0918/**`（可删，见代定 20：`profile-model.ts` 里被 R28 引用的标签选项常量搬走后留一行 re-export 到 R28；`use-profile-editor-session.ts` 搬到 `app/(app)/app/profile/use-profile-editor-session.ts`，**R28 也会用，只能向后兼容地改**）、`app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/**`、`app/(app)/app/profile/profile-editor-adapter.ts`、`app/(app)/app/orbit-profile-route-view-model.ts`、`app/(app)/app/profile/profile-save-model.ts`（**只能向后兼容地改**）、`app/(app)/app/settings/page.tsx` 与 `orbit-agent-{automation,execution,feedback,memory}-settings.tsx`、`orbit-appearance-settings.tsx`；新建 `app/(app)/app/settings/[section]/page.tsx`（及 `integrations/`、`iorbit/`、`appearance/` 静态段）、`app/(app)/app/profile/suggestions/page.tsx`、`app/(app)/app/orbit-2026/account/**`（含本线私有的 integrations 客户端 `orbit-2026/account/integrations-api.ts`）、`orbit-2026/copy/account.ts`。
- **服务端与共享**：`app/api/profile/**`、`app/api/account/{me,status,language-preference}/**`（`deletion-request` / `exports` 归 R18c，不动）、`features/profile/**` 中本 Sprint 碰到的部分（`ProfileSignalSourceKind` 等枚举**不加值**，见代定 12）；契约 `shared/contract/{profile,account-language-preference}.ts` 与对应 `shared/api-schema/*` **只加不改**；新建演示数据 `shared/mock/demo-world/account.ts`。
- **文案**：App 字典域 `src/i18n/{ja,zh,en}/{profile,settings,permissions}.ts`（重写；`profile.*` 只删全仓库没有使用点的键，R28 / 其他屏还在用的保留），或新建域 `me.ts`；`account.ts` 只加键（R18b / R18c 还要用）；Web `orbit-2026/copy/account.ts`。
- **设计稿**：`docs/designs/redesign-2026-10/b12-missing-states.html` **只在文件末尾追加**本线一组补画；`b5-me-inbox.html` 只做 §9.1 第 1 条列出的就地改稿（每处加注释）。
- **门禁**：新建 `scripts/visual/views/{web,app}-R18a.json`、`scripts/visual/attribution-redesign-R18a.json`、`attribution-redesign-R18a-app.json`；本目录 `preflight-checklist.md` / `REPORT.md`。
- **允许只追加自己的行**：App `tests/legacy-ui-ratchet.test.ts` 的 `ZERO` 名单（新目录 `src/screens/me/` 等）、`tests/fixtures/legacy-ui-deferred.json`（只在确有组件缺口、按其格式登记本线页面私有件时追加）。

**不许碰**（要改就写 REPORT「请求」）
- **组件库与 token（A 线）**：App `src/components/ui/**`、Web `orbit-2026/ui/**`、`shared/design/tokens.json`、`scripts/visual/{compare-redesign*.mjs,redesign-pixel-lib.mjs,board-preflight*.mjs,contrast-substitutions.json}`；`legacy-ui-deferred.json` 除上面「只追加」外不动。组件不对齐 kit 就标「待组件库」，缺组件就在本线目录里写页面私有组件（`src/screens/me/parts/**`、`orbit-2026/account/parts/**`），并在 REPORT「请求」里写给 A 线以后收编。
- **导航壳（D 线）**：App `src/components/{ShellTopBar,ShellBackBar,ShellBackground,OrbitTabBar,TabPageBar,LegacyTaskRedirect}.tsx`、`src/components/shell-navigation.ts`、`src/view-models/{app-navigation,shell-state}.ts`；Web `orbit-2026/shell/**`（左栏、头像菜单、底部胶囊、`shell-routes.ts`、`CommandPalette`；`shell-routes.ts` 的一行改动在 D 线做，见 §0 第 2 条）、`app/(app)/app/orbit-theme.tsx`、`orbit-language-context.tsx` / `orbit-language-core.ts`（只调用已导出的读写函数，见代定 5）。`parentForPath` 已能把 `settings/*` 返回到 `/settings`、`profile/*` 返回到 `/profile`（`app-navigation.ts:60–63`），预计不用改壳。不再使用的 `ShellBackBar` / `ShellInboxRow` 不要删，写进「请求」。
- **B 线人脈 / 收件箱**：`features/contacts/**`、`features/inbox/**`、`src/screens/inbox/**`、`app/(app)/app/inbox/**`；受信箱行只读未读数（用现有接口），不改收件箱文件。R14 的通知设置页（App `app/settings/notifications.tsx`、Web `app/(app)/app/settings/notifications/**`，由 R14 新建）本 Sprint **不建这两个文件**，见代定 6。现有 `src/screens/settings/{NotificationDeliverySettings,NotificationDiscoverySettings,DiscoverySettingsContent}.tsx`、Web `settings/notification-{delivery,discovery}-settings.tsx` 不删，留给 R14。
- **甲名下与其他功能（只引用）**：App `src/screens/host/**`（`HostEventsRow` 原样用）、`src/screens/add/**`（招待コード页）、`src/screens/search/**`（只读 `APP_SEMANTIC_PREFERENCE_KEY` 与能力读取）、活动 / 计划页面；Web `orbit-2026/host/**`、`orbit-2026/add/**`（`InviteCodeModal` 只引用）、`orbit-2026/search/**`（只用 `readSemanticPreference` / `writeSemanticPreference` 与能力读取）、`features/plans/**`、`features/events/**`（只调用已导出的接口，例如 `/api/events/center?summary=1`、`/api/events/mine`）。
- **D 线 R20a 正在改的**：`features/integrations/**`、`app/api/integrations/**`（本 Sprint 只调用现有接口：列表、`authorize`、`callback`、`health`、`DELETE /api/integrations/[provider]`；OAuth 回调的 `returnTo=settings` 白名单由 R20a 提供，见代定 18）。两条线的 integrations 客户端各写在自己的私有目录，不共用文件。
- **E 线 iOrbit**：`app/api/agent/**` 的处理函数（`/api/agent/memory` 只调用，不改）、`app/(app)/app/agent/**`、App `src/screens/ai/**`。
- **R18b / R18c / R28 的文件**：认证屏（`AccountAuthScreen.tsx`、`PasswordResetScreen.tsx`、`auth-0918`）、落地页、`AccountScreen.tsx`（アカウント，R18c）、`app/api/account/{deletion-request,exports,session}/**`、`/api/app/version`、引导（`src/screens/profile/onboarding/**`、`app/(app)/app/profile/onboarding/**`、`onboarding-0918/**`、`profile-onboarding-navigation.ts`（只调用 `profileOnboardingFlowPath`）、`app/(app)/app/start/**`）。
- **汇总文件只追加**：`shared/contract/index.ts`、`shared/mock/demo-world/{index,fixtures}.ts`、App `src/api/endpoints.ts`、`src/data/offline-read/route-domain-inventory.ts`、`src/i18n/*/index.ts`、`copy-kinds.ts`、`tests/i18n-domain-split.test.ts`、`scripts/copy-qa/cli.mjs`、`features/redesign-contracts/{service-factory,mock-service,handlers}.ts`、`shared/services/capability-registry.ts`、路由登记与审计计数；三份旧屏允许清单只删自己的行。
- 文档：README、HANDOFF、DEFERRED-A、决定表、`screen-ownership.md`（主会话改，见 §0 第 7 条）。

**本线环境**：Web dev 端口 **3400**、`ORBIT_NEXT_DIST_DIR=.next-line-c`；Metro **8084**；本地库 **`orbit_line_c`**（已存在就直接复用；不存在时 `createdb -T orbit_redesign_shots_20261018 orbit_line_c`）；worktree 里的 `repos/orbits/.env.local` 从 `/Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/.env.local` 复制，再把本地库变量改指 `orbit_line_c`（这个文件不提交）；连库测试用 `orbit_line_c` 或从它复制的 `orbit_line_c_test`，不和其他线共用；设计稿服务用 `python3 -m http.server 3420 -d docs/designs` 并给门禁传 `--design-base http://localhost:3420/redesign-2026-10/`（避开别的线的 3320）；iOS 模拟器新建 **`Orbit Line C`**（`xcrun simctl create "Orbit Line C" <机型> <运行时>`），之后一律按 UDID 操作；App `.env.development.local` 指向 `http://localhost:3400`（不要改 `.env.local`）。不连 Neon、不部署。

## 2. 主会话代定（2026-10-18，RD-33；用户回来可逐条推翻；REPORT「文档更新请求」里统一登记为决定表 §C-1）

1. **拆分**：R18a = マイページ + 公開プロフィール + 编辑 / 标签 + 設定（連携、iOrbit が使う情報、言語と外観、権限、意味検索）+ 本人「更新の提案」；R18b = 认证、落地页、欢迎页、版本检查、ヘルプ / お問い合わせ、404 / メンテナンス；R18c = アカウント页、导出、退会；通知设置页归 R14；引导归 R28（在 R18b 之后）。
2. **付费方案不做**（D55 / D56）：两端所有「ご利用プラン」行与 Web 子菜单项隐藏；b5 画板由本线就地改稿（§9.1 第 1 条；B 线改稿不碰这几块，开工 `pull --rebase` 后再改）。ヘルプ里的 Pro 条目归 R18b。
3. **名刺交換（NFC）一组隐藏**：NFC 是 A5「下一期」，App 設定 b5 #21–23 / #68 的「名刺交換」分组随 Pro 行一起就地改稿去掉。
4. **后续 Sprint 的入口统一规则**：
   - 列表行 / 子菜单项（App 設定「データの書き出し」「ヘルプ」「通知」、页脚「利用規約 · プライバシー」；Web 子菜单「アカウント」「通知」「権限」「データの書き出し」「ヘルプ」）**照画板显示**，点进去是同一个「準備中」占位页（App / Web 都走 `settings/[section]` 动态段，见代定 6；文字用 `States` 空态，普通说法，不出现「开发中」）；Web「権限」也按这条（设计稿无内容）；
   - **数据权利的行内操作链接**（Web「言語と外観」アカウント块里的「データを書き出す / アカウントを削除」）在 R18c 之前**隐藏**，因为危险操作不能做成点不动的按钮；该画面按 §9.2 用区域门禁，整板留给 R18c 重跑；
   - App 設定顶部账号行（名字 · 邮箱 · Google でログイン）进现有 `/account`（`AccountScreen`，R18c 重写），不做占位。
5. **言語 / 外観 一个入口**：
   - **语言**：Web 「言語と外観」**只调用 `orbit-language-context` 的 `setLanguage`**（与头像菜单同一个入口），不在页面里另写 cookie 或账户偏好；App 设定页只调用 `useOrbitLocale()` 现有的设置函数。「切换语言时同步账户偏好（`/api/account/language-preference`）」作为**请求交给 D 线**，在 language context 里统一加（两个入口一起受益），R18a 不等它。
   - **外观**：Web 用 `orbit-theme.tsx` 导出的函数，App 用 `design/appearance` 的 `setAppearanceChoice`；两处入口切换后另一处立即一致（测试守住）。
   - **App 语言选项**照画板只有 **日本語 / English / 中文** 三个，不再另加「跟随系统」：用户未手动选择前沿用 R03 已定口径（跟随设备，不支持的语言回退日语），这时三项里高亮当前生效的语言；选择后固定为所选语言。
6. **通知设置页归 R14**：App 設定「通知」行进 `/settings/notifications`，Web 子菜单「通知」进 `/app/settings/notifications`。本 Sprint 只建动态段 `settings/[section]`（App `app/settings/[section].tsx`、Web `app/(app)/app/settings/[section]/page.tsx`），`notifications` 等后续段在这里显示「準備中」；R14 新建同名静态路由后自动优先（expo-router 与 Next.js 都是静态段优先），两条线不改同一个文件。**现有推送开关、送达 / 发现设置的界面从設定移除**（推送注册逻辑不动）；`redesign` 合回前不会到用户手里（RD-03），由 R14 在通知页里接回，写进「交接表追加」。
7. **「参加するイベント」行**：放在マイページ「主催したイベント」旁边（App 列表行、Web 卡片），数据用 `GET /api/events/mine` 里「これから」的件数，点进イベント「参加予定」页签（App 深链 `/events?tab=going`，Web 对应 `?tab=going`；开工核对 R26 页签 key 一致）。**没有即将参加的活动时不显示这一行**（数据自洽：b5 #14 / #15 / #18 / #19 是没报名的账号，原画板不变）；有报名的「大量」状态按补画验收（§9.1 S01 / S30）。
8. **「主催したイベント」**：App 用 R17 交付的 `HostEventsRow`（原样，不改，`src/screens/host/HostEventsRow.tsx:16`）；Web 没有现成组件，在 `orbit-2026/account/` 里写页面私有卡片，读同一个 `GET /api/events/center?summary=1`（`app/api/events/center/handler.ts:39–40`）。Web 正式入口上线后删掉旧マイページ页签栏的临时「主催」（`profile-shell.tsx:48–53`，`host` 项在 :52）；手机 Web 走「プロフィール → 主催したイベント」（R07 拍板的手机进入路径保留）。头像菜单不放主催（D18，D 线文件不动）。
9. **「受信箱」行保留**（App マイページ，照画板）；R13 做好首页 🔔 入口后由 R13 去掉（R13-02）。
10. **意味検索开关（R30-06）放在「iOrbit が使う情報」最下面**（两端），一张开关卡：标题「意味検索」、一行说明「言葉の意味が近い人・イベントも探します · この端末だけの設定です」。写同一个键 `orbit.search.semantic`，值只写 `"on"` / `"off"`（App AsyncStorage：`src/screens/search/search-model.ts:9`；Web localStorage：`orbit-2026/search/use-global-search.ts:14` 的 `writeSemanticPreference`）。**搜索能力里意味検索不可用时（`semantic.available=false`）整张开关卡隐藏**；测试 mock 能力的两种取值。按补画验收（§9.1 S02 / S31）。
11. **编辑资料与标签没有画板**：App 编辑页、标签选择页、Web 名刺字段编辑抽屉，照 b1 #10–#12（App）/ #16 / #18（Web）的输入框、标签和底部按钮样式，用组件库现有组件拼；不进像素门禁，REPORT 附截图并对 b1 对应元素跑 `--style-diff` 记录差异。App `profile/more`（所在地等）并入编辑页，旧路由跳转到 `/profile/edit`。
12. **更新の提案（b7 #46–#51，复核 S2）**：页面与卡片两端都做，卡片按「对象」通用（本人 / 联系人同一种卡）。
    - **live 队列**只接现有 `/api/profile/update-suggestions` 的三种来源 `chat | activity | contact`（`features/profile/signal-contract.ts:16` `ProfileSignalSourceKind`），**不给服务端枚举加值**；
    - **名刺 / 職務経歴書** 的卡片由客户端用现有抽取草稿（`/api/profile/extractions/{business-card,resume}` 的结果）生成同样样式的卡，✓ 后把选中字段合进资料，走 `PUT /api/profile`；
    - **来源筛选**只显示有数据的来源（没有经历书草稿就不出「職務経歴書」chip）；Web 右栏「提案の出どころ」计数同口径；
    - **「反映はあとで元に戻せます」与撤销**：没有数据源 / 接口，不显示（代定 15）；
    - **联系人一侧**的提案来源是下一期（归属表 `profile/suggestions` 行改归 R18，见「文档更新请求」），画板上的联系人卡用设计稿示例 fixture 补数据（只补数据、不改结构，live 不出现）。
13. **Web 旧 agent 设置模块**（automation / execution / feedback / memory 四个 `orbit-agent-*-settings.tsx`）：从界面上删掉，接口全部保留；「iOrbit が使う情報」里「iOrbit が覚えていること」改用 `/api/agent/memory` 读 / 删。记忆来源只有 `manual` / `conversation` 两种：标签显示「メモ」/「iOrbit との会話」，画板上的「面談メモ」标签不画（`[data]`，并在 §9.1 改稿注释里写明）。`/api/agent/memory/settings` 的开关如果 #30 画板上有对应控件就保留，没有就不做界面、在 REPORT「交接」登记。只测旧界面的测试随文件删除，接口测试保留。
14. **App 権限**：设定页内联三行（カメラ / カレンダー / 通知）显示系统权限状态；未询问 → 点按请求权限；已拒绝 → 打开系统设置（`Linking.openSettings()`）。`account/permissions` 路由改跳 `/settings`，`AccountPermissionsScreen` 没有其他引用就删除。
15. **画板文字与后端能力不符 → 只画真实存在的**（决定表 §15-1 先例；复核 M1）：没有数据源的块不显示，并在画板上就地改稿、注释「主会话代定 §C-1」，门禁按改后的画板比：
    - 連携（b5 #24、#26–#28、#70）：Gmail 说明改成与实际权限一致（只读元数据：件名・相手・日時；不读本文、不保存下書き），「下書きを Gmail に保存」行删除；「同期の履歴」块删除；Google 連絡先「使えるようになったら知らせる」按钮删除（只留「準備中」）；
    - マイページ 100%（b5 #16、#20、#66）：「今月の閲覧」格**没有计数源就删除**（名刺交換格开工查来源：有现成的交换 / 招待连接计数就保留，没有同样删除）；
    - 更新の提案：撤销说明（见代定 12）。
16. **注销（R18-09）**：沿用 R04 做法——有未同步修改时用动作表确认、焦点在安全项。
17. **缺画板的组合**：Web 1024 / 390 与 Web 深色按 §9.1 补画后验收；App 只有 b5 #66（マイページ）/ #68（設定）有深色，其余 App 深色（公開プロフィール、連携、更新の提案、编辑）不补画，照浅色画板 + token 实现，只附截图、不进门禁，写进「交接表追加」登记「设计稿无」。
18. **Google 连接**：「接続する」走 `authorize`，回调带 `returnTo=settings`（白名单由 R20a 在 `app/api/integrations/**` 里提供；没合入前先用默认回跳，REPORT 写明）；「解除」用现有 `DELETE /api/integrations/[provider]`（`app/api/integrations/[provider]/route.ts:20`）。本机用测试替身 provider，**不连真 Google**。App OAuth 回跳不通时「接続する」退回打开 Web 设定页（REPORT 写明）。
19. **左栏高亮（复核 M3）**：Web `/app/profile` 属于「設定」（画板左栏高亮 設定）。由 D 线在 `shell-routes.ts` 把 `/app/profile`（不含 onboarding / continue）映射为 `settings`，见 §0 第 2 条；R18a 门禁依赖它。
20. **引导入口不再走旧页（复核 M2）**：`/app/profile?onboarding=1&next=…` 改为跳转 `profileOnboardingFlowPath(next)`（`/app/profile/onboarding`，`profile-onboarding-navigation.ts:84`），加跳转测试；之后旧 `profile-0918/**` 可以删除——R28 的 `onboarding-0918/onboarding-model.ts:12` 引用的 `OFFER_OPTIONS` / `SEEK_OPTIONS` / `TOPIC_OPTIONS` 搬到本线新文件（例如 `app/(app)/app/profile/profile-tag-options.ts`），`profile-0918/profile-model.ts` 只留一行 re-export 到 R28 改引用为止（不改 R28 的文件）。App `profile/continue` 行为不变。
21. **完成度（复核 S1）**：
    - 契约新增**可选并行字段** `completeness.card?: { score: number; items: { key: string; weight: number; done: boolean }[] }`，服务端计算；`key` 读取宽进（未知 key 照常显示、不报错）；旧 `completeness.score` 与 6 字段口径（`completedFields` / `missingFields` / `nextBestField` 等）**不动**（R28、live-service 在用）；
    - 名片完成度 = **4 项各 25**：会社・役職 / 力になれること（提供）/ 求めていること（求め）/ 自己紹介；**去掉「写真」**（契约无照片字段，下一期）；
    - 画板 b5 #14–#16 / #18–#20 / #66 的完成度数字与缺项由本线就地改稿为 **25 / 50 / 100** 三档与 4 项（每项 +25），注释「主会话代定 §C-1」，门禁按改后的画板；
    - 演示账号按这套权重造数据（25% / 50% / 100%；提供 / 求め 各 ≤5 条）；App 读取宽进（`card` 缺失时退回旧 `score`）。
22. **自我介绍上限（复核 M5）**：用现有 `profileBioWithinLimit`（`shared/api-schema/profile-bio.ts:29`，App 副本同名）：含 CJK 80 字，否则 200 字；计数显示用 `profileBioLimit`。画板「62 / 200」按数据差异（`[data]`）处理。

## 3. 交接条目（逐条写进 SC，REPORT 逐条写处理结果）

| 交接表 # | 内容 | 去向 |
| --- | --- | --- |
| R18-01 | Web マイページ「主催」正式入口，删临时页签 | **SC-07**（代定 8、19） |
| R18-02 | App マイページ整屏重写（A-R05-11） | **SC-03** |
| R18-03 | App 启动 / 认证态不显示底栏（R09 A2） | → **R18b**（壳是 D 线：R18b 写请求，由 D 线实现或约定冻结窗口） |
| R18-04 | 公开页照 b1 A1 / A2 重画 | → **R18b** |
| R18-05 | ご利用プラン不做 | **SC-01**（改稿）、**SC-05** / **SC-07**（两端隐藏）；ヘルプ里的 Pro 条目 → R18b |
| R18-06 | 契约 11（导出、退会、`/api/app/version`）live；`minSupportedAppVersion` 启动检查 | 导出 / 退会 → **R18c**；版本接口与启动检查 → **R18b** |
| R18-07 | マイページ「招待コード」入口；注册走旧英文弹窗 | 入口 → **SC-03** / **SC-07**（App 链 `contacts/new/invite`，Web 打开 `InviteCodeModal`，开工核对现有打开参数）；注册弹窗 → **R18b** |
| R18-08 | 「参加するイベント」入口 | **SC-03** / **SC-07**（代定 7） |
| R18-09 | 有未同步修改时注销用动作表，产品事后确认 | **SC-05**（代定 16） |
| R17-03 / R17-04 | 主催入口：App 用 `HostEventsRow` + `center?summary=1`；删临时链接 | **SC-03**、**SC-07** |
| R13-02 | App マイページ「受信箱」行 | **SC-03** 保留（代定 9），R13 去掉 |
| R30-06 | 设定里的意味検索开关 | **SC-06** / **SC-08**（代定 10） |
| R14（通知设置页） | 設定只放入口行 | **SC-05** / **SC-07**（代定 6），交接 R14 |
| README 合回前「Web マイページ『主催』入口按设计稿重做」 | 同 R18-01 | **SC-07** |
| README 合回前「R09 走查 A2 登录确认画面已显示底栏（R18）」 | 同 R18-03 | → **R18b** |
| README 合回前「首次正式发布时启用 `minSupportedAppVersion`（R18 实现启动检查）」 | 同 R18-06 | → **R18b** |
| README 合回前「产品负责人事后确认 R04 复核 M5（注销确认动作表）」 | 同 R18-09 | **SC-05** |
| 归属表「账户」App `(app)/profile`、`profile/{edit,preview,tags}`、`settings`、`settings/api`、`profile/more`、`account/permissions` | 重写 / 并入 | **SC-10** |
| 归属表 App `account`、`account/{login,signup,…}`；Web `/app/account/**`、`/` 落地页 | — | `account` → **R18c**；认证与落地页 → **R18b** |
| 归属表 App `profile/suggestions`（现写 R11） | 改归 R18（代定 12） | **SC-09**；「文档更新请求」改归属表 |
| 归属表 Web `/app/profile`、`/app/settings` | 重写 | **SC-07**、**SC-08**、**SC-10** |
| 通用口径 G01–G26 | 新屏用 `ShellPage` / 三段顶栏（G01、G10、G11、G15–G17）、`--ink-3` 次要文字（G02）、危险色（G03）、尚未实现隐藏（G18）、宽进读取（G19）、允许清单删行（G20）、`Orbit2026Scope` + `ToastProvider`（G21）、语言 cookie（G22，经 `setLanguage`）、`UiText`（G24）、token（G26） | 写进 §6 与各 SC；G04 / G23 / G23b 属 A 线（标「待组件库」）；G05–G09、G25 → **SC-12** |

## 4. 已查清的事实（按 `75ace0f03`，开工按符号复核）

1. **App マイページ**：`app/(app)/profile.tsx` → `ProfileScreen`（`src/screens/profile/ProfileScreen.tsx`，1973 行）。头部是壳的 `ShellBackBar`（:444–446，右侧 ⚙ 进 `/settings`），正文前有 `ShellInboxRow`（:467，来自 `src/components/ShellBackBar.tsx:34`，只有这一处用）；名刺卡 `OrbitBusinessCard`（:1324，点按进 `/profile/edit`）、统计行 `ProfileStatistics`（:1350，人脈 / 今日タスク / 予定）、提案卡 `ProfileUpdateSuggestionsCard`（:1407）、标签区 `ProfileTagSection`（:1522）、文档抽取（名刺 / 经历书）与手动编辑卡都写在同一个文件里；未登录时显示登录卡（:470–490，用 Ionicons）。完成度来自 `data.completeness.score`。
2. **App 其他账户屏**：`EditProfileScreen`（164 行）、`ProfilePreviewScreen`（35）+ `ProfilePublicView`（45）、`ProfileTagPickerScreen`（83）、`ProfileMoreScreen`（165，所在地等公开信息 + 文档抽取）、`ProfileSuggestionsScreen`（175，读 `profileSuggestionsSchema`，接受 / 拒绝路径在 `api/endpoints`），编辑会话共用 `useProfileEditSessionScreen.ts` 与 `src/data/profile-edit-session.ts`（设定页注销时 `clearProfileEditSession`）。`AccountPermissionsScreen`（364）挂在 `app/account/permissions.tsx`（未包 `withOrbitPrivateRoute`）。`AccountScreen`（440，`/account`，工作区 / 方案 / 时区 / 状态）归 R18c。
3. **App 设定**：`SettingsScreen.tsx`（302 行）用 `AppScreen`（:131）；目的地表 `settingsDestinations`（:23–49：`/account`、`/account/permissions`、`/settings/api`）；语言四选项含「system」（:51–56）；推送开关 `enablePushNotifications` / `disablePushNotifications`（:103–125）与 `NotificationDeliverySettings` / `NotificationDiscoverySettings`（:1–2 引入）；注销 `signOut()`（:75–87）；外观用 `AppearanceOptions.tsx`（`design/appearance` 的 `setAppearanceChoice`）。
4. **App 路由与返回**：`mobile-route-access.ts:18`、`:20` 已有 `/profile`、`/settings` 前缀；`app-navigation.ts:60–63` `settings/*` → `/settings`、`profile/*` → `/profile`，`:104–110` `account/*` → `/account` 或 `/profile`。
5. **Web**：`/app/profile`（`profile/page.tsx`，`PROFILE_VIEWS = profile | persona | basic | connect`，处理 `onboarding=1` / `next=`）与 `/app/settings`（`settings/page.tsx:8–31`，`view="settings"`）都渲染旧 `profile-0918/ProfileScreens`，挂在 `data-orbit-real-page="profile-0918"` 里；页签表 `profile-shell.tsx:48–53`（个人资料 / iOrbit 设置 / 连接 / 临时「主催」:52，标题文案只有中英）。旧设定由 `profile-legacy-settings.tsx` 挂四个 agent 模块；`orbit-agent-memory-settings.tsx` 读写 `/api/agent/memory`、`/api/agent/memory/settings`、`/api/agent/memory/[id]`（记忆来源只有 `manual` / `conversation`，`app/api/agent/memory/request.ts:37`）。R28 的 `onboarding-0918/onboarding-model.ts:12` 只从 `profile-0918/profile-model` 引用三组标签选项。`orbit-profile-route-view-model.ts`、`profile-editor-adapter.ts`、`compose-app-profile-…/profile-view-model-adapter.ts`、`profile-0918/{business-card-preview,use-profile-editor-session}` 互相引用。旧测试：`tests/pages/app-profile-*.test.tsx`、`app-agent-execution-settings.test.tsx`、`app-agent-feedback-controls.test.ts`、`tests/ui/orbit-settings-theme.test.ts` 等。
6. **壳与登录前缀**：`features/auth/app-auth-routing.ts:17–18` 已有 `/app/profile`、`/app/settings`；`orbit-2026/shell/shell-routes.ts:44–45` 现在 `/app/settings` → `settings`、`/app/profile` → `me`（代定 19 要改），`:10` `/app/profile/onboarding` 不挂壳。语言入口 `orbit-language-context.tsx:12 / :43` `setLanguage`。
7. **接口现状**：`/api/profile` 只有 `GET` 与 `PUT`（`app/api/profile/route.ts`；**没有 PATCH**，PUT 请求体现在不是 `.strict()`），含 `completeness`（`ProfileCompletenessContract`，`shared/contract/profile.ts:109–121`）；`/api/profile/{update-suggestions,update-suggestions/[id]/*,seek-suggestions,intro-draft,extractions/{business-card,resume}}`；提案来源枚举 `chat | activity | contact`（`features/profile/signal-contract.ts:16`）；自我介绍上限 `profileBioWithinLimit` / `profileBioLimit`（`shared/api-schema/profile-bio.ts:25–31`）；`/api/account/{me,status,language-preference}`、`/api/agent/memory/**`、`/api/integrations`（+ `[provider]` 的 `DELETE`（:20）、`authorize`、`callback`、`health`）、`/api/permissions/calendar`、`/api/connections`、`/api/events/center?summary=1`、`/api/events/mine`（App `endpoints.ts:73`）。**契约里没有「公開する項目」，也没有照片字段**。
8. **Google 连接**：`features/integrations/contract.ts:1–5` 提供方 `google_calendar` / `gmail` / `microsoft_graph`；Gmail 只有 `gmail.metadata.readonly`（:26–36）——画板「件名・本文の要点を読む」「下書きを Gmail に保存」超出现有权限，按代定 15 改稿。
9. **意味検索偏好**：Web `use-global-search.ts:14–20`（`SEMANTIC_PREFERENCE_KEY`、`readSemanticPreference`、`writeSemanticPreference`）；App `search-model.ts:9`（`APP_SEMANTIC_PREFERENCE_KEY`）；能力字段 `semantic.available`（R30 决定表 §50）。
10. **主办摘要**：App `host-api.ts:59` `centerSummary()`；`HostEventsRow` 已在展示页（`ComponentShowcaseScreen.tsx:135`）。
11. **补画样板**：b12 末尾 R17 组（「补画 · 2026-10-16 · 主催 R17 · …」，用 `S8(...)` 分组、每块浅 / 深两框、深 = 序号 +1，画板标题以 `W-R17-xx` / `A-R17-xx` 开头），R30 组（`W-R30-01` …）。编制时 b12 最后一块是 #499，其他线也在追加，**序号以开工时 `--list` 为准，门禁一律用标题定位**（G07）。
12. **文案与门禁现状**：App 已有域 `profile`、`settings`、`account`、`permissions`；Web `orbit-2026/copy/` 没有账户文件，旧页文案写死在 `profile-shell.tsx` 等文件（在 Web 写死文字允许清单里）。App `tests/legacy-ui-ratchet.test.ts:23` `ZERO` 名单（新目录只追加）。

## 5. 上下文包

- 决定：本文件 §2；README RD-05、RD-16、RD-24～RD-33、通用规则 10–13；决定表 D18、D55、D56、§15-1、§20、§38、§50。
- 交接：HANDOFF 通用口径、§R18、R17-03 / 04、R13-02、R30-06；`screen-ownership.md` 账户行。
- 画板：`b5-me-inbox.html` #14–#17、#18–#20、#21–#25、#26–#28、#30、#31、深色 #66、#68、#70；`b7-account-misc.html` #46–#51；`b1-onboarding-cards.html` #10–#12、#16、#18（编辑样式）；`b8-responsive.html` #15（断点规范）；`b12` 末尾本线补画。一律 `--extract-board` 单块抽取。
- **不归本 Sprint 的同文件画板**：b5 #13 / #29（通知，R14）；b7 #6–#18 / #73 / #80（订阅，下一期）、#19–#32 / #74 / #81（アカウント / 退会 / 导出，R18c）、#52–#61 / #75 / #82（ヘルプ / 404 / 版本，R18b）；b1 #0–#9 / #60（认证与落地，R18b）、#10–#21 等引导步骤（R28）。
- 代码：§4 列出的文件；R17 REPORT（`HostEventsRow` 用法）；R30 REPORT（意味検索偏好与能力）；R20a PLANNER（integrations `returnTo`）；R31a / R31b PLANNER（组件新参数）。

## 6. 易错边界（全部写进对应 SC）

- **完成度口径**（代定 21）：マイページ只读 `completeness.card`（4 项各 25），缺失时退回旧 `score` 且不画缺项列表；不在前端另算；旧 `score` 与 6 字段不受影响（R28 / live-service 回归测试守住）。100% 时显示「完成しました」，不再显示缺项。
- **求めていること AI 候选**（b5 #15 / #19）：✓ 写进资料、✕ 只是隐藏这一条候选；「根拠」行文字来自 `seek-suggestions` 的返回，没有就整行不画。候选生成若调用付费 AI，测试一律 mock（§0 第 6 条）。
- **公開する項目**（b5 #17–#20 底部勾选）：按 §7.1 加可选 `publicFields`；预览（App 公開プロフィール、Web 右栏）按设置实时变化；「メール・電話（交換後のみ）」不可关闭。**旧客户端 PUT 不带 `publicFields` 时保留已存值**（不重置为缺省，测试守住）。别人看到公开资料的读取点（招待コード落地 `/i/<code>`、活动参加者卡等）不在本线文件里的不改，在 REPORT「交接表追加」写清每个读取点和该由谁接上；本线文件里的公开资料投影必须按设置过滤。
- **只画真实存在的**（代定 15）：「今月の閲覧」、「同期の履歴」、「使えるようになったら知らせる」、「下書きを Gmail に保存」、更新の提案的撤销都不做界面；Gmail 说明按实际权限写；画板按 §9.1 改稿后门禁。
- **連携**（代定 18）：只调用现有 `/api/integrations/**`；客户端在本线私有文件；「解除」先确认再调 `DELETE`；状态读 `health`；Google 連絡先固定「準備中」。
- **iOrbit が覚えていること**（代定 13）：读 / 删走 `/api/agent/memory`；删除后列表少一条（测试验证调用了删除）；来源标签只有「メモ」/「iOrbit との会話」，日期来自接口字段，没有就不画。
- **「AI で整える」**（自我介绍）：走 `/api/profile/intro-draft`，结果先放进输入框让用户确认再存；上限用 `profileBioWithinLimit`（代定 22），超限时保存按钮禁用并提示。
- **一个入口**（代定 5）：Web 语言只经 `setLanguage`；两处入口切换后立即一致；账户偏好同步是 D 线请求，不在 R18a 里另写。
- **意味検索**（代定 10）：只写 `"on"` / `"off"`；能力不可用时整卡隐藏；关掉后全局搜索送 `semantic=0`（调用现有搜索读取函数断言，测试 mock 能力）。
- **更新の提案**（代定 12）：live 只接 `chat | activity | contact`；名刺 / 经历书卡来自抽取草稿，✓ 后 `PUT /api/profile`（与编辑保存同一条路径，不新增写接口）；只有 ✓ 的项目写入；「すべて採用」只勾选同一张卡；来源筛选只出有数据的来源；联系人卡只在 fixture 里出现；不加服务端枚举值。
- **「準備中」占位**（代定 4）：不是错误页、不显示重试；占位页有返回；R14 / R18b / R18c 建好自己的静态路由后占位自动失效（各加一条路由测试证明静态段优先）。
- **只加不改**（规则 10、G18、G19）：响应 schema 不用 `.strict()`；新字段可选；`completeness.card.items[].key` 宽进；给现有契约加字段前先确认 App 读取是宽进的。
- **旧屏重写 = 新文件 + 删旧文件**：不在旧屏上改颜色；旧路由保留跳转（`/app/profile?view=connect|settings|persona|basic` → 新地址；`/app/profile?onboarding=1` → `profileOnboardingFlowPath(next)`；App `profile/more` → `/profile/edit`、`account/permissions` → `/settings`）。App `profile/continue` 行为不变，测试守住。
- **壳与插槽**：Web 新页面用 `ShellPage`（标题「設定」/「更新の提案」），外层 `Orbit2026Scope` + `ToastProvider`（G21），390 下按补画显示返回与标题（G11），不加 🔍（G12），新弹层 / 抽屉在旧页面上复查全局 `.btn` 漏入（G13）；左栏高亮靠 D 线改动（代定 19）；App 新屏用 `AppScreen` 或 `ShellTopBar` 插槽（G15–G17），文字用 `UiText`（G24）。
- **不写死文字**：两端 `no-hardcoded-copy`；日文句末「。」、拉丁字母与日文之间半角空格（R03 规范），跑 `npm run copy:qa`；`profile-shell.tsx` 等旧文件删除后从允许清单删行；App 字典只删没有使用点的键。

## 7. 契约与数据（本 Sprint 定稿，REPORT 交接）

### 7.1 只加不改的字段

- **`completeness.card`**（代定 21）：`{ score: number; items: { key: string; weight: number; done: boolean }[] }`，可选；服务端在现有完成度计算旁边并行计算（4 项各 25：`companyRole`、`offering`、`seeking`、`intro`，key 名开工定，REPORT 写明）；响应 schema 里 `key` 用宽进字符串、`card` 整体可选。
- **`publicFields`**（profile 契约，可选）：`{ companyRole: boolean; offeringSeeking: boolean; intro: boolean }`，缺省全部 `true`；`メール・電話` 固定「交換後のみ」，不进字段。写入走现有 **`PUT /api/profile`**（没有 PATCH；PUT 请求 schema 现在不是 `.strict()`，本 Sprint 不改它的严格程度，只加可选字段）；**PUT 不带 `publicFields` 时服务端保留已存值**。服务端存储按 `features/profile` 现有方式（需要迁移时：本机库 `orbit_line_c` 正向迁移 + 重放验证，**生产不执行**，写进「待用户授权」）。
- **マイページ摘要读取**：不新建聚合接口；主催用 `center?summary=1`，参加用 `events/mine`，受信箱用现有未读数接口，各自失败只隐藏那一行（G18）。
- **不加的**：`ProfileSignalSourceKind` 枚举值（代定 12）、照片字段（下一期）、撤销接口、同期履历、「知らせる」存储（代定 15）。
- 每加一个字段：`shared/api-schema/*` 同步、`demo-world/account.ts`、`tests/contracts/redesign-schema-parity.check.mts`、App `contract-fixtures-parse`、`node scripts/contract-snapshot.mjs --write`、`npm run sync:contract` 同提交。

### 7.2 设计稿示例 fixture

- 三个演示账号（25% / 50% / 100%，按代定 21 的 4 项造数据，提供 / 求め 各 ≤5 条，其余字段照改稿后的 b5 #14–#16；人和事只从演示世界 `index.ts` 取，带 `sample: true`）+ 更新の提案 6 件（本人 1 + 联系人 5，照 b7 #48 / #51 的人名、字段与日期）+ 連携三态（未接続 / Gmail のみ / 両方，照改稿后的 #26–#28）+ iOrbit が覚えていること 3 条（来源只用 `manual` / `conversation`）。
- 放在 `shared/mock/demo-world/account.ts`，只在 mock / 非生产的设计开关下生效，经同一接口 schema 解析，生产构建不收录（测试守住）。只补数据，不改结构。

## 8. 旧屏替换与删除（screen-ownership 账户行，跳转保留）

| 旧（两端） | 新 | 处理 |
| --- | --- | --- |
| App `(app)/profile` → `ProfileScreen` | マイページ（b5 #14–#16、#66，改稿后） | 重写；`ProfileScreen.tsx` 删除（拆出的仍有用的逻辑搬进新目录） |
| App `profile/preview` → `ProfilePreviewScreen` / `ProfilePublicView` | 公開プロフィール（b5 #17） | 重写，旧文件删除 |
| App `profile/edit`、`profile/tags`、`profile/more` | 编辑 / 标签（b1 样式，代定 11） | 重写；`profile/more` 改跳 `/profile/edit`；`ProfileMoreScreen` 删除 |
| App `profile/suggestions` | 更新の提案（b7 #46–#48） | 重写 |
| App `settings` → `SettingsScreen` | 設定（b5 #21–#23、#68，改稿后） | 重写 |
| App 新建 `settings/integrations`、`settings/iorbit`、`settings/[section]` | 連携（#24，改稿后）、iOrbit が使う情報（S31）、占位 | 新建 |
| App `settings/api` | 开发包专用：正式构建不显示入口，只在开发包（`__DEV__` 或现有展示页开关）里显示在设定页最下面 | 保留路由，屏幕按新样式最小重写或原样（REPORT 写明） |
| App `account/permissions` → `AccountPermissionsScreen` | 设定页内联権限（代定 14） | 改跳 `/settings`，旧屏删除 |
| Web `/app/profile`（`?view=profile/persona/basic/connect`、`?onboarding=1`） | 設定 · プロフィール（b5 #18–#20，改稿后） | 重写；`view` 参数跳到新地址；`onboarding=1` 跳 `profileOnboardingFlowPath(next)`（代定 20） |
| Web `/app/settings` | 設定 首页（≥768 默认显示「プロフィール」，390 是列表，按补画） | 重写 |
| Web 新建 `/app/settings/{integrations,iorbit,appearance}`、`/app/settings/[section]` | 連携（#26–#28、#70，改稿后）、iOrbit が使う情報（S02）、言語と外観（#31 / S03）、占位 | 新建 |
| Web 新建 `/app/profile/suggestions` | 更新の提案（b7 #49–#51） | 新建（App 已有同名路由，`route-parity` 成对） |
| Web `profile-0918/**`、四个 `orbit-agent-*-settings.tsx`、`orbit-appearance-settings.tsx` | — | 删除（`profile-model.ts` 只留 re-export、`use-profile-editor-session.ts` 搬走，代定 20） |

每个跳转加路由测试。删除后：三份允许清单删对应行（G20）、旧组件使用点归零就删文件、HOW-TO §7 两端路由登记与审计计数同步（App `integratedFeatureRoutes`、`page-offline-inventory` + 重新生成 `docs/offline/page-inventory.md`、`route-parity`；Web `audit:full-product`、`audit:surfaces`、`web-route-transport` 计数）。

## 9. 像素 SC、改稿、补画与预检（HOW-TO §8、规则 11 / 13、RD-16 / RD-26 / RD-29）

### 9.1 改稿与补画（第一步，单独一个提交）

1. **就地改稿 `b5-me-inbox.html`**（开工 `pull --rebase` 拿到 B 线已提交的改稿后再改；每处加注释「2026-10-18 主会话代定 §C-1（RD-33）· R18a」）：
   - ①Web 子菜单（#18–#20、#26–#31、#70）去掉「ご利用プラン」；②App 設定（#21–#23、#68）「プランとサポート」组去掉「ご利用プラン」行；③App 設定「名刺交換」整组去掉（代定 3）；
   - ④完成度（#14–#16、#18–#20、#66）：数字改为 25 / 50 / 100 三档，缺项只剩 4 项各「+25%」（会社・役職 / 力になれること / 求めていること / 自己紹介），去掉「写真を追加」；文字「あと N 項目…」随之改（代定 21）；
   - ⑤連携（#24、#26–#28、#70）：Gmail 说明改为只读元数据、删「下書きを Gmail に保存」、删「同期の履歴」块、删 Google 連絡先「使えるようになったら知らせる」（代定 15）；
   - ⑥マイページ 100%（#16、#20、#66）：「今月の閲覧」格删除；名刺交換格按开工查到的计数来源保留或删除（代定 15）；
   - ⑦iOrbit が使う情報（#25、#30）：「面談メモ」来源标签改为现有两种之一（代定 13）。
   改完重跑这些画板的 `--list` 确认没有别的变化；每处改动列进 REPORT「改稿与补画清单」。
2. **在 b12 末尾追加一组「补画 · R18a 账户（Web）」**（照 R17 组的 `S8(...)` 写法：每块浅 / 深两框，深 = 序号 +1；1024 = b8 #15 断点规范，左栏收为图标、右栏收起；390 = 单列同 App，二级页有返回、不显示底部胶囊遮挡的操作条；样式照对应 1440 / App 画板（**改稿后**）源码搬，只用 kit 类与 token）。**共 17 块**，画板标题即门禁标题：

| 块 | 画板标题（前缀即 id） | 依据 | 框 |
| --- | --- | --- | --- |
| S01 | `W-R18a-01` 設定 · プロフィール（大量 · 参加するイベント） | b5 #20（改稿后）+ 「参加するイベント」卡（放在「主催したイベント」卡旁，样式同卡） | 1440 浅 / 深 |
| S02 | `W-R18a-02` 設定 · iOrbit が使う情報（意味検索） | b5 #30（改稿后）+ 底部意味検索开关卡（代定 10） | 1440 浅 / 深 |
| S03 | `W-R18a-03` 設定 · 言語と外観 · 深色 | b5 #31 | 1440 浅 / 深（浅 = #31 去 Pro 后） |
| S04 | `W-R18a-04` 更新の提案 · 大量 · 深色 | b7 #51（去撤销说明） | 1440 浅 / 深 |
| S10–S14 | `W-R18a-10`～`14` プロフィール（大量）/ 連携（大量）/ iOrbit が使う情報 / 言語と外観 / 更新の提案（大量）· 1024 | S01、#28（改稿后）、S02、#31、#51 | 1024 浅 / 深 |
| S20–S25 | `W-R18a-20` 設定 首页列表 · 390；`21`～`25` プロフィール（大量）/ 連携 / iOrbit が使う情報 / 言語と外観 / 更新の提案 · 390 | 列表照 App b5 #23（改稿后）；其余照 1440 内容单列 | 390 浅 / 深 |
| S30 | `A-R18a-30` マイページ（100% · 参加するイベント） | b5 #16 / #66（改稿后）+ 「参加するイベント」行（「主催したイベント」行下面） | App 浅 / 深 |
| S31 | `A-R18a-31` iOrbit が使う情報（意味検索） | b5 #25（改稿后）+ 底部意味検索开关卡 | App 浅 / 深 |

   画板注释写清：依据画板、改了什么、「主会话代定 §C-1 · 待主会话复核认可」。起草完提交，接着做 SC-02 以后的工作，不等认可（主会话在 Sprint 复核时认可或要求改，改了按新画板重比）。补画和原画板矛盾、或画不出来的，写进 REPORT「待主会话代定」。
3. 画面清单写成 `views/web-R18a.json` / `views/app-R18a.json`，**补画画面用标题定位**（`--board "W-R18a-01"`），原画板用序号 + 标题注释。

### 9.2 画面清单与门禁

- **判定**：两端按决定表 §20 / RD-29：超阈值带全部归因为 `[data]` / `[raster]` / `[contrast]` 即通过；提交 `attribution-redesign-R18a.json` 与 `-app.json`；每个画面最多 3 轮；被组件卡住的标「待组件库」。中途状态（sheet、确认框、Toast、候选 ✓ 后）用只在开发包 / 开发环境生效的状态开关（`design=` / `open-path`，RD-28），测试保证正式构建里没有。Web 截完整页面（含壳，左栏高亮依赖代定 19），App 用模拟器真实画面。**原画板一律按 §9.1 改稿后的版本比**。
- **画面**（「浅 / 深」= 两张；补画画面浅深都以补画为准）：

| 画面 id | 画板 | 宽度 / 主题 | 到达方式 |
| --- | --- | --- | --- |
| A-R18a-01 | b5 #14 マイページ 25% | App 浅 | 演示账号 25% → `/profile` |
| A-R18a-02 | b5 #15 マイページ 50% | App 浅 | 演示账号 50% |
| A-R18a-03 | S30 `A-R18a-30`（代替 #16 / #66） | App 浅 / 深 | 演示账号 100%（有主办、有报名） |
| A-R18a-04 | b5 #17 公開プロフィール | App 浅 | マイページ →「公開プロフィールのプレビュー」 |
| A-R18a-05 / 06 | b5 #21 / #22 設定 空 / 少 | App 浅 | 25% / 50% → `/settings` |
| A-R18a-07 | b5 #23 設定 大（深 #68） | App 浅 / 深 | 100% |
| A-R18a-08 | b5 #24 連携 | App 浅 | fixture「Gmail のみ」→ `/settings/integrations` |
| A-R18a-09 | S31 `A-R18a-31`（代替 #25） | App 浅 / 深 | `/settings/iorbit`（mock 意味検索可用） |
| A-R18a-10～12 | b7 #46 / #47 / #48 更新の提案 空 / 少 / 大 | App 浅 | fixture 0 / 2 / 6 件 → `/profile/suggestions` |
| W-R18a-P01 / P02 | b5 #18 / #19 プロフィール 空 / 少 | 1440 浅 | 25% / 50% → `/app/profile` |
| W-R18a-P03 | S01 `W-R18a-01`（代替 #20） | 1440 浅 / 深 | 100% |
| W-R18a-P04～06 | b5 #26 / #27 / #28 連携 三态（深 #70） | 1440 浅（#28 浅 / 深） | fixture 三态 → `/app/settings/integrations` |
| W-R18a-P07 | S02 `W-R18a-02`（代替 #30） | 1440 浅 / 深 | `/app/settings/iorbit` |
| W-R18a-P08 | b5 #31 + S03 言語と外観 | 1440 浅 / 深 | `/app/settings/appearance`；**区域门禁**：去掉「アカウント」块（R18c 前链接隐藏，代定 4），整板留给 R18c 重跑 |
| W-R18a-P09～11 | b7 #49 / #50 / #51（深 S04）更新の提案 | 1440 浅（#51 浅 / 深） | fixture 0 / 2 / 6 件 → `/app/profile/suggestions` |
| W-R18a-P12～16 | S10–S14 | 1024 浅 / 深 | 同 P03 / P06 / P07 / P08 / P11 |
| W-R18a-P17～22 | S20–S25 | 390 浅 / 深 | `/app/settings`（列表）及各段 |

- **不进门禁**：App 编辑 / 标签、Web 名刺编辑抽屉（代定 11，附截图 + `--style-diff`）；App 深色里没有画板的画面（代定 17）；「準備中」占位页（HOW-TO §5 空态，附截图）；b5 #13 / #29（R14）；b7 订阅 / 退会 / 导出 / ヘルプ等（见 §5）。
- **重跑（不退步）**：`views/app-R05.json` 的 A-R05-11（旧マイページ壳条目，重写后改指 A-R18a-03 并在 REPORT 写明）、`views/web-R07.json` 涉及头像菜单 / マイページ / 左栏高亮的条目、`views/app-R17.json` 用到 `HostEventsRow` 的条目。

### 9.3 画板预检（开工时跑，改稿前后各跑一次）

`cd repos/orbits && node scripts/visual/board-preflight.mjs --design-base http://localhost:3420/redesign-2026-10/ --suite scripts/visual/views/web-R18a.json --md ../../docs/designs/redesign-2026-10/sprints/R18a-account-mypage-settings/preflight-checklist.md`（App 同理），五项结论写进 `preflight-checklist.md`。第 2 项要逐个给出「接口 / 字段」或「按代定 15 删除」：完成度 4 项（`completeness.card`）；求めていること候选与「根拠」；公開する項目（`publicFields`）；名刺交換计数来源；連携说明与权限；iOrbit が覚えていること 来源与日期、`memory/settings` 开关；現在の目標「第6週 / 24週」与サブ目標（计划 v2 接口字段）；更新の提案各来源（live 三种 + 抽取草稿）；公開プロフィール「相手側に出る共通点 · サンプル」（示例块，只画示例，标 `[data]`）。代定没覆盖到的新缺口写「待主会话代定」。

## 10. 范围与文件

- **改 / 新建 / 删除**：见 §1、§7、§8、§9.1；另外 D 线 `shell-routes.ts` 一行（§0 第 2 条，在 D 线提交）。
- **测试**：`completeness.card` 计算（4 项各 25、去写真）且旧 `score` / 6 字段不变；App 读取 `card` 缺失时退回；`publicFields` 读写、缺省值、旧客户端 PUT 不带时保留已存值、预览过滤；マイページ各行的数据来源与失败时只隐藏该行；参加するイベント 0 件不显示、深链 `/events?tab=going`；主催行与 R17 组件联动；Web 语言只经 `setLanguage`、外观两入口一致；意味検索写 `"on"` / `"off"`、能力不可用时隐藏、关掉后全局搜索送 `semantic=0`（两端各一条，mock 能力）；連携三态与 `DELETE` 解除（测试替身 provider）；iOrbit memory 删除调用与两种来源标签；自我介绍 `profileBioWithinLimit` 边界（CJK 80 / 其他 200）；更新の提案：live 三种来源、名刺 / 经历书草稿卡 ✓ 后走 `PUT /api/profile`、只写 ✓ 项、「すべて採用」范围、筛选只出有数据的来源、联系人卡只在 fixture；「準備中」占位与静态段优先；`onboarding=1` → `profileOnboardingFlowPath(next)` 跳转、App `profile/continue` 不变；R28 引用的标签选项经 re-export 仍可用；跳转测试；开发状态开关与示例 fixture 不进正式构建；两端新屏真实渲染测试（三个账号状态、未登录、离线、读取失败）；允许清单与 `legacy-ui-ratchet` 通过；本机 PG 路由测试（`orbit_line_c`，有迁移时含正向与重放）。
- **不做**：通知设置页（R14）；认证、落地页、欢迎页、版本检查、ヘルプ / お問い合わせ、404（R18b）；アカウント页、导出、退会（R18c）；引导（R28）；付费方案、照片、NFC 名刺交換（下一期）；联系人一侧的更新提案来源（下一期）；同期履历、「知らせる」、提案撤销（无数据源）；账户语言偏好同步（D 线请求）；组件库与壳（A / D 线）。

## 11. 验收契约

| SC | 操作链 | 主证据 |
| --- | --- | --- |
| SC-R18a-01 开工、改稿与补画 | `orbit_line_c` 复用或新建、`.env.local` 从 redesign 复制并改库名、端口 3400 / 8084 / 3420、`.next-line-c`、模拟器 `Orbit Line C`（记 UDID）；两端基线全量记录；D 线 `shell-routes.ts` 改动单独提交（§0 第 2 条）；§9.1 第 1 条就地改稿（①–⑦）与第 2 条 b12 补画 **17 块**提交；`views/{web,app}-R18a.json` 写好；`board-preflight` 改稿前后各跑一次并写 `preflight-checklist.md` | 基线摘要、D 线与改稿 / 补画提交号、`preflight-checklist.md` |
| SC-R18a-02 数据与契约 | 加 `completeness.card` 与 `publicFields`（§7.1，只加不改、响应宽进）；旧 `score` / 6 字段回归通过；旧客户端 PUT 不带 `publicFields` 时保留已存值；三个演示账号与 fixture（§7.2）经 schema 解析；`contract-snapshot`、schema parity、`sync:contract` 同提交；有迁移时本机正向 + 重放 | 契约检查、路由 / PG 测试、`contract:` 提交 |
| SC-R18a-03 App マイページ（R18-02 / 07 / 08、R17-04、R13-02） | 三个账号分别打开：25% / 50% 显示 4 项缺项与「+25%」、50% 显示 AI 候选（✓ 一条 → 资料更新、完成度变化；✕ 一条 → 隐藏）、100% 显示「完成しました」（无「今月の閲覧」格）；行顺序照画板：公開プロフィールのプレビュー → 受信箱（未读数）→ 招待コード（进 `contacts/new/invite`）→ 主催したイベント（`HostEventsRow`，进運営センター）→ 参加するイベント（有报名才显示，进 `/events?tab=going`）→ 設定；Pro 行不出现 | 渲染测试 + 模拟器操作记录 |
| SC-R18a-04 App 公開プロフィール · 编辑 · 标签 | 预览按 `publicFields` 实时变化，邮件 / 电话写「名刺交換した相手のみ」；编辑页改公司 / 职位 / 业界 / 所在地 / 自我介绍（`profileBioWithinLimit`：CJK 80 / 其他 200，超限禁用保存）并保存，返回后マイページ与预览一致；标签页增删提供 / 寻求（各 ≤5 的演示数据下正常）；`profile/more` 跳编辑页；离线时保存按钮按现有规则禁用并提示 | 渲染测试 + 操作记录 + `--style-diff`（对 b1 #10–#12） |
| SC-R18a-05 App 設定（R18-05 / 09、R14 入口） | 顶部账号行进 `/account`；语言三选项（未手动选择时高亮当前生效语言，选后固定）、外观三选项即时生效（代定 5）；連携 / iOrbit が使う情報 进二级页；権限三行状态正确，未询问请求、已拒绝开系统设置；通知 / データの書き出し / ヘルプ / 利用規約・プライバシー 进「準備中」；Pro 行与名刺交換组不出现；注销在有未同步修改时出动作表；`settings/api` 只在开发包可见 | 渲染测试 + 操作记录 |
| SC-R18a-06 App 連携 · iOrbit が使う情報（R30-06） | 連携三态（测试替身 provider）：接続する（`returnTo=settings`，未合入时默认回跳）→ 回跳后显示接続済み；解除 → 确认 → `DELETE /api/integrations/[provider]` → 回到未接続；Gmail 说明为只读元数据，无同期の履歴 / 知らせる；Google 連絡先 显示準備中；iOrbit 页：目标「変更」进计划目标页、自我介绍「AI で整える」（mock）→ 用户确认后保存、上限按 `profileBioWithinLimit`、删除一条记忆后列表少一条、来源标签只有两种；意味検索：能力可用时关掉 → 写 `"off"` → 全局搜索送 `semantic=0`、再打开写 `"on"` 恢复；能力不可用时整卡隐藏 | 渲染测试 + 接口测试 + 操作记录 |
| SC-R18a-07 Web 設定框架 · プロフィール（R18-01 / 07 / 08、R17-03） | `/app/profile` 左栏高亮「設定」（依赖 D 线提交）、子菜单（无「ご利用プラン」）+ プロフィール：名刺、完成度 4 项、提供 / 求め（行内添加、AI 候选 ✓ ✕）、招待コード「コードを作る」打开 `InviteCodeModal`、主催したイベント卡（`center?summary=1`，进運営センター）、参加するイベント卡（有报名才显示）；右栏公開プレビュー随「公開する項目」实时变化；名刺字段编辑抽屉保存后两栏一致；**临时「主催」页签已删**，390 从プロフィール进主催可达；子菜单「通知 / アカウント / 権限 / データの書き出し / ヘルプ」进「準備中」，「ログアウト」可用；旧 `?view=` 跳新地址；`?onboarding=1&next=…` 跳 `/app/profile/onboarding?next=…` | 渲染测试 + 浏览器操作记录（1440 / 1024 / 390） |
| SC-R18a-08 Web 連携 · iOrbit が使う情報 · 言語と外観（R30-06） | 連携三态、`DELETE` 解除、说明按实际权限（无同期の履歴 / 知らせる / 下書き保存）；iOrbit 页同 SC-06 并用 `/api/agent/memory`，`memory/settings` 开关按 #30 有就保留、没有就登记；四个旧 agent 设置模块不再出现在任何页面、接口测试仍通过；言語と外観 语言只经 `setLanguage`，切换后头像菜单同步（反之亦然），外观同理；「データを書き出す / アカウントを削除」隐藏 | 渲染测试 + 接口测试 + 操作记录 + 文本搜索为零 |
| SC-R18a-09 更新の提案（两端，S2） | 空态（示例卡 + 三个入口：名刺 / 职务经历书 / iOrbit に近況を話す，各自进现有入口）；live 队列只出 `chat | activity | contact` 来源的提案，逐项 ✓ / ✕、「すべて採用」、「✓ した項目を反映」后资料变化、件数减少；扫描 / 上传后由抽取草稿生成名刺 / 経歴書卡，✓ 后经 `PUT /api/profile` 写入；来源筛选只出有数据的来源，Web 右栏「提案の出どころ」计数同口径；无撤销说明；联系人卡只在 fixture 出现；服务端枚举未改（文本搜索为证） | 渲染测试 + 接口测试 + 操作记录 |
| SC-R18a-10 旧屏替换与路由 | §8 每行做完：新屏上线、旧文件删除（`profile-0918` 只剩 re-export）、跳转测试通过；R28 引用的标签选项仍可用；三份允许清单删行、`legacy-ui-ratchet`（`ZERO` 追加本线目录）通过；HOW-TO §7 两端登记与审计计数更新；`route-parity` 无新增例外；静态段优先测试（模拟 R14 / R18b / R18c 的静态路由时不再显示占位） | 测试 + 文本搜索 + 审计输出 |
| SC-R18a-11 状态与边界 | 两端未登录（跳登录，不显示旧登录卡）、离线（App 本机已有资料可看、需要联网的按钮禁用）、读取失败（区块重试卡）、「尚未实现」（整块隐藏，G18）、主催 / 参加 / 受信箱各自失败只隐藏该行；日文界面没有中文 / 英文残留 | 渲染测试 + 截图 + 文本搜索 |
| SC-R18a-12 像素与不退步（R31a / R31b 合入后） | §9.2 每个画面 × 主题过门禁（改稿 / 补画以主会话认可版本为准）；被组件卡住的标「待组件库」并写进「交接表追加」；§9.2「重跑」清单通过；不进门禁的画面附截图 | 门禁总表（raw、带数、归因路径）、`compare.html` |
| SC-R18a-13 全量与复核 | 两端全量对照基线零新增失败（orbits 带 `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`）；orbits `typecheck` / `typecheck:app` / `lint` / `copy:qa`、App `npx tsc --noEmit` 通过；REPORT 写「越线自查」（`git diff --stat origin/redesign...HEAD` 逐文件对照 §1，D 线那一行单独列）与交接条目逐条结果（§3）；独立复核**自己重跑**测试与门禁 | 全量摘要、REPORT、REVIEW |

## 12. 执行顺序

1. SC-01：环境、基线、D 线壳改动（单独提交）、改稿与补画（单独提交）、画面清单、画板预检。
2. SC-02：数据与契约（测试先行）→ 一次 `contract:` 提交并同步 App → 演示账号与 fixture。
3. App：SC-03 マイページ → SC-04 预览 / 编辑 / 标签 → SC-05 設定 → SC-06 連携 / iOrbit / 意味検索。
4. Web：SC-07 框架与プロフィール（含删临时主催页签、`onboarding=1` 跳转）→ SC-08 連携 / iOrbit / 言語と外観（删旧 agent 模块）。
5. SC-09 更新の提案（两端）。
6. SC-10 旧屏删除、跳转、登记、允许清单；SC-11 状态补齐。
7. 全量测试一轮（不含像素），写 REPORT 草稿。
8. 检查 `origin/redesign` 是否已合入 R31a / R31b：已合入 → SC-12 像素收口；未合入 → REPORT 写「等组件库」并结束（§0 第 6 条）。
9. SC-13 全量、REPORT 定稿；独立复核由主会话另起。

可以并行的 worker（§0 第 1 条）：App（SC-03～06）与 Web（SC-07～08）在 SC-02 合入后可分两个 worker；共用的契约、fixture、字典汇总文件只由主开发会话改。

## 13. 失败与交接

- 需要产品取舍：按 §0 第 5 条跳过并写进「待主会话代定」，不阻塞其他 SC。已知可能出现的：名刺交換格没有计数来源；`memory/settings` 开关在 #30 没有对应控件；App OAuth 回跳不通；R20a 的 `returnTo` 白名单未合入；公开资料读取点在其他线文件里；R26 参加予定页签 key 不是 `going`。
- REPORT「交接」必须写：
  - 给 **R14**：通知页静态路由路径（App `/settings/notifications`、Web `/app/settings/notifications`）、本 Sprint 从設定移除的推送开关与送达 / 发现设置（文件仍在原处）；
  - 给 **R18b**：ヘルプ / 利用規約 / プライバシー 占位入口的路径、ヘルプ里的 Pro 条目、R18-03 底栏请求、注册弹窗；
  - 给 **R18c**：アカウント（`/account`）与 データの書き出し 入口、Web「言語と外観」两个隐藏链接与 W-R18a-P08 整板重跑；
  - 给 **R28**：`completeness.card` 与旧 `score` 的关系、`profile-edit-session` / `use-profile-editor-session.ts`（新路径）的接口变化（只加）、`profile-0918/profile-model.ts` re-export（R28 改引用后删）、编辑页组件可复用的部分；
  - 给 **R13**：受信箱行（R13-02）的位置与删除方法；
  - 给 **D 线**：`shell-routes.ts` 改动提交号（已做）；请求在 language context 里统一加账户语言偏好同步；不再使用的 `ShellBackBar` / `ShellInboxRow`；
  - 给 **A 线**：页面私有组件清单（建议收编）；
  - 给 **R20a**：R18a 对 `returnTo=settings` 白名单与 `DELETE` 的使用方式；
  - 「待组件库」「设计稿无」清单；改稿与补画清单（块、标题、依据、待认可）；
  - 「文档更新请求」：决定表 §C-1（本文件 §2 全部代定、§9.1 改稿①–⑦与 17 块补画，标「主会话代定」）；HANDOFF §R18 各行状态、R17-03 / 04、R13-02、R30-06；`screen-ownership.md` 账户行与 `profile/suggestions` 改归 R18；README 登记表加 R18a 行。
