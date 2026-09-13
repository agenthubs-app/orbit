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
| CON-B04 | AI/OCR 累计硬预算后续已确认为 5 美元；同账号 Web 对照、逐调用费用控制和具体测试对象仍待落实 | 按后续自主执行授权核实；预算确认不等于已执行，也不代表另一端已接单 | 同环境／账号／隔离对象及费用边界落实后执行并保留回读证据 |

恢复操作已于 12:35 按授权完成，实际范围和回滚位置见 2.5。未升级 package/lock、未改 API 业务源码、数据库／鉴权／provider 或部署；后续新问题仍逐一诊断，不自行扩展到升级或重写接口。

R-00 关闭之前还须捕获同环境实际失败／成功响应，并以真实新回复、工具结果、保存确认和两端回读完成验证。依赖安装成功不是功能完成。R-01 和其余 R-02–R-14 均保持开放。

## 6. 本轮验证与提交边界

- 起始 `npm test`：2190/2190，0 失败／取消／跳过，175.259 秒，exit 0。日志 `/tmp/orbit-r00-baseline-20260913.log`。
- 本轮未改生产代码或测试用例；既有自动化通过不能替代上述真实业务验收。
- `npm run typecheck`：exit 0；日志 `/tmp/orbit-r00-typecheck-20260913.log`。
- 契约／Schema／字典同步检查、API client、base URL、AI 会话六个测试文件：89/89，0 失败／取消／跳过，24.675 秒，exit 0；日志 `/tmp/orbit-r00-boundaries-20260913.log`。没有执行同步写操作或付费请求。
- `git diff --check`：exit 0；新文档的相对链接、矩阵条目及暂存差异在提交前复核。没有更改早期设计原件的既有格式。
- 提交只包含本计划进度及脱敏验证文档；不包含截图、原始日志、认证数据、依赖目录、独立 prototype 或 Web 改动。不推送。

## 7. R-03 追加：资料原文与账号名保真

此节是后续独立功能修复，不改写第六节早间只读文档提交的边界。源码起点 `e56a71f38`，沿用 12:32 对此前具体方案的授权；[实施计划](../superpowers/plans/2026-09-13-profile-server-truth.md)。

### 7.1 实现及影响

- 删除 `mobile-profile.ts` 中固定账号 ID、资料模板与语言检测替换 helper。`ProfileCard` 直接消费已存在的 `profileToSummary(data)`，不再用登录名覆盖公开资料名，也不补造空的公司、简介或标签。
- `mobileUserDisplayName` 只取当前登录名并去除首尾空白；AI 侧栏缺名复用“账号”。账号页继续调用既有 account view-model，不改鉴权逻辑。
- 不改服务端数据、API、共享副本、保存请求或编辑状态管理；保留现有布局。公司／职位在当前编辑器没有独立输入控件，本项只验证其预览原文，没有顺手增加控件。
- 逐符号 GitNexus upstream impact 均 LOW；账号名 helper 的直接调用者为资料替换 helper、account view-model 与 AiScreen（3 个），ProfileCard 直接调用者为 ProfileScreen；未列出受影响流程。图未给出资料替换 helper 的实际 JSX 调用边，源码检查补上；两个新的页面测试文件为 UNKNOWN，不记为零风险。

提交前首次变更检查暴露旧索引行号错位：错误列入两个未修改的资料提取函数。TypeScript AST 对比确认这两个函数与 HEAD 内容完全相同；CLI 随后明确报告索引过期（09-10／`8b38b4e`）。按项目规则执行 `npx gitnexus analyze --skip-agents-md`，12:53 成功，277.9 秒、exit 0；390355 节点、559402 边、300 流程。未改根 AGENTS/CLAUDE、未生成 embeddings；默认跳过 52 个超过 512KB 的大文件，本项源码／测试均不在此大小范围。刷新后的 context 已定位当前 ProfileCard，staged detect_changes 为 12 文件、LOW、无列出的受影响流程；20 个匹配项包含文档章节及测试常量，不是 20 个生产函数。已删除 helper 的风险仍结合修改前 impact 和实际 diff，不把新图中不存在的符号算作无风险。日志 `/tmp/orbit-r03-gitnexus-refresh-20260913.log` 仅本地保留。

### 7.2 自动化证据

