# Sprint 0010 — 事项与个人日程编辑执行报告

任务支持地点与日期／截止时间清空，个人日程支持无联系人创建、编辑、删除和再次打开。Web 与 App 使用相同记录及版本；冲突保留草稿，重试复用幂等意图。修改任务日期保持已有提醒的绝对时间，页面明确说明此规则。

## 版本与范围

- run-01；Planner SHA256 `5f169b6879af07d7f21515e1d02f7f9ab14a9bcd0b207d950c47080be0c66c16`。
- C 工作树 HEAD `fca77373f123c03e29a0584cba46bade5f5eb907`，承接 0009 功能 `a4bbfd9f6`、报告 `563800fd7`；必要协议及文件补充见本 Sprint `APPROVED_SCOPE_ADDENDUM.md`。
- 主线功能提交 `d005c2b79`（61 files，1265 行新增／47 行删除）。最终补丁 61 文件，SHA256 `e94ec5eb4c079b7d0583a966d898cd5778b6ef91c4dbf8653d083abc66c4eea6`；相对 `a4bbfd9f6` 仅包含 C 实际修改路径，未带回主树其他线的旧版本。主线接收时 `source-manifest.json` 对冻结的61文件逐一核对，零漂移。集成后仅两处非业务调整：`tests/mobile-route-access.test.ts` 保留 A0003 已生效的登录后资料完善预期；Web `features/tasks/local-date-time.ts` 删除尾部空白行。最终集成代码以功能提交为准，原冻结补丁保持不变。
- Web 新增个人日程服务／路由及页面；任务与个人日程在 PostgreSQL 事务中完成版本检查、记录、活动和幂等回执写入。App 契约通过同步脚本更新；接入原日期编辑器、新个人日程页面及首页、待办、日历消费者。未改通知调度器或外部日历。

## 验收证据

证据位于主工作区 `/Users/xzhao/Projects/orbit/repos/orbit-app/build/harness-state/evidence/sprint-0010/run-01/`，C 工作区保留同一份冻结原件。本次使用独立 PostgreSQL、合成账号与专用 Simulator。实际 Web 组件和原生 App 经 HTTP 客户端、真实 route handler、服务与仓储访问同一 PostgreSQL；鉴权入口注入合成 actor，不把它称作生产登录验收。Web 本地验收外壳保留 C0009 标题，内部已挂载本次实际代码。

| SC | 行为、文件及证据 |
| --- | --- |
| 01 | `PersonalScheduleWorkspace` 实际创建无 contactId 的 `personal:650f4eb77a3496ee91d1a70b`，App 重新打开同 ID，显示个人日程／已安排；原生编辑地点后 Web 回读一致。`personal-schedule-interactions` 覆盖实际 App screen+HTTP client 的创建、失败重试、重开及删除确认；Web client 丢响应重试只保存一条；PG 两客户端测试覆盖并发、幂等及回滚。见 `cross-client/personal-created.json`、`verified.json`、两端截图及对应 commands 日志。 |
| 02 | 任务 `task:a97ea85212189bf698f4f6ab`：Web 保存 plannedDate=9/16、dueAt=null、location=null，未提交标题未夹带；App 读取空字段，再保存纯日期9/17和地点123；Web 同 ID回读，无 dueAt，原始标题未改变。个人日程可清空结束时间／地点，保持未改秒数并拒绝 DST 无效／重复时间。见 `task-dates`、`task-date-interactions`、`personal-schedule-editor` 及 `cross-client/verified.json`。 |
| 03 | 原生旧版本保存返回409，错误可见、草稿保留；刷新不覆盖脏稿，显式放弃后加载最新空字段。测试覆盖 actor／ID／字段错误回执、换号迟到保存、同幂等键重试。PostgreSQL 证明并发旧版本仅一胜，回执失败同时回滚记录／活动；冲突不会新增活动。原生任务截图与 `task-mutations-postgres` 为证据。App/Web 重复挂载取消信号问题经真实浏览器 RED→GREEN 修复。 |
| 04 | 同一提醒修改前后完整 DTO 相等，`fireAt=2026-09-17T00:10:00Z`，两端东京显示9/17 09:10。原生／Web 文案说明保持原计划，HTTP 记录无提醒修改、无外部日历权限请求。fixture 为 in_app；未声称实体设备推送送达，未改变引擎。见 `reminder-before.json` 与 `verified.json`。 |
| 05 | 原生首页、待办、日历读取同一任务／个人日程；周视图个人日程09:30及地点只显示一次，9/17任务为全天、地点123。原生键盘完成日期／地点编辑；实际 Web 双向修改与重新读取。新增 `/tasks/personal` 原生深链打开真实个人日程列表。0009时区/DST与公开安排预览零写入直接消费者回归保留。见 `cross-client/c0010-calendar-week-location-once*`、`c0010-personal-alias*`、各阶段 native/web 截图及 requests.jsonl。 |

