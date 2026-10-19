# R18b 执行记录（进行中；不是收口报告）

2026-10-19 RD-33 主会话代定：`preflight-checklist.md` 已补的公开帮助 / 法务、404、维护和 App 强制更新画板及预检记录获准作 UI 实施依据；b12 末尾补画已有「主会话代定」注释，并补记本次认可范围。此批准**不是**交互、像素或发布门禁通过，Web 新版浮条及 b1 其他认证 / 欢迎冲突仍照原停点处理。b1 #9 原画板的「英字と数字を含む」「以前と異なるパスワード」两条没有服务端 / App 支撑的实时勾选已原地删除并注释，只留下真实的「8文字以上」，未加新密码策略。删除前聚焦断言预期红、删除后绿；同板 `board-preflight.mjs --design b1-onboarding-cards.html --board-index 9` 重跑 exit 0：1 块、近似 token 0、自洽提示 0、疑似无功能 0，7 项缺 token 中含模拟机外框与字距，仍须按既有 token/kit 归属核对；深色与邮箱 / 自动登录等独立冲突仍 OPEN。此轮不跑两端全量，按用户要求留收口时执行。

2026-10-19 04:22 补充：C 线在干净检查点无冲突 rebase 到 `origin/redesign d8e6dafb7`，R18a 独立复核四补丁的新提交及目标验证见其 REPORT。此处没有新增 R18b UI：b12 公开页／认证／404／维护／更新草案仍待主会话设计认可。新源 App `typecheck`、Web `typecheck:app` exit0；C Web invite/route 17 pass、14 个未配置 PG 的预期 skip，App Metro/sync 54/54。这些不替代 R18b 全量、真实认证链、像素门禁或设计批准。

2026-10-18，C 线 `line-c`。本 Sprint 的入口、认证、帮助、异常与像素验收均未收口；以下只记录已验证的独立工作项，避免把局部测试误写成 SC 全通过。不推送、不触碰生产环境。

2026-10-19 01:34 检查点：三份公开页 / 异常态画板草案以 `88424a08f` 单独提交，仍待主会话设计认可。C 线随后把 62 个提交无冲突 rebase 到 `origin/redesign` 的 `6ea769085`，再接入隔离原生重试报告；重试交接点 `715a8478a` 干净，ahead 63 / behind 0，`git diff --check` exit 0。该代码的 Web `typecheck:app` 和 App `typecheck` 均 exit 0；rebase 后 Web 版本接口 / 认证服务 / FAQ 目标测试 17/17，App 版本策略 / 读取 / FAQ / 认证 view-model 15/15。全量测试没有因 rebase 重跑，旧全量红色结果仍在下文。R18a 报告已写清 Metro `load-native` 阻断、非已证实的签名故障，原生 SC03–06 / 像素留待 DEFERRED；R18b 继续，不能据此关闭任何 UI 门禁。主会话需把 R18a DEFERRED 文案转入中央清单。

2026-10-19 02:11 检查点：主线上游接入 D 至 `2b95b1ac1` 后，C 在干净树上重新 rebase 65 个提交，现 `79d7ef01f`，ahead 65 / behind 0，`git diff --check` exit 0。四处冲突按来源合并：契约导出保留 D 的 Todo / calendar 与 C 的 account；三语注册同时保留 Todo 和 me；离线读取面删除已退役的旧 Profile 路径，保留新 me 与 D 的 Task / Todo 路径；live 能力和 503 路由清单同时纳入 D 与 C 条目。Web 版本 / live 路由 / 认证 / FAQ 目标组 **35/35**，App 契约 / 版本 / account / 离线读取面 **39/39**。全量不在此时重跑；两端 typecheck 因本机内置盘降至约 4.1 GiB 暂缓，不能借用上一个上游的通过记录。R18a 原生重试报告已随 C 线保留（现 `3143ad390`），Metro `load-native` 阻断与设计认可门禁不变。

2026-10-19 02:18 检查点：B 线 R11b 接入 `origin/redesign bf1aac746` 后，C 再从干净树 rebase；重复的页面清单文档提交被 Git 自动略去，现 C ahead 65 / behind 0。冲突中同时保留 B 的 `networkAnalysis` 与 C 的 `me` 三语／copy-qa 注册及 live 能力；离线页面清单由仓库生成器重建为 **121 条**，对应测试通过。最终上游的 Web 版本 / 合同路由 / FAQ **24/24**；App 契约及页面清单等 **13/14**，唯一失败是已有的拆分前字典固定键数锁（现 2902，固定值 2253），三语键集一致性本身通过。Web `typecheck:app` 在这次 B rebase 之前 exit0，不能算最终树验证；最终树 App `typecheck` 因同机 B / A2 并行检查使内存降到 5%、内置盘约 4.45 GiB，由本线主动中断 **exit130**，未通过也未失败于类型诊断。待资源恢复重跑，未重跑全量。

02:28 复验：同一 B+D 上游的 C 工作树中，App `npm run typecheck`、Web `npm run typecheck:app`、Web `npm run typecheck` 及 Web `npm run lint` 均重跑 **exit0**。前述 App exit130 保留为资源中断记录；Web 全范围检查在内置盘再跌到约 3.8 GiB 时已经自行完成，停止指令到达后返回的原命令状态仍为 exit0，并无类型诊断。两端完整套件未在这次 rebase 后重跑；不能据此关闭 SC-16。

02:38 补核 D 已合入的 App 根壳：`root-shell-auth-render`、认证 view-model、初始路由、me 路由与全 App 路由登记共 **30/30 pass**。其中根壳用例确认会话未成立时不挂底栏及底栏高度 Toast；邀请与重置入口的安全回跳仍通过。它是 C+D 合并后的源码／渲染目标回归，不包含真实注销→登录操作或原生像素，SC-15 仍未收口。

02:45 上游 R13 秘书预览契约 `306f32224` 到达后，C 在干净树上无冲突 rebase 69 个提交；Web 秘书预览契约／接口与版本接口目标测试 **8/8**、App 契约 fixture **3/3**，Web `typecheck:app` / `typecheck` / `lint` 和 App `typecheck` 均 exit 0，`git diff --check` 无告警。未重跑完整套件，R18b 设计认可、UI 操作链、像素和 SC-16 仍未收口；未推送。

## 当前检查点

