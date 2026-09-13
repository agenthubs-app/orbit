# App 连通性执行记录：R-00 / R-01

状态：进行中。12:35 已按授权恢复本地 API 锁定依赖并重启，实际 Simulator 的首页资源与 AI 历史读取恢复；新回答生成／保存仍未验，没有完成任何整项功能验收。下文早间证据保留采集时状态，最新结果见 2.5。

关联：[剩余功能计划](../superpowers/plans/2026-09-13-app-remaining-functionality-and-connectivity.md) R-00、R-01、R-14；原 APP-00、APP-04、APP-15。

## 1. 本轮范围与版本

采集时间：2026-09-13 09:04–09:11 JST。

| 项目 | 证据／限制 |
| --- | --- |
| App 源码 | `1efc95508a43326bc6c99dea6d955e7b3f4dc5b7`；排查开始时无 tracked 未提交改动 |
| App 二进制 | `app.agenthubs.orbit`，0.1.0 / build 1，iphonesimulator；SDK 标识 iphonesimulator26.5 |
| 当前设备 | 实际启动的 iPhone 17 Pro Simulator，iOS 26.4；不是实体 iPhone |
| 当前 API 地址 | 09:08 实际服务器页显示 `http://localhost:3000`；没有点保存、检查或重置 |
| App bundle 版本 | Metro 在 `[::1]:8081` 运行；本轮未采集运行中 JS bundle 的哈希，不将源码 SHA 当作二进制或 bundle SHA |
| API 运行进程 | PID 69257，Next.js 16.2.9，监听 `127.0.0.1:3000`，cwd 为 `repos/orbits`；进程自 09-10 14:31 JST 运行 |
| API 源码 | 最近涉及 Web 的提交为 `8b38b4eb8618505ca4f59f20dc323159e1ad784b`；本轮未修改 Web。开发服务没有提供可验证的已加载路由版本戳，不能把进程启动时间或仓库 HEAD 当作全部路由版本 |
| Web 对照 | 用户所指 Web 环境与已登录账号尚未确认；未做同账号 Web 发送 |
| 账号 | 沿用 Simulator 现状，不登录／退出／切换／清缓存；没有读取或导出认证头。下方 HTTP 探针全部匿名，不能证明 App 会话有效或失效 |

已进行：源码与依赖解析的只读检查、查看开发日志的编译错误、查看 Simulator 当前页面、进入服务器页查看地址、匿名 GET、App 自动化回归。

未进行：依赖安装、服务重启、配置修改、数据库读写、真实 AI/OCR、任务／报名／聊天写入、通知注册、部署或推送。没有将 HTTP 缓存中的历史地址当作当前配置；当前地址以服务器页为准。

## 2. R-00：已确认的故障证据

### 2.1 原生症状

- 原计划 08:42 的会话显示 `ORBIT_APP_NON_JSON_RESPONSE`，该次发送的 HTTP 状态、Content-Type 和最终响应 URL 仍缺少记录。
- 09:04 的实际首页中，日程、待办、联系跟进三个区均显示“Orbit 服务返回了无法识别的内容，请稍后重试。”，因此当前可见问题不局限于 AI 页面。
- 当前服务器页确认地址为 localhost:3000，和本轮探针目标一致。没有改地址或清空草稿来替换故障场景。
- 截图仅留本地：`/tmp/orbit-r00-start-20260913.png`、`/tmp/orbit-r00-api-settings-ready-20260913.png`；不提交截图。第一次紧随深链采集的图片仍是旧页，不能用它宣称已进入设置，后续实际图片才确认服务器页。

### 2.2 API 开发日志与缺失依赖

`repos/orbits/.next/dev/logs/next-development.log` 的最近修改时间为 `2026-09-13T00:00:38.305Z`。其 timestamp 是进程累计时间（例如 `66:07:59.981`），不是 24 小时制时钟；不凭该字符串伪造具体请求时间。

日志中存在以下实际编译失败链：

