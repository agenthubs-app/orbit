# W1：首次资料 Web 页面门禁设计与验证

最初只读设计阶段的审阅对象固定为主提交 `af9784f41a329d134778d5a0386ad5f31833b920`，不是 W1 工作树 HEAD，也不是历史 mock。2026-09-18，Astra 只读设计；未启动 Luna、未改业务、未运行数据库/云服务、未重建索引、未提交。当时本文件是唯一新增仓库文件。后续主审正式批准独立实施；实施基线、范围及实际结果见文末。

主任务随后明确收窄：**默认实施候选仅 Web 页面导航与 SSR，不改变 API HTTP 行为、业务授权或 App 行为。** API 能力限制另列，不计入本轮完成。

## 结论与边界

现有实现完成了登录表单后的资料引导、权威完整度计算、资料编辑和复读后继续，但没有全站页面入口门禁。最小候选是在既有 `proxy.ts` 对已登录用户的 `/app` 页面 GET/HEAD 请求增加权威资料判定，精确豁免认证/补全/恢复入口；复用现有 continue 的读取流程。layout 不承担唯一门禁，不搬动或重置 W4 的 `OrbitAskProvider`，不在共享身份 resolver 内增加资料限制。

这能封住新进入服务器的直达、刷新、SSR、RSC 导航和预取请求；**不等于 API 操作被禁止，也不等于已缓存/已展示页面被实时撤销**。客户端完全没有发请求的恢复路径必须单独验证，不能用 proxy 单测宣称穷尽。P0-03 的跨域全链及业务能力限制仍不能因此整项关闭。

不新增必填、正式词表、历史完成标志或身份系统。基础资料门禁与活动报名问答分离：只读取现有基础 onboarding，不把目标、供需、话题或活动个性问答变成全站必填，不写活动 persona/报名记录。

## 固定源码事实

下列路径均为 `repos/orbits/` 内、上述固定提交的路径；行号也是该提交行号。

| 位置 | 已有行为 | 对门禁的含义 |
| --- | --- | --- |
| `proxy.ts:29,81,119` | Auth.js wrapper；API 未登录 401；既有私有页面未登录跳 login；matcher 为 `/app/:path*`、`/api/:path*` | 没有读取 onboarding。会话存在即不会触发页面登录分支 |
| `app/(app)/app/layout.tsx:23` | auth、语言、SessionProvider、OrbitAskProvider、children、GlobalAsk | 没有完整度判定；源码明确 layout 跨页保留草稿，不宜换成会反复卸载 Provider 的门禁 |
| `app/(app)/app/page.tsx` | 已登录跳 `/app/home`，匿名展示星空首页 | 已登录根入口仍需被新页面门禁覆盖 |
| `app/(app)/app/account/login/page.tsx:71`、`signup/page.tsx:71` | 已有 session 直接跳归一化 next | 跳转本身没有检查资料；目的页面的新门禁可以兜住，不必另改登录协议 |
| `app/(app)/app/account/orbit-real-account-auth.tsx:154–206` | credentials/signup 成功进入 continue；Google callbackUrl 同样指向 continue；navigate 使用 window.location | 新登录标准 UI 已有引导，不应重做 auth callback/JWT |
| `auth.ts` | JWT 把本地 user id 放入 token.sub/session.user.id；刷新检查密码会话有效性 | session 存在不等于 canonical account 已解析，更不等于资料已完成 |
| `app/api/_shared/authenticated-actor.ts:59,117` | 从持久化 membership 解析 raw subject 或 legacy account subject；必须有 profile 与 account；live 无任意账号 fallback | 新门禁原样调用，不把 raw session id 当 actor，不重造 owner |
| `features/auth/storage/auth-account-provisioning-provider.ts:58–118` | 新账号的 profile 有姓名、账号、时区和时间；没有行业/生日 | 新注册账号能解析身份，同时基础 onboarding 仍可能 incomplete；资料缺失不是自动补造身份的理由 |
| `features/profile/onboarding.ts:14` | policyVersion 1：姓名、合法一级/二级行业、合法生日决定 complete/incomplete | 这是唯一基础规则；行业验证继续用现有 `shared/domain/industries`，没有新词表依赖 |
| `features/profile/live-service.ts:198–243,448` | GET/保存后从实际 manual profile 计算 onboarding；旧 scoreCompleteness 是另一个丰富度指标 | 不用 `completeness.score/status`、客户端字段或 JWT 中的完成标志判定 |
| `app/(app)/app/profile/continue/page.tsx:35–93` | session → live → canonical actor → live getProfile → 有 profile 且已知 onboarding complete 才 next；异常去补全页 | 已有正确的权威读取链，可抽出复用；它不是全站入口 |
| `app/(app)/app/profile/page.tsx:126` 及 route view model | canonical/live 不可用显示恢复态；读失败不当空资料；补全 next 可保留 | 可作为门禁失败的恢复终点，必须豁免自身 |
| `app/(app)/app/profile/orbit-real-profile.tsx:162–211,895–995` | PUT 校验 receipt，再 GET no-store 复读；complete 才继续；已有 complete 的页面有“继续”链接 | 沿用保存/CAS/失败恢复，不以提交按钮点击或本地 draft 放行 |
| `app/(app)/app/events/[id]/register/page.tsx:65–135`、对应 API route-handlers | 页面解析 canonical actor，API 检查 actor/报名条件/活动问题；未引用基础 onboarding | 页面门禁应覆盖报名入口，但不得把活动资料写回基础资料；API 在本轮保持原行为 |
| `app/api/profile/handlers.ts` | GET/PUT 有 actor 边界；允许 incomplete 用户读写资料 | 本轮不动；不能把身份 resolver 改成“必须 complete”，否则会锁死补全 API |