| 检查 | 结果 | 本地日志 |
| --- | --- | --- |
| 七文件原基线 | 263/263，80.858 秒，exit 0 | `/tmp/orbit-r03-identity-baseline-20260913.log` |
| 新行为红测 | 21 项中 16 个预期断言失败、5 个已有行为通过；exit 1 | `/tmp/orbit-r03-identity-red-20260913.log` |
| 首次绿测／类型检查 | 13/21；8 个新增测试错误地寻找不存在的公司／职位输入框，另有 tuple label 类型错误；未算通过 | `/tmp/orbit-r03-identity-green-20260913.log`、`/tmp/orbit-r03-identity-typecheck-20260913.log` |
| 修正测试定位后的绿测 | 21/21，6.018 秒，exit 0；没有为测试增加表单或更改生产逻辑 | `/tmp/orbit-r03-identity-green-corrected-20260913.log` |
| 类型检查复跑 | exit 0 | `/tmp/orbit-r03-identity-typecheck-corrected-20260913.log` |
| 七文件完整回归 | 281/281，153.482 秒，exit 0 | `/tmp/orbit-r03-identity-regression-20260913.log` |
| 契约／Schema／字典同步检查 | 6/6，2.045 秒，exit 0；未执行同步写操作 | `/tmp/orbit-r03-identity-sync-20260913.log` |
| 全量 `npm test` | 2220/2220，209.922 秒，exit 0 | `/tmp/orbit-r03-identity-full-20260913.log` |

最终通过的测试运行均 0 失败／取消／跳过；首轮测试编写错误如表中单独保留。按原先选择的单代理执行，自审源码／测试 diff，没有另行声称经过独立代理审查。

新用例覆盖旧特判账号与普通账号的中／日／英服务端资料、不同登录名、空 profile／空字段、未提交草稿经刷新和预览切换后保留，以及 AI 侧栏真实名／通用占位与未发送草稿。旧“应显示固定人物资料”的测试被真实行为回归替换，过时的 helper 接线断言移除；其余保存失败、错误回执、账号／服务器切换等回归保留。HTTP／原生能力仍是受控边界，不算真实写入或 OAuth 验收。

### 7.3 原设备只读复验与限制

同一 Simulator、localhost API 和已有会话，12:40–12:43 进入资料与账号页；新服务记录 GET `/api/profile`、`/api/profile/update-suggestions`、`/api/account/me` 均 200，资料统计的三个 GET 也为 200。没有发 PUT、登录／退出、清缓存或编辑真实资料。

已逐张查看本地截图：`/tmp/orbit-r03-profile-before-20260913.png`、`/tmp/orbit-r03-profile-after-20260913.png`、`/tmp/orbit-r03-account-after-20260913.png`。资料页不再显示此前模板填入的身份、简介和标签，而显示接口原公司名称及真实缺项；不提交原始个人内容。账号页可读，公开资料名与登录名允许不同；本轮没有导出登录会话原文或运行中 bundle 哈希，因此该截图本身不是身份来源完整比对证据。

12:51 再打开 `orbit://ai?drawer=1`，查看 `/tmp/orbit-r03-ai-drawer-after-20260913.png` 确认原生侧栏与历史入口可见；没有发送新问题。该账号不属于缺名场景，通用占位的缺名分支由上述受控回归验证。

R-03 剩余：新用户资料完成／Google 回跳／两端写回尚未执行。只读源码确认现有 live profile 的 completeness 依据是 displayName、headline、relationshipGoal、homeMarket、targetRelationshipTypes、preferredIntroChannels 六项，industry 不在其中；这不等于已经批准的“姓名＋行业”准入规则。需要独立解决 B1/D2，不能在本次展示修复中强制用户补齐关系目标等字段。R-00 新生成、R-01 完整矩阵及 R-14 仍开放。

## 8. 真实 AI/OCR 预算与自主执行追加

2026-09-13，用户先明确“上限设置为5美元吧”，随后要求外出期间按计划自行调查、判断并执行，不再逐项问询。本节承接该授权，不将此前建议的 10 美元或未提交的选项当成批准。