| 错误 | 源位置 | 导入链末端／影响 |
| --- | --- | --- |
| `Can't resolve '@vercel/queue'` | `features/agent/runtime/action-queue.ts:1` | `runtime/service-factory` → `orbit-ai/chat-known-workflow` → `/api/ai/conversations` |
| `Can't resolve '@vercel/queue'` | `features/acquisition/business-card-ingest-v2/image-write-journal.ts:3` | ingest v2 configured → batches v2 handlers／route |
| `Can't resolve 'heic-convert'` | `features/acquisition/business-card-image-normalization.ts:1` | live scan/service factory → email-calendar signals、external candidates，另有 legacy batches handler |

在 Web 目录用 Node `createRequire` 只解析路径（未运行业务模块），`@vercel/queue` 和 `heic-convert` 均无法解析；`sharp` 和 `next` 可以解析。进一步比较 16 个声明运行依赖，以下六个根依赖目录不存在：

| 依赖 | 现有 lockfile 版本 |
| --- | --- |
| `@napi-rs/canvas` | 1.0.8 |
| `@vercel/blob` | 2.8.0 |
| `@vercel/queue` | 0.5.1 |
| `heic-convert` | 2.1.0 |
| `nodemailer` | 8.0.11 |
| `pdfjs-dist` | 6.2.108 |

这是现有依赖未就绪，不是要求新加产品依赖。仅前述两项有本轮查到的具体编译错误链，不能把其他四项写成已复现的路由故障。未审计完整传递依赖树，也不能假定只补两包就恢复所有能力。

**结论与限度：** 本地 AI／名片路由的依赖解析阻塞已确认。它与 App 收到非 JSON 内容相符，但原始 App 失败响应尚未关联捕获，不能补写成“该次一定 HTTP 500”，也不能保证首页所有失败都只有同一个原因。优先恢复锁定依赖，再用原设备／原场景验证。

### 2.3 为什么健康检查与匿名 401 不足以排除故障

- `app/api/health/route.ts` 只返回 envelope、mode 和边界说明，源码明确不调用业务 provider。
- `proxy.ts` 在匿名访问私有 API 时直接返回 401 JSON，未证明后面的 route 能编译或业务服务能执行。
- App `src/api/client.ts` 会保留非 JSON 响应的 HTTP 状态并返回 `ORBIT_APP_NON_JSON_RESPONSE`；现有客户端测试覆盖 HTML 502。没有发现应把 HTML 当成成功 JSON 的理由。
- 正常 JSON 业务错误、HTML 登录页、HTML 500、传输失败仍须分别验证；本轮没有新增这些测试，也未声称既有 HTML 502 测试已覆盖全部 R-00 条件。

### 2.4 后续追加：客户端受控错误回归

源码起点 `de05f3d7c19a83984a703ef6d0d6cf13398874f9`，生产代码未变。以下为同日后续测试提交的范围，不改写 09:04–09:11 的运行时证据。此时本地 Next PID 69257 仍在监听，`@vercel/queue` 与 `heic-convert` 仍解析失败；依赖恢复与服务重启尚未获准。

新增 12 项真实 App 代码的受控测试，仅替换外部网络传输，未使用真实账号、模型或业务对象：

| 场景 | 受控输入 | 验证的客户端行为 |
| --- | --- | --- |
| CON-U01–U04 | AI POST 收到 HTML 200 登录页、HTML 500、text/plain 502、HTML 401 | 拒绝当作成功回答；保留 HTTP 状态、NON_JSON 错误码与 meta；不泄露原始错误正文、不自动重发；只有 HTTP 401 广播过期 |
| CON-U05–U08 | AI POST 收到 JSON 401、403、429、503 业务错误 | 保留各自业务错误码及状态；不归为网络断开；不泄露合成英文堆栈、不自动重发；401 过期与其他业务失败分开 |
| CON-U09–U12 | 实际 AI 路由／Screen 收到 HTML 200、HTML 500、text/plain 502、JSON 503 | 显示失败及正确错误码，保留发送期间输入的新草稿和重试入口；失焦／回焦不重发、不保存失败回答、不导航；不展示 HTML／合成堆栈 |

客户端状态断言在 `tests/api-client.test.ts`；路由、HTTP client、hooks 与 Screen 联动断言在 `tests/ink-signal-ai-conversation.test.ts`。后者绕过既有只生成 JSON envelope 的回复 helper，直接向待处理 fetch 提供原始 Response；其余 App 消费链保持真实。原生鉴权／设备能力、外部传输及本地快照 I/O 仍是测试边界，因此不算 L1、真实 L3/L4 或 L5 通过。