| SC | 状态 | 实际证据 / 未完依赖 |
| --- | --- | --- |
| SC-01 开工 / 预检 | 部分完成 | C 线已确认 R18a 设置占位存在；b1 #0–#9/#60 与 b7 #52–#61/#75/#82 的标题、类型、尺寸已列出。原稿 23 块自动预检的自洽提示均为 0。按 PLANNER §2 已就地修 b1 #0 / #1 的目标数和 b7 12 块帮助、反馈、404、维护、更新画板的虚构承诺，改后两组重跑均为 0 项数值不自洽。b12 末尾新增公开帮助 / 法务、公开 / 已登录 404、维护未知 / 有效时刻、App 强制更新与 Web 新版浮条草案：Web 1440 / 1024 / 390、App phone，已补画处各浅 / 深。W/A-11 的 29 块代表、404 的 14 块、维护的 16 块、强制更新的 2 块与新版浮条的 6 块自动预检均近似 token 0、自洽提示 0；缺 token 均为模拟设备 / 外框 / kit 值，窄屏 / 桌面截图已核。草案需主会话复核认可；其余 b12 断点 / 中途态、全量逐元素映射、五项通过与独立草案提交已完成，设计认可仍未完成；任何 UI 门禁未过。详见 `preflight-checklist.md` 与 `_evidence-c/R18b/run-01/preflight-{public-v2,404,maintenance,force-update-final,web-version-final}*`。 |
| SC-02 Web 落地 | 会话路由切片已实现，Sprint 验收未收口 | 已登录打开 `/` 会先 307 到 `/app/home`；`/app` 页面本身也以首页为目标，但未完成资料的账号先被全局资料门禁送至 `/app/profile/onboarding?next=%2Fapp`，不能笼统称两条路径始终同去首页。未登录仍显示既有落地页。路由源码断言先红后绿，`app-home-live-route-services.test.ts` 16/16、`smoke.test.tsx` 1/1；本机模拟模式匿名 `/`、`/app` 均 HTTP 200 且 HTML 含落地页标记，进程内假账号的上述登录态跳转也已实走。资料完整账号、新 b1 视觉、弹层与全尺寸门禁尚未验证。 |
| SC-11 live 版本接口 | 服务端切片已实现，Sprint 验收未收口 | `GET /api/app/version` 已从 `account-lifecycle` 分出独立 `app-version` live 能力；mock 仍读演示世界，exports / deletion 的 live 仍返回 `NOT_IMPLEMENTED`。服务端环境变量读取合法 semver；缺失、非法或颠倒的版本范围会关闭强制更新并记服务端诊断。仅 `maintenance.active` 显式 true 才返回维护，非法 `until` 不透出；`webBuildId` 只取合法 `VERCEL_GIT_COMMIT_SHA`。响应沿用 no-store 信封，不建表。新增可选字段已同步 App，契约快照已重生。相关 Web 路由 / 契约 34/34、App 同步 / fixture 6/6；当前树 Web / App typecheck 与 Web lint exit 0。当前 C 树本地匿名 HTTP 200 / no-store 已实走；最新 Web 全量明确指定本机测试库后为 7,482 项、11 失败、529 skip，旧的 33 失败是未配置测试库的另一种运行条件，不是 22 项产品修复；具体新增 PostgreSQL 失败见下。最新 App 全量 exit 1，11 fail / 1 cancelled，原两项 C 清单审计与认证提示语言回归均通过，不能宣称全量绿。 |
| SC-09 FAQ / 联系 | 配置 / 两端搜索规则切片已实现，Sprint 验收未收口 | `shared/config/support.ts` 设 `supportEmail: null`，先红后绿的配置单测 1/1；Web 与 App 各自的本地 FAQ 过滤规则均先红后绿 3/3（空查询、问答 / 关键词匹配、无结果），未放入待认可文案。两端页面与输入 / 空态操作链、真实邮箱操作仍未实现。 |
| SC-06 深链 / 邀请 | 既有安全路径回归通过，Sprint 验收未收口 | Web `app-auth-routing` / `invite-codes-return-path` 9/9；App `account-auth-view-model` / `initial-route` 22/22。站内 `next` 白名单、外域 / 协议相对路径回退及 `/i/<code>` 保留已获测试证据；新认证 UI 实走与注册后完整链仍待。 |
| SC-07 Google mobile broker | App 注册页成功回跳缺陷已修，Sprint 验收未收口 | 注册页 Google 成功原误走邮箱注册的「回登录」规则，测试先红（15/16，实际 `/account/login?created=1&email=…`），改为与 Google 登录同走 `/profile/onboarding?next=…` 后认证交互 16/16；App 路由 / broker 相关目标测试 34/34、Web 服务 / 路由 / 加密目标测试 24/24，App typecheck exit 0。取消、错误与安全 `next` 既有目标回归通过；真实 Google 授权、原生模拟器成功 / 取消及新 UI 画板尚未验收。 |
| SC-05 重置与邮件 | HTTP / 本机真实库回归通过，Sprint 验收未收口 | `password-reset.test.ts` 的 HTTP 目标组覆盖同源 / 无 Origin、非法正文、未配置、无效 token、错误脱敏、no-store / no-referrer；UTF-8 多字节超过 4096 字节时须在服务前返回 413。伪造短 `Content-Length` 的分块上传原会读完整个 16 块才拒绝，改为超过 4096 字节即取消后回归通过。当前目标文件在明确指定 `127.0.0.1:5432/orbit_line_c_test` 后 **46/46 pass、0 skip**，含持久化 / 重试 / 单次消费 / 旧会话撤销，随机隔离 schema 残留 0。Web typecheck / lint exit 0；全量新增测试通过但套件仍红。新 UI、实际邮件投递与完整回跳仍未验收，不写全通过。 |
| SC-03 注册枚举差异 | 服务与本地库 HTTP 回执回归通过，Sprint 验收未收口 | `auth-user-service.test.ts` 11/11：注册重复邮箱明确 `AUTH_EMAIL_TAKEN`，登录未知邮箱与错误密码同为泛化错误；新注册拒绝超过 72 UTF-8 字节的密码，避免 bcrypt 静默截断。隔离本地库的密码找回测试新增密码账号 / 未注册邮箱 / 仅 OAuth 账号经真实服务与 HTTP handler 的回执等价断言，目标组 1/1；既有超长密码账号兼容策略与新 Web / App 表单仍须处理。 |
| SC-12 版本策略 | 判定 / 读取切片已实现，Sprint 验收未收口 | App 纯判定覆盖开关缺省 / 关 / 开、低于 / 等于最低、网络不可用、非法配置、维护显式信号与有效 / 无效 until；公开路由读取覆盖成功、503、断网。补测并修复「维护显式开启、最新版本配置缺失」时维护信号被版本校验遮蔽；两组目标测试现为 6/6，App `npm run typecheck` exit 0。Web 新版浮条的双构建 ID 身份比较和按目标构建 ID 关闭判定先红后绿 2/2；不按 SHA 大小排序，关闭后同一构建不再显示。App 强制更新、Web 新版浮条各尺寸 / 主题画板草案已补，尚待认可；启动接线、关闭状态存储、强制更新页实现、Web 浮条呈现仍未做。App 根布局归 D 线，C 线的 `app/index.tsx` 只在根入口渲染，不能用它代替覆盖深链的全局门禁；须与 D 线就根布局挂载点单独交接。D 线底栏已有独立提交但尚未合入 C，见下。 |
| SC-04、08、10、13～16 | 未完成 | 认证、公开页、帮助、404、旧屏清理、D 线底栏集成与 Web 浮条、逐像素矩阵、两端全量及独立复核均尚未交付。SC-02 / 03 / 05～07 已有上列局部证据，但各自操作链仍未收口。 |

## 版本配置与安全边界

- `ORBIT_APP_MIN_SUPPORTED_VERSION`、`ORBIT_APP_LATEST_VERSION`：服务端 semver。各字段缺失 / 非法时各自返回 `0.0.0` 作为安全兜底；未配置最新版本不会虚报有新版本，绝不用演示世界的 `1.0.0` / `1.2.0` 假装 live。
- `ORBIT_APP_ENFORCE_MINIMUM=true`：只有两个版本都合法且最小版本不高于最新版本时，响应才返回 `enforceMinimum: true`；否则返回 false 并记诊断。正式发布前保持未配置 / 关闭；此处没有写生产变量。
- `ORBIT_APP_MAINTENANCE_ACTIVE=true`：才返回 `{active:true}`；`ORBIT_APP_MAINTENANCE_UNTIL` 只有合法时间才附上。普通 503、断网与此无关。
- `VERCEL_GIT_COMMIT_SHA`：合法 Git SHA 才作为 `webBuildId`；它是相等 / 不等标识，不作字典序版本比较。前端新版浮条尚未实现。

