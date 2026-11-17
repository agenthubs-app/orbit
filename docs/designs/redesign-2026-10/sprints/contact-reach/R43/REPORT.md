# Sprint R43 — REPORT（2026-11-17）

## 结果

SC-R43-01～04 通过。两端「插入候选时间」换成一周 30 分钟格子：点一格 = 涂一段会面时长，点已涂 = 删整段，按住拖 = 涂 / 擦（可斜拖跨天）；站内信按时长切成不重叠候选（≤5，第 6 个起变浅），邮件按段写入正文。协调者在模拟器上实测发现 3 处问题并修复（见「协调者修正」）。

## 提交

| SHA | 内容 |
| --- | --- |
| `aad73dea7` | 原型 ⑧ App / ⑨ Web（用户定稿） |
| `fb1e69924` | PLANNER |
| `59500dd10` | 共用：`sliceMeetingCandidates`（sent / extra / short）、`formatMeetingRangesText`（三语）、`replaceMeetingSlotsText` 识别新段落；App sync |
| `ee2c7a42e` | 共用：涂格纯函数 `paintTap` / `paintRect` / `paintedRanges` / `cellsInRanges` / `isCellPaintable`；App sync |
| `e9b3eb62f` | Web：`MeetingSlotPicker.tsx` + css、`copy/task.ts`、`ContactReachModal.tsx`（邮件按段）、`tests/ui/contact-reach.test.tsx` |
| `941a59f10` | App：`MeetingSlotPickerSheet.tsx`、`ContactReachScreen.tsx`、`BottomSheet` 可选 `scrollEnabled`、i18n、copy-kinds、`tests/contact-reach-screen.test.tsx` |
| `e0cc970e4` | 协调者：App 模拟器修正（下述 3 处） |

## SC 表

| SC | 结果 | 证据 |
| --- | --- | --- |
| 01 共用函数 | 通过 | `tests/scheduling/meeting-slots.test.ts`：整除 / 尾巴 / 短段 / 超 5 / 跨天排序 / 无效段；三语全文；新旧段落替换；涂格规则。App compute-sync / contract-sync 通过。 |
| 02 Web | 通过 | `contact-reach` 12/12（点 / 删段 / 竖拖 / 斜拖 / 擦 / busy 与午休跳过 / 改时长重切 / 第 6 个浅色 / <3 禁用 / Enter / 翻周 +14 天 / 邮件按段 / 重开还原 / 旧草稿无 ranges）。改期回归全绿。协调者复跑 Web 定向 32/32。 |
| 03 App | 通过 | `contact-reach-screen` 15 例；协调者复跑 App 定向 63/63。**模拟器实测**（iPhone 17 / iOS 27，本地 :3000）：按住拖周三 13:00→15:30 涂成一段并切出 2 个候选，拖动时弹层不滚；点周四 11:00 涂一段 60 分钟、编号按时间重排；从格子外滑动弹层正常滚动，表下汇总与链接输入框可见。 |
| 04 基线 | 通过 | 定向：Web 53→60 全过、App 44→45 全过。**全量按名对照**（干净导出 fb1e69924 vs 941a59f10）：orbits 8342/fail 28 → 8349/fail 28，新增 0；App 3564/fail 6 → 3565/fail 7，按名 2 条「新增」（`shell-back-restore` 滚动恢复、`notification-registration-races` 失败信封）在 R43 版本单独各重跑 2 次全过，判为负载 39 下的时序抖动，实际新增 0。orbits `tsc -p tsconfig.build.json` 0 错；App `tsc` 仅既有 `ios-scene-lifecycle-config.test.ts(47)`；copy:qa forbidden 3（与改前逐行一致）。 |

## 协调者修正（模拟器发现，`e0cc970e4`）

1. **快速单点不涂**：按下把手势写进 state、松手却读上一次渲染的快照，点得快时松手读到空 → 改为手势存 ref（同步写），state 只画预览。
2. **表放不下一屏**：时长 / 形式两排整宽分段 + 链接输入框排在表上方 → 照原型 ⑧ 收成一行两个小选择钮（ActionSheet），链接 / 地点挪到汇总下方。测试改为点选择钮再选项。
3. **不可约虚线格隔行消失**：整点行的细上边框与虚线边框宽度、颜色不一致，iOS 不画虚线 → 整点线只加在可涂格上。

## GitNexus

`MeetingSlotPicker` HIGH（7，经 `MeetingProposalModal` → `CalendarWorkspace`）：只走 insert 模式，改期回归全绿。`BottomSheet` CRITICAL（87）：只加可选 `scrollEnabled`（默认 true）。`replaceMeetingSlotsText` UNKNOWN：文本搜索确认只有两端联系弹层使用。其余 LOW。Generator 开工前重建了索引。

## 偏离与假设（协调者裁决：全部接受）

1. 日文首行「60 分ほど」带空格（与旧段落一致）；中英照 PLANNER。
2. `MeetingSlotSelection.ranges` 为可选（旧草稿可读），picker 交回时必带。
3. 邮件模式按 `minimum === 1` 判断；邮件不画编号 / 切线 / 浅色，短段仍画空心框。
4. 涂格规则放进共用计算（两端一套、可单测）。
5. App 拖动时关闭弹层滚动（`BottomSheet.scrollEnabled`），格子容器 PanResponder 接管。
6. 标题仍为「候補の時間を選ぶ · 最大 5 件」（别处测试断言）。
7. App 汇总候选写「星期 + 时间」，跨周时看不出哪一周（与原型一致）。
8. 键名 `pickNeedThree` / `calendar.pick.needThree` 保留、文案加 `{count}`；删 App `calendar.pick.noOpen`。
9. 颜色全用 token：超出 = ink-4，涂预览 = ink-2，擦预览 = surface-3，切线 = bg。

## 未完成 / 待看

- Web 未在浏览器里手动目测（本地登录需要读测试密码，未这样做）；由 12 个浏览器 UI 测试覆盖。
- 真机（非模拟器）手势未验。
- 模拟器截图在会话 scratchpad `sim-r43/`（未入库）。
- 不 push、不部署（规则）。