固定对象搜索发现，产品 `app` 中消费 onboarding complete 的位置为 continue 和 profile editor；未发现另一套全站 gate。`app`/`features` 源码未发现自定义 `"use server"` 指令，当前主要交互是 API fetch；这不是未来 Server Action 不会出现的保证。

## 图谱证据与共享风险

按 exploring 先读取主树 `orbit-web-main-integration-20260917` context 并运行三组 query，再运行精确 UID context/impact。其索引提交为 `0385ffba7d04b5496258ec0d9c2d78fce8859ae9`，比固定对象落后一个提交，且 FTS disabled；query 返回空不能证明无调用。遵照主任务不重建。两个提交的 12 个差异文件仅涉及 reminder/maintenance；本设计关键 proxy/auth/profile/page 文件不在差异内。所有结论另以固定 `git show` 补证。

| 精确符号 | 索引返回 | 本设计处理 |
| --- | --- | --- |
| resolveAuthenticatedApiActorFromSession | CRITICAL（shared axes HIGH），18 direct / 66 total / 29 affected process entries | 已向主与用户侧更新警示；只调用，不修改共享 resolver、membership 查询或 App 身份契约 |
| calculateProfileOnboarding | LOW，3 direct / 10 total | 原规则复用，不改其实现 |
| proxy、AppLayout、AppAccountLoginPage、AppAccountSignupPage、AppProfileContinuePage | UNKNOWN，0 resolved callers | 框架入口由路径与 matcher 实际调用；按全站共享面管理，绝不按“无人调用”处理 |

context 确认 onboarding 被 live `emptyPayload/payloadFor` 使用；精确流程读取确认 `AppProfilePage → ...normalizeProfileOnboardingNext → normalizeOrbitAuthReturnPath`、`AppAgentPage → resolveAuthenticatedApiActorFromSession → readAccountSessionGraph`、`AppLayout → OrbitLanguageProvider → orbitHtmlLang`。部分图谱把通用 get/auth 误连到测试 invoke 或其他模块，已用源码排除，不当实际调用链。

原始文件保留于 `/tmp/orbit-w1-onboarding-gate-repo-context.json`、`query-*.json`、`*-context.json`、`*-impact.json`、`process-*.json`；固定关键文件 blob/SHA256/行锚点为 `/tmp/orbit-w1-onboarding-gate-source-audit.json`。这些是设计证据，不是编码后 detect 或集成测试证明。

## 默认候选架构

1. 保留现有 auth wrapper、API/CORS/维护服务鉴权和语言 cookie 行为。在已有认证逻辑之后，先做廉价请求分类：只有 `/app` 路径边界内、GET/HEAD、`request.auth.user.id` 存在、且非页面豁免项才读取资料。`/api/**`、其他方法、静态资源和无会话请求不新增 onboarding SQL。
2. 从 continue 抽出小型服务端 route helper，输入已取得的 session identity，返回 `complete / incomplete / unavailable`。继续调用既有 `resolveAuthenticatedApiActorFromSession` 和 `createProfileService("live").getProfile({actorId: actor.id})`，不再调用 auth，不传 scenario，不加载 suggestions/OCR/推荐。非 live、canonical 缺失、factory/query 失败、未知 onboarding 契约均 unavailable；完整条件沿用 continue 的 profile 存在、policyVersion 1、合法 onboarding、status complete。
3. proxy 与 continue 共用这一读取判定，避免各复制一套规则。helper 不 redirect、不写库、不改身份；continue 仍负责自己现有的未登录与 next 跳转。
4. complete：继续原 `NextResponse.next`。incomplete/unavailable：GET/HEAD 去 `profileOnboardingPath(safeNext)`；profile 页自己显示权威状态或已有恢复态。失败不伪装成成功或空白新建，不循环重试，不调用付费服务。
5. 默认不改 layout、login/signup、auth.ts、profile editor 或正常业务页面。已有会话登录页跳到 next 后由目的页面 gate 检查；标准登录 callback/保存后的 continue 继续复用现有链。这里接受有限的多次读取，先测量再由 W5 判断是否另批优化，不能为省一次读发明跨请求完成缓存。

