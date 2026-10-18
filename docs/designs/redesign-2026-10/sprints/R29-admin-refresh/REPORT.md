# Sprint R29 — 运营后台换新 REPORT

**执行线：** A 线 `redesign-a`，开工 `bd39989dd3171ce3ff39f71c86db565f9bfb0eea`（已含 R31a/R31b）；代码提交 `9c8a21422`（App）、`5b69c6133`（Web）、`460a8924c`（App 离线文案）、`b212e189b`（恢复上游账号文案配额），已 rebase 到 `origin/redesign@382265a47`；仅本地提交，不推送。**验收状态：部分。** 两端全量均已执行，但有既有/他线失败；原生登录链与活动详情未通过，不能记 Sprint 全部通过。

## 交付范围与决定

- Web 六个既有路由与 App 五个既有路由改用 R31b/R31a 组件和本屏 ja/zh/en 文案；Web 后台局部壳的桌面按钮、手机分段及退出入口已接入，普通 Orbit2026Shell 未改。
- `/app/admin/access`、`/app/login-admin` 与 App `/admin/access`、`/login-admin` 保持公开入口。App `/admin/access` 改挂登录屏，未登录时不装载后台的 events/profile/dashboard 资源；登录 CTA 仍走既有账号登录和安全返回地址。
- 后台四项事件数（全部、进行中、即将开始、已结束）只取当前账号事件。Web platform 保持 provider unavailable；App platform 将公开活动称为公开目录，不表示平台审核、管理员角色或批准动作。App 继续读取原有 events/profile/dashboard；隐藏与后台没有可信对应关系的指标。
- Web read-cost 保持原 API、授权守卫、UTC 统计与抽样放大口径；缺 runtime 和汇总读取异常显示可重试故障态，确无记录才显示空态。
- R29 无对应设计画板；重查 `web.html`、`app.html`、`b7-account-misc.html` 与 `b12-missing-states.html` 的 `--list`，未发现本组画板。以下全部截图标记为**「设计稿无，附截图，不进门禁」**，不填像素 raw / 归因通过。

**本线工程决定：** read-cost 重试使用保留所选 `route` 的 GET 表单，不改 API；App 继续请求既有 dashboard 汇总以保持读边界，但页面统计只展示活动来源计数；Web 活动行在新 `ListRow` 内继续用原 `EventCover` 渐进图片，避免把真实封面退化成字母头像。暂无新增产品决策冲突。

## SC 逐项结果

