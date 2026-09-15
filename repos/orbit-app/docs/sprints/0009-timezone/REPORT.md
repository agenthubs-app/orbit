# Sprint 0009 执行报告

设备时区已用于首页、待办、日历、活动列表／详情及安排预览。原生同一时刻在东京显示 09:30、洛杉矶显示前一天 17:30、Kolkata 显示 06:00；全天安排日期不随时区移动。未保存草稿保留原编辑时区，前台变化不自动保存。无有效设备时区时显示 UTC 并禁止时间写入；已有有效值读取失败时保留它并显示提示。

## 版本与范围

- 唯一执行：run-01；原 Planner SHA256 `e8a6a5ae644a65a2653c266873d0538d5bbc97dc6fe712db06c8af5198ff1e9a`，原始基线 `fca77373f123c03e29a0584cba46bade5f5eb907`。
- 政策与必要路径补充见 [APPROVED_SCOPE_ADDENDUM.md](APPROVED_SCOPE_ADDENDUM.md)。按 RULES §0 复用设备时区批准，未改写原 Planner 或降低 SC。
- 功能提交：`a4bbfd9f6`（协调者在主工作树集成）；冻结补丁 SHA256 `50ee9748f6d0f4391a782d6f3b806bb9dac6e8adee2a6971258a4a8318ee0a5b`。C 工作树实际产品文件与该提交逐文件对照无差异。
- 24 文件：新增 `src/time/date-time.ts`、`OrbitTimeZoneProvider.tsx`，接入根布局、八个消费者页面及七个 view-model；新增／补充时区、日期和提醒快速选项测试。提醒只调整展示和快速选项时间计算，不改变通知调度器。

## 验收证据

原始证据根目录为 C 工作树的 `build/harness-state/evidence/sprint-0009/run-01/`，已被 Git 忽略。以下均在该目录下；设备与数据库均为本线独立实例。

| SC | 结果及主要证据 |
| --- | --- |
| 01 | 设备值有效／无效、保留上次有效值、UTC 只读与恢复、前台变更通过 `tests/app-timezone-interactions.test.ts`。实现不读取账号偏好，不存在账号旧异步时区请求；身份切换继续由既有 auth/route 保护。见 `commands/ui-targeted.log`。 |
| 02 | 月末、年末、跨午夜、全天日与 DST 日边界已通过日期／home／today／schedule 模型测试。Simulator：Tokyo 首页有 9/14 日程，LA 首页同日移出；LA 日历 9/13 显示 17:30，任务、活动详情、预览均为 9/13 周日 17:30；Kolkata 活动列表显示 9/14 周一 06:00。见 `commands/models-green.log`、`commands/overnight-green.log` 及 `native/` 截图／AX。 |
| 03 | 日期独立于时刻；未改动分钟的保存保持原秒与偏移；DST gap/fold 拒绝，23/25 小时日、缺失午夜、Lord Howe 半小时重复时间有受控测试。原生 Tokyo/LA 编辑器均保留安排日期9/14，截止分别9/14 09:30与9/13 17:30；Kolkata原生06:00。见 `commands/date-green.log`、`commands/time-final.log`、`postgres-cross-client/native-kolkata*`。 |
| 04 | 路由交互验证脏稿在时区变化后保留、清洁稿更新、零隐式 PATCH、显式保存按原编辑区序列化；保留版本、幂等、身份、迟到回执保护。见 `commands/editor-foreground.log`、`commands/ui-targeted.log`。 |
| 05 | Hermes 原生日期／星期／时间非空，见 `native/c0009-event-detail-la*`、`c0009-preview-final-la*`、`c0009-events-kolkata*`。独立 PostgreSQL 同记录双端回读：任务 `task:1cbe185dad4deaf0bb42bbc7`，Web实际TaskDetailWorkspace显示2026/9/14 09:30，App实际编辑器显示9/14 09:30；SQL仍为dueAt00:30Z、plannedDate9/14。见 `postgres-cross-client/record.json`、两端截图／AX及`requests.jsonl`（仅GET，无隐式PATCH）。 |

同存储验收使用实际 Web TasksClient、HTTP task handlers、TaskService、TaskRepository、PostgreSQL，再由原生 App 和 Web 实际任务组件读取。合成 actor 通过依赖注入，Web 挂载页面是本地验收入口；不声称真实登录、生产数据库或线上完整旅程通过。公开活动原生证据使用独立合成 API；不把它记为活动数据库持久化证据。上述边界不影响本 Sprint 的日期解释与同记录只读对照，但后续写入／身份验收必须另取对应证据。

## 检查结果与失败记录

- 行为 RED→GREEN：日期／DST、页面时区消费者、跨午夜日历与提醒快速选项均保存原始 RED 和 GREEN 日志。
- 本线定向 UI 集：329/329；时间／提醒集48/48；task-dates完整文件40/40；home/today/date集62/62；日历最终17/17。具体命令在相应日志与 checkpoint。
- 本线 `npm run typecheck` 最终通过；首次不支持的 accessibilityRole=status 已修为alert，保留失败日志。
- 本线 `npm test` 曾为2606/2607：唯一失败为既有 workspace关闭按钮44pt测量返回43.99998474121094；未改该文件，随后完整文件44/44通过。原全量`commands/full.log`及复查`commands/workspaces-recheck.log`保留，不改记为本线全量通过。
- 主树集成后协调者执行 `npm run typecheck` exit0、App全量2632/2632、0跳过、`git diff --check`通过。证据在主工作树相同Sprint目录`commands/main-combined-typecheck.log`与`main-combined-timezone-tests.log`；后者317716.914ms。该结果覆盖实际提交版本。
- 修改前已进行 upstream impact，活动格式化与日期共用消费者HIGH/CRITICAL已报告并包含直接消费者验证。最终协调者两次GitNexus重建因parser worker timeout及Napi错误崩溃；detect_changes已调用，但旧索引staged漏报、all映射旧文档，不能作为零影响证明。以24文件冻结diff、源码调用检查与组合测试补充说明；索引限制保持未解决。

## 交接与环境

所有本 Sprint 必需行为 SC 已取得上述限定范围内的证据；功能已提交，报告待协调者单独提交并更新全局登记。0010 可消费 `a4bbfd9f6` 的 `useOrbitTimeZone`、`resolveLocalDateTime`、`localParts`、日界线与草稿时区规则。后续增加地点、清空日期、个人日程协议仍属于0010，不在0009实现。

本线无付费AI/OCR调用、无真实账号修改、无通知调度、无外部日历授权。独立Simulator `976A1865-54A3-4CE8-9E70-1A1A55CBAA7C`，Expo Go/Hermes+iOS26.4；仅进程TZ变化，未更改主机或其他Simulator时区。PostgreSQL18位于`/tmp/c0010-postgres-data`，监听127.0.0.1:55419，库/用户c0010，仅本线合成数据；留给0010继续使用。临时截图先写/tmp再归档；源码、命令与合成记录可重建证据环境。

回退由协调者按本功能提交范围处理，不能整树撤销A线或其他任务的变更。C旧worktree仍保留已集成产品diff，后续交付必须以已提交版本为增量基线，不能重复生成0009补丁。活进程及最新句柄见ignored checkpoint。
