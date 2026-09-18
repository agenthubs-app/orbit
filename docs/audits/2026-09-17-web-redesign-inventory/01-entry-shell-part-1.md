# 01-entry-shell：源码明细

证据级别：当前工作区源码。此表列出符号级静态可达实现，不宣称每项都在某个角色/状态实际显示。按钮按 JSX 实现记录；数组 map 可生成多项按钮，条件分支互斥，不能把实现数当 DOM 按钮数。

调用表按所属函数提供 HTTP 路径/方法证据；与按钮 handler 是否连通应结合 handler 源码核对。仅同一文件出现的 API 不等于该按钮调用它。路径常量不是一次额外请求。跨文件、动态路径和 callback 不强行配对。

文案包含原有中文/英文/日文及动态表达式。表格中的长表达式节选有标记；完整内容在对应源码。布局表只证明 HTML/ARIA 分区，不证明实际视觉位置。全局 shell 与 layout 另见 01、02。开发页共享组件的来源入口会标为 /dev，不算客户页面。

## repos/orbits/app/(app)/app/account/forgot-password/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/forgot-password/page.tsx>)

静态来源入口：`/app/account/forgot-password`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 43 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/account/login/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/login/page.tsx>)

静态来源入口：`/app/account/login`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 44 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/account/mobile-google/mobile-google-auth.tsx

源码：[mobile-google-auth.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/mobile-google/mobile-google-auth.tsx>)

静态来源入口：`/app/account/mobile-google`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 20 | MobileGoogleAuth | main |  | orbit-account-auth-page |
| 22 | MobileGoogleAuth | section/status |  | orbit-account-auth-modal |
| 30 | MobileGoogleAuth | h1 | 正在打开 Google 登录… | h-title |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 33 | link/a · MobileGoogleAuth | 返回邮箱登录 | /app/account/login | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 13 | MobileGoogleAuth | 路径常量 | 见调用/handler | `/api/auth/mobile/google/complete?request=${encodeURIComponent( brokerRequest, )}` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 29 | JSX文字 | ORBIT |
| 30 | JSX文字 | 正在打开 Google 登录… |
| 31 | JSX文字 | 登录完成后会自动回到 Orbit。 |
| 37 | JSX文字 | 返回邮箱登录 |

## repos/orbits/app/(app)/app/account/mobile-google/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/mobile-google/page.tsx>)

静态来源入口：`/app/account/mobile-google`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 28 | MobileGooglePage | main |  | orbit-account-auth-page |
| 30 | MobileGooglePage | section/alert |  | orbit-account-auth-modal |
| 34 | MobileGooglePage | h1 | Google 登录暂时不可用 | h-title |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 37 | link/a · MobileGooglePage | 返回邮箱登录 | /app/account/login | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 33 | JSX文字 | ORBIT |
| 34 | JSX文字 | Google 登录暂时不可用 |
| 35 | JSX文字 | 请使用邮箱登录。 |
| 41 | JSX文字 | 返回邮箱登录 |

## repos/orbits/app/(app)/app/account/orbit-real-account-auth.tsx

源码：[orbit-real-account-auth.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/orbit-real-account-auth.tsx>)

静态来源入口：`/app/account/forgot-password`、`/app/account/login`、`/app/account/signup`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 198 | OrbitRealAccountAuth | main |  | orbit-account-auth-page |
| 200 | OrbitRealAccountAuth | section/dialog | viewModel.title | orbit-account-auth-modal |
| 210 | OrbitRealAccountAuth | header |  | orbit-account-auth-modal-head |
| 227 | OrbitRealAccountAuth | h1 | viewModel.title | h-title |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 58 | [query, setQuery] = useState&lt;AccountAuthQuery&gt;(() =&gt; accountAuthQueryFallback(viewModel.defaultNext), ) |
| 61 | [email, setEmail] = useState(query.email) |
| 62 | [password, setPassword] = useState("") |
| 63 | [showPassword, setShowPassword] = useState(false) |
| 64 | [error, setError] = useState("") |
| 65 | [resetNotice, setResetNotice] = useState("") |
| 66 | [submitting, setSubmitting] = useState(false) |

### 弹层根/原生确认

