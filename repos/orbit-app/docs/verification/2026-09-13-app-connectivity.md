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

## 11. R-00：5 美元累计验收费用控制

新增显式加载的 QA preload 与 Node 文件账本，见[执行计划](../superpowers/plans/2026-09-13-ai-acceptance-budget-guard.md)。每次已核定的 Flash 模型请求在网络前原子预留 $1.10，所有进程共用总额 $5；只有完整、合理且模型已知的成功 usage 可按保守上界费率下调。缺 usage、超时、HTTP 错误或解析失败保持全额预留。拒绝未知供应商／路径／模型／计费选项及自动重定向；账本缺失、损坏或独占锁冲突不回退为无计费请求。

本次保守费率为每百万输入 $0.44、输出 $1.32，故 1000 输入＋100 输出计为 572 microUSD；它高于当前核实的公开峰值，不称账户实付。将输入 1,048,576 与最大输出 393,216 分开上界计为 980419 microUSD，小于 $1.10 预留。缓存优惠不减免，OCR 第三次复核同样独立计数。后续续跑仍读同一账本，不得因换进程或功能清零。

验证：首轮 24 项红测失败后 24/24；自审新增 4 项红测捕获未知计费字段／原 Request 被消耗，修复后连同缺账本启动、OCR 三阶段等共 30/30。真实临时文件、12 个独立并发进程和实际本地 HTTP 服务参与测试；只在最外部供应商网络边界返回合成响应。最终类型 exit 0、契约 6/6、全量 2276/2276，180.585 秒、exit 0，0 失败／取消／跳过。精确日志见子计划。

源码影响：基于 `1bf649904` 刷新根图成功；所有新增脚本／函数未收录，upstream 为 UNKNOWN，而非已证明零风险。产品 app/src 没有引用该工具，未修改 Web、API DTO、provider 参数、权限或 UI。观测仅输出脱敏路由、状态、类型、时间与关联 ID，不含请求内容和凭证。当前还未启用到本地 API、未初始化真实验收账本、未触发付费请求；启用后的实际结果另记，R-00 不提前关闭。

### 11.1 14:00 启用与真实请求：仍未通过生成验收

工具提交 `bf1baa1e2` 后，仅以独占创建初始化一次本次账本，cap 5000000 microUSD、初值 0。按既有授权停止本轮自己的 Next 父进程 93129，确认旧 93130 不再监听；按相同 Next dev／webpack／127.0.0.1:3000 命令增加显式 preload 重新启动。新父进程 25115、服务 25124 和随后 worker 25456 均输出 ready，监听端仍为 localhost 原地址。Web 源码、环境文件、依赖锁定版本和产品参数未改；旧服务正常退出。

同一 Simulator／既有账号只读请求：health 200；匿名 events/conversations 401 单列权限边界；原生登录态 conversations/profile/tasks/events/contacts/sessions 均 200 JSON。14:01 普通旧 `initialMessage` 深链在原生输入框预填，未触发 POST，账本仍 0；这是新增真实原生证据，不仅是受控测试。

14:02 首页显式发送一条合成会面准备问题：根 POST 200 JSON（`44fb3f94-69ae-4845-9bfe-80ed8171c97a`），随后 sessions POST 200（`f9407d5d-122e-4372-9864-5c7e92a945a2`），canonical session GET 200（会话路径摘要 `9c906c52`）。回复实际为本地多意图澄清，明确未调用模型；“不要发送消息”的否定限制也被识别为另一个方向。费用仍 0，不作为真实生成通过，也未更改本地规则。保存与重开已发生，但这轮只有本地澄清的内容，不能覆盖完整 L3/L4 验收。

14:03 按提示收敛为单一会面开场问题，在同一 session 继续发送。provider 预留记录 `a92319eb-1e46-4bae-83a6-73264c86dffa` 与业务请求 `2ab97f6d-6d3f-4b8d-8ed4-0b0c15081f80` 关联；已获取 HTTP 200、已知模型和完整 usage，3195 输入／1126 输出，保守结算 2893 microUSD（$0.002893）。该业务根 POST 于 05:03:37.166 UTC 返回 **503 application/json、无重定向**，App 显示 SERVICE_UNAVAILABLE；未出现本轮保存 POST，旧 session 保留。模型响应的实际内容／schema 和具体业务失败原因尚未采集，不能把 provider 200 写成回答成功。

原 NON_JSON 故障与本轮 503 JSON 分开：锁定依赖恢复后路由编译及 JSON 响应恢复已有证据，但真实生成仍失败。已暂停盲目重试，补充仅含白名单类别的响应观测后再按预算和重试上限获取原因。日志 `/tmp/orbit-web-api-budgeted-20260913.log`；原生 AX 证据保存在本地 `/tmp/orbit-r02-native-prefill-budgeted-20260913.json`、`/tmp/orbit-r00-native-single-intent-pending-20260913.json`，不提交原文。累计 1 个真实模型请求、2893 microUSD，账本跨重启保持；不是用户整个账户的结算审计。

### 11.2 脱敏响应观测补充

仅在 QA 工具中对 AI conversations 路径收集至多 128 KiB 的临时响应分段，解析后只输出固定错误类别、白名单生成来源／模型／safety、保存确认、会话 ID 哈希及消息摘要哈希；不记录任意错误原文、回答、Cookie 或 token。编码、过大、非 JSON 情况明确标为未解析。原始 write/end 参数和完成回调不变，不拦截非 AI 路径正文；账本规则不变。

upstream impact：观测函数 LOW，一个 preload 调用者、0 个流程；新解析器未收录为 UNKNOWN。三项缺证据红测与一个 end(null) 兼容性红测均复现后修复，最终 34/34；类型 exit 0、契约 6/6；全量 2280/2280，184.223 秒、exit 0，0 失败／取消／跳过。具体日志见[执行计划](../superpowers/plans/2026-09-13-ai-acceptance-budget-guard.md)。未运行新的付费重试，累计仍 2893 microUSD。