- 范围：本次剩余计划验收中由执行者触发的真实 AI/OCR，跨功能、重试、重启与后续续跑合计最多 5 美元。不是整个供应商账号的支出控制，也没有修改供应商账单设置。
- 不新增付费服务、不充值、不自动提高上限。调用前覆盖该操作的全部模型阶段；并发、超时和结果未知均占用保守预留，不能把未返回 usage 的请求计为零。
- 此次预检没有发起生成、OCR、上传、工具执行或真实资料写入，已触发付费验收请求数为 0；这不是对用户账号其他费用的审计。
- 只读检查本地 `.env` 与 `.env.local` 中允许的配置项：会话为 live、显式 DeepSeek、`deepseek-v4-flash`，DeepSeek 凭证存在；不输出或保存凭证。文件结果不等同于读取运行中进程的完整有效环境。
- 当前 `business-card-ocr-provider-selection.ts` 优先 DeepSeek。默认图像／文本模型分别为 `deepseek-v4-flash-vision-exp` 和 `deepseek-v4-flash`；`extract` 分别调用转录与结构化，`verifyHighRiskFields` 可另发一次请求。主结果 usage 仅合计前两次，复核返回中没有该次 usage，不能仅凭主结果计算完整费用。
- 会话 `createGeminiOrbitAgentPlanner` 的 plan/synthesize 请求没有传入 `maxTokens`；runtime 的步骤限制不是美元限额，工具还可能另行调用模型。检查到的调用链没有针对本次验收的累计费用拦截。因此预算获准不意味着可以直接批量重放。

公开计价参考：[DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)。初次搜索返回旧表格，网页打开通道又超时；随后用本机 Node 直接读取相同官方地址，HTTP 200、最终 URL 不变，发现 Flash 已更新为 DeepSeek-V4.1-Flash。页面说明 `deepseek-v4-flash` 与 `deepseek-v4-flash-vision-exp` 旧名仍被接受，但由 V4.1 Flash 服务并按 Flash 计费；本次不更改项目配置。

当前公开峰值未命中输入为 $0.30／百万 tokens、输出为 $1.20／百万 tokens，低谷为 $0.15／$0.60；上下文 1M、最大输出 384K。不能混用搜索缓存中的旧 $0.44／$1.32 表格，也不把公开表格说成已核对账户结算。预算按较高时段和保守预留；调用前仍须证明完整操作的上界，未知 usage 不回收预留。

下一步先收敛 R-02 的无意发送风险，再以可验证的逐调用费用控制执行少量真实场景。预算到达上限或调用上界不可证明时暂停付费部分，继续不付费工作；被暂停场景不标通过。5 美元约束跨上述步骤保持，不因开新会话或重启清零。

### 8.1 索引刷新遇到磁盘满：可恢复迁移

预算预检后的索引刷新因 `lbug.wal` 写入 `No space left on device` 退出 1。内盘可用空间一度为 116 MiB，部分生成的索引不能用于影响分析或提交验证；依赖步骤先暂停。日志 `/tmp/orbit-budget-gitnexus-refresh-20260913.log` 保留，不算成功。

只迁移生成物与本次已有备份：`.gitnexus` 和 `/tmp/orbit-web-deps-restore.PiVj1w/node_modules` 移到私有目录 `/Volumes/ORICO/Dev/MacMovedData/orbit-validation-20260913.7c2lIC/` 下的 `gitnexus`、`web-node-modules-backup`，原路径保留软链接。没有删除源码、当前依赖、资料或会话。递归相对路径／文件内容／软链接目标校验前后一致：索引 37 文件、530598226 字节，旧依赖 15507 文件／17 链接、389367526 字节；不是用目录大小近似替代内容校验。内盘恢复约 2 GiB；外盘约 883 GiB 可用。回滚材料继续从原备份路径访问，外盘须保持挂载。

在外盘重新运行相同的 `npx gitnexus analyze --skip-agents-md`；日志 `/tmp/orbit-budget-gitnexus-external-20260913.log`。完成前不把索引恢复或后续符号检查写为通过。

第二次运行确认原磁盘满留下的 WAL checkpoint 损坏，COPY 阶段仍失败，未算通过。将该次生成目录保留为同一外盘目录下的 `gitnexus-failed-wal`，停止已报错的本次索引进程，再从空的 `gitnexus` 目录重建；没有删旧资料。第三次日志 `/tmp/orbit-budget-gitnexus-fresh-20260913.log`，完成状态另记。迁移后只读复查本地 health 与公开活动 GET 均 200、application/json、success true，未触发模型。

