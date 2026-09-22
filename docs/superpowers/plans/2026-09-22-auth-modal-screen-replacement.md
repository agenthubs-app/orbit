# 认证四态弹窗 屏级替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `Orbit 首页.dc.html` 346–470 行把 登录 / 创建账号 / 重置密码（申请）/ 设置新密码（含链接失效）四态弹窗做成 1:1，浮在未登录落地页之上；现有四条路由（`/app/account/login`、`/signup`、`/forgot-password`、`/reset-password`）**保留**，只换渲染组件；登录/注册/找回/重置的写逻辑（NextAuth credentials、`/api/auth/register`、`/api/auth/password-reset/request|confirm`、Google OAuth、`?next=` 安全回跳、注册后自动登录、profile continuation）零改动；旧 `orbit-real-account-auth.tsx` 与 `reset-password-form.tsx` 切换后删除。

**Architecture:** 与前四域相同：先把旧组件的状态 + fetch + 动作原样抽成 hook（`use-account-auth.ts`、`use-password-reset.ts`，旧组件改调 hook、JSX 不动、既有测试全绿），再按设计建 `account/auth-0918/` 弹窗壳 + 四态屏消费 hook，最后页面接线 + 删旧。

**Tech Stack:** Next.js 16 App Router、React 19 client components、node:test + react-test-renderer、playwright 像素比对 `scripts/visual/compare-0918.mjs`。

## Global Constraints