| SC | 当前结果 | 证据与未完项 |
| --- | --- | --- |
| 01 基线/依赖 | 已记录，基线仍有失败 | R31a/R31b 在开工 HEAD，两端组件出口已核；rebase 后 R31a REPORT 把 SC-03 收敛为 43/44 自动通过与 1 张人工例外，SC-08 仍部分通过，本线不代报上游全量门禁通过。开工排队的 Web 全量实际在编辑后执行，7535 项中 7 项失败；5 项同 R31b 跨域基线，2 项 R29 旧审计断言和行号已修并在 rebase 后定向 2/2 通过。R31a REPORT 记录 App 基线。 |
| 02 W01/W02 登录 | 已验证核心链 | 公开页 200，CTA 目标均 `/app/account/login?next=/app/admin`；浏览器未登录网络记录无私有请求。安全返回由既有路由测试保护；前后各 12 图。 |
| 03 W03 仪表盘 | 已验证核心链 | QA 本机账号见 13 条来源事件，列表 13 条；只读边界可见。空/失败来自既有 route-state；前后各 6 图及空/失败 2 图。 |
| 04 W04 活动 | 已验证核心链 | 仪表盘切活动、打开首条详情、返回活动页；只读标签不升级为筛选。前后各 6 图及空/失败 2 图。 |
| 05 W05 读取量 | 已验证核心链 | 同账号、固定 `2026-09-27T12:00:00Z`、同 `GET /app/agent` 参数的改前/后 DOM：7 天、Top 20 路由、6 账号、30 趋势点、3 报警逐项一致；前后各 6 图及真空、缺 runtime、读取异常、非授权图。API 403/503、未登录跳转及页面 404 已核。本机 PostgreSQL read-cost 集成 9/9 通过。 |
| 06 W06 平台 | 已验证核心链 | 普通账号见 provider unavailable 与 `/app` 恢复链接，无虚构审核队列；前后各 6 图。 |
| 07 A01/A02 登录 | 部分 | 公开 access 已不装载私有屏；登录屏走原账号登录 CTA。模拟器有浅深两页与未登录视觉 fixture，渲染测试的 guest 请求列表为空；真实原生退出→重新登录链待核。 |
| 08 A03 仪表盘 | 已验证本屏链 | 真模拟器见 13 来源事件与 13 列表、浅深；空/失败/离线视觉 fixture 均已核验。A04 返回 A03 后原生下拉刷新，代理记录新的 events/profile/dashboard GET；见 `app/native-navigation.json` 与 `native-api-proxy-final.log`。 |
| 09 A04 活动 | 部分 | 与 A03 共用来源事件读模型，模拟器列表 13 条及浅深/空态图已拍。原生 A03→A04、点击第一条、从详情返回 A04、再回 A03 均可操作（`app/native-nav-*.png`）。但现有 overview API 返回 404，详情显示「このイベントは見つかりません」；同账号 13 条列表 ID 的 overview 均为 404（`app/event-detail-probe.json`）。开工版 view-model 也用同一 href，属既有本机数据/详情服务断层；不能把“详情打开”记通过。 |
| 10 A05 平台 | 部分 | 公开活动来源文案及无审核动作由测试验证；总数与列表均包含历史活动，不再因旧 8 条截断或结束态过滤而失配；浅深/空/失败/离线图有效，离线文案已改为公开活动并补拍。 |
| 11 权限/契约 | 部分 | Web read-cost 页面非授权 404、API 403，运行故障 503；Web platform 封闭，App guest 渲染请求列表为空。无新 schema/API/同步字段；App 未登录原生网络检查待补。 |
| 12 新组件与壳 | 已验证核心链 | Web Scope/CSS Module/UI、App `inset="kit"`/UI；Web 桌面及 390 导航与退出到 `/app/home` 实测。封面图恢复后 W03/W04 在 260 CSS px（390 宽、150% 大字等效）复测均为 `scrollWidth=innerWidth=260`；截图索引已齐。 |
| 13 无画板截图 | 已完成截图，不进像素门禁 | Web 36 张新版 + 36 张旧版、W03/W04/W05 异常态已拍，索引无错误/溢出；W03/W04 大字另拍。App 10 张新版 + 10 张旧版、9 张异常态均已核验，后两张重拍替换了加载帧和错误离线文案；`comparison.html` 列 46 组前后图。全部标记「设计稿无，附截图，不进门禁」，没有像素通过记录。 |
| 14 清单/全量 | 部分 | App 本组三屏 Ionicons 3 行、旧 UI 3 行、硬编码 5 行；Web 本组硬编码 7 行均从清单删除。第二次 rebase 曾把非本线 `AccountAuthScreen` 配额保留为 3，远端与源码均已降为 1；已按远端值修正，清单最新 20/20 通过，最终相对远端差异仅有本屏行。App `admin` 已追加到 copy:qa 范围和组件类型表。App 后台模型/源 18/18、最新离线读审计 26/26、Web 最新定向 15/15、R29 审计 2/2、两端最新 typecheck 与 Web lint 通过；Web 全量 7535 项中 6539 通过、989 跳过、7 失败（2 项 R29 旧审计已修且定向复测通过，5 项既有跨域失败）。App 全量 3158 项中 3144 通过、2 跳过、12 失败，本组 admin/platform 测试通过，失败明细见下节。最新 copy:qa 为 7211 文案、218 项既有跨域问题，admin 域 0 项，工具仍非零。 |
| 15 交接/收口 | 部分 | 下节给 Bridge 与 R17-15 原文；代码提交已 rebase，REPORT 为本次最后提交。独立复核由主会话执行，本线未代报通过。 |

## 截图与数据证据