| 行 | 类型 | 名称/标题表达式 |
| --- | --- | --- |
| 200 | dialog | viewModel.title |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 199 | callback-control/div · OrbitRealAccountAuth |  | onclick: handleClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 212 | link/a · OrbitRealAccountAuth | t({ en: "Close", zh: "关闭" }) | /app | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 237 | form-submit-boundary/form · OrbitRealAccountAuth | {&lt;FormField className="orbit-account-auth-field" id="orbit-auth-password" label={t({ en: "Password", zh: "密码" })} labelExtra={!isSignup ? ( &lt;a href={`/app/account/forgot-password?next=${encodeURIComponent(query.next)}`} onClick={(event) =&gt; { event.preventDefault(); navigate(`/account/forgot-password?next=${encodeURIComponent(query.next)}`); }} style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600, textDecoration: "none", }} &gt; {t({ en: "Forgot password?", zh: "忘记密码?" …（完整表达式见源码） | onsubmit: onSubmit | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 239 | field/input · OrbitRealAccountAuth | t({ en: "Enter your email address", zh: "输入邮箱地址" }) | onchange: (event) =&gt; setEmail(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 258 | link/a · OrbitRealAccountAuth | Forgot password? / 忘记密码? | `/app/account/forgot-password?next=${encodeURIComponent(query.next)}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 276 | field/input · OrbitRealAccountAuth | isSignup ? t({ en: "Set a password of at least 8 characters", zh: "设置至少 8 位密码" }) : t({ en: "Enter your password", zh: "输入密码" }) | onchange: (event) =&gt; setPassword(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 287 | button/button · OrbitRealAccountAuth | showPassword ? t({ en: "Hide password", zh: "隐藏密码" }) : t({ en: "Show password", zh: "显示密码" }) | onclick: () =&gt; setShowPassword((current) =&gt; !current) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 304 | button/button · OrbitRealAccountAuth | {viewModel.busyLabel} / {primary} {&lt;Icon color="var(--on-dark)" name="arrow" size={17} /&gt;} / {null} |  | {"disabled":"submitting","renderGateProps":[],"conditions":[]} |
| 312 | button/button · OrbitRealAccountAuth | Continue with Google / 使用 Google 登录 | onclick: onGoogleSignIn | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 328 | link/a · OrbitRealAccountAuth | {viewModel.switchLabel} | productHref(switchHref) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 339 | link/a · OrbitRealAccountAuth | {viewModel.switchLabel} | productHref(`/account/login?next=${encodeURIComponent(query.next)}`) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 121 | onSubmit | 调用 | POST | "/api/auth/register" |
| 121 | onSubmit | 路径常量 | 见调用/handler | "/api/auth/register" |
| 161 | onSubmit | 调用 | POST | "/api/auth/password-reset/request" |
| 161 | onSubmit | 路径常量 | 见调用/handler | "/api/auth/password-reset/request" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 96 | 翻译 en | "Account created, but automatic sign-in did not complete. Sign in with the password you just set." |
| 97 | 翻译 ja | "アカウントは作成されましたが、自動サインインが完了しませんでした。設定したパスワードでサインインしてください。" |
| 98 | 翻译 zh | "账号已创建，但自动登录未完成。请用刚设置的密码登录。" |
| 103 | 翻译 en | "Request reset link" |
| 104 | 翻译 zh | "申请重置链接" |
| 134 | 翻译 en | "An account with this email already exists." |
| 134 | 翻译 zh | "该邮箱已注册,请直接登录。" |
| 136 | 翻译 en | "Sign-up failed. Please try again." |
| 136 | 翻译 zh | "注册失败,请稍后再试。" |
| 166 | 翻译 en | "Password recovery is temporarily unavailable. Please try again later." |
| 166 | 翻译 zh | "密码恢复暂不可用，请稍后重试。" |
| 169 | 翻译 en | "Request accepted. If this email supports password recovery, a reset link will arrive shortly. Check spam or retry after a minute if it does not arrive." |
| 169 | 翻译 zh | "申请已受理。如果该邮箱支持密码恢复，你将收到重置链接。请检查垃圾邮件；未收到时可在一分钟后重试。" |
| 180 | 翻译 en | "Email or password is incorrect." |
| 180 | 翻译 zh | "邮箱或密码不正确。" |
| 186 | 翻译 en | "Something went wrong. Please try again." |
| 186 | 翻译 zh | "网络异常,请稍后再试。" |
| 200 | 属性 aria-label | viewModel.title |
| 212 | 属性 aria-label | t({ en: "Close", zh: "关闭" }) |
| 213 | 翻译 en | "Close" |
| 213 | 翻译 zh | "关闭" |
| 226 | JSX文字 | ACCOUNT |
| 231 | 翻译 en | "Enter your account email to request a password reset link, valid for 30 minutes." |
| 232 | 翻译 zh | "输入注册邮箱，申请有效期为 30 分钟的密码重置链接。" |
| 238 | 属性 label | t({ en: "Email", zh: "邮箱" }) |
| 238 | 翻译 en | "Email" |
| 238 | 翻译 zh | "邮箱" |
| 239 | 属性 placeholder | t({ en: "Enter your email address", zh: "输入邮箱地址" }) |
| 245 | 翻译 en | "Enter your email address" |
| 245 | 翻译 zh | "输入邮箱地址" |
| 253 | 属性 label | t({ en: "Password", zh: "密码" }) |
| 256 | 翻译 en | "Password" |
| 256 | 翻译 zh | "密码" |
| 271 | 翻译 en | "Forgot password?" |
| 271 | 翻译 zh | "忘记密码?" |
| 276 | 属性 placeholder | isSignup ? t({ en: "Set a password of at least 8 characters", zh: "设置至少 8 位密码" }) : t({ en: "Enter your password", zh: "输入密码" }) |
| 282 | 翻译 en | "Set a password of at least 8 characters" |
| 282 | 翻译 zh | "设置至少 8 位密码" |
| 282 | 翻译 en | "Enter your password" |
| 282 | 翻译 zh | "输入密码" |
| 287 | 属性 aria-label | showPassword ? t({ en: "Hide password", zh: "隐藏密码" }) : t({ en: "Show password", zh: "显示密码" }) |
| 288 | 翻译 en | "Hide password" |
| 288 | 翻译 zh | "隐藏密码" |
| 288 | 翻译 en | "Show password" |
| 288 | 翻译 zh | "显示密码" |
| 310 | 翻译 en | "or" |
| 310 | 翻译 zh | "或" |
| 324 | 翻译 en | "Continue with Google" |
| 324 | 翻译 zh | "使用 Google 登录" |

## repos/orbits/app/(app)/app/account/reset-password/reset-password-form.tsx

源码：[reset-password-form.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/reset-password/reset-password-form.tsx>)

静态来源入口：`/app/account/reset-password`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 54 | PasswordResetForm | main |  | orbit-account-auth-page |
| 55 | PasswordResetForm | section |  | orbit-account-auth-modal |
| 57 | PasswordResetForm | h1 | t({ zh: "设置新密码", en: "Set a new password" }) | h-title |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 10 | [ready, setReady] = useState(false) |
| 11 | [password, setPassword] = useState("") |
| 12 | [confirmation, setConfirmation] = useState("") |
| 13 | [error, setError] = useState("") |
| 14 | [busy, setBusy] = useState(false) |
| 15 | [done, setDone] = useState(false) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 60 | form-submit-boundary/form · PasswordResetForm | 密码至少 8 位。完成后，你需要在其他设备上重新登录。 / Use at least 8 characters. You will need to sign in again on other devices. 新密码 / New password 再次输入新密码 / Confirm new password {&lt;p role="alert" className="orbit-alert error"&gt;{error}&lt;/p&gt;} / {null} 更新中… / Updating… / 更新密码 / Update password | onsubmit: submit | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 63 | field/input · PasswordResetForm | 新密码 / New password | onchange: (event) =&gt; setPassword(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 65 | field/input · PasswordResetForm | 再次输入新密码 / Confirm new password | onchange: (event) =&gt; setConfirmation(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 67 | button/button · PasswordResetForm | 更新中… / Updating… / 更新密码 / Update password |  | {"disabled":"!ready \|\| busy","renderGateProps":[],"conditions":[]} |
| 69 | link/a · PasswordResetForm | 返回登录 / Back to sign-in | /app/account/login | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 70 | link/a · PasswordResetForm | 重新申请链接 / Request a new link | /app/account/forgot-password | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 32 | submit | 调用 | POST | "/api/auth/password-reset/confirm" |
| 32 | submit | 路径常量 | 见调用/handler | "/api/auth/password-reset/confirm" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 26 | 翻译 zh | "两次输入的密码不一致。" |
| 26 | 翻译 en | "The passwords do not match." |
| 38 | 翻译 zh | "重置失败，请稍后重试。" |
| 38 | 翻译 en | "Password reset failed. Please try again." |
| 47 | 翻译 zh | "网络异常，请重试；如果链接已使用，请尝试用新密码登录。" |
| 47 | 翻译 en | "Connection failed. Retry, or try signing in with the new password if the link has already been used." |
| 57 | 翻译 zh | "设置新密码" |
| 57 | 翻译 en | "Set a new password" |
| 58 | 翻译 zh | "密码已更新，旧会话已失效。请用新密码登录。" |
| 58 | 翻译 en | "Password updated and previous sessions revoked. Sign in with your new password." |
| 59 | 翻译 zh | "重置链接不完整，请重新申请。" |
| 59 | 翻译 en | "This reset link is incomplete. Request a new one." |
| 61 | 翻译 zh | "密码至少 8 位。完成后，你需要在其他设备上重新登录。" |
| 61 | 翻译 en | "Use at least 8 characters. You will need to sign in again on other devices." |
| 62 | 翻译 zh | "新密码" |
| 62 | 翻译 en | "New password" |
| 64 | 翻译 zh | "再次输入新密码" |
| 64 | 翻译 en | "Confirm new password" |
| 67 | 翻译 zh | "更新中…" |
| 67 | 翻译 en | "Updating…" |
| 67 | 翻译 zh | "更新密码" |
| 67 | 翻译 en | "Update password" |
| 69 | 翻译 zh | "返回登录" |
| 69 | 翻译 en | "Back to sign-in" |
| 70 | 翻译 zh | "重新申请链接" |
| 70 | 翻译 en | "Request a new link" |

## repos/orbits/app/(app)/app/account/signup/page.tsx

源码：[page.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/account/signup/page.tsx>)

静态来源入口：`/app/account/signup`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 44 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx

源码：[home-route-view-model.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/home/compose-app-home-from-previously-approved-mock-first-capabilities/home-route-view-model.tsx>)

静态来源入口：`/app/agent`、`/app/home/events`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 336 | HomeRouteStateBoundary | main |  |  |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 211 | 文案/数据常量 description | `${sourceLabel} source data is not available, so the personal home summary is paused.` |
| 212 | 文案/数据常量 emptyState | "Home needs events, contacts, and profile route payloads before it can show the personal hub." |
| 214 | 文案/数据常量 eyebrow | "Home" |
| 215 | 文案/数据常量 guardrail | "This page did not create contacts, update events, send messages, or contact outside providers." |
| 217 | 文案/数据常量 nextStep | "Reload Home after the blocked source route is configured, or open the source route directly." |
| 219 | 文案/数据常量 purpose | "Keep the personal hub tied to the same sourced route payloads used by the underlying feature pages." |
| 221 | 文案/数据常量 title | "Home could not load" |
| 225 | 文案/数据常量 label | "Reload Home" |
| 226 | 文案/数据常量 label | `Open ${sourceLabel}` |
| 281 | 文案/数据常量 description | "One Home source route returned an unexpected state after recovery handling." |
| 283 | 文案/数据常量 emptyState | "Home needs successful events, contacts, and profile route payloads." |
| 285 | 文案/数据常量 eyebrow | "Home" |
| 286 | 文案/数据常量 guardrail | "No contact, event, message, notification, or outside account changed." |
| 288 | 文案/数据常量 nextStep | "Reload Home after checking the source route states." |
| 289 | 文案/数据常量 purpose | "Fail visibly if Home cannot prove all child route payloads are ready." |
| 291 | 文案/数据常量 title | "Home could not load" |
| 294 | 文案/数据常量 label | "Reload Home" |
| 323 | 文案/数据常量 recoveryCopy | "Return to a live-capable route that can re-check sourced Home data." |
| 340 | 属性 title | routeState.copy.title |

## repos/orbits/app/(app)/app/home/orbit-real-home.tsx

源码：[orbit-real-home.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/home/orbit-real-home.tsx>)

静态来源入口：`/app/home/events`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 103 | ProfileSummary | h2 | t({ en: "About me", zh: "个人资料" }) | h-section |
| 212 | HomeEventRow | h3 | name | h-section orbit-home-event-row-title |
| 322 | AccountEventsBlock | section |  |  |
| 415 | TodayEventHero | h3 | event.name |  |
| 514 | ConsoleReminderPanels | section | reminders === null ? &lt;span style={{ color: "var(--text-4)", fontSize: 13 }}&gt;{t({ en: "Loading…", zh: "正在读取…" })}&lt;/span&gt; : null schedule.map((alert) =&gt; &lt;ReminderRow alert={alert} key={alert.id} t={t} /&gt;) reminders !== null && schedule.length === 0 ? ( &lt;span style={{ color: "var(--text-3)", fontSize: 13 }}&gt;{t({ en: "No a …（完整表达式见源码） | card |
| 522 | ConsoleReminderPanels | section | reminders === null ? &lt;span style={{ color: "var(--text-4)", fontSize: 13 }}&gt;{t({ en: "Loading…", zh: "正在读取…" })}&lt;/span&gt; : null people.map((alert) =&gt; &lt;ReminderRow alert={alert} key={alert.id} t={t} /&gt;) reminders !== null && people.length === 0 ? ( &lt;span style={{ color: "var(--text-3)", fontSize: 13 }}&gt;{t({ en: "Nothing …（完整表达式见源码） | card |
| 639 | HubDesktop | h1 | viewModel.account.fullName | h-display |
| 664 | HubDesktop | h2 | t({ en: "My events", zh: "我的活动" }) | h-section |
| 673 | HubDesktop | h3 | item.title | h-section |
| 682 | HubDesktop | details |  |  |
| 683 | HubDesktop | summary | t({ en: "My universal profile", zh: "我的通用画像" }) | h-section |
| 704 | HubMobile | h1 | viewModel.account.fullName | h-title |
| 721 | HubMobile | h3 | item.title | h-section |
| 733 | HubMobile | h2 | t({ en: "My events", zh: "我的活动" }) | h-section |
| 741 | HubMobile | details |  |  |
| 742 | HubMobile | summary | t({ en: "My universal profile", zh: "我的通用画像" }) | h-section |
| 757 | EventsDesktop | h1 | t({ en: "My events", zh: "我的活动" }) | h-display |
| 769 | EventsMobile | h1 | t({ en: "My events", zh: "我的活动" }) | h-display |
| 781 | OrbitRealHome | main |  | orbit-personal-page |
| 789 | OrbitRealHome | main |  |  |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 234 | [tab, setTab] = useState&lt;HomeFilter&gt;("all") |
| 317 | [tab, setTab] = useState&lt;HomeFilter&gt;("all") |
| 353 | [summary, setSummary] = useState&lt;TodayOpsSummary \| null&gt;(null) |
| 471 | [reminders, setReminders] = useState&lt;readonly InboxReminderAlert[] \| null&gt;(null) |
| 583 | [context, setContext] = useState("events") |
| 584 | [rotation, setRotation] = useState(0) |
| 585 | [draft, setDraft] = useState("") |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 227 | link/a · HomeEventRow | {content} | `/app/events/${event.code}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 230 | button/button · HomeEventRow | {content} | onclick: () =&gt; enterEvent(event.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 242 | button/button · MyEventsBlock | {label} {counts[key]} | onclick: () =&gt; setTab(key) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 310 | link/a · AccountEventCard | {content} | `/app/events/${event.code}` | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 313 | button/button · AccountEventCard | {content} | onclick: () =&gt; enterEvent(event.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 329 | button/button · AccountEventsBlock | {label} {counts[key]} | onclick: () =&gt; setTab(key) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 431 | button/button · TodayEventHero | Enter live event / 进入现场 | onclick: () =&gt; enterEvent(event.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 494 | link/a · ReminderRow | {(alert.contactName \|\| alert.title).slice(0, 1)} {alert.title} {[alert.contactName, alert.organization].filter(Boolean).join(" · ") \|\| alert.dueLabel} Open / 处理 | alert.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 519 | link/a · ConsoleReminderPanels | Open schedule / 打开日程 | /app/today | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 527 | link/a · ConsoleReminderPanels | Open contacts / 打开人脉 | /app/contacts | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 610 | form-submit-boundary/form · AgentDock | ✦ | onsubmit: (submitEvent) =&gt; { submitEvent.preventDefault(); ask(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 615 | field/input · AgentDock | t({ en: "Ask iOrbit", zh: "问 iOrbit" }) | oninput: (inputEvent) =&gt; setDraft(inputEvent.currentTarget.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 622 | button/button · AgentDock | t({ en: "Send", zh: "发送" }) |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 643 | link/a · HubDesktop | Edit universal profile / 编辑通用画像 | /app/profile | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 644 | button/button · HubDesktop | Sign out / 退出登录 | onclick: () =&gt; { void signOut({ callbackUrl: "/app" }); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 665 | link/a · HubDesktop | All / 全部 | /app/home/events | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 671 | link/a · HubDesktop | {item.title} {item.sub} | item.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 683 | disclosure/summary · HubDesktop | My universal profile / 我的通用画像 |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 705 | link/a · HubMobile | t({ en: "Edit", zh: "编辑" }) | /app/profile | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 706 | button/button · HubMobile | t({ en: "Sign out", zh: "退出" }) | onclick: () =&gt; { void signOut({ callbackUrl: "/app" }); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 719 | link/a · HubMobile | {item.title} {item.sub} | item.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 734 | link/a · HubMobile | t({ en: "View all events", zh: "查看全部活动" }) | /app/home/events | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 742 | disclosure/summary · HubMobile | My universal profile / 我的通用画像 |  | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 359 | useTodayOpsSummary | 调用 | GET/由封装决定 | `/api/events/${encodeURIComponent(eventId)}/operations` |
| 359 | useTodayOpsSummary | 路径常量 | 见调用/handler | `/api/events/${encodeURIComponent(eventId)}/operations` |
| 476 | useConsoleReminders | 调用 | GET/由封装决定 | "/api/notifications" |
| 476 | useConsoleReminders | 路径常量 | 见调用/handler | "/api/notifications" |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 30 | 翻译 en | "All" |
| 30 | 翻译 zh | "全部" |
| 31 | 翻译 en | "Active" |
| 31 | 翻译 zh | "进行中" |
| 32 | 翻译 en | "Upcoming" |
| 32 | 翻译 zh | "即将" |
| 33 | 翻译 en | "Past" |
| 33 | 翻译 zh | "历史" |
| 39 | 翻译 en | "Auto-reused for every event" |
| 39 | 翻译 zh | "报名各场自动复用" |
| 39 | 翻译 en | "Universal profile" |
| 39 | 翻译 zh | "通用画像" |
| 40 | 翻译 en | "Post-event contact CRM" |
| 40 | 翻译 zh | "会后人脉 CRM" |
| 40 | 翻译 en | "Contacts" |
| 40 | 翻译 zh | "名片夹" |
| 41 | 翻译 en | "Meetings and interaction log" |
| 41 | 翻译 zh | "约见与交往记录" |
| 41 | 翻译 en | "Schedule" |
| 41 | 翻译 zh | "日程安排" |
| 84 | 翻译 en | "Industry" |
| 84 | 翻译 zh | "行业" |
| 85 | 翻译 en | "Home market" |
| 85 | 翻译 zh | "主场市场" |
| 86 | 翻译 en | "Follow-up cadence" |
| 86 | 翻译 zh | "跟进节奏" |
| 89 | 翻译 en | "I can offer" |
| 89 | 翻译 zh | "我能提供" |
| 90 | 翻译 en | "I'm looking for" |
| 90 | 翻译 zh | "我在寻找" |
| 91 | 翻译 en | "I want to meet" |
| 91 | 翻译 zh | "想认识的人" |
| 92 | 翻译 en | "Topics" |
| 92 | 翻译 zh | "关注话题" |
| 93 | 翻译 en | "Intro channels" |
| 93 | 翻译 zh | "引荐渠道" |
| 103 | 翻译 en | "About me" |
| 103 | 翻译 zh | "个人资料" |
| 123 | 翻译 en | "Relationship goal" |
| 123 | 翻译 zh | "关系目标" |
| 168 | 翻译 en | "TBD" |
| 168 | 翻译 zh | "待定" |
| 168 | 翻译 en | "Time TBD" |
| 168 | 翻译 zh | "时间待定" |
| 191 | 翻译 en | "Venue TBD" |
| 191 | 翻译 zh | "地点待定" |
| 206 | 翻译 en | "Replay" |
| 206 | 翻译 zh | "回看" |
| 206 | 翻译 en | "Enter event" |
| 206 | 翻译 zh | "进入活动" |
| 249 | 翻译 en | "No events in this state." |
| 249 | 翻译 zh | "当前没有这个状态的活动。" |
| 258 | 翻译 en | "Replay" |
| 258 | 翻译 zh | "回看" |
| 258 | 翻译 en | "Enter event" |
| 258 | 翻译 zh | "进入活动" |
| 294 | JSX文字 | 人已报名 |
| 297 | 翻译 en | "Tap to revisit details" |
| 297 | 翻译 zh | "点击回看活动详情" |
| 297 | 翻译 en | "Tap to view details" |
| 297 | 翻译 zh | "点击查看活动详情" |
| 298 | 翻译 en | "View event" |
| 298 | 翻译 zh | "查看活动" |
| 325 | 翻译 en | "No events in this state." |
| 325 | 翻译 zh | "当前没有这个状态的活动。" |
| 411 | 翻译 en | "Happening now" |
| 411 | 翻译 zh | "正在进行" |
| 417 | 翻译 en | "Checked in" |
| 417 | 翻译 zh | "已签到" |
| 422 | 翻译 en | " table" |
| 422 | 翻译 zh | "号桌" |
| 425 | 翻译 en | `Seat ${ops.seat}` |
| 425 | 翻译 zh | `座位 ${ops.seat}` |
| 431 | 翻译 en | "Enter live event" |
| 431 | 翻译 zh | "进入现场" |
| 434 | 翻译 en | `${ops.recCount} matches` |
| 434 | 翻译 zh | `${ops.recCount} 位推荐` |
| 436 | 翻译 en | `${ops.pendingRequests} pending` |
| 436 | 翻译 zh | `${ops.pendingRequests} 条待处理` |
| 443 | 翻译 en | "TOP MATCH TONIGHT" |
| 443 | 翻译 zh | "今晚最值得见" |
| 450 | 翻译 en | `Match ${ops.topRec.score}` |
| 450 | 翻译 zh | `匹配 ${ops.topRec.score}` |
| 466 | 翻译 en | "Today" |
| 466 | 翻译 zh | "今天" |
| 502 | 翻译 en | "Open" |
| 502 | 翻译 zh | "处理" |
| 515 | 翻译 en | "SCHEDULE · PENDING" |
| 515 | 翻译 zh | "日程 · 待你处理" |
| 516 | 翻译 en | "Loading…" |
| 516 | 翻译 zh | "正在读取…" |
| 519 | 翻译 en | "No appointment needs you right now." |
| 519 | 翻译 zh | "暂无需要处理的约谈。" |
| 519 | 翻译 en | "Open schedule" |
| 519 | 翻译 zh | "打开日程" |
| 523 | 翻译 en | "WORTH FOLLOWING UP" |
| 523 | 翻译 zh | "值得联系" |
| 524 | 翻译 en | "Loading…" |
| 524 | 翻译 zh | "正在读取…" |
| 527 | 翻译 en | "Nothing waiting — contacts appear here after events." |
| 527 | 翻译 zh | "暂无待跟进——活动之后的关系提醒会出现在这里。" |
| 527 | 翻译 en | "Open contacts" |
| 527 | 翻译 zh | "打开人脉" |
| 536 | 文案/数据常量 en | "Who is worth following up this week?" |
| 536 | 文案/数据常量 zh | "本周谁值得我优先跟进？" |
| 537 | 文案/数据常量 en | "Draft a follow-up note for my newest contact" |
| 537 | 文案/数据常量 zh | "帮我给最新的联系人起草一段跟进话术" |
| 540 | 文案/数据常量 en | "How do I meet the right people fast?" |
| 540 | 文案/数据常量 zh | "怎么快速认识第一批对的人？" |
| 541 | 文案/数据常量 en | "Find an event worth attending" |
| 541 | 文案/数据常量 zh | "帮我找一场值得去的活动" |
| 544 | 文案/数据常量 en | "Who should I prioritize meeting tonight?" |
| 544 | 文案/数据常量 zh | "今晚我该优先见谁？" |
| 545 | 文案/数据常量 en | "Why am I seated at my table?" |
| 545 | 文案/数据常量 zh | "我为什么被分到这一桌？" |
| 546 | 文案/数据常量 en | "Prepare my opener for the top match" |
| 546 | 文案/数据常量 zh | "帮我准备和头号推荐对象的开场" |
| 549 | 文案/数据常量 en | "Find an event worth attending" |
| 549 | 文案/数据常量 zh | "帮我找一场值得去的活动" |
| 550 | 文案/数据常量 en | "What kind of events suit my goals?" |
| 550 | 文案/数据常量 zh | "什么样的活动适合我的目标？" |
| 553 | 文案/数据常量 en | "What should I prepare before my next event?" |
| 553 | 文案/数据常量 zh | "下一场活动我该提前准备什么？" |
| 554 | 文案/数据常量 en | "Who is worth meeting at my next event?" |
| 554 | 文案/数据常量 zh | "下一场活动有谁值得认识？" |
| 557 | 文案/数据常量 en | "Summarize my upcoming appointments" |
| 557 | 文案/数据常量 zh | "帮我梳理接下来的约谈安排" |
| 558 | 文案/数据常量 en | "What should I confirm before tomorrow's meeting?" |
| 558 | 文案/数据常量 zh | "明天的约谈之前我该确认什么？" |
| 615 | 属性 placeholder | t({ en: `Ask iOrbit: "${hint}"`, zh: `问问 iOrbit：「${hint}」` }) |
| 615 | 属性 aria-label | t({ en: "Ask iOrbit", zh: "问 iOrbit" }) |
| 616 | 翻译 en | "Ask iOrbit" |
| 616 | 翻译 zh | "问 iOrbit" |
| 618 | 翻译 en | `Ask iOrbit: "${hint}"` |
| 618 | 翻译 zh | `问问 iOrbit：「${hint}」` |
| 622 | 属性 aria-label | t({ en: "Send", zh: "发送" }) |
| 622 | 翻译 en | "Send" |
| 622 | 翻译 zh | "发送" |
| 638 | 翻译 en | "Good evening" |
| 638 | 翻译 zh | "晚上好" |
| 643 | 翻译 en | "Edit universal profile" |
| 643 | 翻译 zh | "编辑通用画像" |
| 644 | 翻译 en | "Sign out" |
| 644 | 翻译 zh | "退出登录" |
| 649 | 翻译 en | "Register for an event and your contacts and follow-ups will build up here." |
| 649 | 翻译 zh | "报名一场活动后，这里会开始积累你的名片夹和跟进中的关系。" |
| 651 | 翻译 en | "Events" |
| 651 | 翻译 zh | "活动" |
| 651 | 翻译 en | "Contacts" |
| 651 | 翻译 zh | "名片夹" |
| 651 | 翻译 en | "Following up" |
| 651 | 翻译 zh | "跟进中" |
| 664 | 翻译 en | "My events" |
| 664 | 翻译 zh | "我的活动" |
| 665 | 翻译 en | "All" |
| 665 | 翻译 zh | "全部" |
| 683 | 翻译 en | "My universal profile" |
| 683 | 翻译 zh | "我的通用画像" |
| 704 | 翻译 en | "Good evening" |
| 704 | 翻译 zh | "晚上好" |
| 705 | 属性 aria-label | t({ en: "Edit", zh: "编辑" }) |
| 705 | 翻译 en | "Edit" |
| 705 | 翻译 zh | "编辑" |
| 706 | 属性 aria-label | t({ en: "Sign out", zh: "退出" }) |
| 706 | 翻译 en | "Sign out" |
| 706 | 翻译 zh | "退出" |
| 710 | 翻译 en | "Register for an event and your contacts and follow-ups will build up here." |
| 710 | 翻译 zh | "报名一场活动后，这里会开始积累你的名片夹和跟进中的关系。" |
| 712 | 翻译 en | "Events" |
| 712 | 翻译 zh | "活动" |
| 712 | 翻译 en | "Cards" |
| 712 | 翻译 zh | "名片" |
| 712 | 翻译 en | "Following up" |
| 712 | 翻译 zh | "跟进中" |
| 733 | 翻译 en | "My events" |
| 733 | 翻译 zh | "我的活动" |
| 734 | 属性 aria-label | t({ en: "View all events", zh: "查看全部活动" }) |
| 734 | 翻译 en | "View all events" |
| 734 | 翻译 zh | "查看全部活动" |
| 734 | 翻译 en | "All" |
| 734 | 翻译 zh | "全部" |
| 742 | 翻译 en | "My universal profile" |
| 742 | 翻译 zh | "我的通用画像" |
| 757 | JSX文字 | MY EVENTS |
| 757 | 翻译 en | "My events" |
| 757 | 翻译 zh | "我的活动" |
| 769 | 翻译 en | "My events" |
| 769 | 翻译 zh | "我的活动" |

## repos/orbits/app/(app)/app/inbox/inbox-demo-localization.ts

源码：[inbox-demo-localization.ts](</Users/li/work/orbit/repos/orbits/app/(app)/app/inbox/inbox-demo-localization.ts>)

静态来源入口：`/app/agent`、`/app/contacts`、`/app/contacts/[id]`、`/app/contacts/all-actions`、`/app/contacts/analysis/[dimension]/[bucketId]`、`/app/contacts/dashboard`、`/app/contacts/intros`、`/app/contacts/new`、`/app/contacts/new/batch/[id]`、`/app/contacts/new/batch2`、`/app/contacts/new/batch2/[id]`、`/app/contacts/new/import/[id]`、`/app/contacts/pipeline`、`/app/dashboard`、`/app/home/events`、`/app/profile`、`/app/schedule/events/[id]`、`/app/settings`、`/app/tasks`、`/app/tasks/[id]`、`/app/tasks/personal`、`/app/today`

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 25 | 文案/数据常量 summary | "青叶在与场地团队沟通前，希望先拿到代代木气候创始人早餐的两点要点回顾。" |
| 38 | 文案/数据常量 summary | "莉娜在确认这次机器人投资人引荐是否仍有清晰、聚焦的理由。" |

## repos/orbits/app/(app)/app/inbox/relationship-inbox-panel.tsx

源码：[relationship-inbox-panel.tsx](</Users/li/work/orbit/repos/orbits/app/(app)/app/inbox/relationship-inbox-panel.tsx>)

静态来源入口：`/app/agent`、`/app/contacts`、`/app/contacts/[id]`、`/app/contacts/all-actions`、`/app/contacts/analysis/[dimension]/[bucketId]`、`/app/contacts/dashboard`、`/app/contacts/intros`、`/app/contacts/new`、`/app/contacts/new/batch/[id]`、`/app/contacts/new/batch2`、`/app/contacts/new/batch2/[id]`、`/app/contacts/new/import/[id]`、`/app/contacts/pipeline`、`/app/dashboard`、`/app/home/events`、`/app/profile`、`/app/schedule/events/[id]`、`/app/settings`、`/app/tasks`、`/app/tasks/[id]`、`/app/tasks/personal`、`/app/today`

### 分区与 Tab

| 行 | 所属函数 | 元素/角色 | 标题、aria 或表达式 | class/id |
| --- | --- | --- | --- | --- |
| 633 | ThreadContextRail | aside | detail.sourceContextLabels.length ? ( &lt;div className="ri-context-section"&gt; &lt;div className="ri-context-label"&gt; {t({ en: "Source signals", zh: "来源线索" })} &lt;/div&gt; &lt;div className="ri-context-signals"&gt; {detail.sourceContextLabels.map((label) =&gt; ( &lt;span key={label}&gt;{label}&lt;/span&gt; ))} &lt;/div&gt; &lt;/div&gt; ) : null | ri-thread-context |
| 931 | ThreadsTab | aside |  | ri-thread-list |
| 986 | ThreadsTab | section | composing ? ( &lt;NewThreadForm initialBody={newThreadSeed?.body} initialContactId={newThreadSeed?.contactId} initialOrganization={newThreadSeed?.organization} initialRecipient={newThreadSeed?.recipient} initialSubject={newThreadSeed?.subject} onCancel={() =&gt; { setComposing(false); onNewThreadConsumed?.(); }} onCreated={( …（完整表达式见源码） | ri-thread-main |
| 1028 | ThreadsTab | aside |  | ri-thread-context ri-thread-context-empty |
| 1234 | RelationshipInboxPanel | h2 | t({ en: "Inbox", zh: "收件箱" }) | h-section |
| 1280 | RelationshipInboxPanel | div/tablist | tabs.map((item) =&gt; ( &lt;button aria-selected={tab === item.id} className={`ri-tab${tab === item.id ? " is-on" : ""}`} key={item.id} onClick={() =&gt; setTab(item.id)} role="tab" type="button" &gt; &lt;Icon name={item.icon} size={15} /&gt; {item.label} &lt;/button&gt; )) | ri-panel-tabs |
| 1282 | RelationshipInboxPanel | button/tab | item.label | `ri-tab${tab === item.id ? " is-on" : ""}` |

### 本地状态（用于发现隐藏子界面）

| 行 | 状态声明 |
| --- | --- |
| 358 | [state, setState] = useState&lt;"loading" \| "ready"&gt;("loading") |
| 359 | [reminders, setReminders] = useState&lt;readonly InboxReminderAlert[]&gt;([]) |
| 360 | [dismissed, setDismissed] = useState&lt;Set&lt;string&gt;&gt;(() =&gt; new Set()) |
| 505 | [body, setBody] = useState(detail.draftReplyBody) |
| 506 | [rewriting, setRewriting] = useState(false) |
| 507 | [staged, setStaged] = useState(false) |
| 711 | [recipient, setRecipient] = useState(initialRecipient ?? "") |
| 712 | [organization, setOrganization] = useState(initialOrganization ?? "") |
| 713 | [subject, setSubject] = useState(initialSubject ?? "") |
| 714 | [body, setBody] = useState(initialBody ?? "") |
| 716 | [busy, setBusy] = useState&lt;"idle" \| "generating" \| "creating"&gt;("idle") |
| 719 | [error, setError] = useState&lt;NewThreadFormError&gt;(null) |
| 829 | [state, setState] = useState&lt;"loading" \| "error" \| "ready"&gt;("loading") |
| 830 | [viewModel, setViewModel] = useState&lt;InboxPanelViewModel \| null&gt;(null) |
| 831 | [openId, setOpenId] = useState&lt;string \| null&gt;(null) |
| 832 | [composing, setComposing] = useState(false) |
| 833 | [created, setCreated] = useState&lt;ReturnType&lt;typeof toCreatedThread&gt;[]&gt;([]) |
| 834 | [search, setSearch] = useState("") |
| 1043 | [tab, setTab] = useState&lt;InboxTab&gt;("threads") |
| 1044 | [seed, setSeed] = useState&lt;NewThreadSeed \| null&gt;(initialSeed ?? null) |
| 1045 | [panelWidth, setPanelWidth] = useState( RELATIONSHIP_INBOX_DEFAULT_WIDTH, ) |
| 1048 | [widthHydrated, setWidthHydrated] = useState(false) |
| 1049 | [resizing, setResizing] = useState(false) |
| 1470 | [open, setOpen] = useState(false) |
| 1471 | [count, setCount] = useState(unreadCount) |
| 1472 | [seed, setSeed] = useState&lt;NewThreadSeed \| null&gt;(null) |
| 1475 | [mounted, setMounted] = useState(false) |

### 弹层根/原生确认

| 行 | 类型 | 名称/标题表达式 |
| --- | --- | --- |
| 1210 | dialog | t({ en: "Relationship inbox", zh: "关系收件箱" }) |

### 按钮、链接、表单与输入控件

| 行 | 类型/所属函数 | 显示文字或可访问名称 | href / handler | 禁用或显示门槛证据 |
| --- | --- | --- | --- | --- |
| 426 | button/button · AlertsTab | Dismiss all / 全部忽略 | onclick: () =&gt; { for (const alert of visibleReminders) dismiss(alert.id); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 437 | link/a · AlertsTab | {alert.title} {[alert.contactName, alert.organization].filter(Boolean).join(" · ")} {alert.dueLabel} | alert.href | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 444 | button/button · AlertsTab | t({ en: "Dismiss", zh: "忽略" }) | onclick: () =&gt; dismiss(alert.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 472 | button/button · ThreadRow | {thread.participantName} {formatOrbitDateTime(thread.lastCorrespondenceAt, language)} {thread.subject} {thread.preview} {&lt;span aria-label={`${thread.unreadCount} unread`} className="ri-row-unread"&gt; {thread.unreadCount} &lt;/span&gt;} / {null} | onclick: onOpen | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 541 | button/button · ReplyComposer | Edit draft / 继续编辑 | onclick: () =&gt; setStaged(false) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 551 | field/textarea · ReplyComposer | t({ en: "Write a reply…", zh: "写一条回复…" }) | onchange: (event) =&gt; setBody(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 562 | button/button · ReplyComposer | Rewriting… / 改写中… / Rule-based rewrite / 规则改写 | onclick: onRewrite | {"disabled":"rewriting \|\| !body.trim()","renderGateProps":[],"conditions":[]} |
| 566 | button/button · ReplyComposer | Stage for review / 暂存待复核 | onclick: () =&gt; setStaged(true) | {"disabled":"!body.trim()","renderGateProps":[],"conditions":[]} |
| 591 | button/button · ThreadDetailView | t({ en: "Back to list", zh: "返回列表" }) | onclick: onBack | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 773 | button/button · NewThreadForm | t({ en: "Back to list", zh: "返回列表" }) | onclick: onCancel | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 780 | field/input · NewThreadForm | t({ en: "Contact name", zh: "联系人姓名" }) | onchange: (event) =&gt; setRecipient(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 783 | field/input · NewThreadForm | t({ en: "Optional", zh: "选填" }) | onchange: (event) =&gt; setOrganization(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 785 | button/button · NewThreadForm | AI is drafting… / AI 起草中… / Draft with AI / AI 起草邮件 | onclick: onGenerate | {"disabled":"!recipient.trim() \|\| busy !== \"idle\"","renderGateProps":[],"conditions":[]} |
| 791 | field/input · NewThreadForm | t({ en: "Thread title", zh: "对话标题" }) | onchange: (event) =&gt; setSubject(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 794 | field/textarea · NewThreadForm | t({ en: "Write the first message…", zh: "写下第一条消息…" }) | onchange: (event) =&gt; setBody(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 813 | button/button · NewThreadForm | Creating… / 创建中… / Create thread (confirm) / 创建对话（确认） | onclick: onCreate | {"disabled":"!canCreate","renderGateProps":[],"conditions":[]} |
| 892 | button/button · ThreadsTab | Prepare a local draft / 准备本地草稿 | onclick: () =&gt; setComposing(true) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 941 | button/button · ThreadsTab | t({ en: "New conversation", zh: "发起新对话" }) | onclick: () =&gt; setComposing(true) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 952 | field/input · ThreadsTab | t({ en: "Search conversation history", zh: "搜索对话历史", }) | onchange: (event) =&gt; setSearch(event.target.value) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 966 | callback-control/ThreadRow · ThreadsTab |  | onopen: () =&gt; openThread(thread.conversationId) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 988 | callback-control/NewThreadForm · ThreadsTab |  | oncancel: () =&gt; { setComposing(false); onNewThreadConsumed?.(); }; oncreated: (entry) =&gt; { setCreated((previous) =&gt; [entry, ...previous]); setComposing(false); setOpenId(entry.detail.conversationId); onNewThreadConsumed?.(); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1205 | callback-control/div · RelationshipInboxPanel |  | onclick: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1241 | button/button · RelationshipInboxPanel | t({ en: "Close", zh: "关闭" }) | onclick: onClose | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1252 | button/button · RelationshipInboxPanel | t({ en: "Resize inbox. Use left and right arrow keys.", zh: "调整收件箱宽度，可使用左右方向键。", }) | onkeydown: resizePanelFromKeyboard; onpointerdown: startPanelResize | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1282 | button/button · RelationshipInboxPanel | {item.label} | onclick: () =&gt; setTab(item.id) | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1540 | button/button · RelationshipInboxTrigger | t({ en: "Open inbox", zh: "打开收件箱" }) | onclick: () =&gt; { setSeed(null); setOpen(true); } | {"disabled":null,"renderGateProps":[],"conditions":[]} |
| 1590 | callback-control/RelationshipInboxPanel · RelationshipInboxTrigger |  | onclose: () =&gt; setOpen(false) | {"disabled":null,"renderGateProps":[],"conditions":[]} |

### HTTP 调用与 API 路径证据

| 行 | 所属函数 | 证据类别 | 方法 | 目标或路径表达式 |
| --- | --- | --- | --- | --- |
| 103 | fetchInboxWorkspace | 调用 | GET/由封装决定 | `/api/chat/relationship-inbox${query}` |
| 103 | fetchInboxWorkspace | 路径常量 | 见调用/handler | `/api/chat/relationship-inbox${query}` |
| 179 | requestMessageDraft | 调用 | POST | "/api/chat/assist/email-draft" |
| 179 | requestMessageDraft | 路径常量 | 见调用/handler | "/api/chat/assist/email-draft" |
| 262 | createThreadFromDraft | 调用 | POST | "/api/chat/relationship-inbox" |
| 262 | createThreadFromDraft | 路径常量 | 见调用/handler | "/api/chat/relationship-inbox" |
| 289 | rewriteDraft | 调用 | POST | "/api/chat/assist/rewrite" |
| 289 | rewriteDraft | 路径常量 | 见调用/handler | "/api/chat/assist/rewrite" |
| 340 | fetchReminderAlerts | 调用 | GET/由封装决定 | "/api/notifications" |
| 340 | fetchReminderAlerts | 路径常量 | 见调用/handler | "/api/notifications" |
| 380 | persistNotificationState | 调用 | POST | `/api/notifications/${encodeURIComponent(id)}/state` |
| 380 | persistNotificationState | 路径常量 | 见调用/handler | `/api/notifications/${encodeURIComponent(id)}/state` |

### 文字明细

| 行 | 类型 | 原文或绑定表达式 |
| --- | --- | --- |
| 210 | 文案/数据常量 message | "The draft response did not include a reviewable draft." |
| 223 | 文案/数据常量 message | "The draft request could not be completed." |
| 410 | 属性 title | t({ en: "Loading", zh: "加载中" }) |
| 410 | 翻译 en | "Loading alerts…" |
| 410 | 翻译 zh | "正在加载提醒…" |
| 410 | 翻译 en | "Loading" |
| 410 | 翻译 zh | "加载中" |
| 416 | 属性 title | t({ en: "All clear", zh: "暂无提醒" }) |
| 416 | 翻译 en | "Source-backed reminders will appear here." |
| 416 | 翻译 zh | "来源明确的提醒会显示在这里。" |
| 416 | 翻译 en | "All clear" |
| 416 | 翻译 zh | "暂无提醒" |
| 424 | 翻译 en | "Reminders" |
| 424 | 翻译 zh | "跟进提醒" |
| 431 | 翻译 en | "Dismiss all" |
| 431 | 翻译 zh | "全部忽略" |
| 444 | 属性 aria-label | t({ en: "Dismiss", zh: "忽略" }) |
| 444 | 翻译 en | "Dismiss" |
| 444 | 翻译 zh | "忽略" |
| 454 | 翻译 en | "In-app reminders stay in Orbit. No external push, email, or SMS was sent." |
| 454 | 翻译 zh | "站内提醒仅保留在 Orbit；未发送外部推送、邮件或短信。" |
| 488 | 属性 aria-label | `${thread.unreadCount} unread` |
| 534 | 翻译 en | "Staged for review — not sent" |
| 534 | 翻译 zh | "已暂存待复核 — 未发送" |
| 539 | 翻译 en | "No external message, notification, calendar entry, saved record, or network request happened." |
| 539 | 翻译 zh | "未发生任何外部消息、通知、日历、保存记录或网络请求。" |
| 542 | 翻译 en | "Edit draft" |
| 542 | 翻译 zh | "继续编辑" |
| 550 | 翻译 en | "Draft reply" |
| 550 | 翻译 zh | "回复草稿" |
| 551 | 属性 placeholder | t({ en: "Write a reply…", zh: "写一条回复…" }) |
| 554 | 翻译 en | "Write a reply…" |
| 554 | 翻译 zh | "写一条回复…" |
| 559 | 翻译 en | "Draft & review only — sending requires confirmation, no message is sent automatically." |
| 559 | 翻译 zh | "仅草稿与复核 — 发送需确认，不会自动发送任何消息。" |
| 564 | 翻译 en | "Rewriting…" |
| 564 | 翻译 zh | "改写中…" |
| 564 | 翻译 en | "Rule-based rewrite" |
| 564 | 翻译 zh | "规则改写" |
| 568 | 翻译 en | "Stage for review" |
| 568 | 翻译 zh | "暂存待复核" |
| 591 | 属性 aria-label | t({ en: "Back to list", zh: "返回列表" }) |
| 591 | 翻译 en | "Back to list" |
| 591 | 翻译 zh | "返回列表" |
| 644 | 翻译 en | "Organization not listed" |
| 644 | 翻译 zh | "未填写组织" |
| 651 | 翻译 en | "Relationship context" |
| 651 | 翻译 zh | "关系上下文" |
| 656 | 翻译 en | "Review the conversation before deciding the next follow-up." |
| 657 | 翻译 zh | "先复核对话，再决定下一步跟进。" |
| 665 | 翻译 en | "Source signals" |
| 665 | 翻译 zh | "来源线索" |
| 679 | 翻译 en | "Draft-only workspace. Nothing is delivered without confirmation." |
| 680 | 翻译 zh | "仅用于草稿复核。未经确认不会投递任何内容。" |
| 773 | 属性 aria-label | t({ en: "Back to list", zh: "返回列表" }) |
| 773 | 翻译 en | "Back to list" |
| 773 | 翻译 zh | "返回列表" |
| 776 | 翻译 en | "New conversation" |
| 776 | 翻译 zh | "发起新对话" |
| 779 | 翻译 en | "Recipient" |
| 779 | 翻译 zh | "收件人" |
| 780 | 属性 placeholder | t({ en: "Contact name", zh: "联系人姓名" }) |
| 780 | 翻译 en | "Contact name" |
| 780 | 翻译 zh | "联系人姓名" |
| 782 | 翻译 en | "Organization" |
| 782 | 翻译 zh | "公司/组织" |
| 783 | 属性 placeholder | t({ en: "Optional", zh: "选填" }) |
| 783 | 翻译 en | "Optional" |
| 783 | 翻译 zh | "选填" |
| 787 | 翻译 en | "AI is drafting…" |
| 787 | 翻译 zh | "AI 起草中…" |
| 787 | 翻译 en | "Draft with AI" |
| 787 | 翻译 zh | "AI 起草邮件" |
