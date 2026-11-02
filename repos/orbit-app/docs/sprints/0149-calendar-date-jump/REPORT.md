# Sprint 0149 报告 — 日历快速跳到任意年、月、日

## 1. 结论

| SC | 结果 | 证据 |
| --- | --- | --- |
| 01 月/周/日视图跳转定位正确，跨年正确 | 通过 | `tests/calendar-date-jump.test.tsx`，第 3 节 |
| 02 标题可点、有无障碍标签；取消不改日期 | 通过 | 同上 |
| 03 phoneweb 截图 | 通过 | 第 5 节 |
| 04 全量与类型检查无新增失败 | 通过 | 第 4 节 |

## 2. 改了什么

- `src/screens/calendar/CalendarContent.tsx`
  - :59-62 标题改成按钮：文字后面加下拉箭头（`down` 图标），无障碍角色 button，标签是「标题 + 选择日期」（例如「2026年11月 选择日期」），最小 44×44。
  - :65-66 点标题打开现有的 `PersonalScheduleDateTimePicker`，日期模式、弹窗、带年份网格；打开时选中的是日历当前选中的那天。点「完成」走原来的 `onSelectDate`（就是 `CalendarScreen` 的 `setDateKey`），点「取消」或背景只关弹窗。
  - 三种视图都只按选中日期算：月视图显示那个月，周视图显示包含那天、从周日开始的一周（和日历原来的周起始一致），日视图显示那天。`CalendarScreen.tsx` 没改。
  - 标题原来的 `accessibilityRole="header"` 去掉了：按钮里套标题语义不对，按钮标签已经念出标题。
- `src/screens/schedule/PersonalScheduleDateTimePicker.tsx`:10-11、:29 加可选参数 `latestYear`：年份列表从这一年往前排。不传时和原来一样（`max` 或今年），其他 9 处调用没动。日历传「选中年份 + 10」，这样也能跳到以后的年份。
- 文案：`calendar.view.pickDate`（中「选择日期」、日「日付を選ぶ」、英「Choose a date」），也用作弹窗标题；`copy-kinds.ts` 登记为 label。
- `src/components/ui/Segmented.tsx`:118（单独一个提交）：截图时发现日历上方「日 / 周 / 月」切换在网页上是空的，只看到一个白色小块。原因是 inline 选项用 `flex: 0`，在 react-native-web 上按 0 宽起算，文字被压成 0 宽。加 `flexBasis: "auto"` 后文字显示正常。这不是这次改出来的问题，修改前就有。同一个 inline 写法也用在首页组件设置和邀请页，网页上一起变好；原生上 `flex: 0` 本来就按内容算宽，不受影响。

## 3. 测试

先写测试，确认 7 条都失败（找不到标题按钮），再实现。`tests/calendar-date-jump.test.tsx` 在 Chromium 里用 react-native-web 渲染真实的 `CalendarContent`、`calendarProjection` 和选择器，外层只放一份和 `CalendarScreen` 一样的日期/视图状态。

- 标题是按钮，标签含当前月份，有箭头图标，点击区域不小于 44×44；「回到今天」还在。
- 打开选择器时选中的是 2026-10-07，没有时间列。
- 月视图：2026-10-07 → 年份网格选 2024 → 2024-02-29，标题变「2024年2月」，下方日程标题是「2月29日」。
- 以后的年份：年份网格选 2030 → 2030-06-15。
- 周视图跨年：选 2027-01-01，周条是 27、28、29、30、31、1、2（周日开始），1 号是高亮那天。
- 日视图：选 2025-12-31，标题含「2025年12月31日」。
- 取消：翻到下个月点 11-20 后取消，日期还是 2026-10-07，`onSelectDate` 一次也没被调用。
- 第二个提交补一条：「日 / 周 / 月」三个文字宽度大于 0（修之前是 0，失败过）。

定向：`calendar-date-jump`（8）、`calendar-content`、`calendar-failure-locale`、`calendar-meeting-screen-r20a`、`personal-schedule-picker-interactions`、`ui-components-render`、`legacy-ui-ratchet`、`relationship-inbox-screen-source` 都通过。

## 4. 全量与类型检查

- `npm run typecheck`：通过。
- `npm test`：3448 条，通过 3443，失败 3，跳过 2。失败的是已知的 3 条：`API Schema 副本与服务端真源保持逐字一致`、`契约副本与源逐字一致`、`native app has a route for every web app surface`。`personal-schedule-interactions` 这次通过。

## 5. 运行时检查（phoneweb）

- 服务器：本 worktree 的 orbits，`next dev` 在 8092，连本机新建的空库 `orbit_0149_runtime`（`db:migrate:live`、`db:migrate:sync-revision`、`scripts/migrate-web-runtime.ts`），`ORBIT_MODULE_MODE=live`，没有 AI key。
- App：`EXPO_PUBLIC_ORBIT_API_BASE_URL=http://127.0.0.1:8091 expo export --platform web`，`scripts/phoneweb-server.cjs` 在 8091，上游 8092。Chromium 390×844，2 倍图，中文。HTTP 注册 `qa0149@example.test` 后在登录页登录，打开 `/task?seg=calendar`。
- 过程：标题「2026年11月」带箭头，按钮 148×44 → 点开，弹窗选中 11 月 2 日（今天）→ 点「2026年11月 ▼」出年份网格（2036 到 1936）→ 选 2028，往前翻到 3 月，点 15 → 完成。日历变成「2028年3月」，15 号高亮，下方是「3月15日周三」。切到周视图，显示 3 月 12–18 日，15 号高亮。页面没有报错。
- 截图：
  - `0149-zh-light-title.png` 关闭状态，标题带箭头
  - `0149-zh-light-picker.png` 选择器打开，选中今天
  - `0149-zh-light-picker-years.png` 年份网格
  - `0149-zh-light-picker-year.png` 换到 2028 年 3 月并选中 15 号
  - `0149-zh-light-month-after.png` 跳转后的月视图
  - `0149-zh-light-week-after.png` 跳转后的周视图
- 看图发现的问题：「日 / 周 / 月」切换是空的，已修（见第 2 节）。截图是修好之后重新导出、重新拍的。
- 收尾：8091、8092 已停；3000 没碰。`orbit_0149_runtime` 已删除。`repos/orbit-app/dist` 是导出产物（git 忽略）。

## 6. 自己做的判断

1. 跳转直接复用 `onSelectDate`，没有给 `CalendarContent` 加新回调：点日期格和跳转本来就都是设置选中日期。
2. 年份列表上限是「选中年份 + 10」。选择器原来最多只到今年（生日用），日历需要往后看，所以加了 `latestYear`。往前一共 101 年。
3. 日历用 `yearJump` 模式，所以弹窗里没有「今天 / 明天」快捷键；外面的「回到今天」按钮保留。
4. 标题文字不限制一行，太长时换行（和原来一样），不截断。
5. 「日 / 周 / 月」的修复不在这次需求里，但它在截图里一眼就能看到，而且一行就能修好，所以单独提交了。

## 7. 没有验证的

1. 没在真机（iOS / Android）上看，只有 phoneweb。原生弹窗动画、箭头和标题的对齐要真机确认。
2. 只看了中文浅色。英文日视图标题较长（如「Wed, September 30, 2026」）在窄屏上的换行，和深色模式都没截图。
3. Segmented 的修复只在日历页看过，首页组件设置和邀请页没在 phoneweb 上复查。