第三次重建于 13:18:48 JST 成功，260.9 秒、exit 0；390303 节点、559399 边、300 流程。根仓库路径的索引指向当前 `5539c0658`，后续影响分析成功；没有使用同名旧 worktree 的索引，也未改根 AGENTS/CLAUDE 或创建 embeddings。原失败目录和依赖备份继续保留。

## 9. R-02：显式发送意图与空会话

按[独立实施计划](../superpowers/plans/2026-09-13-ai-explicit-send-intent.md)实施，不变更已批准的页面布局。旧 `initialMessage` 链接与业务上下文只预填；`/ai/new` 没有初始问题时也有输入框。首页点击发送登记单个内存意图，并绑定登录用户、服务器和问题；会话路由精确消费一次后继续该次发送。仅 URL 参数不授予生成权限，重启不恢复待发送意图。

### 9.1 影响范围与回归

编辑前根索引 upstream impact：AiConversationRoute、AiConversationScreen、claimInitialPrompt 和首页 sendMessage 均为 LOW、0 个已识别调用者／流程；AiScreen 为 LOW、1 个直接调用者 AiMainRoute、0 个流程。新模块、测试内嵌 fixture 和匿名 loader 无可用图节点，记录为 UNKNOWN，结合源码调用范围和真实路由测试补验，不解释为零风险。没有修改 Web、共享生成副本或业务权限。

- 三文件基线 156/156，31.066 秒、exit 0。
- 旧链接／空会话／身份切换红测 7/7 按预期失败：自动 POST 或缺少输入框；首页联测因没有 sendIntent 失败。纯意图模块在未实现消费时 3 项正向断言失败，不用缺失导入充当红测。
- 初次行为绿测 18/18，4.111 秒、exit 0；随后三文件加新意图测试完整回归 175/175，32.178 秒、exit 0。双击、刷新、前后台、整路由重挂载、保存重试、较新草稿及账号／服务器隔离的旧断言保留；原初始生成用例改为真实点击发送后再验证，未放宽结果要求。
- 类型检查 exit 0；契约／Schema／字典同步检查 6/6，0.507 秒、exit 0，没有同步写操作。
- 首次全量回归 2230 项中 2229 通过、1 失败，182.855 秒、exit 1：旧首页服务端渲染测试未替换新引用的原生 expo-crypto，加载时 `__DEV__ is not defined`。该文件的 10 个用例没有运行，不与失败轮次总数混算。仅在该测试既有设备边界用 Node randomUUID 替代，未修改生产行为或跳过断言；该文件复跑 10/10、exit 0。最终全量结果另记。

自审新增边界也先保留失败证据：重复 URL 参数导致数组 trim 异常；延迟首页跳转跨账号／服务器虽不 POST 却泄漏原草稿，两个用例失败；首页跳转前清空草稿的断言失败。路由统一读取参数首项，最近一条意图保留来源／消费状态以取消错误身份导航，首页交接前保留输入。随机数失败恢复还经临时移除本项新增 catch 的故障对照，随即还原后通过。复跑相关五文件 189/189，34.918 秒、exit 0；之后增加的首页草稿保留断言与随机数失败用例复跑 2/2，1.544 秒、exit 0。最终类型检查 exit 0。

第二次完整运行 2243 项中 2242 通过、1 失败，181.087 秒、exit 1：未修改的 `ink-signal-inbox.test.ts` narrow-large 场景在 `scrollIntoViewIfNeeded` 等待控件稳定时超过 1.5 秒。先暂停提交，确认该文件与 HEAD 无差异并单独复现；不删除用例、放宽阈值或把这次失败改记为通过。日志 `/tmp/orbit-r02-intent-full-final-20260913.log`。

该收件箱用例单独运行通过，1/1、1.459 秒、exit 0；未修改代码、断言或超时阈值。随后以相同 `npm test` 完整复跑，**2243/2243，0 失败／取消／跳过，177.379 秒、exit 0**。日志 `/tmp/orbit-r02-inbox-isolated-20260913.log`、`/tmp/orbit-r02-intent-full-retry-20260913.log`；当前仅有一次全量超时与随后单独／全量通过的证据，不把环境负载猜测写成已确认根因。