- 工作树 `/Users/li/work/orbit-web-newui-batch0-20260918`（分支 `newui/batch-0-shell-landing`）；主仓 `/Users/li/work/orbit` 只读；`$WEB` = `repos/orbits`；冻结 `orbit-reference-styles.tsx`；trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`；永不 amend / stash；不提交 `.claude/launch.json`、`next-env.d.ts`；ratchet（现 button 98 / fontSize 35 / fontWeight 16 / gap 173）只降；`npm run typecheck` 0；提交前 `detect-changes --scope all`；改函数前 `impact`（UNKNOWN → grep 确认）；每任务台账 `- **认证弹窗 任务 N 完成** …` 写入 `docs/development/2026-09-17-web/EXECUTION.md`。
- **绝不**把任何账号密码写进代码 / 文档 / 报告 / 提交信息（QA 账号密码只从 `.env.local` 的 `ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD` 读；像素命令里用 `<password>` 占位记录）。
- `$DESIGN` = `/Users/li/work/orbit/docs/designs/Orbit_0918/Orbit 首页.dc.html`（537 行）。核对过的区间：346–347 遮罩（`position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(14,18,37,0.45); backdrop-filter:blur(6px)`）+ 面板（`max-width:440px; max-height:calc(100vh - 48px); overflow:auto; background:#FFFFFF; border-radius:24px; padding:40px; box-shadow:0 30px 80px rgba(14,18,37,0.3); display:flex; flex-direction:column; gap:24px`）+ 关闭 × + 「Orbit」字标；348–369 登录；371–392 注册；394–420 找回（含成功卡 ✦ 重置链接已发送）；422–464 新密码（tokenInvalid 分支「链接已失效」/ tokenValid 分支 + 成功态「密码已更新」）；466–470 「演示」切换条 = **纯演示 UI，不实现**（记偏差）；renderVals 486–534（按钮文案 / 校验文案 / `btnOpacity` 0.6）。
- **像素规则**同前：前缀 `au-`，作用域 `[data-orbit-real-page="auth-0918"]`（只包弹窗层；底下落地页保持 `landing-0918` 作用域）；一静态样式一类，声明顺序 / 值逐字；`.btn.au-*` 整段中和基类 + `:active{transform:none}`；`:hover` 只写 `style-hover`；`style-focus` 用 `:focus` 规则逐字；动态 `opacity:{{ btnOpacity }}` 内联；设计 mock（taken@orbit.app / failfail）不得出现；错误文案沿用设计（「请输入有效的邮箱地址。」「密码至少 8 位。」「邮箱或密码不正确，请重试。」「该邮箱已注册，请直接登录。」「新密码至少 8 位。」「两次输入的密码不一致。」「重置失败，请稍后重试。」）——服务端返回的 `error.message` 原样优先。
- **i18n**：文案全部走 `useOrbitLanguage().t({zh,en,ja?})`，zh 值 = 设计文案逐字（Network/Events 同法）；服务端 page 继续用 `localizeOrbitTree` 的 view model 仅取 `defaultNext`/`mode`（标题/描述改由屏内 `t()` 给出设计文案；`orbit-account-auth-route-view-model.ts` 的 copy 字段保留但不再渲染 → 记录，Task 3 决定是否精简）。
- **页面接线**：四个 page.tsx 的服务端逻辑（`auth()` 已登录重定向、`loadAppAccountAuthRouteViewModel` 状态边界、`enabledOAuthProviders()`、reset 的 `metadata` no-index）**不动**；只把 `<OrbitRealAccountAuth …/>` / `<PasswordResetForm/>` 换成 `<OrbitLanding0918 authenticated={false} />` + `<AuthModal view=… oauthProviders=… defaultNext=… />`（落地页在下、弹窗在上，与设计一致；落地页自身的登录/注册 CTA 保持指向路由）。`mobile-google/` 不在本计划（原生 App 回跳页，记录）。
- **真实数据 / 行为映射（元素级）**：
  - 关闭 ×、遮罩点击、Esc → `onClose` = 导航 `/app`（旧行为 `navigate("/")` → `/app`）；焦点陷阱 / `role="dialog"` / `aria-modal` / 打开时自动聚焦首个输入 沿用 `useOrbitModalA11y`（`tests/ui/orbit-modal-standard.test.ts:76-92` 锁定）。
  - 登录：邮箱 / 密码（`autoComplete`、`required`、`type=password`；显示/隐藏密码眼睛按钮 = 设计外能力 → **省略**，记偏差）/「忘记密码？」→ `/app/account/forgot-password?next=`（整页导航，路由保留）/ 错误卡 / 主按钮文案 登录 · 登录中… · ✓ 已登录（成功后立即 `navigate(profileContinuationPath(next))`，「✓ 已登录」只在导航前一帧出现）/「还没有账号？ 创建账号」→ `/app/account/signup?next=`；`?created=1&email=` 提示条（旧 `message`）→ 用设计错误卡同尺寸的蓝色 notice（`#ECEEFB/#2E3270`，同 找回成功卡 样式）放在表单上方（记偏差）；Google：`oauthProviders.includes("google")` 时在主按钮下方加一枚 `btn au-google`（白底 `#DDDEFA` 边、999px、与主按钮同 padding；设计无 → 记偏差）。
  - 注册：邮箱 / 密码（占位「至少 8 位」，`minLength=8`）/ 错误卡 / 创建账号 · 创建中… · ✓ 账号已创建 / 条款行（「服务条款」「隐私政策」：仓库无 legal 路由（已核对）→ 渲染为无 href 的同样式 `<span>`，记偏差）/「已有账号？ 直接登录」；409 → 「该邮箱已注册，请直接登录。」；注册成功 → 自动登录 → continuation；失败 → `/app/account/login?…&created=1&email=`（原样）。
  - 找回：邮箱 / 错误卡 / 申请重置链接 · 发送中… / 「重置链接有效期 30 分钟。」/ 成功卡「✦ 重置链接已发送 / 请查看 {email} 的收件箱。链接 30 分钟内有效。」（旧 notice 文案「申请已受理…」的语义：受理 ≠ 送达 → 成功卡第二行用设计文案，第三行补一句 t()「如果该邮箱支持密码恢复，链接会很快送达；未收到时可在一分钟后重试。」，记偏差）/「← 返回登录」。
  - 新密码：token 从 `location.hash` `#token=`（43 位 `[A-Za-z0-9_-]`）读取；不合法 → 「链接已失效」分支（「重新申请重置链接」→ `/app/account/forgot-password`；「← 返回登录」）；合法 → 新密码 / 确认新密码 / 错误卡 / 设置新密码 · 保存中… ；成功 → 标题「密码已更新」+ 副标「你的密码已重置，现在可以用新密码登录。」+「用新密码登录」→ `/app/account/login`；`history.replaceState` 清 hash 原样。
  - `btnOpacity`：loading 时主按钮 `opacity:0.6`（内联）。