API 源码范围另核：`repos/orbits` 最后涉及提交为 `8b38b4eb8`，当前 tree `b1bcc6df622c9122b7a1a435aca3cbe8963d3865`，无该目录 tracked diff。运行依赖已恢复但源文件没有改；App 的新增 QA 提交不冒充 API 业务修复版本。

14:16，观测版本 `fbab545e5` 重启后只读检查发现实际 JSON 使用 gzip，证据状态为 skipped_encoded，未误标业务解析成功，也没有付费重试。随后仅补有 128 KiB 解压输出上限的 gzip 观测；未知编码、损坏或超限仍显式未解析，原始网络响应与 Web 设置不变。新增红绿用例与整个 QA 套件 35/35、类型和 6 项同步检查通过；此小补充没有重跑产品全量，2280 全量是此前观测版本的证据。费用账本仍为 2893 microUSD／1 次，重试尚未执行。

### 11.3 14:18–14:22：真实生成、工具、续聊与原生重开通过

App/QA 版本 `60443e36a`，业务续聊实现 `1bf649904`，Web/API 仍为上述未改动 tree；同一 iPhone 17 Pro / iOS 26.4 Simulator、原登录用户（普通 App 会话，未提升权限）、`http://localhost:3000`。正常停止本轮自己的旧 Next 后以同一命令、同一账本重启；父进程 31565／服务 31574 均 ready。14:18 匿名 conversations GET 401 的真实 gzip JSON 成功解析为 UNAUTHORIZED；先确认观测有效，再点击一次原失败问题的“重新生成”，没有编辑问题或放宽服务端校验。

以下响应均为 application/json、无重定向，时间为 UTC（JST +9 小时）：

| 场景 | 时间 | 请求关联 ID | HTTP／业务证据 |
| --- | --- | --- | --- |
| 原冻结问题重试 | 05:20:16.371 | `598618cb-647e-4a9a-88b3-4cfa65915ca3` | 根 POST 200；success true；generationMethod=model-provider-live-agent-reply；provider=deepseek、model=deepseek-v4-flash；aiProviderRequested=true、domainToolsExecuted=true |
| 保存第一次真实回答 | 05:20:17.018 | `fb1c5688-c2be-459e-b7d2-c225a71207d6` | sessions POST 200；persisted=true；同一 session，4 条消息 |
| 返回 AI 首页后从最近会话重开 | 05:20:42.575 | `0b599d74-297e-41b6-961a-873a1244d388` | session GET 200；persisted=true；4 条消息；sessionRef 和 messagesDigest 与保存回执一致 |
| 重开后只问前文中的项目代号 | 05:21:13.618 | `101ba69e-0bad-4716-a57e-f367eba4494a` | 根 POST 200；真实模型回复来源，aiProviderRequested=true、domainToolsExecuted=false；原生回答与此前合成代号一致，新问题未重复提供答案 |
| 保存续聊 | 05:21:13.655 | `87b408bc-d652-4662-b2d6-34c930506510` | sessions POST 200；persisted=true；原 session 增至 6 条消息 |
| 再次离开重开 | 05:22:29.629 | `7bd80ea8-65a2-411d-a374-8781d7be2b60` | session GET 200；persisted=true；6 条消息；sessionRef 和 messagesDigest 与本轮保存回执一致；原生显示正确代号、空输入框、无失败重试按钮 |

会话脱敏引用为 `9c906c5272943a3bbb27a869b50ef98c626cb82246217149f0e9bb4ab281201c`。4 条消息的摘要为 `97d36c0bf90f776e71ff62016283e34c06aeb9daf76514ba4fc36400ead60a65`，6 条为 `8f0a89696e03f7356cc5cd4b369cb8aa2f712b7c8e931e3d9b517a77c32682e4`；摘要按保存／回读的有序 role/text 计算，不记录原文或原始 session ID。重开没有新增模型请求。原生普通字号下输入框 343×44、发送 44×44，键盘收起时底边 832.7，位于 402×874 屏内；不推广成 Dynamic Type 或实体设备验收。

费用账本覆盖此次重试的三个真实供应商请求（3195/998、3273/1945、1078/757 输入/输出 token，保守计 2724、4008、1474 microUSD）及代号续聊一次（3538/94，1681 microUSD）。加上原失败调用，累计 **5 次供应商请求、12780 microUSD，即 $0.012780 保守估算**，没有未结算预留；仍使用累计 $5 硬上限的原账本。一次 UI 请求可包含多次模型调用，未按按钮次数计费。

分层结论：本次同账号 Simulator 的 L1/L2、真实生成与工具读取 L3，以及 App 保存→服务端回读 L4 子场景通过；L5 仅上述原生路径。请求与回执证据在本地 `/tmp/orbit-web-api-gzip-evidence-20260913.log` 的 orbitQa 白名单记录中，原始日志不提交。没有报名、创建任务、修改资料、发信或运行 OCR。

失败记录没有被成功重试覆盖：14:03 的 503 内部原因仍未知，不能断言是 planner schema 或宣称消除了偶发 provider 失败；这次没有改 API 业务逻辑。Web 同环境同账号生成及双向写回未运行、服务端 B3 幂等和超时结果未知仍未解决、实体 iPhone 未验，因此完整 R-00/R-02/R-14 不关闭。下一责任方建议为 Web/API（未联系、未接单），需结合请求 `2ab97f6d-6d3f-4b8d-8ed4-0b0c15081f80` 定位首次 503，并提供幂等与跨端验收；App 可继续独立功能，不再为复现同一未知问题盲目付费重发。

## 12. R-04：报名草稿、问卷版本与当前页回读

按[报名子计划](../superpowers/plans/2026-09-13-registration-draft-and-readback.md)实现。刷新同一问卷时保留未提交答案、辅助问题／回答、对话轮次及画像预览；新问卷保留旧问题和答案供复制，明确确认清空后才载入，不把旧答案自动套到新问题。账号、服务器、活动及会话就绪状态隔离请求；同步锁覆盖报名、取消和辅助生成，迟到回执不覆盖新草稿或新身份。