两端最后执行实际 HTTP + PostgreSQL 断言通过（`commands/cross-client-final.log`）：任务和个人日程 ID 不变、个人记录唯一、任务标题不变、清空持久化、纯日期无伪造午夜截止、冲突无额外活动、提醒 DTO 不变。

## 检查结果

- 两端最终 typecheck exit0；最终 `git diff --check` 与补丁反向检查通过。
- App 直接消费者180/180；全量后夹具／路由5个完整文件34/34；最后个人日程／日历4个完整文件36/36，含真实 RNW StrictMode 读／保存和地点去重。
- App 最终全量为2604通过、15失败、0跳过（2619项）。失败集中新增个人列表所需焦点hook／GET夹具和私有／同名路由登记，已修复并完成上述完整文件复查；原全量仍记录失败，未再重跑。
- Web 最终全量2997通过、52失败、182跳过、0 TODO（3231项，222086.745083ms）。`web-failures.json` 逐项分类：12项全局审计、4项provider环境、36项显式缺数据库配置。任务及个人日程行为测试通过，独立 PostgreSQL 两项事务测试通过；个人页面/API4/4。
- provider 环境失败在清空全部模型key（包括DEEPSEEK）后，三个完整文件离线复查63/63。未改无关模型、OCR、数据库迁移或审计模块；全量失败及跳过不算通过。
- 全局审计仍缺多项既有运行证据，也未登记本次新增个人日程路由；独立原生／跨端证据不冒称已经更新全局审计。与既有0020报告相同的环境／审计失败类型保留，未以“基线问题”消除未完成检查。
- 主线整合验证：App/Web typecheck exit0；App直接组合初次152/154，恢复A0003已有登录后资料完善预期后，该完整文件10/10、完整组合154/154；Web个人日程/任务/UI组合26/26，任务/日期重检17/17。所有provider key显式清空。`git diff --cached --check`通过。
- 协调者实际运行 staged GitNexus detect_changes，旧索引返回 `No changes detected`，不能把它称作有效影响覆盖。协调者人工审核精确61文件后提交；此前主索引重建失败限制保留。修改前影响分析与直接消费者验证见留存日志。

## 限制、费用与交接

功能验收限定为上述合成 actor、独立 PostgreSQL 与 Expo Go/Hermes+iOS26.4；未修改真实账号。首页无关联系人 fixture 不完整时显示读取错误，未声称已完成联系人功能。实体推送送达及线上完整登录旅程未测，不属于本次保持提醒时间的结果。

人工 C 业务验收未调用付费模型；Web 全量中旧“未配置key”测试回退环境 provider，出现两项 OCR provider failure 和 AI／语言响应。未捕获 token 使用量，本轮新增费用待核实，不能写为零。已通知协调者，不再调用付费服务，不重置累计 $5 上限或原 $0.012780 账本。

0010 已发布为 `d005c2b79`，0022 可消费本次 Task 版本／幂等和可清空字段契约。0022 不改本次编辑器，筛选及私有入口独立推进；建议／草稿工具迁移仍需 B0006 的真实已交付接口，不能以 mock 替代。回退只按功能提交范围处理，不覆盖 A/B 的工作。Bridge 与主登记表由协调者更新。