不建议“只在 layout 读一次”“只加客户端 useEffect redirect”“只在 login callback 读一次”或用 `?onboarding=1` 判断放行。这些都不能证明直接 URL/RSC 请求经过权威判断。也不在 session/JWT 写永久完成位：当前规则没有历史完成豁免，资料变化后位值会过时。

## 页面路由矩阵

分类始终先限制为 GET/HEAD 页面请求；下面的“门禁”只针对已有会话。未登录用户沿用原 proxy/各页面认证行为，不扩大本轮匿名登录策略。

| 路由 | 推荐处理 | 原因/不能误用的豁免 |
| --- | --- | --- |
| `/app/account` 路径边界内现有 login/signup/forgot-password/reset-password/mobile-google | 豁免新资料读取 | 认证、密码恢复及移动 OAuth 收尾必须可达；`/app/accountX` 不能命中 |
| 精确 `/app/profile` | 豁免 | 基础补全、GET 失败重试、已有 complete 的继续入口；与 onboarding query 值无关 |
| 精确 `/app/profile/continue` | 豁免外层 gate，由自身 helper 判断 | 防止自己跳自己、避免同一次 continue 请求读两轮；不豁免任意 `/app/profile/**` 新路由 |
| 精确 `/app/admin/access`、`/app/login-admin` | 作为现有管理员登录页面豁免，保留原后台授权 | 不扩成 `/app/admin/**`；后台页面本身仍在已登录页面 gate 候选中，主须核验真实运营账号资料可恢复 |
| `/app`、home/home/events、today、schedule/**、tasks/** | 门禁 | 包含 tasks，不能只复用旧 private prefixes |
| agent、chat、contacts/**、followups、dashboard、settings、platform、party/**、admin 业务页 | 门禁 | 服务端先挡页面读取；不改 W4 Provider、草稿/owner 或这些模块内部业务 |
| events、events/center、events/[id]、register、events/[id]/register、analytics、operations/** | 门禁 | 已登录用户的首次基础补全覆盖活动链；不能以 `/app/events/**` 全豁免，不能把静态 center 当动态公开活动 id |
| inbox/sources/[id]、invitations/[token] | 门禁 | 旧 private prefix 未列出，但真实页面存在；邀请 token 放在安全 next 中保留，不复制进通用日志 |
| `/app/o/[slug]` | 默认已登录也门禁；匿名维持现有公开展示 | 最小豁免不另造“公开页上登录用户可以跳过补全”政策 |
| `/`、`/dev/**`、`/_next/**`、字体/图片等 `/app` 之外资源 | 不新增门禁 | 不将内部 dev/mock 验证面当产品完成；不改变现有 matcher 或资源请求成本 |
| `/api/**`，包括 profile/auth/bootstrap/报名/AI/维护/queues | **本轮一律不新增 onboarding 限制或 SQL** | 保留既有认证、业务授权、CORS、worker 身份；绝不因名称 public/private 推导新 API 行为 |
| `/app/**` POST/PUT/PATCH/DELETE（含未来 Server Action） | 本轮不新增 onboarding 判定 | 页面导航方案不是写权限方案；不能用 307 把 POST 请求体重放到 profile |

这是“已登录后先补全”的最小页面豁免建议，并非改变匿名公开目录。若主希望 incomplete 的已登录用户仍浏览活动/组织者公开页，应另明确公开页面豁免；动态活动页同时能解析私人活动，不能仅凭 `/app/events/:id` 路径宣称数据必公开。该选项不阻塞默认最小方案，也不擅自实施。

未知的新 `/app` 页面默认受 gate 约束；豁免表必须做路由边界匹配，不用包含字符串。尾斜杠/编码路径按实际 NextRequest 与框架重定向测试，不能为了命中豁免而任意重复 decode。静态资产不要先经过资料读取再决定跳过。

## next、安全跳转和防循环

- 受 gate 的页面用请求实际 pathname + 业务 search 构造 next，复用 `normalizeProfileOnboardingNext` 和 `profileOnboardingPath`；不从 Referer、可伪造的路径 header 或业务页面自己的 `next` 参数选跳转目标。
- 不改现有 normalizer：它先限制同源站内 `/app` 或 `/`，再排除 profile/auth 目的地，fallback `/app/home`。auth UI 仅通过 `normalizeProfileAuthReturnPath` 解包一层已知 continue 包装。外站、`//host`、反斜杠、编码 account/profile、嵌套 continue、重复 next 参数必须沿用现有防循环断言。
- RSC 运输参数（实际请求中的 `_rsc`）不能永久保存在返回目标；构造 next 时只移除经框架确认的内部参数，保留 tab/language/event 等业务参数。不因为 prefetch/RSC header 就免读；这些 header 不能成为客户端可伪造的 bypass 开关。
- HTTP 请求不携带 fragment，proxy 无法恢复原 URL 的 `#section`。已有登录 UI/continue query 中编码的 fragment 可保留；不能承诺直接服务器拦截保留浏览器 fragment。不要为此信任任意客户端 header。
- profile 和 continue 精确豁免；continue unavailable/incomplete 去 profile，profile 不自动再跳 continue。恢复后 complete 编辑页已有“继续”链接；保存仍 PUT receipt → GET no-store → continue → 目标页面 gate，不信任成功提示文字。
- GET/HEAD 的临时 redirect 不使用永久状态，并对个体化 redirect 设置 no-store。语言 cookie 的原逻辑在新增 redirect 分支也要保留。不要在 POST 路径使用页面重定向。

## 失败恢复与缓存遗漏

| 情况 | 本轮默认结果 |
| --- | --- |
| 会话缺失/失效 | 原认证处理；不先读资料 |
| canonical actor 不存在或读取抛错 | 去豁免 profile 恢复入口；由已有 profile failure state 提供重试。不能用 raw user id 继续，也不能自动创建 account/profile |
| live provider 缺失、DB 故障、契约未知 | 同上；不得降级 mock complete，不自动重试整个页面请求 |
| 权威 profile 为 null/incomplete | 基础编辑；合法 persisted membership 是前提；无效会员链是 unavailable，不伪装普通首次填表 |
| 保存 409/receipt 不符/复读失败 | 原 editor 保留草稿与 reconcile 行为；不放行业务页面，不擅清理 W4 草稿 |
| 恢复后资料已 complete | profile 的既有“继续”可重进 continue，随后目标 gate 再读；无自动跳转环 |
| 旧 tab、浏览器前进后退、缓存 RSC、部署前已经展示的页面 | 只对到达服务器的请求有保证。必须执行浏览器恢复/预取实证；不把页面 gate 宣称数据撤销或业务写权限 |

当前登录/注册的 navigate 是 full location 变更，资料保存后也是 `window.location.assign`；这些标准首次路径会重新经过服务端。真正没有网络的旧缓存恢复、切换账号后的既有 shell 和 already-open 页面另属 UI/owner 协调面。**若主验收要求这些情况下也必须立即遮住旧页面，本候选不能单独满足**：应在真实 RED 后另批小型客户端路由恢复边界，与 W4/W0协同，保留既有 Provider 生命周期，使用当前会话与请求代次防过期结果覆盖。这里不预设该边界能零查询，不新增它、不修改 owner/draft Provider。

资料页目前允许全局 Ask launcher 出现（`orbit-ask-routes.ts` 未排除 profile）。本轮 API 不限制业务能力，所以资料页/已开窗口仍可能直接请求 AI 等 API。主若只批准导航门禁，这是明确剩余；不能把“页面到了补全页”写成“所有业务能力禁用”。隐藏 launcher 或 API 能力策略均需 W4/主另审，不偷偷塞入本补丁。

## 读取成本与边界

增量资料读取只发生在已登录、非豁免 `/app` GET/HEAD；API、静态资源、未登录、认证页、profile 页面外层 gate、continue 外层 gate、非 GET/HEAD **新增 onboarding 查询为 0**。这不是整个请求零 SQL：原 Auth.js session revocation、页面/continue/profile 自身仍可能读库。

| 路径 | 源码可证的新增成本（不是实测） |
| --- | --- |
| raw subject 正好匹配 membership profile id，单 account | canonical 1 profile + 1 account，P reader 2 SELECT，合计通常 4 SQL |
| legacy/current subject 需 accountId fallback，单 account | canonical 2 profile + 1 account，P reader 2 SELECT，合计通常 5 SQL |
| 多个 payload accountId 候选 | identity 阶段是 1 或 2 个 profile 查询 + k 个 account 查询，再 profile 2；不能宣称固定上界 5 |
| 标准登录 continue → 目标页面 gate | 两个独立 HTTP 请求可各读一轮；完整资料常见合计 8/10 SQL，尚不含 auth 与目标页自身读取 |
| protected page incomplete → profile 恢复页 | gate 4/5 后，profile 页面还有原 canonical、profile、可选 suggestions；不能把整条跳转链记成 4/5 |
| prefetch/RSC/navigation | 每个实际受 gate 的请求都要计费；不声称一个点击只读一次或 proxy 与 page 自动 dedupe |

canonical provider 已有按 payloadId/accountId 下推查询，但仍返回其原字段；P 优化只证明后半段 profile reader 的两个窄查询，不能套用为整个 gate 两 SQL。Auth.js `isPasswordSessionCurrent` 自身还有 auth_users 读取；本轮不修改它，不调用第二次 auth。既有 store cache/pool 不是跨 HTTP 请求的权威完成状态缓存。

后续 coding 验证需由 W5 审读取预算：给 complete/incomplete、raw/canonical 两类身份、直接 URL/continue/预取分别记录 SQL 数、返回 rows/JSON bytes、延迟，另计被阻断后没有执行的目标页查询。先在隔离本地库实测，不做云压测。此次设计没有运行这些测试。任何 identity reader 合并、跨请求缓存、TTL、索引/schema 变更都另批，不在这次门禁里“顺手优化”。

## 候选文件与共享锁

以下仅是待批准编码清单，本次未编辑。

| 文件 | 建议职责/锁 |
| --- | --- |
| `proxy.ts` | 唯一共享入口改动：GET/HEAD 页面 gate，保留 API/matcher/auth/CORS/语言分支；主/W0锁，不能并发改 |
| 新 `app/(app)/app/profile/profile-onboarding-access.server.ts` | 从 continue 提取既有 canonical/live/profile 决策；无 auth 调用、redirect、写操作或付费服务 |
| 新 `app/(app)/app/profile/profile-onboarding-route-policy.ts` | 纯请求分类与精确豁免；调用现有 next normalizer，不复制行业/生日规则 |
| `app/(app)/app/profile/continue/page.tsx` | 调用共用 helper，保持现有 redirect 行为；W1锁 |
| 新 `tests/ui/profile-onboarding-proxy.test.ts` | 执行真实 proxy callback 的行为矩阵、query spies、保留 API 结果；不能只测源文本包含字符串 |
| 新 `tests/pages/profile-onboarding-access.test.ts` | helper 的权威结果、canonical raw/account 身份、失败分类、无可选服务、只读断言 |
| `tests/pages/app-profile-onboarding-navigation.test.ts` | 现有 continue 行为矩阵继续跑；调整提取后的模块 stub/缓存隔离与源码断言，不能删除原失败用例 |
| `tests/ui/maintenance-proxy-integration.test.ts` | 当前直接同步调用 proxy；若 callback 改 async，必须改 await/返回类型并验证 Cron 邻近路径仍 401。属于主/W0测试锁，不能为避锁绕成错误架构 |
| 本设计文件 | 主审意见与最终证据由后续批次追加 |

只读依赖：`auth.ts`、`features/auth/app-auth-routing.ts`、`app/api/_shared/authenticated-actor.ts`、account provider、profile service/onboarding/P reader、navigation helper、profile editor、login/signup。默认不改 login/signup 的已有会话 redirect，因为目标 gate 已封住页面绕过；若主要求每次已登录 auth entry 必须显式走 continue，可另加这两个文件，成本与 fragment 行为也要单列。

不改 layout、OrbitAskProvider、W4 owner/draft/runtime、API routes/handler、App、共享契约/schema、数据库索引或正式词表。依赖行为是全站的，文件少不等于影响小。编码获批时必须针对那时冻结版本重新核对 impact 和锁；本次图谱只作设计依据。

## RED oracle 与验收（最初设计阶段未执行）

沿用 `maintenance-proxy-integration.test.ts` 的实际 callback 加载方式：仅替换 session/资料依赖，执行真实 NextRequest/NextResponse。RED 必须调用现有 proxy/路由行为，不以新模块不存在或 grep 不匹配当产品 RED。

| Oracle | af9784f4 应暴露的问题 / 后续 GREEN 条件 |
| --- | --- |
| 已登录但权威 incomplete，直达 `/app/home`、`/app/agent`、`/app/tasks/personal`、活动 register、邀请页 | 现有 proxy 返回 next；新增后 GET/HEAD 精确到 profile onboarding 安全 next，目标页面 service spy 为 0 |
| 已登录 login/signup + business next；OAuth 自定义安全 business callback；根 `/app` | 跳转链的最终业务页面必须 gate；不能只验证表单默认 callback |
| 权威 complete，但旧丰富度 score 不 ready；反例本地 draft/JWT 声称 complete 而服务端 incomplete | 前者放行，后者拦截；只以既有 onboarding 为准 |
| raw session id ≠ canonical account，双账号/双 workspace | getProfile 接收 resolver 的 canonical id；没有任意账号 fallback、字符串拼接身份或上一账号缓存 |
| canonical null/throw、非 live、factory throw、getProfile failure/throw、未知 policy/version、profile null | fail closed 到 profile 恢复；无成功空图伪装，无无限 retry/redirect |
| profile、continue、认证恢复、匿名请求、API、静态资源、POST | 外层新增 profile read 为 0；continue 自己原读仍在，API HTTP/body/headers/维护鉴权保持基线 |
| `accountX`、`profile/other`、encoded auth/profile、外站、`//`、反斜杠、重复 next、嵌套 continue、业务 query/内部 `_rsc` | 不扩大豁免、不外跳、不循环；业务 query 保留，内部运输参数不固化；HTTP fragment 限制如实记录 |
| Prefetch/RSC/客户端 Link | 不依赖可伪造 header 放行；验证实际 HTTP 命中与目标组件不渲染，并记录请求次数；不能只测初始 SSR |
| 浏览器 Back/Forward、旧缓存、跨标签完成/清空、账号切换 | 记录哪些路径无请求而不经过 proxy；若验收要求实时遮挡且实际 RED，另批客户端边界，不能把缓存恢复冒称服务器 gate 已覆盖 |
| PUT成功但 receipt/GET复读失败、409、optional suggestions/OCR不可用 | 原 editor 不提前导航、不丢草稿；基础保存不依赖可选资料；复读 complete 后走 continue 能到原业务目标 |
| profile 辅助入口直接调用业务 API / Server Action POST | 默认本轮保持基线业务授权；必须明示不属于页面 gate 的 GREEN，不能伪造“全能力拦截”通过 |

后续还需真实本地 HTTP/浏览器证据和独立实际 PG canonical/profile/CAS 回归，再跑既有 API auth proxy、maintenance proxy、onboarding policy/navigation/editor 测试、类型检查及最终图谱。设计阶段无运行结果，不引用历史 mock 或 App 状态充当这轮完成。

## 是否需要产品决定

按主已授权的“Web 页面导航/SSR、复用既有基础规则”收口，**没有必须先向用户索要的新必填或词表决定**；无需为此阻塞设计或编码审批。主/W5需要审批的是共享 proxy 方案、读取成本和精确豁免范围，W0协调其维护测试，W4协调任何将来缓存/launcher 展示变更。

以下会改变语义，必须独立明确，不能混入默认补丁：允许 incomplete 已登录用户浏览特定公开页面/后台业务；“曾经 complete 后永久豁免”的历史策略；在资料页禁止所有业务能力；改变 API 为 403/503 或新增恢复上下文；要求已展示/完全缓存页面立即撤销。API 选项即使复用 FORBIDDEN/SERVICE_UNAVAILABLE 既有枚举，也改变现有 Web/App 行为，需要跨端及领域批准。当前页面方案不据此宣称关闭全站业务权限缺口。

交主审后才另批 coding；W1 保持 P 提交与旧报告冻结，本设计不提交、不触碰运行环境。


## 主审补充与实施启动（2026-09-18）

主已批准默认页面方案及表中八代码测试文件加本文，共九文件；W0确认 proxy/maintenance-proxy 测试没有在途编辑，锁交W1。独立实施基线为 `236c202f101f37990bea349113251512c120ab0d`，相对最初审阅对象仅多一份 conversation readback 测试修订。新树 `/Users/li/work/orbit-web-onboarding-gate-20260918`，分支 `codex/w1-onboarding-gate-20260918`；原197d冻结产品不改。原Luna/max单一编码，Astra独立review/验收。新增SQL常见4/5及continue两请求8/10已获正确性首批批准，仍需实测，不代表成本治理完成。

原“固定af978下未发现自定义use-server”的结论仅对该提交有效。主已另批W5的 `home-dashboard-actions.ts` 无参re-auth action；未来首页刷新POST明确不在本轮页面GET/HEAD gate内，本域不修改该文件或其授权，不把缺少POST限制误报为本补丁缺陷，也不宣称全能力门禁。

本地依赖实际Next版本16.2.9；其 `next/dist/build/analysis/get-page-static-info.js` 明确Proxy always runs on Node.js runtime，且不允许在proxy导出runtime配置。因此不新增edge/nodejs runtime标记。现有profile service-factory静态导入live/mock extraction和signal模块，单有“未调用可选服务”不足以证明加载无副作用：proxy的纯路由policy不得导入service图，server helper应在合格的已登录页面GET/HEAD分支之后才动态导入。factory模块顶层注册自身目前是纯构造，实际PG Pool在调用configured runtime时创建；仍以实际bundle/启动与请求计数验证完整传递链。

运行时验收必须使用新树独立.next的实际Next server及专属 `w1.localhost:4611`，不仅是callback shim。冷启动/首个API/asset/POST、首次合格页面、第二轮非合格请求分开取证；新增模块加载不应发SQL、外部HTTP、模型/OCR或写操作。现有auth revocation和原handler查询为基线成本，不能误算成新增onboarding查询，也不能因把环境设成缺数据库而虚假证明零副作用。对比profile/accounts SELECT及模块trace，并用实际合成会话和隔离PG验证默认composition。首次Next导入错误、RSC/prefetch/语言/回跳、API原状态与Cron鉴权必须执行；如果现有非九文件依赖阻断验收，报告精确边界，由主决定，不扩业务改动。


## 独立实施验证记录（2026-09-18）

实施分支 `codex/w1-onboarding-gate-20260918`，工作树 `/Users/li/work/orbit-web-onboarding-gate-20260918`；代码与测试由原 Luna 实施，Astra 独立源码复核、真实 Next/PG/Chromium 验证。新索引 `orbit-web-w1-onboarding-20260918` 精确绑定基线 `236c202f101f37990bea349113251512c120ab0d`。pre-impact：proxy/continue 框架入口 UNKNOWN（0 个图谱调用边，不当低风险）；被提取契约校验 LOW（1 直接调用方）；只读 canonical resolver CRITICAL（18 直接、66 总影响、29 流程）。两既有测试文件全部 38 个 Function UID 亦做了 upstream impact，UNKNOWN 由实际测试覆盖。索引流程生成有既有截断预算，不据不存在的流程推断无影响。

运行环境：独立复制依赖，Next 16.2.9 webpack dev，专属 `w1.localhost:4611`；独立 PostgreSQL `/tmp/orbit-profile-cas.y61ckldC` 仅 Unix socket、UTF8、合成账号与 workspace；白名单干净环境，不加载云数据库/模型/邮件凭据，浏览器阻断外部 origin。所有取证脚本、SQL trace、浏览器截图均在 `/tmp`，不加入产品仓库。

真实基线 RED：原 proxy 下已登录且 incomplete 的 `/app/w1-probe?lang=ja&tab=one&_rsc=baseline` 返回 404，期望 onboarding 307 的断言真实失败；不是 module-not-found。既有 navigation + maintenance 24/24 基线通过。冷启动 `/api/health` 为 0 SQL；signed health 和 POST health 各仅 1 条既有 `auth_users` 查询。

实现后的真实 HTTP 首轮：incomplete GET/HEAD/RSC/prefetch 为 307，`cache-control: no-store`，HEAD 无响应体；保留业务参数和语言 cookie，剔除 `_rsc`。complete raw / legacy account 通过 gate 到原目标（不存在探针页为原 404）；缺 membership、其他 workspace 的身份为 307。匿名私有页仍走 login、匿名公开探针仍原 404。`/app/accountX` 和编码的未知 profile 子路径受 gate；`/app/account/unknown` 保持豁免。signed app POST 保持原 404。新增 helper 首次加载前后的 API/POST 均仅原 auth 查询；实际静态 CSS 不触发 gate SQL。

SQL trace 在实际 Next 进程 pg.Client.query 层记录调用、返回行数/JSON 序列化字节、耗时，不替换数据读取；PostgreSQL 同时启用本地 statement 日志。普通 raw subject 的 gate 为 4 SELECT；legacy account 回退为 5 SELECT；另计 Auth.js 的 auth_users 查询。典型各有 4 返回行，legacy 的额外 membership 空查询为 0 行，P reader 仍是 4/19 字段的两个窄查询。continue 内部复用一次 helper，外层不重复 gate；continue→目的页新增读取仍为 8/10 SELECT，auth/layout/目标页查询另计。开发编译及 fixture 较小，HTTP 延迟仅作为本地观测，不当生产 SLA。

原始证据：`/tmp/orbit-w1-gate-http-baseline.json`、`/tmp/orbit-w1-gate-runtime-red.log`、`/tmp/orbit-w1-gate-http-green-core.json`、`/tmp/orbit-w1-gate-http-green-nav.json`、`/tmp/orbit-w1-gate-http-asset.json`；最终冻结与验证结果见下节。


真实 Chromium 完整流程：从 incomplete 直达 tasks 跳编辑页；点活动导航仍被门禁带回并保存 next；选择已有两级行业、填写生日，真实 PUT 回执和 GET readback 成功后经 continue 到正常活动空态。首次目标页因测试库仅初始化 orbit_records、缺 event_ops_events 报错，补执行仓库已有 runOrbitRecordsMigration 后完整复跑通过，不修改 schema/迁移文件；最终无 pageerror、无放行的外部 origin。另一标签通过既有 profile PUT 清空生日后，旧活动页仍可见；刷新才重检并跳回补全页。切换 complete/incomplete 会话后刷新分别放行/阻断，未使用上一账号的完成缓存。

Back/Forward 本次实际浏览器记录均重新发起 /app GET，返回当前 incomplete 门禁，再到 profile；无页面错误。该运行没有命中无网络 BFCache，不能外推“无网络历史恢复已被阻止”。本地 Next dev 不保证自动 Link 预取策略等同生产；实际 Next HTTP 的 RSC/prefetch 头组合已验证不豁免，浏览器旧页面保持显示已作为明确非目标记录。未来 W5 Server Action POST 不在此门禁内，业务授权仍由原 action 本身负责。

成本暖请求样本（小型合成资料，更新后 payload 含实际保存字段；JSON bytes 为 pg 返回 rows 数组序列化大小，不是网络协议字节）：

| 请求 | 门禁 SELECT | 返回行 | JSON bytes | SQL 调用耗时合计 ms | 本地 HTTP ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| incomplete raw | 4 | 4 | 3293 | 6.49 | 127.54 |
| complete raw | 4 | 4 | 3251 | 2.47 | 1016.77 |
| complete legacy account | 5 | 4 | 2400 | 2.72 | 53.44 |
| continue raw | 4 | 4 | 3251 | 22.83 | 548.19 |
| continue legacy account | 5 | 4 | 2400 | 10.03 | 69.94 |

raw continue→目的页合计 8 条新增 SELECT、legacy 合计 10 条；本次两请求各另有 auth 基线（合计 3 条），没有把 layout/认证费用归入 profile reader。SQL 可能并行，合计耗时不等于请求临界路径。Next dev 热编译、不同目标页和单样本会影响 HTTP 数值，以上不作为性能比较或生产目标。证据 `/tmp/orbit-w1-gate-http-warm-cost.json`、`/tmp/orbit-w1-gate-browser-flow.json`、`/tmp/orbit-w1-gate-history.json`。


最终冷启动补验记录：实际静态 CSS 首次和 helper 加载后均 200/0 SQL；signed health 首次和之后 200/仅 1 auth SQL；signed app POST 原 404、API POST 原 405，均仅 1 auth SQL。首次 incomplete/complete 合格请求分别阻断/放行，均 4 门禁 SELECT + 1 auth。真实 Next 进程加临时 socket 级网络阻断，捕获到 Next dev 既有 getVersionInfo 在启动时尝试 npm registry 版本查询（node_modules/next/dist/server/dev/hot-reloader-shared-utils.js:33）；该尝试已被阻断，发生在首个 session/PG/gate 查询之前。后续连接只有本次 PG Unix socket，没有成功的外部连接、模型/OCR或云操作。没有修改 Next 依赖来隐藏此框架行为。证据 `/tmp/orbit-w1-gate-final-cold-audit.json`、`/tmp/orbit-w1-gate-http-final-cold.json`、`/tmp/orbit-w1-gate-runtime-network.ndjson`，业务源码 SHA256 留在 `/tmp/orbit-w1-gate-runtime-source-sha256.txt`。


## 冻结、回归与交接

8 个代码/测试文件已由 Luna 冻结；Astra 独立复核最终 4 个业务文件 SHA256 与真实 Next 最后运行时完全一致。批准路径共 9 个，包括本文档；Next dev 自动生成的 next-env.d.ts 已恢复，无依赖、auth/resolver、API、schema、W4 Provider、W5 action 或其他业务文件改动。

- 独立既有回归 76/76：profile actor reader、真实 PG parity、CAS/save conflicts、onboarding policy、private birth date、live store、canonical actor、editor failure/readback 和 API proxy boundary；真实 PG 开启，0 skip。
- 独立 proxy/continue/maintenance 33/33，helper 默认真实 PG composition 与失败矩阵 6/6，共 **115/115，0 failure、0 skip**。继续页测试执行提取后的真实 helper，仅其依赖可替换，没有复制实现当替身；proxy 测试分别计数动态模块加载与读取调用。
- app tsc 与 full tsc 均通过；git diff --check 通过。Luna 另跑 proxy 9、navigation 22、maintenance 2、access 6 与 full tsc，全部通过。
- 原基线真实 HTTP RED、完整真实 Next/PG/Chromium 取证及其 24 组运行断言通过；最终冷启动另有 8 组 HTTP 与网络来源/时序检查通过。真实服务已停止，未 push/deploy；本地数据库在所有测试结束后由本任务停止。

回归日志 `/tmp/orbit-w1-gate-root-regression.log`、`/tmp/orbit-w1-gate-root-navigation.log`、`/tmp/orbit-w1-gate-root-access.log`、`/tmp/orbit-w1-gate-root-typecheck-app.log`、`/tmp/orbit-w1-gate-root-typecheck-full.log`；最终图谱使用本树专属索引 force/index-only 重建，并保存 scope all 与 compare baseline 的完整原始输出到 `/tmp/orbit-w1-gate-detect-all.json` 和 `/tmp/orbit-w1-gate-detect-compare.json`。逐项核对原始 changed_symbols ID 非空唯一、无 partial/truncated、9 个 git 路径与 mapped filePath 完全相等后才提交；固定提交 SHA 和图谱计数随最终交接记录。

主验可使用 `/tmp/orbit-w1-gate-repro/README.md` 中的参数化 seed/server/HTTP/browser 脚本，在主任务自己的独立 app 工作树、Unix PG socket、host/port 和输出目录重跑；不接管本任务端口或数据库。脚本不输出 secret/cookie 正文，清理仅作用于该次生成的测试 schema。主仍需在自己的集成提交上独立验证，本文不宣称主验或跨端全能力策略完成。