- **比对工具（Task 0）**：`compare-0918.mjs` 加 `auth` 表：设计侧 = 打开落地页 → 点头部「登录」按钮（以设计源码 `openLogin` 的元素为准）→ 视图 login；register/forgot/reset 视图 = 再点弹窗底部「演示」条的 注册 / 找回 / 新密码 按钮（`getByRole("button",{name,exact:true})`，限定在 dialog 内）；设计的「链接已失效」态（`goResetInvalid`）在演示条没有入口 → **该态只做 app 截图 + 对照设计 422–433 行人工核对**（记录）。应用侧 URL：`/app/account/login`、`/app/account/signup`、`/app/account/forgot-password`、`/app/account/reset-password#token=<43位合法样式假 token>`（reset 只到表单态，不提交）、`/app/account/reset-password`（无 token → 链接已失效态）。未登录访问，无需 `--login`。门槛 raw ≤0.02 或框级归因非数据残差 ≤0.005（落地页底图相同，弹窗差异应很小）。
- **验证数据**：无需数据库；行为测试全部 fetch/signIn mock。真机冒烟只做：打开四个路由、切换、关闭、错误校验（不提交真实注册）。dev server :3100 已起。

## 文件结构（`$WEB/app/(app)/app/account/auth-0918/`）
`auth-model.ts`（`AuthView` 类型、校验纯函数 `validateEmail` / `validatePassword` / `validateResetPair`、按钮文案表、`resetTokenFromHash(hash)`、`authRoutePath(view, next)`）、`use-account-auth.ts`（原样抽自 `orbit-real-account-auth.tsx`：query 读取 + SSR 安全回退、`submitLogin` / `submitSignup` / `submitForgot`、`googleSignIn`、`navigate`/`productHref`）、`use-password-reset.ts`（原样抽自 `reset-password-form.tsx`）、`auth-modal.tsx`（壳：遮罩 / 面板 / × / 字标 / `useOrbitModalA11y` / `AUTH_STYLES`）、`auth-login.tsx`、`auth-register.tsx`、`auth-forgot.tsx`、`auth-reset.tsx`。修改：四个 `page.tsx`（只换渲染）。删除（Task 3）：`orbit-real-account-auth.tsx`、`reset-password/reset-password-form.tsx`。测试：`tests/pages/app-account-auth-live-route-services.test.ts`（:258–417 十例改指 hook/新屏）、`tests/ui/orbit-modal-standard.test.ts:76-92`（改指 `auth-modal.tsx`）、`tests/ui/orbit-form-standard.test.ts`（`FormField` 使用者清单 / `role="alert"` 计数：新屏不再用 `FormField` → 清单与计数按实际调整并记录）。

## Tasks
- **Task 0**：compare `auth` 表 + 冒烟（四路由 + reset 两态截图）。提交 `chore(visual): compare-0918 supports auth modal design views`。
- **Task 1**：先写特征化渲染测试（react-test-renderer + fetch/signIn mock，覆盖：登录成功 → continuation 导航；登录失败文案；注册 POST 体 + 自动登录 + 失败回退 URL；找回 POST + 受理 notice；Google callbackUrl；query `next` 归一化；reset：hash token 读取、不匹配提示、不合法 token 提示、confirm POST 体、成功后 replaceState + done），再抽两个 hook，旧组件改调 hook、JSX 不动，既有 + 特征化测试全绿。提交 `refactor(auth): extract use-account-auth / use-password-reset`（一 hook 一提交）。
- **Task 2**：`auth-model.ts` + `auth-modal.tsx`（`AUTH_STYLES`）+ 登录屏 + 注册屏 + `login/page.tsx`、`signup/page.tsx` 接线（落地页 + 弹窗）；像素 ×2（login / register）。提交 `feat(auth): Orbit_0918 login and register modal over the landing page`。
- **Task 3**：找回屏 + 新密码屏（两分支 + 成功态）+ `forgot-password/page.tsx`、`reset-password/page.tsx` 接线；删除两个旧组件；改指测试；ratchet 下调；回归（`tests/pages` `*.test.{ts,tsx}` + `tests/ui`）；像素 ×2 + reset 人工核对；台账「认证弹窗 屏级替换完成」+ ROUTE-CONSOLIDATION 认证四行「已重建」+ NEW-UI-DECISION ⑤ 完成。提交 `feat(auth): Orbit_0918 forgot and reset modal; delete legacy auth components` + `docs(ledger): …`。