对应日志：`/tmp/orbit-r02-array-param-red-20260913.log`、`/tmp/orbit-r02-deferred-scope-red-20260913.log`、`/tmp/orbit-r02-native-random-red-20260913.log`、`/tmp/orbit-r02-draft-handoff-red-20260913.log`、`/tmp/orbit-r02-draft-handoff-green-20260913.log`、`/tmp/orbit-r02-intent-regression-final-20260913.log`。

提交前 `npx gitnexus analyze --skip-agents-md` 返回 Already up to date、exit 0；此次 CLI 以 HEAD 为准，没有声称重新建立未提交新增模块的图。最终 staged detect_changes 报告 11 个文件、LOW、没有列出的受影响流程；58 个触及项含文档／常量和旧行号重叠，不是 58 个改动函数。TypeScript AST 与 HEAD 对比确认实际只改 AiConversationRoute（含 intent／claim）、AiScreen（含 sendMessage）、AiConversationScreen，并新增三个纯内存意图函数；工具额外列出的 startNewChat、scope、isScopeCurrent 均内容不变。新模块结合两处生产引用与真实路由回归验收，不用图中缺项代替检查。按既有单代理选择自审，没有声称独立代理审查。

本地日志：`/tmp/orbit-r02-intent-red-20260913.log`、`/tmp/orbit-r02-home-intent-red-20260913.log`、`/tmp/orbit-r02-intent-green-20260913.log`、`/tmp/orbit-r02-intent-regression-20260913.log`、`/tmp/orbit-r02-intent-typecheck-20260913.log`、`/tmp/orbit-r02-intent-full-20260913.log`。通过项均 0 失败／取消／跳过，失败轮次单独保留。

### 9.2 原生只读检查与未完成项

13:24 左右，同一 iPhone 17 Pro / iOS 26.4 Simulator 和现有会话打开 `orbit://ai/new`，实际显示“新会话”、空输入框与发送按钮；402×874 画面中输入框高 44，发送按钮 44×44，底边约 832.7，在屏内。服务日志对应 conversations、profile、events、tasks、contacts 五个 GET 均 200，没有读取虚构的 `/api/ai/conversations/new` 详情。未点击发送、编辑真实资料或切换账号；原生 UI 树仅保存在 `/tmp/orbit-r02-native-empty-20260913.json`，不提交原始内容。

带初始文本的原设备深链、真实首页付费生成、跨端续聊和服务端 B3 幂等仍未验收。已有前端一次性意图不是服务端请求 ID／超时幂等；两类 POST 当前解析仍没有生成幂等字段。不能据此关闭 R-00、完整 R-02 或 R-14。

## 10. R-02：每轮续聊携带已确认历史

在显式发送提交 `eef661284` 基础上，只调整 `AiConversationScreen.sendMessage()` 的路径优先级及历史参数。只读 Web 证据：根 POST 接收 history，带 ID POST 不接收；原 App 在第一次回复后已有 resolvedConversationId，第二轮错误转到带 ID 路径。App 保留最近八条 user/assistant 消息，与 live runtime 的最终八条窗口一致；根 route 的十二条解析上限不是模型实际使用窗口。

编辑前刷新根 GitNexus 索引成功（259.9 秒、exit 0），AiConversationScreen、对应 sendMessage、测试 open/fixture 的 upstream impact 均 LOW、0 个已识别直接调用者／流程。新红测明确捕获已保存会话和草稿第二轮路径错误／缺历史，首次失败后编辑重发的保护测试保持通过；修复后新增三项全部通过。保存仍用同一 session ID、自定义标题、置顶及完整保存消息，生成失败重试保持原冻结请求，较新未发送草稿不混入历史。

验证：两文件原基线 104/104；新增红测 2 失败／1 通过（预期）；绿测 3/3，2.262 秒；行为回归加契约同步 113/113，65.255 秒；类型检查 exit 0；全量 2246/2246，189.429 秒、exit 0，0 失败／取消／跳过。日志与具体场景见[子计划](../superpowers/plans/2026-09-13-ai-session-continuation-history.md)。这批测试仅替换网络／设备边界，不发真实模型请求，累计付费验收仍为 0 次。

未修改 Web、contract/schema 字典或权限；没有新增服务端幂等。实际模型、超时结果未知、Web/App 双向续聊及真实持久化回读仍是 R-00/R-02/R-14 独立未完成项。