## 本轮验证与诊断

版本路由新测试 `tests/api/app-version-route.test.ts` 初跑因 live 未注册返回 503，3/3 预期红；接线后 3/3 绿。随后补入「latest 缺失或低于 minimum 不可强制」和「缺 latest 不虚报新版本」断言，各自先红后绿。原 `redesign-contract-routes` 测试先如预期因 app/version 不再 503 失败，更新既有能力清单后通过。集中运行 `app-version-route`、`redesign-contract-routes`、`demo-world-consistency`、`contract-append-only`、`redesign-schema-parity` 合计 34/34 通过；最后的版本微调又重跑版本 / 路由 21/21。App `contract-sync` / `contract-fixtures-parse` 6/6 通过，`git diff --check` 无问题。

2026-10-19 复核同一版本接口 / 契约组 Web 34/34、App 同步 / fixture 6/6，两端 typecheck 与 Web lint exit 0；服务端 live、契约快照和 App 同步副本按 11 条确定路径提交为 `27ed82e2d`，`git show --stat` 已核未夹带 App 启动判定、FAQ 或画板文件。该提交不代表版本门禁已挂根布局，也未推送。最新 Web 全量与跨线日期 fixture 结果见下，SC-16 仍红。

独立新增的支持配置测试初跑因模块缺失失败，补入 `supportEmail: null` 后 1/1 通过。App 版本策略 / 读取两组测试均先红（模块缺失）后绿，合计 5/5；其中真实 `OrbitApiClient` 对 503 和 `fetch` 抛错均返回可放行诊断。App 新代码之后 `npm run typecheck` exit 0；Web 在支持配置加入后再跑 `npm run typecheck` exit 0。两端全量均已按公平重任务队列排队，尚无结果。它们是底层切片，不是 App 启动链或 UI 验收。

随后补了非法日历日期 `2026-02-31` 回归：服务端 / App 测试先各失败一次（原实现依赖会顺延日期的 `Date.parse`），改用现有 Zod 日期约束后两端目标测试各 3/3 通过，非法恢复时刻不再透出。App 还补测可选开关 / 维护信号类型错误，先红后绿；两组版本测试合计仍为 5/5。修正后 App 与 Web typecheck 均再跑 exit 0；最后一次 App 可选字段微调后再跑 App typecheck exit 0，Web lint exit 0。

2026-10-19 再验 App 版本判定、公开接口读取与离线清单审计三组测试，合计 28/28 通过；App typecheck exit 0，改动路径的 `git diff --check` 与暂存检查均无问题。判定 / 读取 / endpoint 登记 / 不落离线镜像这 7 条路径已按路径提交 `0678911d4`，`git show --stat` 核对无画板或未完成 UI 文件。此提交只交 SC-12 底层切片；根布局门禁、强制更新页、Web 浮条及完整验收仍未完成，未推送。

不改代码的既有安全回归：Web `app-auth-routing` / `invite-codes-return-path` 9/9，App `account-auth-view-model` / `initial-route` 22/22；密码恢复 HTTP 目标组 39/39。该批回归尚未覆盖真实库，故随后另做下列隔离库验证；新界面端到端仍未做。

随后在确认为本机的 PostgreSQL `orbit_line_c_test` 上，仅运行 `password-reset.test.ts` 的真实库目标用例 1/1 通过（约 2.9 秒）：随机临时 schema 内核对令牌持久化、不把明文写入记录、投递重试、并发单次消费、密码替换、旧会话撤销、31 分钟过期和被后续请求取代。测试 finally 清理后直接查询 `information_schema.schemata`，`password_reset_%` 残留数为 0。此为本地存储边界，不是线上 SMTP / OAuth 或新 UI 操作链。

续跑既有 `auth-user-service.test.ts` 10/10：注册重复邮箱可辨 `AUTH_EMAIL_TAKEN`，登录未知邮箱与错误密码给相同泛化错误。其后在 `password-reset.test.ts` 原有随机 schema / 本地库测试中补充密码账号、未注册邮箱及仅 OAuth 账号的实际 `handlePasswordResetRequest` 回执比较：三者经真实 `createPasswordResetService` 均为 HTTP 202、`no-store` 且 JSON 信封完全相同。只指定本机 `127.0.0.1:5432/orbit_line_c_test`，最终目标组 1/1、Web typecheck exit 0，finally 清理后 `password_reset_%` schema 残留 0；没有真实邮件投递。此证据补足找回请求的 HTTP 枚举边界，不代替新 Web / App 表单的操作验收。

SC-07 的 App 注册页 Google 入口使用同一 broker，但成功后调用了邮箱注册共用的 `nextHrefForAccountAuthSubmit({ mode: "signup" })`，会把已经登录的 OAuth 用户送回 `/account/login?created=1&email=…`，而不是先完成资料再回安全 `next`。在真实 `AccountAuthScreen` 的浏览器交互测试中新增注册页场景，初跑 15/16、唯一失败的实际地址为 `/account/login?created=1&email=&next=%2Fevents%2Fevent-1%3Ftab%3Ddetails`；只把 Google 成功分支改用已有登录完成规则，保留邮箱注册原规则。复跑 16/16；App `mobile-auth` / `account-auth-view-model` / `mobile-route-access` 34/34、App typecheck exit 0；Web `mobile-auth-service` 8/8、`mobile-auth-routes` / `mobile-auth-crypto` 16/16。上述只证明本地 broker 与模拟边界，真实 Google 授权及原生成功 / 取消录像仍未跑，设计批准与像素门禁也仍未过。

续查请求体上限发现 HTTP 头以字节检查 4096，而读完整正文后的防伪造头兜底误用 JavaScript 字符数。测试以仅 2012 字符、实际 6012 UTF-8 字节的多字节 JSON 和伪造 `content-length: 2` 复现：原 handler 意外进入服务并返回 202（预期 413）；把兜底改为 `Buffer.byteLength(raw, "utf8")` 后，请求 / 确认两操作都在服务前拒绝。HTTP 目标组 39/39，明确本地库地址后整个 `password-reset.test.ts` 45/45，结束后临时 schema 0；Web typecheck / lint exit 0。此为请求大小边界修复，不改变找回枚举回执、令牌时效或实际邮件交付状态；该改动晚于首次 Web 全量，已纳入下文第二次全量复测。

SC-02 的根路径会话分流：先把 `app-home-live-route-services.test.ts` 改成要求 `/` 已登录显式跳 `/app/home`，预期红（15/16）；在 `app/page.tsx` 加 `redirect` 后 16/16 绿，匿名落地组件固定传 `authenticated={false}`。同步更新旧冒烟断言，Web `smoke.test.tsx` 1/1 绿；语言选择与安全回跳两组再跑 10/10。第一次冒烟命令误用 App 专属 preload、在加载前失败，已按 Web 脚本重跑，错误不算产品失败。随后在当前 C 树的独立 127.0.0.1:3410、本机 mock 模式且不配置数据库或 Google 凭据的 Next 开发服务中，对匿名 `GET /` 与 `GET /app` 实走：两者均 HTTP 200、HTML 均含 `data-orbit-real-page="landing-0918"`。首次启动默认同时监听局域网，立即停止且未请求；重启显式绑定 loopback 才执行上述检查。