这些用例对既有实现首跑通过，证明本次没有必要为这几类受控响应修改生产逻辑；不是一次后端修复，也不标成新功能的 TDD 红绿实现。另以 esbuild `write: false` 在独立测试进程的内存中做了四种故障注入，磁盘源码和运行中 App 不变：

| 内存中故意引入的退化 | 被新增回归捕获 |
| --- | --- |
| 把非 JSON 错误码改成网络错误 | U01–U04 均失败 |
| 把非 JSON 响应状态抹成 0 | U01–U04 均失败 |
| 不再广播 HTTP 401 过期 | U04、U05 失败 |
| 把 JSON 业务错误码改成网络错误 | U05–U08 均失败 |

四个故障注入子进程均按预期 exit 1，验证脚本确认相应用例失败后 exit 0；不是普通回归失败。第一次汇总脚本误按 TAP 解析实际 spec reporter，未识别已出现的失败；修正输出匹配后重新验证四项。生产文件未被写入，也没有借用当前运行服务注入故障。

本检查点验证：两文件修改前 80/80、修改后 92/92，均 0 失败／取消／跳过；修改后耗时 26.438 秒、exit 0。类型检查 exit 0。日志分别为 `/tmp/orbit-r00-error-baseline-20260913.log`、`/tmp/orbit-r00-error-regression-20260913.log`、`/tmp/orbit-r00-error-typecheck-20260913.log`。随后全量 `npm test` 为 2202/2202，0 失败／取消／跳过，166.670 秒、exit 0，日志 `/tmp/orbit-r00-error-full-20260913.log`。未新增原生或真实业务通过结论。

未关闭：原 App 失败发送的响应关联与最终 URL、同账号 Web 对照、真实生成／工具／保存／跨端回读，以及 R-02 显式发送与服务端幂等。受控 HTML 500 用例不能倒推原始请求一定返回 500；不能据此宣布 R-00 完成。

### 2.5 授权后恢复本地依赖与原设备回读

2026-09-13 12:32 JST，用户明确授权继续自行处理；本次据此执行此前提出的本地依赖恢复／必要重启方案。范围仅为 `repos/orbits` 现有锁文件，不升级、不改 API 业务代码、数据库、鉴权或部署。此前的等待授权状态至此结束。

- 12:33–12:35：核实旧 Next 进程的 PID、命令与工作目录后结束该服务；将原 `node_modules` 移到 `/tmp/orbit-web-deps-restore.PiVj1w/node_modules`，保留可回滚备份，未删除。
- `npm ci --ignore-scripts --no-audit --no-fund`：exit 0，安装 306 个包；16/16 声明运行依赖均能解析，包括早间缺失的六项。没有擅自执行依赖安装脚本；随后对 canvas、HEIC 转换模块加载、sharp 1×1 PNG 处理及 esbuild 转换作本地运行检查，四项通过。这不等于所有原生包／所有路由都已验收。
- `package.json` SHA-256 仍为 `63676e44b156652d201735e16c14c1a89a968404ee327bdfec4fddaaac432675`，`package-lock.json` 仍为 `ecc94a6b254bcd9a5ff68cf48325f1aa00a168c0d78166c271d461081f6a1298`，前后相同；根仓库的 Web tracked diff 为空。Web 内另有旧独立 Git 工作树及既有差异，未重置、暂存或提交。
- 同一地址启动 Next.js 16.2.9，监听 `127.0.0.1:3000`，新服务 PID 93130。仍使用当前本地 Node 25.8.1／npm 11.11.0，不当作生产 Node 22 的验证。启动日志 `/tmp/orbit-web-api-restored-20260913.log`，安装日志 `/tmp/orbit-web-deps-restore-20260913.log`，均不提交。
- App 源码起点 `0908a196c7028670bfbe0f1b1904db99fc517f6a`；沿用同一 iPhone 17 Pro / iOS 26.4 Simulator、会话与 localhost 地址，未登录、切号、清缓存或改草稿。未采集运行中 JS bundle 哈希，API 未提供路由版本戳，仍不把源码 SHA 当运行产物哈希。