仅在 2xx 且回执的报名／参与资料均属于当前账号与活动、目标状态正确时显示保存确认，再触发活动详情和报名两个 GET。该检查不是服务端幂等，也不是列表、首页或日历已更新的证据。辅助 persona 仍只在本页预览，不冒充已用于匹配。

### 12.1 自动化与影响范围

源码起点 `c1a8c3335`。根索引 254.4 秒刷新成功；既有 Screen、refresh、setAnswer、requestAdaptiveQuestion、generateAdaptivePersona、submitRegistration、cancelRegistration 为 LOW，refresh 的两个调用边为低置信度成员名关联；RegistrationForm 和 AdaptiveRegistrationCard 各一个直接上层调用者、关联六条资源读取流程；adaptiveBody 两个调用者。新增 helper／内嵌测试边界未收录，记 UNKNOWN。自审按既有单代理选择执行，没有独立代理审查声明；未改 Web、共享生成副本、权限或布局方向。

原基线 88/88。新真实路由交互的首轮有效红测 15 失败／1 通过；纯 helper 两项失败后实现。辅助问答测试还捕获旧 transcript 重复加入基础答案；自审追加用例捕获显式清空后恢复旧答案、旧回调提交旧草稿。最终定向 32/32（9.800 秒）、原事件回归 79/79（69.518 秒）、契约同步 6/6（0.377 秒）均 exit 0。测试只替换设备／登录与服务器来源／网络，真实 route、Screen、资源 hook、HTTP client、view-model 和 web 快照 adapter 参与；不产生真实报名或模型调用。

首次全量 2304 项中 2300 通过、4 失败，194.802 秒、exit 1。原因是旧页面样式测试的登录／服务器替身缺少账号 ID 和 ready、HTTP 回执缺少 status，且每次渲染创建新客户端。不削弱生产校验，仅对齐测试边界；报名场景明确为登录用户，其他访客场景不变。原断言、触控／字号要求和超时阈值保留，单文件 29/29、12.530 秒、exit 0；最终全量结果另记。早期新增测试中的表单等待和未决 Promise 等待错误也单列在子计划，不当作产品红测证据。

最终同一 `npm test` 复跑 **2304/2304，0 失败／取消／跳过，180.165 秒、exit 0**；类型复跑 exit 0，`git diff --check` exit 0。日志 `/tmp/orbit-r04-registration-full-corrected-20260913.log`、`/tmp/orbit-r04-registration-types-corrected-20260913.log`。旧失败结果不覆盖或混计。

提交检查发现短名 `orbit` 选中了旧工作树，返回“没有变更”，与 git 的八个暂存文件矛盾；废弃该结果，固定绝对路径 `/Users/xzhao/Projects/orbit` 重查。正确 root 索引检测为 HIGH、31 个触及项、六条报名读取流程（追加主计划后文件数另增），已提示风险并逐条阅读快照、地址、状态映射流程，重新核对既有十个函数 upstream 仍 LOW。AST 与 HEAD 对照确认实际修改上述 handler／Screen／两层表单，新加六个作用域与草稿函数和两个纯校验函数；PersonaPreview、RegistrationQuestion、useStyles 及旧 VM 接口未改，只因旧图行区间重叠被列出。新增函数缺图节点仍为 UNKNOWN，靠调用源码与真实路由回归补验。此纠正不宣称编辑前已使用正确短名解析。

### 12.2 同一原生设备的真实报名入口仍未通过

14:37–14:38 JST，同一 Simulator、既有普通用户与 `http://localhost:3000`；App 为 `c1a8c3335` 加本项 Screen／view-model 未提交改动，Web/API 最后涉及提交 `8b38b4eb8`、tree `b1bcc6df622c9122b7a1a435aca3cbe8963d3865` 不变。本轮没有重新构建原生二进制，页面由现有开发服务提供。

从活动列表进入实际非空、未来的公开活动，再点击“报名参加”（仅导航）：

| 读取 | UTC 时间 | 关联 ID | 结果 |
| --- | --- | --- | --- |
| 公开详情 `/api/events/public/:id-58aea07b` | 05:37:15.462 | `332252d7-b429-49e0-9351-3d2815f6d0b0` | 200 JSON，原生可见详情和报名入口 |
| 报名问卷 `/api/events/:id-58aea07b/registration` | 05:38:04.404 | `d46f7916-b41f-490f-b548-067873cd2c9b` | 500，无 Content-Type；未取得可填问卷 |
| 报名页旧私有详情 `/api/events/:id-58aea07b` | 05:38:04.966 | `093cc2a4-97a7-43c7-872d-fee2f6fea557` | 404 JSON；页面显示未找到内容，没有表单 |

公开详情页的 readiness／推荐／会后资料另有 404，未算业务通过。上述关联均来自同一 QA 服务进程的脱敏记录，日志 `/tmp/orbit-web-api-gzip-evidence-20260913.log` 不提交。没有点击报名提交、取消、辅助问题或画像生成；同一费用账本仍为 5 次、12780 microUSD，无新模型调用。没有账号切换、清缓存或创建替代活动。

只读源码确认两个详情接口的数据来源不同：公开详情读取 Canonical Public Event Catalogue，私有详情读取旧 CRUD/import service；报名 GET 则读取 Event Core 已发布活动。App 下一独立修复将消费现有公开详情，不造本地活动或绕过问卷错误。500 的实际内部原因尚未取得，下一责任方建议 Web/API，未联系或确认接单；不能写成依赖或模型故障已定位。

分层结论：公开详情 L1/L3 可读；报名 L1 收到 500／404，L3 未取得问卷，L4 未执行报名写入和回读，L5 只验证真实入口及错误呈现。普通输入、原生版本确认、真实提交、人数／跨页回读及答案进入匹配均未验。完整 R-04、R-01/R-14 保持开放；B2 的资格／服务端时间与允许动作、授权隔离样本和跨端配合仍是关闭条件。

### 12.3 报名页改用现有公开详情

