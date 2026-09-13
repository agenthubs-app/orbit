# 0009 设备时区技术准备

2026-09-14，只读准备与待审提案；没有开始 Generator，没有修改产品符号。用户已确认跟随设备，不再要求选择账号优先策略。本页不独立覆盖 PLANNER；批准并合入契约前不得以本页启动实现。

## 已确认的源码边界

| 位置 | 当前行为 | 本次实施需要改变的边界 |
| --- | --- | --- |
| `src/view-models/task-dates.ts` | draft 用 Asia/Tokyo；patch 拼 +09:00；分钟未变时保留原秒数／偏移 | 把同一个明确 timeZone 传入 draft 与 patch；保留 unchanged 和回执校验。 |
| `src/view-models/home-dashboard.ts` | 东京日期、固定日界线，日结束直接加 86,400,000 毫秒 | 使用设备当地日界线；下一日不是固定 24 小时。日历日期运算与绝对时间分开。 |
| `src/view-models/today-tasks.ts` | 日期／星期分段格式化，东京默认 | 保留 Hermes 分段兼容，只改显式时区输入；不能退回组合格式化。 |
| `src/view-models/schedule.ts`、`events.ts` | 东京格式化和 +09:00 辅助时间 | 同一设备上下文贯穿过滤、展示、选择和预览；不只改屏幕文案。 |
| `src/screens/today/TodayScreen.tsx` | memo 固定 `todayPath("Asia/Tokyo")` | 请求键包含当前设备 timeZone，前台变化后更新读取；旧请求不能覆盖新键。 |
| `src/api/endpoints.ts` | `todayPath(timeZone)` 已编码 query | 可复用现有参数，无需新增账号时区 API。 |
| `src/screens/tasks/TaskDetailScreen.tsx` | 展示与提醒 timeZone 固定东京 | 显示、日期编辑、提醒请求使用一致时区；不顺手重写提醒权限／清空语义。 |
| `src/screens/home/HomeDashboardScreen.tsx` | 已有 AppState 前台／焦点读取管理 | 与现有生命周期协调，不另造第二套页面轮询。 |

GitNexus query 找到 taskDateDraftFromView、buildTaskDatePatch 与 Web TodayService 定义，没有返回执行流程；这不是“无调用者”。本页用实际源码补充核对；实施前仍须每个待改符号 upstream impact。

## 待审技术方案

### 时间来源

采用设备 `Intl.DateTimeFormat().resolvedOptions().timeZone`，通过显式 formatter 校验有效 IANA 值；首次渲染与 AppState 回到 active 时读取。不新增 expo-localization 依赖、账号时区字段或同步设置。设备时区是当前设备事实，不能被旧账号 profile.timezone 覆盖。

设备返回无效值／Intl 异常时：保留本次已确认有效的设备值并显示读取异常；首次就无有效值时 UTC 仅用于标明为 UTC 的只读展示，拒绝本地日期时间保存并保留草稿。不能静默用东京，也不能把旧账号偏好当设备缓存。该失败策略属于本书面提案，尚未批准。

### 日期与时刻

- `plannedDate` 和全天日期是 YYYY-MM-DD 日历值，不转 UTC、不加伪造的中午或午夜来代表业务时刻。合法日期沿用服务端支持范围，星期／月历计算可使用纯 UTC 日历运算。
- `dueAt`、startsAt、endsAt 和 fireAt 是带偏移绝对时刻；过滤和标签按同一有效设备 zone 解读，序列化回 UTC ISO。
- 当地一天的窗口是该日开始到下一日开始的半开区间。由各边界分别解析，不用加 24 小时；跨日事件和恰好结束于零点的事件保留当前半开区间语义。
- 分钟输入未变时保留原始 deadline 的秒／毫秒／时刻，不为统一格式制造无意义 PATCH。

### DST 与草稿

提案采用显式拒绝歧义，不静默替用户选：不存在的当地时间返回 invalid 并提示重新选时刻；重复的当地时间在缺少明确偏移时也返回 invalid，保留稿。已有记录即使落在重复区间，只要用户未改分钟，继续保留原绝对时刻。

编辑开始锁定有效 `editTimeZone`。回前台发现 zone 改变时，未修改的视图可刷新；有脏稿时保留输入及原 editTimeZone，提示“此草稿按原时区保存”，保存请求使用该明确时区，不能用新设备值重新解释旧输入。离开／取消编辑后新编辑采用新 zone。账号／服务器／事项切换仍沿用原身份隔离机制，不带走旧稿。

纯函数负责解析和阈值，不交给模型；候选绝对时刻必须格式化回目标 zone 精确核对年月日时分，不能依赖宿主 Date 自动归一化。实现前在 date-time 测试中明确重复、缺失、半小时偏移案例；若现有运行时无法可靠完成转换，停止依赖步骤并记录，不擅自加库。

## 精确验收样本

本节是新测试要求，不是已运行结果：

| 输入／操作 | 预期 |
| --- | --- |
| 同一 `2026-09-14T00:30:00Z`，Tokyo 与 Los Angeles | 当地分别为 9 月 14 日与 9 月 13 日，各页一致；原 ID／时刻不变。 |
| plannedDate 为 2026-09-14，切换设备 zone | 始终是 9 月 14 日，不产生 dueAt。 |
| America/New_York，2026-03-08 02:30 | 不存在的时间不能生成 patch。 |
| America/New_York，2026-11-01 01:30 | 无明确偏移时不能静默选择两个时刻中的一个。 |
| Asia/Kolkata，09:00 输入 | 序列化须包含半小时偏移效果，不四舍五入为整数小时。 |
| 有脏稿时 Tokyo → Los Angeles | 保留输入与编辑时区，零自动 PATCH，显式保存不变更解释。 |
| 午夜边界／月末／闰年／事件结束于当地零点 | 按纯日期与半开窗口分别断言；全天不当作 instant。 |
| 原秒数为 42.123，分钟未编辑 | unchanged，不抹掉秒和毫秒。 |

## 本地准备证据

产品基线 `585c3abaa`，仅文档在工作树变化。2026-09-14 在 App cwd 执行：

```sh
node --test --import tsx --import ./tests/helpers/register-render-hooks.mjs tests/task-dates-view-model.test.ts tests/home-dashboard.test.ts tests/today-tasks-view-model.test.ts tests/schedule-view-model.test.ts
```

退出码 0；68 tests、68 pass、0 fail、0 skipped。这是现有固定东京行为基线与回执保护的证据，不是新设备时区测试、RED、原生验收或 0009 完成证据。没有因此运行全量、修改偏好或访问业务 API。

## 修订 Planner 时必须对齐

1. 原标题与 SC-01 的“账号时区优先”已被用户的设备策略取代；修订为设备来源、异常、前台变化及身份隔离，不再等待账号时区字段发布。
2. SC-05 改成相同有效显示 zone 下两端同记录读数一致；不同设备可以当地日期不同，但绝对时刻一致。不能要求全球所有设备墙上时间相同。
3. 明确传入 timeZone 的具体调用签名与消费文件，再冻结哈希；现有白名单尚需覆盖实际受影响的列表消费者，不能因读过源码自动扩张。
4. 本页的异常／DST／脏稿策略仍属书面提案，完成审阅才可开 run；用户离线期间不发问题、不默认批准。