同一 loopback mock 服务里又用临时内存注册的 `.test` 假账号走真实凭据回调：注册 201、回调 200、会话 200 且有账号 ID。首次诊断脚本把 Next 的相对 `Location` 误断为绝对 URL，并错误预期未完成资料的 `/app` 一定直达首页，故脚本 exit 1；其实际响应已表明 `/` 为 307→`/app/home`，`/app` 被资料门禁 307→`/app/profile/onboarding?next=%2Fapp`。对照 `proxy.ts` 的门禁范围与来源后，另用新内存假账号重跑并以准确响应断言，脚本 exit 0：`/` 307→`/app/home`，继续取 `/app/home` 307→`/app/profile/onboarding?next=%2Fapp%2Fhome`，直接取 `/app` 307→`/app/profile/onboarding?next=%2Fapp`。这是未完成资料账号的真实本机 HTTP 链，不证明资料完整账号会进入首页，也不证明新落地视觉或私有页面操作链。`profile-onboarding-access.server.ts` 在非 live 模式固定返回 `unavailable`，因此 mock 账号不能用于验证「资料完整→放行」；这需要另经授权的隔离本机 live fixture，不能借以前锁定旧源码 / 模拟器包的授权越界。验证后服务停止、3410 无监听，Next 自动改动的 `next-env.d.ts` / `tsconfig.json` 已恢复受跟踪原值。独立生成的忽略目录 `.next-line-c-r18b-route` 约 107 MB 仍保留，删除被工具安全策略拒绝，未绕过；假账号只在该进程内存中，关服后不保留。

2026-10-19 再跑当前 C 树的入口 / 首页目标文件，`app-home-live-route-services.test.ts` 与 `smoke.test.tsx` 合计 **17/17 pass**；Web typecheck / lint 同轮 exit 0，三条入口源码 / 测试路径 diff 检查无问题。根路径会话分流按路径提交 `0d9baba24`，`git show --stat` 核对未夹带其他页面或画板；未推送。此前 loopback 的未完成资料账号证据仍是此行为的操作链边界，不能把该提交算成资料完整用户或新设计稿画面的验收。

Web 浮条条件纯函数 `shouldShowWebVersionBanner` 的测试初跑因模块缺失失败，补实现后 1/1 通过：页面 / 接口缺任一构建 ID 不显示，相同不显示，不同即显示（即使新 SHA 字典序更小）。D 线壳挂载与关闭行为尚未实现；此结果不能当作 Web 浮条整体验收。

续补「关闭后同一目标构建不循环、目标构建改变可再提示」测试，先红后绿；浮条判定合计 2/2。当前只提供目标构建 ID 比较条件，实际关闭状态持久化仍属 D 线壳呈现工作。公开帮助草案 FAQ 的名片答案也已按 `ScanBatchScreen` 的可编辑 / 自动确认事实收窄，并在预检表新增 W/A-11 逐元素来源核对；仍待主会话设计认可。

该 FAQ 改稿后的 b12 自动预检第一次重跑在 Playwright 加载设计稿时 30 秒超时，未取得新结果（`_evidence-c/R18b/run-01/preflight-public-copy-check.log`）。旧 `preflight-public-final` 只对应改稿前草案；待共享浏览器负载下降后有界重试，未将本次失败写成通过。

复核 W/A-11 的已登录设置入口时发现草案顶栏仍显示「ログイン」。已在 b12 原有 40 块之后追加 W-R18b-11H/T/P-auth 的 Web 1440 / 1024 / 390 浅深变体（18 个视觉画框），顶栏动作标为「設定へ」；原 #548–#587 不移动。HTML 两段内联脚本可解析，浏览器列板确认新增 #588–#605 的标题、宽度与主题；390 帮助及 1440 条款草案截图已目视核对。随后 29 块浅色代表的 `preflight-public-v2.{json,md,log}` exit 0：近似 token 0、缺 token 86（均为画框 / 模拟设备 / kit 顶栏值）、数字不自洽 0、疑似无功能 15（均为本地 FAQ 搜索输入）。前一次加载超时仍保留失败日志。自动预检不代表五项人工预检、设计认可或 UI 验收。

404 的旧 b7 Web #59 带私有侧栏，无法直接用于未登录未知路由。已在 b12 尾部补 A-R18b-08 与 W-R18b-08 公开 / 已登录草案 #606–#619，Web 1440 / 1024 / 390 与 App phone 均有浅 / 深；公开 Web 无私有导航。修正了图标过小与 390 文案孤行，App、Web 公共 / 私有 390 截图已目视复核。14 块浅 / 深画板的 `preflight-404.{json,md}` / `preflight-404-dark.json` 均 exit 0：每组近似 token 0、缺 token 19（4 个 Web 画框阴影，15 个模拟手机外框值）、数字不自洽 0、疑似无功能 0。此为待主会话独立设计认可的草案；App 已登录 404 是否复用无底栏画框仍待确认，未知路由 UI 未实现。

`preflight-checklist.md` 已把 W/A-08 与 W/A-11 跨断点重复元素合并为逐项来源表：404 触发 / 首页 / 帮助 / 会话外壳，三条 FAQ 的能力依据、本地搜索与无结果、联系邮箱 null、法务占位和公开导航。来源清单不代替尚未到位的页面操作链、设计认可或发布文本授权。

维护页依 b7 #55 / #60 在 b12 末尾补 #620–#635：App phone 与 Web 1440 / 1024 / 390 均浅 / 深，分别演示 `maintenance.active=true` 无有效 `until`、以及有效 `until=2026-10-19T03:00:00Z`。第二态显示 `10月19日 12:00（日本時間）` 只作为设计 fixture；真实页面必须按接口值与时区格式化。代表浅 / 深截图目视核对，16 块 `preflight-maintenance.{json,md}` exit 0：近似 token 0、缺 token 48（8 个 Web 外框阴影、40 个模拟手机外框值）、数字不自洽 0、疑似无功能 0。逐元素来源与普通 503 / 离线边界已记 `preflight-checklist.md`；仍为未认可草案、没有维护 UI 操作链或像素门禁。

App 强制更新依 b7 #56 在 b12 尾部补 #636–#637 浅 / 深画板：只展示 `enforceMinimum=true` 且当前版本低于最低版时的阻断态，唯一出口为 App Store，不含关闭、版本号、更新日志或数据不会丢失等未经验证承诺。首次截图发现卡片孤行、按钮未贴底，已把说明收短并将唯一按钮贴于底部，最终两张截图目视核对。最终 `preflight-force-update-final.{json,md}` 两块 exit 0：近似 token 0、缺 token 10（每块 5 个均为模拟手机外框 / 系统状态栏值）、数字不自洽 0、疑似无功能 0。文案精简按日文用户文案检查执行；仍为待认可草案，启动门禁和真实页面未实现。