12:36–12:38 的复验结果：

| 场景 | 触发与证据 | 本次分层结果／限制 |
| --- | --- | --- |
| CON-R01 健康 | Mac GET `/api/health`，200、`application/json`、success=true，无跳转 | L1／公开健康协议通过；没有执行模型 |
| CON-R02 首页 | 原设备打开 `orbit://home`；新服务记录 GET `/api/schedule-items`、`/api/tasks?status=open`、`/api/contacts` 各 200 | L1 及原设备已有会话的私有读取恢复；画面有 10 个待办、当日 0 日程，原先三个错误状态不再出现。未采集完整响应 schema／请求 ID，不能标为全模块 L2–L5 完成 |
| CON-R03 AI 历史 | 原设备打开 `orbit://ai`；GET `/api/ai/conversations`、`/api/ai/conversations/sessions`、`/api/today?timeZone=Asia%2FTokyo` 各 200；实际画面有旧会话与待办 | AI 路由可编译并完成私有读取，不再出现此前缺包编译失败；新模型生成、工具执行、保存与跨端回读未执行 |
| CON-R04 伴随读取 | 同次 App 导航产生 GET `/api/chat/relationship-inbox` 与 `/api/notifications`，均 200 | 只证明这些现有会话 GET 返回成功状态；未验证已读写入、目标导航或推送 |

上述 App 请求的状态来自新启动服务日志，响应头／最终 URL／原始 envelope 未额外截获，不伪造 Content-Type、账号角色或请求关联 ID。没有读取或导出认证凭据。截图仅本地保留：`/tmp/orbit-r00-restored-start-20260913.png`、`/tmp/orbit-r00-restored-home-20260913.png`、`/tmp/orbit-r00-restored-ai-20260913.png`；已逐张查看，不提交个人画面或原始内容。

本次仅恢复开发环境及只读连通性；未发送 AI/OCR、创建事项、报名或发信。R-00 新回答／工具／持久化和 Web 同账号对照仍开放，付费验收累计硬预算等待明确。早间 2202 项测试及类型检查属于此前代码基线，本环境恢复检查点没有改 App 代码，也不冒称重新执行了全量测试。

## 3. R-01：本轮匿名 HTTP 记录

统一参数：Mac 发起，目标 `http://localhost:3000`，GET，`Accept: application/json`，不带 Cookie，`redirect: manual`，每次 10 秒超时。以下 11 项均在 `2026-09-13T00:10:23.617Z` 至 `00:10:24.657Z` 开始；全部 Content-Type 为 `application/json`，响应 URL 与请求相同，`redirected=false`，Location 和 `x-request-id` 均未提供。

| 场景 ID | 路径 | HTTP／响应事实 | 本次判定 |
| --- | --- | --- | --- |
| CON-001 | `/api/health` | 200，success=true | 通过：匿名健康协议；业务 provider 未执行 |
| CON-002 | `/api/auth/mobile/providers` | 200，success=true | 通过：匿名入口协议；不证明 Google 登录回跳可用 |
| CON-003 | `/api/auth/session` | 200，JSON null | 通过：匿名会话读取；此认证接口不是 success/data envelope，不误报协议失败 |
| CON-004 | `/api/events/public` | 200，success=true | 通过：匿名公开列表协议；全库范围、过滤、业务字段及分页尚未验收 |
| CON-005 | `/api/account/me` | 401，UNAUTHORIZED | 通过：匿名拒绝；登录后账号读取未执行 |
| CON-006 | `/api/profile` | 401，UNAUTHORIZED | 通过：匿名拒绝；个人资料业务未执行 |
| CON-007 | `/api/contacts` | 401，UNAUTHORIZED | 通过：匿名拒绝；人脉业务未执行 |
| CON-008 | `/api/schedule-items` | 401，UNAUTHORIZED | 通过：匿名拒绝；日程业务未执行 |
| CON-009 | `/api/tasks?status=open` | 401，UNAUTHORIZED | 通过：匿名拒绝；待办业务未执行 |
| CON-010 | `/api/ai/conversations` | 401，UNAUTHORIZED | 通过：匿名拒绝；生成和工具业务未执行 |
| CON-011 | `/api/ai/conversations/sessions` | 401，UNAUTHORIZED | 通过：匿名拒绝；会话持久化回读未执行 |

