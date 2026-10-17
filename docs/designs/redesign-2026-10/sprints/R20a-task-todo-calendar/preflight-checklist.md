# R20a 画板预检（进行中）

SC-11a 日程提案骨架先核对 b3-daily-actions.html #25–#29。其余 R20a 画面尚未预检；完整画面清单、业务界面与像素门禁不能据此标记完成。

工具证据：`/Users/xzhao/orbit-sprint-evidence/redesign/R20a/run-01/sc11a-preflight.{md,json,log}`。运行 `board-preflight.mjs --design b3-daily-actions.html --board-index 25,26,27,28,29 --no-variants --no-bundle`，exit 0。

| 项 | 本轮结论 |
| --- | --- |
| 画板自洽 | 五块画板疑似数字不自洽为 0。候选数量和正式提交规则留 SC-11 实现。 |
| 数据 / 功能来源 | SC-11a 只渲染标题和「候補を選ぶ → 形式と場所 → 送る前の確認」空结构，来源为两端日中英字典。contactId、appointmentId、initialCandidates 按 §7.6 预留；不读接口、不提交、不生成候选。候选 / 场所 / 邀请草稿 / 仮押さえ的数据与功能逐项映射在 SC-11 补齐。 |
| token | 工具汇总：近似但不等 4、缺 token 22（包含画框与日程表等完整画板元素）。骨架只使用已有文字 / 间距 token；未给缺口加近似值。完整界面缺口留后续逐项处理或提交组件请求。 |
| 组件 | 直接使用现有 App BottomSheet / UiText 与 Web Modal；不修改组件库。R31a / R31b 合入后再做像素验收。 |
| 示例 / 到达状态 | 骨架 rendering tests 直接传 open=true / false，覆盖三语；Web 关闭按钮调用 onClose、onSent 不触发。示例业务数据与开发状态开关留 SC-11。宽度 / 深色沿 PLANNER §2 代定 7；本次没有像素通过声明。 |

## SC-01 全部画板预检（业务界面实现前）

清单：`scripts/visual/views/app-R20a.json` 录入 PLANNER §9 的 App 42 个基础画面与 6 个深色变体，共 48 项；`web-R20a.json` 录入 Web 22 个基础画面与 2 个深色变体，共 24 项。两份 JSON 可解析、ID 无重复，`board-preflight.mjs --suite` 在全机锁内跑完，72/72 项均能定位画板，exit 0。工具明细在 `/Users/xzhao/orbit-sprint-evidence/redesign/R20a/run-01/sc01-{app,web}-preflight.{json,md,log}`。清单里二级页、弹层、Toast 的到达步骤仍是待 SC-06～13 接线的元数据，不能据此称已过像素门禁。

| 预检项 | 结论与处理 |
| --- | --- |
| ① 画板自洽 | Web 24 项未报数字矛盾。App 48 项报 1 条：b11 #38「人脈に 4人」与工具识别的分项 3＋3 不同；可能跨了「目標」与人脈两个口径，原 b11 不在本 Sprint 可改画板范围，保留原稿并在 REPORT「待主会話代定」请求确认，不以 6 覆盖 4。 |
| ② 数据与功能来源 | 输入框/文字逐项清单见生成的 Markdown；タスク活动与延期来自 SC-03 的任务活动、To-do 三块与准确フォロー件数来自 SC-04、个人予定/面談来自既有 schedule/appointments、Google 予定来自 SC-12 只读接口。工具的功能提示：App 19 项（麦克风 10、自由输入 9），Web 35 项（麦克风 18、自由输入 13、装饰 emoji 4）。自由输入是各表单/搜索的预期控件，不是自动缺功能；语音入口不在已批准的 R20a 行为契约里，不能凭画板接付费/录音功能，列 REPORT 请求。 |
| ③ token / 组件 | App 工具报近似 29、缺 token 316；Web 近似 26、缺 token 44。App 中多次命中 `.phone` 圆角/阴影、灵动岛等设备外框（非产品 UI），不能按总数要求改组件；业务区的每项缺口在实现时按生成清单复核。两端只用既有 UI 组件；R31a/R31b 未合入前不做像素放行，也不修改 A 线组件/token。 |
| ④ 宽度与主题 | Web 正式画板只有 1440 浅色及上表具名深色变体；1024/390 与其他深色视图按 PLANNER 代定 7 附实现截图、记「设计稿无」，不造新画板。App 浅色及具名 #47～#50、b12 #93/#95 深色均登记；横滑/键盘/Toast/抽屉等中途状态需 SC-06～13 的开发态开关或操作步骤，正式构建不得携入 fixture 开关。 |
| ⑤ 到达与门禁 | 基础路径写入清单；需要操作的画面仍须补 `steps`/深链/fixture，待对应屏实现后才可运行真实门禁。b7 #41「動かす」按 §D-1 改板后必须重做预检。旧 R05/R07 Task 与 W-R24-01 1024 不退步重跑、全量 raw/逐带/缺块/归因和截图均排在 R31a/R31b 合入后；本轮 0 张像素通过声明。 |