Web 新版浮条依 b7 #61 在 b12 尾部补 #638–#643：1440 / 1024 / 390 各浅 / 深。设置页背景仅用于观察全局浮条的位置，不声称输入已保存；浮条给「あとで」关闭与用户主动「再読み込み」两个动作。首轮截图显示 `pop` 样式在新画板组不生效、原 R18a 设置列表同样失去该组专属 `srow` 样式，已从计算样式确认根因，改用自足卡片和简单的设置背景；390 的浮条再上移至与底栏相隔 4px。日文说明删去孤行并保留重载前确认输入内容的提醒。后续读图发现说明沿用 `--ink-3` 时浅 / 深对比仅 2.90:1 / 4.06:1；针对六张真画框的只读对比断言先红，再仅把浮条说明改为 `--ink-2`，重跑分别达 6.85:1 / 7.91:1，六张均超过 4.5:1。最终六图重新捕获、390 浅 / 深目视复核，`preflight-web-version-final.{json,md}` 再跑 exit 0：近似 token 0、缺 token 14（4 个 Web 外框阴影、10 个模拟手机外框值）、数字不自洽 0、疑似无功能 0。此为草案，仍待设计认可和 D 线壳实现；纯函数 2/2 不能代替真实关闭 / 重载链。

SC-13 旧屏引用预审（只读，未删除）：`OrbitLanding0918` 仍由根 `/`、`/app` 及登录 / 注册 / 找回 / 重置四个公开认证路由直接渲染；四个认证路由还直接引入 `account/auth-0918/auth-modal.tsx`。新链路未接通之前删除两者会切断现有入口。`orbit-real-landing-page.tsx` 在 `app/` 内无运行时进口，但页面测试仍引用其源码，需等新落地替换后同步测试 / 清单再删。`orbit-landing-route-view-model.ts` 仍供首页、活动、公开事件与组织者模型使用，不能随落地页直接删除；`orbit-reference-styles.tsx` 在 `app/` 的 39 个 TS/TSX 文件中被引用或定义，涉及任务、活动、设置及联系人，C 线只能在替换自身页面后解除自己的引用。以上按 PLANNER SC-13 保留，非“旧屏清理已完成”；未触碰其他线模块。

b1 W/A-02～05 做了现有认证链路的只读来源预审，已将登录、注册、找回、重置的 Web / App 请求和回跳对应关系补入 `preflight-checklist.md`。发现 Web 旧找回成功卡虽然附有“受理不等于送达”说明，主标题仍称链接“已发送”；新稿须统一为受理语义，并保持找回对邮箱存在性的同响应。另发现 b1 #9 两条实时密码要求（英数字混合、与旧密码不同）在服务端和 App 校验均不存在；推荐先从新画板移除虚构勾选，若要新增真实策略须主会话另行授权。此项是设计 / 行为冲突登记，不表示四态预检通过，也未写新认证 UI。

继续核对 b1 原稿与真实链路，另登记四个不成立的承诺：Web 注册后确认邮件（实际尝试自动登录、无邮箱验证）、Web 登录“保持登录状态”勾选（无对应会话策略输入）、过期重置链接回填邮箱（邮件链接只有 fragment token）、App 改密码后自动登录（服务端只改密并撤销旧会话）。逐项来源和建议已写入预检表，主会话 / 用户未认可改稿前不把这些交互做成装饰性假功能。

本轮逐元素复核 b1 #3 / #7 / #8 又发现两类未登记冲突：Web 注册强度条与 App 注册占位要求英数字混合，但当时 `auth-user-service.ts` 只要求有效邮箱和至少 8 字符；现有纯数字注册 / 重复邮箱目标组 10/10 通过，不存在强度评分回执。App 找回受理画面固定 `0:42` 重发倒计时并称链接已送达，然而公开 `PasswordResetResponse` 仅含受理消息；服务端虽有 60 秒冷却，但对已注册、未知及仅 OAuth 邮箱给同一回执，不暴露某账号的剩余时间或送达状态。两处已在 `preflight-checklist.md` 登记为待认可的改稿 / 产品取舍；不能把 UI 假进度条、伪倒计时或已送达声明接到现有服务。没有改 b1 画板或实现这些交互。

再核 b1 #5 / #9：服务端对格式错误、过期、已用和被新请求取代的重置 token 统一返回 `INVALID_TOKEN`，画板不能把通用失效结果确诊为「有効期限が切れています」；App 新密码画板显示演示邮箱，但重置 URL 只有 fragment token，App 页面与公开响应都不含邮箱，跨设备打开时也没有可信的找回表单上下文。两项已进预检表，建议分别改为通用失效说明、移除无来源的邮箱；在设计认可前未改画板或 UI。不同 token 原因仍应分别覆盖安全回归，不等于向前端公开区别。

b1 #2 / #6 登录画面已按输入、错误、Google、忘记 / 注册、返回和 App 本机恢复提醒逐元素补来源表。固定 Google 按钮与真实可用性条件冲突：Web 只有 Google 两项配置齐备才将 provider 传给页面，App 仅在 `auth.googleEnabled` 时生成动作；无 provider 的新画板布局仍缺。App 原生登录还保留本机加密未同步修改的匿名数量 / 无法确认数量提示，原 b1 #6 未画，不能在换版时悄悄丢掉恢复边界。现有 App 登录来源 / 提示目标组本轮 16/16 通过；这只验证旧行为来源，不是新画板、深色或操作链通过。

注册密码边界补查：`bcryptjs.truncates` 和本机 hash / compare 实测，两个密码若前 72 字节相同、仅尾部不同会被视为同一密码。重置服务原已拒绝超 72 UTF-8 字节，新注册服务此前只验至少 8 字符。先加内存真实服务测试，以 24 个汉字（72 字节）通过、25 个（75 字节）拒绝并不留账号为准，旧实现预期红（实际 `success`）；随后注册服务加同一字节上限并把通用输入错误写明上限，目标组 11/11、相邻认证 / 并发路由组 11/11，Web typecheck 与 lint exit 0。登录校验暂不拒绝既有长密码账号，避免无迁移地锁住用户；历史账号仍可出现 bcrypt 截断等价，且无法从已存 hash 判断谁当初输入超长，须另定兼容 / 重置策略。Web 注册 `maxLength=72` 只按字符数截，不可代替服务字节校验；App 的旧帮助文案也只说至少 8 字符，当前 `registerOrbitAccount` 会把服务端英语错误直接显示在日文页面。新认证画板和客户端错误映射须处理上限提示，未获认可前不改 UI。后述 Web 全量仍红，不能据定向测试写 SC-16 通过。

上述注册服务、错误文案与回归测试已按 C 线三条文件路径独立提交 `1f3dd05e9`；`git show --stat` 仅含这三条，未混入仍在进行的 R18b 画板 / 其他切片。未推送、未合入上游。

App 注册 #7 的重复邮箱卡同时展示「登录」和「重置密码」。只读服务核对表明 409 不透露邮箱对应密码账号还是仅 Google 账号；后者的找回申请虽也回 202，但 `password-reset-store` 仅对有 `passwordHash` 的账号建立邮件任务。已把这个安全 / 体验边界写入预检：可保留通用重置入口，但受理文案不能承诺送达，也不能按 409 猜出 provider。没有修改未认可画板。

b1 #0 / #1 的原始 token 扫描也已按值和命中元素补入预检表：Web / 手机模拟外框值与产品排版分开；真实落地页导航间距、标题 / 正文行高字距、欢迎页标题字距列为 A 线需核对的候选；两块共用的微字号名片仅列营销插画视觉项，不推成全局 UI token。续核 #2–#9 / #60 的非 exact 项：Web 四态及深色错误态只重复落地背景 / 插画值；App 四态除设备外框外，仅标题与部分小标签字距须核。此为告警归类，未获画板认可，也未申请或新增 token。