这些“通过”仅针对表中具体匿名场景。L3 业务、L4 写入／跨端、L5 原生交互均未因此通过。早期探索误试过 `/api/schedule`，其 401 同样可由 proxy 产生；该路径不是首页消费者，不纳入上述清单或路由存在性证明。

## 4. 模块、入口与副作用初始清单

来源：`src/api/endpoints.ts`、各 Screen／请求 builder，以及 `src/api/mobile-auth.ts`、`src/api/business-card-import.ts`。这是为后续逐场景核验建立的主要入口清单，不是已经穷举每个消费者或全部动态路径；R-01 的完整盘点仍开放。`:id` 等为路径模式，不是真实业务 ID。以下写入均未执行。

09:21 补充：[路由与 HTTP 消费点源码盘点](2026-09-13-app-http-consumers.md)记录了 263 个 TS/TSX 文件中的 204 处请求相关调用、66 个路由／layout 文件及动态委托、原生边界。该计数包含底层转发，不是独立接口或通过场景数。精确服务端角色、实际请求、非空样本及 L1–L5 仍待验；本补充没有新增网络调用。

| 模块 | 主要只读入口 | 写入／外部副作用，需单列授权 | 身份与本轮 L1–L5 状态 |
| --- | --- | --- | --- |
| 服务设置 | GET `/api/health`；App 服务器页 | 保存／重置本地 API 地址会改变后续请求作用域 | L1 当前 Simulator 地址已确认；无实体机传输证据 |
| 账号／OAuth | GET `/api/auth/session`、`/api/auth/mobile/providers`、`/api/account/me` | POST register/mobile credentials/google exchange；系统 OAuth、退出；恢复密码可发邮件 | 匿名边界如 CON-002/003/005；登录／OAuth／切号未执行 |
| 个人资料 | GET `/api/profile`、`/api/profile/update-suggestions` | PUT profile；POST suggestion accept、两种 extraction | 当前用户；CON-006 只证明匿名拒绝；保存／提取未执行 |
| 首页 | GET `/api/schedule-items`、`/api/tasks?status=open`、`/api/contacts` | PATCH `/api/tasks/:id` 完成事项 | 实际原生三个区域失败；无该次响应状态，L2/L3 未定位到各自原因 |
| AI 生成／工具 | GET `/api/ai/conversations`、`/api/ai/conversations/:id` | POST 根路径／带 ID 路径；模型、工具和会话副作用 | 当前用户；本地编译阻塞，付费生成未授权／未执行 |
| AI 保存／恢复 | GET `/api/ai/conversations/sessions`、`/sessions/:id` | POST sessions、DELETE `/sessions/:id` | 当前用户；CON-011 只证明匿名拒绝；双端恢复未执行 |
| 人脉 | GET contacts/:id、connections、关系分析；搜索还使用 POST `/api/contacts/search`、`/api/search/relationships` | PATCH contacts/:id；POST analysis recompute；搜索的具体服务副作用待逐条确认，不因“搜索”自动归为无副作用 | 当前用户／记录所有权；业务读取与修改未验 |
| 名片／导入 | GET imports/:id、legacy batches、batches/v2 及图片 | 相机／相册权限、上传、OCR、复核、确认创建、取消、重试和替换图片 | 当前用户／批次所有权；两个缺失依赖已有编译错误；实体相机/OCR 未执行 |
| 活动发现 | GET `/api/events/public`、`/api/recommendations/events`、详情 | POST 推荐接受；涉及个人推荐的副作用另核 | 公开列表可匿名，其余按真实账号；CON-004 不证明搜索覆盖全库 |
| 报名 | GET `/api/events/:id/registration`、活动详情 | POST registration、cancel、interview、persona | 当前用户／服务端资格；辅助问答与真实报名均未执行 |
| 运营／审核／签到 | GET events/center、operations/admin、admission/reviews 等 | 生成／发布／重试、审核 decision、签到、角色变更 | 需真实主办方／活动能力；具体写方法逐消费者补齐，不能用普通账号或假角色验收 |
| 待办／日程／提醒 | GET today、tasks/:id、activities、schedule-items、reminders | POST tasks，PATCH task；提醒和通知注册另核；缺少的日期地点编辑协议先确认 | 当前用户；CON-008/009 不是业务验收；跨端写回未执行 |
| 身份／聊天／邀请 | GET chat/conversations、messages、connections、contacts | POST messages；邀请 prepare/confirm；AI summary/extractions 等按真实消费者核验 | 平台绑定／聊天资格待 B4；邀请草稿不能冒充真实发送或绑定成功 |
| 收件箱／推送 | GET chat/relationship-inbox、notifications、signals、notification delivery | 草稿／改写／隐私开关／signal confirm；设备 token 注册／解绑；服务端已读协议另核 | 当前用户与设备；角标现状不证明已读一致，真实推送未执行 |
| 人脉分析 | GET mobile/contacts-dashboard、既存统计／报告 | POST dashboard/opportunities/recompute；PUT profile 保存目标 | 当前用户；长期目标不能被整份 profile 意外覆盖；重算未执行 |
| 笔记（后期） | 现有联系人备注读取不等于独立笔记 | 独立正文、多人关联、迁移、笔记建议接受需 B8/B6 与独立设计 | R-13 未实施；不杜撰 API 或提前迁移旧内容 |