在 `a0dff6171` 上只改 Screen 的 import 和详情 GET 调用；报名、取消、辅助接口及权限不变。当前绝对路径索引刷新成功，257.6 秒；Screen upstream LOW、无已识别直接调用者，测试 helper 只影响本文件。新增三个真实路由场景分别检查公开详情、详情失败、问卷失败；初次／保存／取消路径的有效红测为 5 失败／1 通过。两行修复后定向 35/35、10.454 秒，类型 exit 0；全量 **2307/2307，0 失败／取消／跳过，177.053 秒、exit 0**，含六项同步检查。精确日志见报名子计划。

同一原生开发页面在 05:54:07.243 UTC 读取公开详情 200 JSON，请求 `2cea8512-7605-44ef-8cdf-5528fe522352`；没有再请求旧私有详情。问卷 GET 于 05:54:07.377 仍返回 500、空 Content-Type，请求 `c4bd3e33-fb42-4bed-b49e-23d178f58097`。没有重启 API、重建二进制或切换账号，Web tree 不变。

AX 显示“尚未报名”、两个空 TextArea、“确认报名”和辅助入口，未显示问卷错误；这与本次网络 500 并存，已有内容不能作为本轮问卷成功证据。资源 hook 当前允许快照／已有状态保留，这是后续需要补齐的提示和提交边界；本批不清除缓存掩盖问题。未输入答案或点击任何写操作，费用仍 5 次、12780 microUSD。

追加一次匿名只读诊断，同一公开活动 `/registration?questions=false` 返回 401 application/json、UNAUTHORIZED（108 字节），没有身份凭证、生成问题或任何写入。因此路由并非对所有请求都在编译阶段失败；登录态 500 内部原因继续待 Web/API 排查，不能据匿名结果宣称已定位或已修复。自动化的“错误可见”只覆盖无快照边界，下一批增加真实资源 hook 的缓存失败用例。R-04 原生报名与跨端闭环仍未通过。

### 12.4 只走网络确认问卷，失败保留草稿并停用写入

App 起点 `fdbc78928` 加本项未提交改动；未修改 Web/API，tree 仍为 `b1bcc6df622c9122b7a1a435aca3cbe8963d3865`。仅报名资源选择 `network-only`，跳过快照读写而不删除既有缓存；默认资源继续先出缓存及失败保留内容。初始读取失败没有表单；已填表单刷新时保留答案／辅助草稿，但等待或失败期间不允许报名、取消、下一题或画像生成。手动重新读取仍只有报名与公开详情各一个 GET，无自动 POST 或额外验证请求。

根索引刷新 262.0 秒、exit 0。共享钩子 upstream CRITICAL、47 个直接依赖，已在编辑前报告；Screen、Form 和 refresh LOW。提交前检测返回的 20 条流程均已阅读，涉及任务、消息、联系人和活动的快照／错误／状态映射。`load` 被连到 Pods 的 C++ `getCacheSize`，只读确认那里调用 atomic `cacheSize_.load()`，不视为真实 TS 调用者；内嵌测试 helper 缺节点为 UNKNOWN。测试 bundler setup 的新增快照边界在改动检测后补核 LOW，不宣称它已在编辑前单独核过。

基线 38/38；首轮新增回归 7 失败／27 通过，15.947 秒。实现后 42/46，四项只因两个独立 GET 不再固定先后顺序；改为精确核对每轮路径、次数和参数后 **46/46、11.900 秒、exit 0**，类型 exit 0。默认缓存成功／网络失败保留、network-only 的 JSON 500／非 JSON 500／断网、初始旧快照拒绝、重试恢复及同帧旧写回调均由真实 hook/client/Screen 覆盖；仅外部网络、原生快照 I/O 和设备／登录来源替换。完整回归结果另记。

15:09 JST 在同一实际 Simulator，从同一公开活动进入报名页一次；没有重启 API、重建二进制、切换账号或清缓存：

| 读取 | UTC 时间 | 关联 ID | 结果 |
| --- | --- | --- | --- |
| 报名页公开详情 | 06:09:16.067 | `ceed5d83-3669-4ab7-bbb0-e06eaf728b13` | 200 application/json |
| 报名问卷 | 06:09:16.628 | `04e5d959-ed8d-4ad8-a8ea-4954be531095` | 500，无 Content-Type |

AX 和本地截图共同确认：显示“页面暂时无法加载”和无法识别响应的错误信息；“重新读取报名资料”触点为 370×49，位于屏内；没有 TextArea、报名提交、取消或辅助生成入口。截图 `/tmp/orbit-r04-freshness-native-20260913.png` 仅留本地，不提交。没有点击重读或任何写操作。原累计账本保持 5 次已结算调用、12780 microUSD、$5 硬上限，无新供应商调用。

分层结论：L1 如实取得问卷 500；L5 的本次错误呈现通过。有效问卷 L3、普通输入、真实报名／跨页／跨端回读 L4、匹配消费均继续未验；不能以错误保护修复关闭 R-04。下一责任方仍建议 Web/API（未联系、未接单）定位该请求，补齐 B2 资格、允许动作与授权验收样本。

最终全量 **2315/2315，0 失败／取消／跳过，182.977 秒、exit 0**，包含契约、Schema 和字典同步检查；日志 `/tmp/orbit-r04-registration-freshness-full-20260913.log`。`git diff --check` exit 0。该全量结果只证明本地自动化范围，不替代上方仍缺失的业务联验。

## 13. R-08：待办日期与截止时间编辑

按[日期编辑子计划](../superpowers/plans/2026-09-13-task-date-editing.md)补齐现有待办详情设置：安排日期、截止日期与东京截止时间独立保存，不夹带未提交标题／备注。只使用现有版本和幂等 update 协议；非法日期、半组截止输入及清空已有值明确拒绝。服务端新版不覆盖脏日期，显式放弃入口在设置面板内可见。保存检查当前草稿／版本、2xx、回执归属和保存字段；账号、服务器、任务、就绪状态或卸载撤销旧请求。修改日期不会重排提醒，也不申请通知／系统日历权限。

### 13.1 本地行为验证