SC-15 D 线依赖核对：`redesign-d` 当前历史包含独立 App 根壳提交 `d096aa6d0`（最初为 `39a353303`，后续 rebase 后同内容），仅改 `repos/orbit-app/app/_layout.tsx` 与 `tests/root-shell-auth-render.test.ts`，D REPORT 记定向 root SSR 回归 1/1。C 当前 `app/_layout.tsx` 仍按 pathname 挂 `ShellTabBar` / 设置 Toast 偏移，`git branch --contains d096aa6d0` 只有 `line-d`；故 D 已交付独立修正但尚未进入 C，更没有本线的未登录→登录→再注销操作回归或 Web 浮条证据。待主线集成后按 PLANNER SC-15 重验；不把 D 定向测试换算成 C 验收。

上游集成检查点：22:41 JST 的本地 `origin/redesign` 相对 C HEAD 多 6 个提交，含 R31a 文档 / no-regress 修正与独立复核记录（SC-03 仍 open）；C 相对该上游另有 51 个提交，合并基点 `324218dda028e02e4a48a938940b08a240a7296e`。因此本轮 C 全量仍对应当前 C 树，不代表上游 R31a 组件 / no-regress 集成后的像素验收；待本轮工作树稳定并满足路径提交门禁后，再按 PLANNER 的 rebase / 冲突规则复核。此时不在脏树及全量排队过程中重排历史。

D REPORT 另交接 App 现有登录页英语标题下混入中文设备待恢复提示。C 确认 `AccountAuthScreen.tsx` 的未知数量与加密修改数量两段直写中文后，先补三语与源码接线断言，目标组如预期 8/10 红；再改用 `auth.devicePendingWritesUnknown` / `auth.devicePendingWriteCount` 语言键，后者只插入匿名 `{count}`，保留原账号 / 原服务器恢复边界。只读复核 `AuthSessionProvider.readPendingWritesOnDevice`：它把 `pendingWriteSummary()` 的当前 / 其他账号计数相加，登录页没有账号、邮箱或域名列表；画面上的 `baseUrl` 比较只防止旧请求的结果出现在切换后的服务器画面，并非把总数伪称当前服务器独有。随后补英文 1 项计数断言，先红后把英文改为不依赖复数变化的计数句；三语翻译、拷贝门槛、字典键集的目标组重跑 19/19，最终措辞后的 App typecheck exit 0；旧硬编码允许数从 3 降到 1。此修改晚于第二次 App 全量，仍需同树全量与 App 浅 / 深操作画面重验，不能称认证 UI 验收已过。

Web 全量 `c-web-full-version-working-tree.log` 已在当前 R18b 工作树结束，**7,476 tests / 6,424 pass / 32 fail / 1,020 skip，exit 1**。按完整失败名称对照 R18a 最近一次 `c-web-full-current-c34e559df.log` 的 31 项：原有「手入力→元に戻す」30 秒超时本次未复现；新增两项静态规范失败——`orbit-0918-anchor-colour` 六域锚点门槛 60、当前 59，以及 `orbit-button-ratchet` 非 `.btn` 按钮上限 79、当前 84。两项单独重跑均复现（目标 5 项中 3 pass / 2 fail）；它们检查的现有 / 上游跨线源文件与固定门槛均不在本轮 C 修改清单，当前未调整门槛或改动别线 UI 以掩盖失败。须由相应屏幕 / 规范所有者检查近期删除的链接及新增的五个设计控制，再给出保留覆盖率与外观的修正；C 线 SC-16 仍红。其余 30 个失败名称与 R18a 基线一致，但不能把 32 fail 写成全量通过。

归因补查：对比 `c34e559df..HEAD`，锚点测试所扫的旧 `contacts/network-0918` 目录有跨线删改，测试的固定数量自检未随之更新；新 `.btn` 计数中可见 `orbit-2026/network/ContactDrawer.tsx` 的五个 `styles.why` / `styles.more` 按钮与 `NetworkScreen.tsx` 的一个 `styles.why` 按钮，净数 +5（另有删除），均非本轮 R18b 改动。不能仅把 60 改 59 或 79 改 84；须由对应所有者按设计规格决定迁移 `.btn`、记录有理由的例外或更新扫描覆盖，再重验。

上述全量结束后，在包含 `/` 会话分流与全部 C 切片的同一工作树上重跑 Web `npm run typecheck` 与 `npm run lint`，两者均 exit 0。类型 / lint 通过不能抵消全量测试的 32 项失败。

其后新增 Web 公开 FAQ 纯过滤规则，先跑 `public-faq-search.test.ts` 因模块缺失预期红，再加最小实现后 3/3 绿：空查询保序、问题 / 答案 / 关键词匹配、无结果为空。尚无真实页面、网络搜索或获批最终 FAQ 文案；此修改晚于首次 Web 全量，已纳入下文第二次全量复测。加此文件后当前树 Web `npm run typecheck` 与 `npm run lint` 均已重跑 exit 0。

App 按不能跨仓库直接 import Web 源码的规则，在 `src/view-models/public-faq-search.ts` 实现同一纯过滤行为；`tests/public-faq-search.test.ts` 先因模块缺失预期红，再 3/3 绿。新增后 App `npm run typecheck` exit 0。FAQ 文案与界面仍待设计认可。

App 全量 `c-app-full-version-working-tree.log` 在本轮 C 树结束，**3,070 tests / 3,055 pass / 13 fail / 2 skip，exit 1**。与 R18a 最近一次 12 项失败按名称比对：既有「suggestion next page replaces twenty previews」偶发超时本次未复现；新增「the actual native consumers all have explicit versioned policies」与「the committed page inventory document is the rendering of the registry」。前者是本轮 `src/api/app-version.ts` 新 GET 未登记，已在离线读面清单补成 `app-version` 域、`online_only_secret` / `never_local`，目标审计重跑通过；另有专门测试确认公开版本响应不会落入离线账号镜像，1/1 通过。后者是已提交离线页面清单多一行失效的 Sprint 0137 汇总，登记表实际为 0，已删该行，生成内容逐行一致，目标组 5/5 通过。第一次并跑两个目标组时页面测试仍读取到补丁前文档，故其 25/26 不算后续修复通过；独立重跑 5/5 才是有效证据。修复后的 App `npm run typecheck` exit 0。两项都是第一次全量之后的改动，不得把原 13 fail 追溯改写。

修复后第二次完整 App 套件 `c-app-full-version-after-policy-fix.log` 结束，**3,071 tests / 3,054 pass / 11 fail / 4 cancelled / 2 skip，exit 1**。逐失败名比对：此前 C 所有的版本策略登记和页面清单两项均在完整运行中通过；余下 11 个失败名与 R18a 基线中除偶发 suggestion paging 外的 11 个一致（9 个 R12 名片读取、字典拆分锁、邀请页被 toast 遮挡）。另 4 个通知注册 race 用例在 5 秒限制处超时并被取消，既不属于之前的 11 个失败名，也不能记为通过；须隔离重验并查运行负载 / 定时器，不能靠增加测试限时或从总数里抹去。完整 App 仍为红灯。