每任务模板同前：读设计对应行 → TDD → 像素 → 提交 → 台账；设计 / 仓库与本计划矛盾 → NEEDS_CONTEXT。

## 后续计划
⑥ iOrbit chat（`orbit-real-agent.tsx` 3892 行，最后、最大）。

## 审阅修订（2026-09-22，独立评审 38 项——与上文冲突处以本节为准）

1. **设计行号更正**：`authOpen` 342、遮罩 343、面板 344（完整声明：`position:relative; width:100%; max-width:440px; max-height:calc(100vh - 48px); overflow:auto; background:#FFFFFF; border-radius:24px; padding:40px; box-shadow:0 30px 80px rgba(14,18,37,0.3); display:flex; flex-direction:column; gap:24px`）、× 345、字标 346；登录 348–369；注册 371–392；找回 394–420；新密码 422–463；演示条 465–472（**五**枚：登录/注册/找回/新密码/失效链接 `goResetInvalid`）；renderVals 494–533。
2. **像素表**：`auth` 表视图 = login / register / forgot / reset / reset-invalid 五个；设计侧打开 = `getByRole("link",{name:"登录",exact:true})`（头部是 `<a href="#">`），切换 = 演示条内按钮（用演示条容器限定，因为「登录」与主按钮同名）；新增 `--design-remove "<selector>"`（`page.evaluate` 删除演示条后再截图，记录为去除演示 UI 的规范做法）与 `--viewport-only`（弹窗比对只截视口，避免全页落地页稀释比例）；Task 0 先记一条落地页基线（`/app` vs 设计首屏，无点击，视口截图）作为弹窗残差的扣除基准。应用侧 reset-invalid = `/app/account/reset-password`（无 token）。
3. **遮罩点击关闭**是旧能力、设计无（343 无 onClick）→ 保留但处理器必须 `event.target === event.currentTarget` 才关闭（设计结构是单层 overlay 内含面板），记设计外。
4. **焦点**：`useOrbitModalA11y` 聚焦面板内第一个可聚焦元素 = ×（DOM 顺序与旧实现一致）；不改；像素归因时把 × 的焦点环记为已知残差。
5. **reset-password/page.tsx** 现只有 metadata + 组件（无 `auth()`、无 route model、无 `OrbitVisualFreezeRuntime`）：接线时加 `<OrbitVisualFreezeRuntime/>`（像素冻结需要），不加 `auth()`（已登录用户也可用重置链接），落地页仍 `authenticated={false}`（顶栏由 SessionProvider 决定真实态，记录）。
6. **`.btn[disabled]` 中和**：`AUTH_STYLES` 加 `.btn.au-primary[disabled]{background:#0E1225;color:#FFFFFF;cursor:pointer;box-shadow:none}`（基类会改底色/字色/opacity .45；设计只靠内联 `opacity:0.6`）。
7. **登录主按钮**（366：多 `display:flex; align-items:center; justify-content:center; gap:10px`）与其余三个主按钮（388/414/456）是**两个类** `au-btn-login` / `au-btn-primary`；密码标签行 `span{display:flex;justify-content:space-between}` + 链接 `font-weight:400;color:#4B4FC7` 各一类。
8. **校验**：`<form noValidate>` + `auth-model.ts` 的 JS 校验产出设计文案（保留 `type=email`/`autoComplete`/`minLength`/`maxLength={72}` 属性供键盘与密码管理器）；三条本地校验文案（邮箱格式 / 密码 8 位 / 新密码 8 位）进渲染测试。
9. **显示/隐藏密码**：保留为 `btn au-eye`（字段内右侧，UI 审计 P1-j 项，`orbit-reference-styles.tsx:2225-2260` 有据），设计外记偏差；不省略。
10. **找回成功态**：设计隐藏表单 → 成功卡下加一行 t()「未收到？可在一分钟后<a>重新申请</a>」（点击回到表单态、清 notice）；「← 返回登录」带 `?next=`；`emailShown` 空值回退不可达（邮箱必填）记录。
11. **新密码成功态**：标题/副标用设计文案，第三行补 t()「其他设备上的旧会话已失效，需要重新登录。」（保留旧实现的会话失效告知）；两输入框 `minLength=8 maxLength=72`；`sending` ref 双提交保护、`history.replaceState`、43 位 token 规则原样；**SSR 形状**：先渲染 tokenValid 分支（按钮 `disabled` 直到 `ready`），`useEffect` 后才切 invalid（避免 hydration mismatch；无 token 链接会闪一帧，记录）。
12. **role**：错误卡 `role="alert"`，成功卡 / created 提示 `role="status"`；`aria-labelledby` 指向各视图 `h2`（替代旧 `aria-label`）。
13. **view model copy 不删**：`orbit-account-auth-route-view-model.ts` 的 title 等被 `tests/pages/app-account-auth-live-route-services.test.ts:217` 断言；只是不再渲染（记录）。
14. **测试改指按任务落点**（否则中间提交红）：
    - Task 1（抽 hook 时）：`app-account-auth-live-route-services.test.ts:258-357` 是对 `orbit-real-account-auth.tsx` 源码的正则（`normalizeOrbitAuthReturnPath(rawNext, defaultNext)`、`if (isSignup) {`、`signIn("credentials"`、`callbackUrl: productHref(`、created 文案）→ 逐条拆为「hook 文件 / JSX 文件」两侧，hook 侧改指 `account/auth-0918/use-account-auth.ts`；报告列每条去处。
    - Task 2：`:183-197` 断言 login/signup/forgot 页源码含 `OrbitRealAccountAuth` → 改为新组件名（保留 `auth()`/`redirect(normalizeOrbitAuthReturnPath`/`loadAppAccountAuthRouteViewModel` 断言）；`compare-0918.mjs:59-61` 与 `scripts/visual/README.md:10` 的 `--login` 占位符（「输入邮箱地址」「输入密码」）改为设计占位 `you@company.com` / `••••••••`（其余各表的 `--login` 都依赖它）。
    - Task 3（删旧同一提交）：`tests/ui/orbit-modal-standard.test.ts:30,40,86-92`（路径常量、`MIGRATED_FILES`、import 正则 `from "\.\.\/\.\.\/orbit-modal-a11y"`、保留标识符 `handleClose`）；`tests/ui/orbit-form-standard.test.ts:57-80,121-129`（`FormField` 采用者 ≥2 且含账号认证路径 → 新屏不用 `FormField`（与设计 label 结构冲突），阈值降为 1 并从 `MIGRATED_FILES` 移除该路径，加注释；`ROLE_ALERT_BASELINE=7` 安全）。
15. **ratchet**：新屏所有 `<button>`（×、四主按钮、Google、眼睛、重新申请重置链接、用新密码登录）必须带 `btn` token；设计 `<a href="#" onClick>` 在应用里都是真实导航 → `<a href>`；内联 style 只允许 `opacity`。
16. **落地页与导航**：`OrbitLanding0918` 只需 layout 已供的 language + Session context；`OrbitGlobalAsk` 未登录为 null；顶栏 z 50 < 弹窗 100；顶栏「登录」CTA 在 `/app/account/login` 下生成的 `?next=/app/account/login` 会被 `normalizeOrbitAuthReturnPath` 拒绝回落 `/app/home`（被遮罩盖住，记录）。不动 `orbit-landing-0918.tsx` / `orbit-public-shell.tsx`（CTA href 测试锁定）。
17. **不用 `ModalShell`**（`orbit-account-shell.tsx`，像素结构不同），在台账明示。
18. Task 2 期间「忘记密码？」从新弹窗跳到旧找回页一个提交，记录。