基线 52/52。纯日期 helper 先有 22 项行为失败，再有 13 项错误回执失败；实现后 37/37。真实路由入口的 22 项红测全部因缺少入口而失败，完成后路由 22/22。自审新增旧回调用例捕获本地新输入、同帧输入及已读新版本后的过期 PATCH，三个有效红测后修复；另用一项有效红测修复回执已接受、GET 尚未完成时日期徽标仍旧的问题。最终定向及旧回归 **116/116、21.734 秒、exit 0**；最终类型 exit 0，契约／Schema／字典同步 **6/6、1.497 秒、exit 0**。真实 route、Screen、hook、HTTP client、VM 和 RNW 参与；外部网络、原生 I/O 与认证来源替换，不把受控响应叫作真实持久化。

首轮集成的 16 项失败是 Expo UUID 替身错误依赖 about:blank 中不可用的浏览器 randomUUID；改为确定性测试 ID，产品 UUID 不变。首轮旧回调测试有两项错误等待未决请求而超时；修正测试触发方式后才记录有效行为红测。首轮全量 **2378 项中 2373 通过／5 失败，191.692 秒、exit 1**；五项均为旧工作区样式 fixture 缺少 signedIn/base-ready 导致待办内容未显示。只补全登录／服务器／任务归属字段，保留所有断言及超时，原文件 44/44 通过。失败日志不覆盖，精确路径见子计划。

第二轮全量 2378 项中 2377 通过／1 失败，203.128 秒、exit 1：未修改的名片复核用例点击等待超时；单文件原 28 项随后全部通过。未确认负载是否根因，未改名片代码、断言或超时。索引结束后相同全量命令最终 **2379/2379，0 失败／取消／跳过，177.897 秒、exit 0**，日志 `/tmp/orbit-r08-task-dates-full-delivery-20260913.log`；类型日志 `/tmp/orbit-r08-task-dates-types-delivery-20260913.log`。

根索引强制刷新完成，467.6 秒、exit 0，日期新 helper 与回调可定位；绝对路径 staged GitNexus 变更检查为 11 个 App 文件、LOW、0 条列出的受影响流程。结合实际 diff 自审，生成副本、Web 和根 Bridge 未改；不以图中无流程替代对共享 mutation 五个调用者的回归。

### 13.2 同一 Simulator 只读入口与原生输入布局

15:29–15:33 JST，App 为 `07b64fbc6` 加本项未提交改动，仍使用原开发服务，没有重建二进制。iPhone 17 Pro / iOS 26.4 Simulator、既有普通登录用户、`http://localhost:3000`；Web/API 最后涉及提交 `8b38b4eb8`、tree `b1bcc6df622c9122b7a1a435aca3cbe8963d3865`，无 Web diff。

从任务列表打开既有任务的详情（未触碰完成复选框），再打开日期设置；以下均 application/json、无重定向，时间 UTC：

| 读取 | 时间 | 关联请求 ID | 结果 |
| --- | --- | --- | --- |
| `/api/tasks` | 06:29:15.728 | `df24dc8f-4385-4005-ac9e-f8dcb552d64d` | 200；原生非空列表 |
| reminders（脱敏段 `a53ebed8`） | 06:30:05.316 | `9facc245-c62a-40a4-b0be-be2b73bff703` | 200；设置可见既有提醒 |
| task activities（任务引用 `65fa8f24`） | 06:30:07.451 | `d1090922-6c9f-4000-b2c9-e3d42fb2ee86` | 200；设置可见历史 |
| task detail（同一引用） | 06:30:07.460 | `bab0fd8f-7eda-4e72-ac5b-2764a0a92746` | 200；安排日期及东京截止时间回填 |

AX 与本地截图共同确认：日期行 370×48，三个输入内框约 368×46，保存按钮 370×48，关闭 44×44。只聚焦截止时间，没有键入；系统键盘出现时该输入仍可见。滑动后键盘收起，保存按钮可达；没有声称键盘常驻时保存按钮始终可见。随后关闭设置，没有点击保存、完成、删除或任何提醒动作；对应时段 QA 记录无非 GET 请求。

截图 `/tmp/orbit-task-dates-native-{settings,keyboard,keyboard-scrolled}-20260913.png` 已查看，仅留本地。RNW 普通／深色／320pt 双倍字号三个变体亦已查看，输入和固定关闭按钮可达、无水平溢出。原生旧长标题仍有裁切，这是已开放的 R-12 问题，本项不宣称修复。

分层结论：此既有任务的 L1/L2/L3 只读与 L5 新日期输入布局有实际证据；真实 PATCH、服务端持久化、首页／待办／日历同记录回读、Web↔App 双向修改和实体 iPhone 未执行。没有授权隔离业务对象，不为验收制造真实任务。累计 AI/OCR 账本仍 5 次已结算、12780 microUSD、无未结算预留，$5 硬上限不变。

R-08 仍缺地点、个人日程创建／修改协议、清空日期与提醒联动语义，以及全局时区策略和跨端闭环。下一责任方建议 Web/API（未联系、未接单）补 B6 协议；App 不修改生成副本、不写根 Bridge。本子功能不关闭完整 R-08 或 R-14。

## 14. R-12：普通字号待办长标题

### 14.1 原生失败、原因与最小修复

实施起点 `5b454f73bc233d07d8ebd744412d78c7145a33d3`；沿用已批准 R-12 与待办视觉、单代理、原目录和逐功能 commit。此项是既有布局的局部修复，没有新设计、文案、业务协议或依赖变更；`frontend-design` 约束为保持现有字体、字号、颜色与操作布局。GitNexus upstream：TaskDetailScreen LOW、0 个图中直接调用者／流程，实际路由仍为 `app/tasks/[id].tsx`；useStyles LOW、1 个直接 Screen 调用者／0 流程。本轮只修改 Screen 的标题高度约束，不修改 useStyles 或共享原生实现。