对这 9 个 R12 名片用例的第二次全量堆栈逐项复核：8 个停在浏览器 `waitForFunction` / `locator.waitFor` 的 5 秒等待（其中 6 个等不到 `add-batch-reading`），另 1 个「离开相机仍完成上传」实际批次状态为 `collecting` 而非期望的 `processing`。这不能一概称为过期 fixture 或纯负载波动；属于 B 线业务 / 浏览器操作链，C 线未改其实现或放宽等待。邀请历史用例是 toast 挡住链接；字典拆分用例是旧快照键数 2253 与当前 2813 不等。待各所有者按具体堆栈修复后再重验，不从 C 线全量失败数中抹除。

隔离运行整个 `notification-registration-races.test.ts`，**15/15 pass / 0 cancelled，exit 0**；四个在全量中取消的用例各自耗时约 0.77–1.35 秒、低于现有 5 秒限制。这支持全量并发负载超时的判断，但尚未用同树全量证明稳定，未调整用例超时或生产逻辑。

认证提示语言修复后的第三次 App 全量 `_evidence-c/R18b/run-01/c-app-full-after-auth-locale.log` 已经结束，**3,072 tests / 3,059 pass / 11 fail / 0 cancelled / 2 skip，exit 1**。相对第二次全量新增 1 个认证提示语言回归且通过；两项 C 自有的版本策略 / 页面清单审计也再次通过。将完整失败名称去掉耗时并与第二次全量的 11 项失败（排除那次 4 个 cancelled）做排序差集，结果为空：仍是 9 个 R12 名片、1 个旧字典快照、1 个邀请 toast 遮挡，未见新 C 失败名。第二次全量取消的 4 个通知注册 race 用例本次全部在原 5 秒限制内通过，故不再把它们列为当前取消项；当前完整套件仍因 11 fail 为红灯。

Google 注册成功回跳、App 维护判定和相关回归加入后的第四次 App 全量 `_evidence-c/R18b/run-01/c-app-full-after-auth-broker-body-limit.log` 结束，**3,074 tests / 3,060 pass / 11 fail / 1 cancelled / 2 skip，exit 1**，约 301 秒。与第三次全量按去时长后的完整失败名称比较，原 11 项全部保留且无新失败名；新增取消项是通知注册 race 的 `opt-out leaves the canonical registry revoked after an in-flight registration commits`，在 5 秒测试限制处取消，不能算通过。本轮 C 测试期间同机另有 B 线 Web 全量 Node 进程（当时 PID 46957）并行运行，负载可能相关，但不能凭并行就断言根因。该通知文件随后隔离重跑 **15/15 pass / 0 cancelled**，目标用例约 1 秒；这只支持并发负载假设，不能把完整套件的 1 cancelled 消除或当作 SC-16 通过。本轮 C 新增的 Google 注册交互和维护回归在完整套件内通过；Web FAQ 与密码找回大小修复纳入下述 Web 复测。

第二次 Web 全量 `_evidence-c/R18b/run-01/c-web-full-after-faq-body-limit.log` 在 B 线两端全量结束后独占共享重任务槽位运行，**7,480 tests / 6,428 pass / 32 fail / 0 cancelled / 1,020 skip，exit 1**，约 304 秒。相对首次 Web 全量新增 4 项且均通过：三项本地 FAQ 搜索规则及一项超限 UTF-8 找回请求拒绝。将两次日志的完整失败名称去除耗时、去重、排序后逐项比较，差集为空，原 32 个失败名称均未消失也没有新失败名称。该结果证明新增切片未增加全量失败名，但全量仍红，不能作为 SC-16 或任何页面操作链验收。

密码重置 HTTP 的后续有界读取回归先 RED：伪造 `Content-Length: 2` 的 16 个 1024-byte 分块，旧 `request.text()` 在返回 413 前读完 16 块。改为逐块累计真实字节数，超过 4096 即取消 reader；同一测试 GREEN，未触发 service，回执仍为 413 / `PAYLOAD_TOO_LARGE`。目标文件首轮未配置数据库为 **46 tests / 45 pass / 0 fail / 1 skip**。随后先只读确认 `127.0.0.1:5432` 的目标库名和用户确为 `orbit_line_c_test` / `xzhao`，明确指定本机连接串重跑同一文件 **46/46 pass、0 skip**；测试使用随机 `password_reset_*` schema，结束后查询残留 **0**。此为本轮源码的真实库回归，不是云端或真实邮件投递。当前 Web `npm run typecheck` 与 `npm run lint` 均 exit 0。共享重任务槽位中的第三次 Web 全量 `_evidence-c/R18b/run-01/c-web-full-after-stream-limit.log` 结束：**7,481 tests / 6,429 pass / 32 fail / 0 cancelled / 1,020 skip，exit 1**。与第二次完整失败名去时长、去重排序后的 `diff -u` exit 0；新测试通过但原 32 个失败没有消失，SC-16 仍未过。

2026-10-19 再用当前 C 树及本机 `orbit_line_c_test` 重跑密码重置目标文件 **46/46 pass / 0 skip**，结束后 `password_reset_*` schema 残留 **0**；Web typecheck / lint exit 0，改动路径 diff 检查无问题。请求体有界读取及其回归测试仅两条路径提交为 `b328a73ce`，`git show --stat` 核对无其他未完成页面 / 画板文件；未推送。该独立修复不改变第四次 Web 全量仍有 33 项失败的结论。

注册 72 字节修复后的第四次 Web 全量 `_evidence-c/R18b/run-01/c-web-full-after-register-byte-boundary.log`：**7,482 tests / 6,429 pass / 33 fail / 0 cancelled / 1,020 skip，exit 1**，新注册边界用例在完整套件中通过。与第三次失败名去时长排序对比，只新增 `web personal client requests the editable collection rather than the legacy aggregate`，其余 32 项未变。该测试在 C / D 两线单独复跑都失败；它以 2026-09-17 的固定予定测试按当前日期计算的客户端窗口，2026-10-19 时已越过窗口起点。D 线按归属仅把该测试 fixture 改为同一次捕获的当前时间 + 1 日，目标文件 10/10、相邻客户端 / 路由 19/19、另一时区 10/10、D Web typecheck / lint exit 0；D 全量 7,790 项中 6,717 pass / 39 fail / 0 cancelled / 1,034 skip，目标测试通过、相对前一 D 全量无新失败名。该修正已按 D 线文件路径提交 `f7dc2c118`，未推送、未进入 C。不能把 C 全量的第 33 项提前扣除，也不能把余下 32 项当通过。

后续发现一个 SC-10 / 12 交叉条件：服务端在 `ORBIT_APP_MIN_SUPPORTED_VERSION` 有值、`ORBIT_APP_LATEST_VERSION` 缺失且维护显式开启时，会安全返回 `latestAppVersion: "0.0.0"`、`enforceMinimum: false` 与 `maintenance.active: true`。App 原判定先检查版本范围，使维护被误判为普通放行。先加策略回归，实际红 1/3（得到 `policy-invalid`）；再将显式维护判定移到版本范围校验前，并在公开接口读取测试覆盖同一响应。App 两组最终 6/6、App typecheck exit 0；Web 服务端路由同一配置响应的断言 3/3，未跟踪的新文件经 `git diff --no-index --check` 检查无空白告警。版本范围非法且**没有**维护信号时仍安全放行并附诊断；本修复不代表维护页、启动接线或完整 App 套件已经通过，此改动晚于上述第三次全量。