证据根目录：`/Volumes/ORICO/Dev/line-a-evidence/R29/`（`~/orbit-sprint-evidence/redesign/R29/run-01` 指向同一目录）。截图均为本机数据/状态，无生产连接。Web `web/index.json` 与 `web-before/index.json` 各有 36 张：W01 `/app/login-admin`、W02 `/app/admin/access`、W03 `/app/admin`、W04 `/app/admin/events`、W05 `/app/admin/read-cost`、W06 `/app/platform`，每页 `1440/1024/390 × light/dark`，文件名分别为 `web/{Wxx}-{width}-{theme}.png` 与 `web-before/{Wxx}-{width}-{theme}.png`。两套索引逐项 HTTP 200、无横向溢出；同一 QA 账号、本地来源数据、路由、en cookie、viewport 与主题。W03/W04 旧版有内部滚动，新版为页面滚动，截图可见范围因此不同；它们不作为像素门禁。App `app/index.json` 与 `app-before/index.json` 各有 A01–A05 浅深 10 图；新版 iOS 模拟器运行于本机已登录 QA 会话，旧版借同一会话与数据临时还原对应源码采集，随后恢复。旧版部分屏硬编码中文，即使系统为 ja，也无法取得与新版相同的显示语言；对照页 `comparison.html` 明示这是文案行为差异，不能作逐像素比较。App `app/states-index.json` 另列未登录、空、故障、离线视觉 fixture 9 图，不代表真实退出或网络断开。

W05 固定数据同语言前后为 `web/W05-before-fixed-1440-light.png`、`web/W05-after-fixed-1440-en-light.png`；`web/W05-reconciliation-en.json` 的 days/routes/accounts/alerts/trend 均为 `true`，7 天、20 路由、6 账号、3 报警、30 趋势点。旧图与新图均用 en、同一 QA 账号、固定 `2026-09-27T12:00:00Z` 及 `GET /app/agent`；API 固定数据只用于本机临时验证，正式源码已恢复实时日期。异常态索引 `web/W05-final-states-index.json` 有真空、缺 runtime、读取异常；未授权图 `web/W05-unauthorized-390-light.png`。W03/W04 空与失败图见 `web/admin-route-states-index.json`，均由临时视觉 fixture 生成并已恢复源码。当日真实本机读模型有 7 天、0 Top 路由、0 Top 账号、0 趋势点与 3 报警；页面据实显示，不能用这轮实时数据替代固定数据逐项对账。

## 验证摘要

| 检查 | 结果与证据 |
| --- | --- |
| Web 页面/权限/导航 | `web/probe.json`、`web/navigation.json`、`web/shell-check.json`、`web/language-check.json`；公开入口私有请求 0，W03/W04 13 来源事件，桌面/390 壳导航与退出可用，ja/zh/en 三种标题均 200 且按 cookie 正确切换。 |
| Web 定向 | `web-targeted-final.log` 16/16；`web-auth-targeted.log` 13/13；`web-cover-after-fix.log` 4/4；read-cost API 本机 401/403/503 情形实测。 |
| Web 类型/静态 | 最新 `origin/redesign@382265a47` rebase 后 `web-typecheck-latest-rebase-retry.log` 与 `web-lint-latest-rebase-retry.log` 均 exit 0；此前 `web-typecheck-app-final.log` exit 0。`web-copy-qa-latest-rebase.log` 检查 7211 项、218 项既有跨域问题、admin 0，工具 exit 1。 |
| App 定向 | 最新 `app-focused-latest-rebase.log` 18/18、`app-ratchet-latest-rebase-fixed.log` 20/20、`app-offline-inventory-latest-rebase.log` 26/26；此前 `app-auth-route-targeted.log` 17/17。最新 rebase 后 `app-typecheck-latest-rebase.log` exit 0。 |
| Web 全量 | `web-baseline-test.log`：7535 项、6539 通过、989 跳过、7 失败。R29 相关两项是后台登录页导入新 UI 后旧源清单断言、后台局部壳旧 `file:line` 审计证据；对应 R29 记录已修，`web-audit-r29-rebased.log` 定向 2/2 通过。另 5 项为 R31b 所记跨域同名基线失败（产品清单、联系人合并、dev fixture、名片扫描两项）。 |
| read-cost 本机 PostgreSQL | `read-cost-pg-final.log` 9/9 通过；启动脚本只接受 `localhost`/`127.0.0.1` 且数据库名为 `orbit_line_a`，未连接 Neon。首次尝试在共享负载下迁移超时，这轮恢复后进入断言并全部通过。 |
| App 全量 | `app-full-final.log`：3158 项、3144 通过、2 跳过、12 失败。9 项 `add-contact-screens` 相机/批量与 1 项 `i18n-domain-split` 计数和 R31a 已记基线同名；1 项 `invite-code-screens` S1 被 Toast 拦截点击、属于 R31a 已记负载超时类；1 项 `compute-sync` 是 rebase 后他线 `secretary-source.ts:20/26` 的 `Date.parse` 审计失败，需该文件归属线修正。本组 admin/platform 渲染测试在全量中通过。不能称全量通过或零失败。 |
| 视觉/布局 | W03/W04 390 与 260 CSS px 无水平溢出，W05 固定数据及 A01/A03/A05 实图已人工检查；Web 完整索引与 App 前后主状态、9 张异常态索引已生成并核验。`app/native-nav-*.png` 记录原生 A03/A04 与详情 404 后返回。 |

