# 页面层级审核 — "分组标题 + 行" 结构（Sprint 0084 · SC-0084-01）

设计案（已批准）：https://claude.ai/artifact/RPmcSJo9GBTkucNoBPUj97

## 审核方法

设计案定义了四个角色：**分组标题**、**可点入口**、**字段标签**、**静态值／输入**（外加**破坏性动作**）。
审核对每个候选页面回答一个问题：**这四个角色是否出现在同一列、并且用相同的字号字重渲染？**
只有答"是"的页面才有本 Sprint 要修的那个毛病。答"否"的页面记录原因并排除，不因为文件里有个叫 `sectionTitle` 的样式就改它。

候选来源：设计案列出的四组页面，加上全仓 `sectionTitle: {` 样式定义的普查（19 处）。

## 结论一览

| 页面 | 四角色同列？ | 现状实测 | 处置 |
| --- | --- | --- | --- |
| 编辑资料 / 更多资料 / 资料建议 / 资料预览 / 公开视图 / 标签选择（6 页） | **是** | 共用 `ProfilePagePrimitives.tsx`：`sectionTitle` 15/800、`rowLabel` 15/600、`input` 15/400、`fieldLabel` 12/700 | **改共用组件** |
| 设置 | **是** | `SettingsScreen.tsx:250` `sectionTitle` 15/800、`:270` `destinationText` 15/600，且"服务器"分组标题与行标签同字符串 | **改本页样式 + 改文案** |
| 账号与工作区 | **是** | `AccountScreen.tsx:265` `sectionTitle` 15/800、`:277` `accessText` 15/600 | **改本页样式** |
| 权限中心 | 否 | `AccountPermissionsScreen.tsx` 无分组标题样式；页面是卡片列表不是标签值行 | 排除 |
| 服务器设置 | 否 | `ApiSettingsScreen.tsx` 无分组标题；单表单页 | 排除 |
| 通知投递 / 通知发现 | 否 | `NotificationDeliverySettings.tsx:21` 的 17/600 是**卡片标题**（与 hint 成对），不是列内分组标题；两者本就与 15/400 的开关行拉开了 | 排除 |
| 活动详情 | 否 | `EventDetailScreen.tsx:1346` 的 `sectionTitle` 用在 `:396/:672/:692`——"关于""当天安排"领起的是**正文段落与时间轴**，下面没有标签值行，四角色不同列 | 排除 |
| 待办详情 | 否 | `TaskDetailScreen.tsx:402` `contentHeading` 领起正文；`:565` `sheetTitle` 是弹层标题 | 排除 |
| 个人日程编辑 | 否 | `ScheduleScreen.tsx:754` 的 `sectionTitle` 是**按日期分组的列表组头**，下面是日程卡片不是字段行 | 排除 |
| 首页 / 活动列表 / 联系人管道 / 联系人详情 / 名片导入 / Agent 账本 / 活动运营等（其余 12 处 `sectionTitle`） | 否 | 均为内容区段标题，领起卡片或图表 | 排除 |

**命中 8 个页面，落在 3 个文件**（6 页共用一个 primitives 文件）。

## 三个页面的四角色实测

### 1. `ProfilePagePrimitives.tsx`（编辑资料、更多资料等 6 页）

| 角色 | 符号 | 现状 | 问题 |
| --- | --- | --- | --- |
| 分组标题 | `sectionTitle`:137 | 15px / 800 / ink | 全页最重，却是信息量最低的那一行 |
| 可点入口 | `rowLabel`:150 | 15px / 600 / ink + `text4` chevron | 与分组标题只差一档字重；chevron 与静态值同色 |
| 字段标签 | `fieldLabel`:143 | 12px / 700 / text3 | 与 `sectionDetail`（12px / text4）几乎一样 |
| 静态值／输入 | `input`:146 | 15px / 400 / ink，无边框 | 与行标签同字号，输入框读起来像静态行 |

**证据截图**：`docs/todo-evidence/2026-09-18-profile-edit.png`、`-profile-more.png`（phoneweb 390×844，账号 Sync QA A）。

**连带观感**：编辑资料页里"我能提供"（分组标题）下面紧跟"选择标签"（`ProfileNavRow`），"怎么联系我"下面紧跟"打开更多资料"和"查看资料建议"——两个同样粗的标题连着出现，读者分不清第二行是不是另一个分组。

### 2. `SettingsScreen.tsx`

| 角色 | 符号 | 现状 |
| --- | --- | --- |
| 分组标题 | `sectionTitle`:250 | 15px / 800 / ink |
| 可点入口 | `destinationText`:270 | 15px / 600 / text + `text3` chevron |
| 静态值 | `valueText`:285 | 14px / 400 / muted |
| 破坏性动作 | `signOutText` | 14px / 600 / rose |

**最尖锐的一处**：`settings` 分组 `server` 的分组标题用 `settings.server` = "服务器"，它下面唯一那行 `settingsDestinations[2].titleKey` **也是** `settings.server` = "服务器"。同一个字符串、同一列、只差一档字重，上一行是标题下一行是入口。设计案要求把行标签改成"当前服务器"。

### 3. `AccountScreen.tsx`

| 角色 | 符号 | 现状 |
| --- | --- | --- |
| 分组标题 | `sectionTitle`:265 | 15px / 800 / ink |
| 可点入口 | `accessText`:277 | 15px / 600 / ink |
| 静态值 | `workspaceDetail`:271 | 12px / 400 / text3 |
| 破坏性动作 | `signOutText`:280 | 14px / 600 / rose |

## 实现决定

**规格放在 `src/design/tokens.ts` 的一个新导出里，不在三个文件里各写一遍。** 仓里已有 `textStyles.section`（15/800），但它被 65 个文件引用、覆盖全 App 的内容区段标题；改它等于把本 Sprint 的范围扩大到每一个屏幕。新增一组只服务这四个角色的样式，由命中页面引用。

**不在前端各页复制规格**——`ZH:` 挑段逻辑在 App 里已有 10 份副本，那正是这类"每页各修一次"留下的债。