SC-11 实际 HTTP 复查：原定 C 端口 3400 被另一份 `redesign-c-r18a-retry` 工作树占用，先前对它的请求为旧 `account-lifecycle` 503，不能当作当前 R18b 失败或通过。核对 PID 工作目录后，当前 C 树在空闲 3410 / 独立 `.next-line-c-r18b-runtime` 临时启动，本地显式 `live`、版本 `1.0.0` / `1.2.0`、强制开关关；匿名 `GET /api/app/version` 实际返回 HTTP 200、`success:true`、版本值与 `enforceMinimum:false`，同时有 `Cache-Control`、`CDN-Cache-Control`、`Vercel-CDN-Cache-Control: no-store`。中间件仍报缺少本地 Auth secret 的启动诊断，但未阻止公开接口，不能视为已验证认证链。验证后已停止本轮 3410 服务并确认端口关闭；Next 自动加入 `tsconfig.json` 的临时类型路径已用补丁恢复，追踪文件无差异。没有写生产配置或调用真实 OAuth。

首次 Web typecheck 没进入源码诊断：本工作区遗留的被忽略 `.next/dev/types/validator.ts` 引用上游已删的 `contacts/pipeline` 两个路由。`next typegen` 生成了新的 `.next/types/validator.ts`，但未删旧开发缓存；确认 C 线 3400 无服务且旧文件不受 Git 跟踪后，将那一份旧文件**移至** `_evidence-c/R18b/run-01/stale-next-dev-validator.ts` 保留，原 `npm run typecheck` 重跑 exit 0。`next-env.d.ts` 被 typegen 临时改成正式类型引用后已恢复原追踪内容；没有把生成文件变化纳入产品提交。原始失败不能算通过，重跑 exit 0 才是当前证据。

2026-10-19 App 认证页回归再验：`account-auth-screen-source`、`ink-signal-auth`、硬编码文案门槛、profile 三语与 copy-sync 五组 **38/38 pass**，App typecheck exit 0。Google 注册成功后的跳转继续走资料完成页并保留安全 `next`；设备待恢复提示改为日 / 中 / 英字典，匿名数量不泄露账号名或邮箱。新增两条文案在 `copy:qa -- --app auth` 首轮暴露组件类型未登记、英文 `we` 与中文占位符空格问题，修正后不再出现在告警；全域 QA 仍 **53 个旧键告警、exit 1**，不能称通过。上述 8 条 App 路径按路径提交 `3e4b2c68c`，`git show --stat` 已核，未推送。该提交晚于第四次 App 全量，仍须集成态复验。

2026-10-19 离线页面清单文档与实际路由登记表逐行一致，`page-offline-inventory.test.ts` **5/5 pass**；单行过期的 Sprint 0137 汇总删除按路径提交 `1297acb47`，未改分类注册表。Web 公开 FAQ 本地过滤、构建 ID 浮条纯判定与支持邮箱空配置共 **6/6 pass**，App FAQ 本地过滤 **3/3 pass**；两端 typecheck 与 Web lint exit 0。8 条底层规则 / 测试路径提交 `340714a52`，`git show --stat` 已核；未推送。这些测试不证明公开帮助页、浮条状态存储、真实联系动作或 UI 画面已实现，仍须按 SC-09 / 12 及设计门禁完成操作链。

2026-10-19 发现此前 Web 全量未设置 `ORBIT_EVENT_DATABASE_URL`：失败堆栈明确写 `ORBIT_EVENT_DATABASE_URL is required`。只读核对本机 PostgreSQL 的 `orbit_line_c_test` 与回环地址，明确传入 `postgresql://xzhao@127.0.0.1:5432/orbit_line_c_test` 后先跑事件访问真实库目标 **3/3 pass**。再经共享重任务锁在同一 C 树跑全量：**7,482 tests / 6,942 pass / 11 fail / 0 cancelled / 529 skip，exit 1**。先前无库条件为 7,482 / 6,429 pass / 33 fail / 1,020 skip；两轮配置及实际执行的用例集合不同，不能把失败减少的差额叫作源码修复。新的 11 项为 D 已修但未入 C 的日期 fixture、manifest 生成、联系人合并、design fixture import、R16 每日一问 PostgreSQL 三项、R12 名片两项及两个跨线静态 ratchet。R16 `completion-question.test.ts` 在同一库隔离复现 **30 项中 27 pass / 3 fail**：内存版都通过，PostgreSQL 的三个场景遗漏真实活动选项；随机 `completion_*` schema 清理后残留 0。该模块归 A 线，本轮 C 不越线改它；其他 8 项仍须各归属方复核。Web 全量与 SC-16 依然红。

## 请求 / 未过 / 下一步

1. SC-01：b1/b7 已代定文案改稿与自动重跑完成；W/A-11 公开帮助 / 法务、W/A-08 404、W/A-09 维护两态、A-10 强制更新和 W-10 新版浮条浅 / 深草案已补，但均待复核。仍须用来源表逐项核对数据 / 动作，把真实 token 缺口与营销插画尺寸区分后按 C/A 文件边界交 A 线，并在 b12 末尾补齐其余画面的断点 / 深色，再跑五项人工预检。当前任何 R18b UI 像素都**未过**。
   - b1 #0 / #1 重看原稿时新增停点：仅 b1 出现的「確認は1枚5秒」缺耗时来源；「登録は1分」虽未找到计时证据，却是 R15 邀请等跨屏既有口径，不能 C 线单独改；未登录插画的 12 枚 / 3 人 / 分数应明确是演示，不能像访客数据；顶栏前三个链接缺真实目标；欢迎页「スキップ」目的地未定。推荐与影响已逐项写在 `preflight-checklist.md`，待主会话代定，W-01 / A-01 不开 UI。
2. SC-11 / SC-16：最新 C Web 全量在明确本机测试库下为 7,482 项中 11 fail；其中 R16 PostgreSQL 每日一问 3 项已隔离复现，日期 fixture 待集成 D 的修正，另有联系人 / R12 / 静态规范等跨线失败。不能把未配置数据库时的 33 fail 或这次少掉的失败名当作产品修复；也不能调高门槛或削弱覆盖来当成通过。最新 C App 全量仍有 11 fail / 1 cancelled；通知 race 隔离 15/15 通过不能抵消全量取消。C 自有版本、离线清单、认证语言与 Google 回跳等定向回归通过，并已按上文列出的独立提交保存；全量与像素验收仍未收口。后续须由各所有者按堆栈修复、集成上游并重验。
   - `/` 根路由改动后的 Web typecheck / lint 已重跑 exit 0；App 本轮离线清单修复后的 typecheck exit 0。
3. D 线请求保持 PLANNER §1 / §9 边界：根布局认证态底栏、Toast 偏移和 Web 壳浮条由 D 线独立提交；C 线不得代改。SC-12 还需 D 线确认 App 根布局的全局版本门禁挂载点：C 线提供政策读取、判定及获批后的更新 / 维护内容，D 线在不绕过任意深链的根壳接入并回归会话、底栏和 Toast。当前 `app/index.tsx` 只处理 `/` 根入口，不可作为全局阻断证明；未获设计认可及跨线接入前保持 SC-12 OPEN。
4. 支持邮箱与正式法务正文仍是发布授权门禁；不配置真实邮箱、不伪造法律文本。生产启用强制更新、真实 OAuth / 邮件、部署与 TestFlight 均未执行。