15:44 在同一 iPhone 17 Pro / iOS 26.4 Simulator，系统 content_size=large（普通字号）、appearance=light，重新采集原先失败任务：完整值已进入 TextArea，框高 `32.000000000000014pt`，截图末尾不可见。既有 `tests/native/task-title-layout.mjs` 在相同标题／64pt 最小值上再次 exit 1；不是直接复用昨日失败日志。

源码确认：标题在内容尺寸尚未正确报告时设置精确 `height=32`；本地 React Native 的 `BaseTextInputShadowNode::measureContent` 按外部尺寸约束测量并 clamp，`RCTTextInputComponentView::updateLayoutMetrics` 再据布局赋值输入框 frame 和发布内容尺寸。只将 `height` 改为 `minHeight`，保留原来每行最低高度、onContentSizeChange、字体缩放、内容和焦点／保存处理。该单变量改动后，原生首次更新即为 64pt；返回列表，再从真实同一任务详情入口重开，仍为 64pt，截图均确认全文可见。没有增加固定两行、隐藏溢出、关闭缩放或重挂载整屏。

| 检查 | 结果 | 本地证据 |
| --- | --- | --- |
| 最新原生 RED | 完整值；32pt < 64pt，exit 1，截图裁切 | `/tmp/orbit-r12-task-title-native-red-20260913.log`、`/tmp/orbit-r12-task-title-before-20260913.{json,png}` |
| 同页更新后的原生 GREEN | 完整值、64pt，exit 0，截图全文可见 | `/tmp/orbit-r12-task-title-minimum-result-20260913.log`、`/tmp/orbit-r12-task-title-minimum-20260913.{json,png}` |
| 返回列表后重开 | 完整值、64pt，exit 0，截图全文可见 | `/tmp/orbit-r12-task-title-remounted-result-20260913.log`、`/tmp/orbit-r12-task-title-remounted-20260913.{json,png}` |
| 日期／待办交互与样式回归 | 60/60，0 失败／取消／跳过，19.844 秒、exit 0 | `/tmp/orbit-r12-task-title-minimum-regression-20260913.log` |
| 类型检查 | exit 0 | `/tmp/orbit-r12-task-title-types-20260913.log` |
| 最终全量 `npm test` | 2379/2379，0 失败／取消／跳过，180.060 秒、exit 0；包含六项同步检查 | `/tmp/orbit-r12-task-title-full-20260913.log` |

既有原生脚本本身已能捕获此退化，未通过改变断言或阈值使其通过；RNW 回归不能替代这项原生尺寸与目视检查。按 code-review 清单单代理复查：仅一处高度约束变化，保留输入、草稿、焦点和保存语义，未发现本修复范围内的重要遗留问题，不称独立代理审查。最终 staged GitNexus 为 4 个 App 文件、LOW、0 条列出的受影响流程，8 个匹配项包含文档章节而非 8 个生产函数；实际源码仅一行差异。`git diff --cached --check` exit 0。

### 14.2 真实读取与验收边界

仍使用原 App 开发服务与 `http://localhost:3000` 的同一普通账号，没有重建二进制、重启 API、改服务器或登录。Web tree 仍为 `b1bcc6df622c9122b7a1a435aca3cbe8963d3865`，无 Web 改动。返回列表及重开详情的 QA 元数据如下，均 GET、200、application/json，时间 UTC：

| 读取 | 时间 | 请求 ID |
| --- | --- | --- |
| `/api/tasks` | 06:45:35.419 | `be92d746-dbf1-4f42-a3e6-ba4490a63728` |
| reminders（脱敏段 `a53ebed8`） | 06:45:50.482 | `190047c4-0139-4fde-bb28-c5469708cf04` |
| task detail（任务引用 `65fa8f24`） | 06:45:50.490 | `08dc211a-2f3d-4883-884b-ab59ee027e30` |
| task activities（同一引用） | 06:45:50.494 | `7d710f96-c29e-4193-ad44-d9a63abb9f72` |

截图均已逐张查看，只留本地，不提交原文、截图或 AX。未触碰完成框、未输入／保存任何字段、未发起提醒、删除或 AI/OCR；对应时段元数据无非 GET 请求。本项证明普通字号的既有长标题原生显示修复，不证明持久化写入、实体 iPhone、VoiceOver、全 App 三语或运行中 Dynamic Type 双向热切换。后者共享 RN 测量路径仍需独立审批方案，整包原生和完整 R-12／R-14 均未关闭；无需 Web/API 协议变更，根 Bridge 由协调者更新。

## 15. R-05：回复草稿的写入边界

源码起点 `eb3c4f968`；沿用已批准 R-05 的草稿／真实发送区分和原有界面，未增加真实发信能力。只编辑 App，Web/API 源码树仍为 `b1bcc6df622c9122b7a1a435aca3cbe8963d3865`，没有修改接口、认证、数据、依赖或根 Bridge。

### 15.1 已确认原因与实现范围

原详情页只检查 HTTP envelope 的 `success`，即使载荷为空、属于另一会话或只表示 pending，也会展示“回复草稿已保存”并清空输入。`sendMessageState` 只用于文字，没有阻止 blocked/pending/unknown 写入；空线程反而没有输入框。状态级 pending 不能拦住同一帧双击，成功 POST 的线程覆盖值又会遮住后续 GET。账号、会话、服务地址变化没有撤销请求，默认读取快照也不能证明当前写权限。

当前实现：

- 当前线程必须从网络读到，ID、载荷状态和消息数组相符；只用既有 `ready`、`canSendInMock`、确认边界及未对外发送标志决定能否保存预览，不视为平台聊天资格。
- 未保存草稿在普通刷新和读取失败后保留，失败／读取中暂停保存。刷新开始立即撤销旧回调的写权限；新 GET 可更新已显示消息，不被 POST 的旧线程永久覆盖。有效空线程仍能写草稿。
- 同一版未确认成功的草稿重试复用请求体 `requestId`；同步请求锁防双击，旧正文回调不能提交后改输入。2xx、业务 success、相同会话／正文／记录 ID、本人角色、已记录草稿、明确未对外发送及返回消息列表同时匹配，才清空输入。有效确认后重读线程与提取结果。
- 账号、Cookie 会话、服务器、路由和就绪状态各自界定独立生命周期；切换／卸载 abort 旧请求，迟到响应不触发旧账号过期事件或填回页面。摘要继续由用户主动触发，并使用同一生命周期及单次请求保护，不增加自动生成。
- 提示明确“联系人资料不代表已验证的平台账号”和“仅保存草稿，不会发给联系人”。未引入身份猜测、接收方匹配、邀请或外部投递逻辑。

