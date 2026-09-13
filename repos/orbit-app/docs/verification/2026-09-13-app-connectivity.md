# App 连通性执行记录：R-00 / R-01

状态：进行中。已定位本地 API 依赖缺失造成的编译失败，尚未恢复环境或证明 AI 生成／保存可用；没有完成任何整项功能验收。

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
| CON-B01 | AI 会话导入链无法解析锁定的 @vercel/queue | 本地 Web/API 环境；待授权恢复现有 lockfile 依赖，或对应负责人处理 | 模块可解析，实际路由能编译；原场景 App 发送、工具、保存、重开回读通过 |
| CON-B02 | 名片／信号导入链无法解析 heic-convert；另有 ingest v2 queue 缺失 | 同上；恢复后先只读非空批次／图片，再按授权做 OCR | 原生批次读取与协议通过；后续真实导入闭环另验 |
| CON-B03 | 原生首页三个资源都显示非 JSON 错误文案，但缺对应响应元数据 | App/API 联合排查；先恢复环境，保留状态与原账号 | 分别记录 schedule/tasks/contacts 的实际响应并成功读取；不以单个健康结果代替 |
| CON-B04 | Web 同账号对照、AI/OCR 调用预算、真实写对象未确定 | 需要用户提供／批准场景；不代表另一端已接单 | 环境、账号角色、对象、费用硬上限明确后执行并保留回读证据 |

建议恢复操作只限本地 `repos/orbits` 已声明／已锁定依赖，必要时重启这一 Next 服务；不升级 package/lock、不改 API 业务源码、不改数据库／鉴权／provider、不部署。**这是待授权方案，本轮未执行。** 若安装发现锁文件冲突或新构建问题，先报告，不自行扩展到升级或重写接口。

R-00 关闭之前还须捕获同环境实际失败／成功响应，并以真实新回复、工具结果、保存确认和两端回读完成验证。依赖安装成功不是功能完成。R-01 和其余 R-02–R-14 均保持开放。

## 6. 本轮验证与提交边界

- 起始 `npm test`：2190/2190，0 失败／取消／跳过，175.259 秒，exit 0。日志 `/tmp/orbit-r00-baseline-20260913.log`。
- 本轮未改生产代码或测试用例；既有自动化通过不能替代上述真实业务验收。
- `npm run typecheck`：exit 0；日志 `/tmp/orbit-r00-typecheck-20260913.log`。
- 契约／Schema／字典同步检查、API client、base URL、AI 会话六个测试文件：89/89，0 失败／取消／跳过，24.675 秒，exit 0；日志 `/tmp/orbit-r00-boundaries-20260913.log`。没有执行同步写操作或付费请求。
- `git diff --check`：exit 0；新文档的相对链接、矩阵条目及暂存差异在提交前复核。没有更改早期设计原件的既有格式。
- 提交只包含本计划进度及脱敏验证文档；不包含截图、原始日志、认证数据、依赖目录、独立 prototype 或 Web 改动。不推送。