后续逐场景补齐：确切消费者／方法／路径、角色、环境、脱敏对象、请求关联 ID、L1–L5 分项结果、持久化回读、Web↔App、清理授权与失败责任端。没有账号、样本、预算或协议的场景保持“未执行／受阻”，不填成功。

## 5. 故障交接与下一步

| ID | 已确认事实 | 责任端／下一动作 | 关闭所需证据 |
| --- | --- | --- | --- |
| CON-B01 | 早间 AI 会话导入链缺少 @vercel/queue；12:35 已恢复解析，原设备会话与历史 GET 均 200 | 环境依赖阻塞解除；继续新生成／工具／保存验收，不把 GET 当作生成通过 | 原场景 App 发送、工具、保存、重开回读通过 |
| CON-B02 | 早间 heic-convert／ingest v2 queue 缺失；锁定包已恢复 | 依赖解析通过；原生名片批次／图片业务仍待复验 | 原生批次读取与协议通过；后续真实导入闭环另验 |
| CON-B03 | 早间首页三个资源显示非 JSON 错误；12:36 同设备三个 GET 均 200，非空待办恢复 | 可见首页读取故障已恢复；保留旧失败元数据缺口 | 原失败响应不能倒推；后续补完整协议及功能层验证 |
| CON-B04 | Web 同账号对照、AI/OCR 调用预算、真实写对象未确定 | 需要用户提供／批准场景；不代表另一端已接单 | 环境、账号角色、对象、费用硬上限明确后执行并保留回读证据 |

恢复操作已于 12:35 按授权完成，实际范围和回滚位置见 2.5。未升级 package/lock、未改 API 业务源码、数据库／鉴权／provider 或部署；后续新问题仍逐一诊断，不自行扩展到升级或重写接口。

R-00 关闭之前还须捕获同环境实际失败／成功响应，并以真实新回复、工具结果、保存确认和两端回读完成验证。依赖安装成功不是功能完成。R-01 和其余 R-02–R-14 均保持开放。

## 6. 本轮验证与提交边界

- 起始 `npm test`：2190/2190，0 失败／取消／跳过，175.259 秒，exit 0。日志 `/tmp/orbit-r00-baseline-20260913.log`。
- 本轮未改生产代码或测试用例；既有自动化通过不能替代上述真实业务验收。
- `npm run typecheck`：exit 0；日志 `/tmp/orbit-r00-typecheck-20260913.log`。
- 契约／Schema／字典同步检查、API client、base URL、AI 会话六个测试文件：89/89，0 失败／取消／跳过，24.675 秒，exit 0；日志 `/tmp/orbit-r00-boundaries-20260913.log`。没有执行同步写操作或付费请求。
- `git diff --check`：exit 0；新文档的相对链接、矩阵条目及暂存差异在提交前复核。没有更改早期设计原件的既有格式。
- 提交只包含本计划进度及脱敏验证文档；不包含截图、原始日志、认证数据、依赖目录、独立 prototype 或 Web 改动。不推送。