首次本地 PostgreSQL read-cost 集成测试在建库迁移期间因共享负载触及 `statement_timeout=20s`，9 项均未进入断言；串行重跑已 9/9 通过。Web 全量命令虽在开工排队，实际执行在编辑后，因此只作本轮结果，不冒称无改动基线。

**资源检查点：** 第二次 rebase 后 App/Web 类型检查及 Web lint 均通过。共享原生任务使内置盘一度降至 3.7 GiB，本线撤销未启动的排队任务并关闭自己的服务；空间恢复后重启服务，完成原生返回/刷新、PostgreSQL 9/9 和 App 全量一次，再次关闭自己启动的服务并恢复共享模拟器原 Metro 地址。取消与未执行均不记通过。

## Bridge 与后续请求

**本端版本：** Web `5b69c6133`、App `9c8a21422` + `460a8924c` + `b212e189b`，基于 `origin/redesign@382265a47`；REPORT 提交号另记。**另一端影响：** Web/App 公开后台入口、当前账号活动来源与 platform 文案一致；Web 独有 read-cost 保持其 API 与授权；没有共享 schema、DTO、同步副本或普通壳变更。本机 13 条账号事件可在两端来源列表看到，但 App 详情 overview API 对同组 ID 均返回 404，需活动详情服务归属线核对来源 ID 映射，不在 R29 改 API。**未完成：** 未登录原生操作链、活动详情来源断层、`compute-sync` 他线审计失败、主会话独立复核及生产发布验收。**验证范围：** 本机 QA 账号、localhost Web 3210、本机 iOS 模拟器与本地数据库；Web 写→App 回读、App 写→Web 回读不适用（本 Sprint 只读）；未连接 Neon 或部署。

请主会话按 `bridge/templates/handoff.md` 协调更新 Bridge 台账，保留上述四栏与本地/发布边界；按 R29-01 更新 HANDOFF 与 DEFERRED-A。本线无通用组件或 D 线普通壳改动请求。

**文档交接：** `repos/orbit-app/README.md` 仍把 platform 写成从 profile/dashboard 推导审核统计，并把 `/admin/access` 写成读取后台资源的入口；本线按 §1 不改主会话所有的 README，请同步为本轮实际只读/公开目录口径。`repos/orbit-app/docs/designs/2026-09-08-app-wide-style/README.md` 的 `/admin/access` → `AdminScreen (access)` 是当时视觉覆盖快照；其 5/5 结构测试仍通过，建议主会话在当前状态文档注明 R29 的登录屏映射，不改写历史原始证据。

**R17-15 转出原文：** 公开主催页「通報する」仍缺公开反馈表单、服务端存储、滥用防护与运营处理流程。承接人 A 线 Claude；R29 后另开独立反馈功能 Sprint，主会话负责排期并更新 HANDOFF / DEFERRED-A。R17-15 保持未完成，本次不修改 `/o/[slug]` 或把表单塞入需登录后台。

**授权边界：** Neon、生产迁移/部署/变量、TestFlight/真机分发均未执行；若后续需要，记 DEFERRED「待用户授权」。本 Sprint 实际付费 AI 调用 0。没有 PR、push、GitNexus 或像素门禁伪记录。

**待主会话决定：** 本轮没有新增产品口径冲突；§2 的 A-1～A-6 已由主会话预先代定。请主会话独立复核 R29 的权限、原生操作链和截图，并决定是否接受既有全量失败作为本次验收例外；`compute-sync` 新出现的他线审计失败需秘书功能归属线修正，不能列作既有例外。活动 ID 与详情 overview API 的 404 也需归属线查明。R17-15 的独立反馈 Sprint 排期及 README / Bridge / HANDOFF / DEFERRED-A 台账更新仍由主会话办理；本线不代报这些事项完成。