后端只读核实：`features/chat/service-factory.ts` 的 live 路径使用账号作用域 provider；`live-service.ts` 和 `storage/chat-conversation-live-record-provider.ts` 实际可持久化预览记录，并用 workspace/account/conversation/requestId 生成稳定记录 ID。此行为不等于外部投递；现有共享契约没有 B4 的已验证接收方资格，不能凭手填联系人直接启用发信。这里是源码证据，不是本轮真实写入或服务端并发验收。

### 15.2 自动化与失败历史

真实 private route、Screen、hooks、HTTP client 和 view-model 运行于 RNW/Playwright；只替换设备／认证／快照边界和外部 fetch，不连业务服务、不发送 AI/OCR。

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| 首轮业务 RED | 27/27 按预期失败：权限、双击、误清稿、缓存与身份撤销 | `/tmp/orbit-r05-chat-draft-red-20260913.log` |
| 首轮实施复跑 | 测试设备替身错误：about:blank 不支持 `crypto.randomUUID`，页面未挂载；不算业务 GREEN | `/tmp/orbit-r05-chat-draft-green-20260913.log` |
| 仅修正 Expo UUID 替身后 | 27/27 通过，0 失败／取消／跳过，10.782 秒 | `/tmp/orbit-r05-chat-draft-green-fixture-20260913.log` |
| 追加异常载荷／既有回归 | 41 通过、5 失败：3 个新增边界缺陷，2 个旧源文本断言绑定旧调用格式 | `/tmp/orbit-r05-chat-draft-regression-red-20260913.log` |
| 修复后聊天定向套件 | 47/47 通过，0 失败／取消／跳过，13.671 秒 | `/tmp/orbit-r05-chat-draft-targeted-20260913.log` |
| 最终 `npm run typecheck` | exit 0 | `/tmp/orbit-r05-chat-draft-types-delivery-20260913.log` |
| 首轮 `npm test` | 2411 通过、5 失败，0 取消／跳过，191.992 秒；均为旧跨页面聊天夹具及旧预期 | `/tmp/orbit-r05-chat-draft-full-20260913.log` |
| 补齐旧夹具后的受影响回归 | 91/91 通过，0 失败／取消／跳过，21.364 秒 | `/tmp/orbit-r05-chat-draft-regression-final-20260913.log` |
| 最终 `npm test` | 2416/2416 通过，0 失败／取消／跳过，194.187 秒，exit 0 | `/tmp/orbit-r05-chat-draft-full-final-20260913.log` |

追加回归中，3 个业务问题是缺失／外部发送边界仍获成功、null 载荷没有可见错误，均先 RED 再修复。旧 POST 源码格式断言已由真实路由交互覆盖：检查具体端点和正文、显式摘要、回执显示及刷新；其余旧断言保留，不跳过失败。新增套件共 37 个场景。UUID 替身问题已记入 App 本地学习记录，与此前 R08 的同类错误关联。

首轮全量的 5 个失败全部在 `app-wide-workspaces.test.ts`：两个浅／深色草稿布局、失败保稿、按钮字重、空线程反馈。该旧夹具缺少 thread 的 `state`／发送边界、POST 的状态码及完整 `message`，且 empty 仍返回非空消息。已按实际协议补齐夹具，精确请求预期包含 `requestId`，新提示文案与保稿断言同步；原有圆角、字重、触控、导航和空／加载态检查均保留。没有为旧夹具放宽生产校验。

GitNexus：详情页／草稿组件及相关回调为 LOW；共享 `relationshipChatThreadToView` 的预查为 HIGH（3 个直接调用点），该函数及其展示映射未修改。新增验证器和作用域容器尚未被现有图收录，UNKNOWN 不当零风险；已逐处核对实际调用及完整路由交互。按用户既有单代理要求使用代码审查清单自审，不声称独立代理审查。提交前 staged 检查为 8 个 App 文件、32 个触及项、MEDIUM、2 条已核实的快照读取流程；触及项含文档、常量和旧行号重叠，不是 32 个实际改动函数。

TypeScript AST 对比确认：现有 Screen 文件改动 7 个函数、新增作用域容器和编辑回调，没有移除函数；view-model 的所有既有函数保持原文，只新增 3 个校验器。图中被旧行号重叠列出的 `firstParam`、提取／按钮展示函数、`relationshipChatMessageSendToView` 等并未改动。未暂存检查列出 2 条快照流程；资源链接无法定位时，使用根仓库绝对路径的图查询核实两条均经过 `useApiResource → readSnapshot`，本功能显式选择 network-only，默认快照实现没有修改。

### 15.3 实际 Simulator 只读结果与交接

同一 iPhone 17 Pro / iOS 26.4，UDID `9BF990F2-45B8-42CE-8543-E583B941DA17`，浅色普通字号。原有当前会话和 `http://localhost:3000`，没有改账号、地址或会话资料。

| 时间（JST） | 操作／原生结果 | HTTP／请求 ID |
| --- | --- | --- |
| 15:58:33 | 打开关系对话，列表真实为空，显示“暂无关系对话” | GET `/api/chat/conversations`，200 JSON，`453c1ec9-8780-46c8-b137-f6ead3f98d09` |
| 15:59:47–48 | 读取专用不存在会话的负向路径；详情显示内容不存在，没有草稿／摘要写入口 | detail GET 404 JSON，`fa48aa4e-a61a-4a05-bd2c-9bf1af342ebc`；extractions GET 404 JSON，`3e038965-f46d-4231-8c88-03e1ab6eca35`；脱敏会话段 `:id-9e130791` |

AX 与截图 `/tmp/orbit-r05-chat-list-native-20260913.{json,png}`、`/tmp/orbit-r05-chat-missing-native-20260913.{json,png}` 已实际查看，均不提交。请求元数据来源 `/tmp/orbit-web-api-gzip-evidence-20260913.log`，本时段只有上述 GET，没有 POST。

L1/L2：原账号读取列表 200，负向详情 404 的协议与错误呈现有证据。L3/L4：没有可用非空会话，不制造真实记录，未执行保存、摘要、发送／接收、持久化或跨端回读。L5：本次只覆盖空列表及不存在会话的原生错误状态；有效输入、键盘、长草稿和真实保存仍未验。完整 R-05、R-01、R-14 保持开放。

交接给 Web/API／Bridge（建议下一责任方，未联系、未接单）：提供 B4 的验证绑定、资格／撤销、有效邀请、授权的两账号样本及真实投递契约后，再做邀请→绑定→资格刷新→收发／拒绝与 Web/App 同记录回读。App 不凭联系人 ID 或现有预览标志补写这些能力。此次无 AI/OCR 调用，累计 $5 预算不变；根 Bridge 由协调者更新。

## 16. R-11：首页角标刷新

### 16.1 范围与实现

实施基线 `e19e93b4f`，仅改 `HomeDashboardScreen.tsx` 与其已有路由交互测试。首页原本已有账号／会话隔离、失焦卸载角标和前台恢复读取；本次没有重建这些能力。已复现的缺口是首页下拉只刷新三块业务数据，角标的两个读取源继续使用原作用域；有效完成待办后也只读取待办。

现在下拉递增角标读取版本，让既有 hook 同步重读 `/api/chat/relationship-inbox` 和 `/api/notifications`。只有当前操作收到 2xx、匹配任务 ID 和 completed 状态的有效回执，才执行完成后的重读。新版刷新撤销旧角标请求，迟到 401 不触发失效会话事件。

保留原有未读会话＋提醒条数的口径、99 上限、读取缓存、布局与触控。没有把暂时忽略改成已读，没有乐观减数，也没有增加实时订阅或自动写入。缺少服务端新数据时，受控测试能证明刷新行为，不能证明真实计数发生改变。

### 16.2 验证

| 检查 | 结果 | 日志 |
| --- | --- | --- |
| 新交互 RED | 3 个预期失败，1 个已有保护通过；2.110 秒，exit 1 | `/tmp/orbit-r11-home-badge-red-20260913.log` |
| 首页与收件箱 view-model 定向 | 68/68，0 失败／取消／跳过，16.584 秒，exit 0 | `/tmp/orbit-r11-home-badge-targeted-20260913.log` |
| 类型检查 | exit 0 | `/tmp/orbit-r11-home-badge-types-20260913.log` |
| 全量回归 | 2420/2420，0 失败／取消／跳过，190.180 秒，exit 0 | `/tmp/orbit-r11-home-badge-full-20260913.log` |

新增 4 项使用实际 Home 路由、Screen、hook、HTTP client 和 view-model，替换原生／身份／快照／fetch 边界：下拉发出 5 个 GET 且角标从 3 更新为 8；有效任务完成后重读两个角标源；连续刷新撤销旧请求并抑制迟到 401；错误回执既不改角标也不启动额外重读。没有访问真实业务服务。

GitNexus 编辑前分析：`HomeDashboard` 1 个直接调用点，`refresh` 2 个，`complete` 1 个，均 LOW，未列出受影响流程。TypeScript AST 对比确认实际差异只改这三个函数；未暂存检查为 2 个文件、6 个触及项、LOW、0 流程，旧行号重叠的 `navigate` 并未修改。依照用户既有单代理要求按审查清单自审，未声称独立代理审查。最终 staged 检查为 4 个 App 文件、11 个触及项、LOW、0 流程；包含文档与行号重叠项，不等于 11 个实际改动函数。

### 16.3 Simulator 与交接

同一 iPhone 17 Pro / iOS 26.4 Simulator，浅色普通字号，原账号和 `http://localhost:3000` 不变。Web/API 源树仍为 `b1bcc6df622c9122b7a1a435aca3cbe8963d3865`。16:11 打开首页显示角标 40、10 条待办；16:13 首次手势未触发请求，不算通过。核对 AX 的 402×874pt 坐标后，16:14 从日程空态文字区域下拉，出现以下请求：

| 时间（JST） | GET 路径 | 结果／请求 ID |
| --- | --- | --- |
| 16:14:06.042 | `/api/tasks` | 200 JSON，`96decde7-3295-4370-98c5-4d1e881f597f` |
| 16:14:06.052 | `/api/schedule-items` | 200 JSON，`1b0a9fe3-c4c0-473b-bf2b-fc6bc838a9b3` |
| 16:14:06.071 | `/api/contacts` | 200 JSON，`88f6ee75-5b7c-4e88-8c47-bc50860c1871` |
| 16:14:06.085 | `/api/chat/relationship-inbox` | 200 JSON，`38b5414b-bfa9-4a68-9764-510315379559` |
| 16:14:06.252 | `/api/notifications` | 200 JSON，`49f066be-8456-4617-94b3-f2e09d84a316` |

读取后角标仍为 40，没有点击待办完成或执行其他真实业务写入。AX／截图 `/tmp/orbit-r11-home-before-refresh-20260913.{json,png}`、`/tmp/orbit-r11-home-confirmed-refresh-20260913.{json,png}` 已查看；请求元数据在 `/tmp/orbit-web-api-gzip-evidence-20260913.log`。截图、个人内容、日志均不提交。

L1/L2 与本次 L5 下拉读取有实际证据。真实已读、任务完成后的通知变化、L4 跨端回读、权限撤销、实体推送和通知目标仍未验。Web/API 无源码或契约变化；下一步继续核对收件箱现有已读／导航和身份隔离。完整 R-11/R-14 不关闭，根 Bridge 由协调者更新。此次未新增 AI/OCR 费用。
