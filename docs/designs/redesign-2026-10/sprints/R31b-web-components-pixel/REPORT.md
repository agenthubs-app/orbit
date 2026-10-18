# R31b Web 组件库像素轮 — REPORT（2026-10-18）

线 A2（worktree `redesign-a2`，本地分支 `line-a2`，dev :3600 / 设计稿 :3601，`distDir .next-line-a2`，库 `orbit_line_a2` = `orbit_redesign_shots_20261018` 副本）。没连 Neon、没部署、没调付费 AI，没碰 App 文件。门禁与全量都经 `_runs/heavy.sh a2`。

## 1. 提交

| 内容 | 提交 |
| --- | --- |
| Modal 表单型大模态 760 / 860 / 1000（D 线 R20a 依赖，主会话插单） | `2569ad835` |
| 第 1 步：`pass-baseline-web.json`（开工实跑 395 张、通过 265）、重比清单、`run-web-gates.mjs` | `5cd607085` |
| 工具 bug 修复（主会话同意）：规格格 `--region` 只裁实现侧 + 工具测试；测试类型补丁 | `c4039b166`、`f7da769ba` |
| 组件修正 + 旧样式隔离 + 逐件对照展示页 / 清单 / 归因 | `e3048764c` |
| 调用点改新参数 + 替换手写件 + 交接表通知甲 | `d5f27962c` |
| RetryCard / DegradedCard / QuotaChip / QuotaMeter / Why / Bone | `7a038e192` |
| 勾选类控件保留 44×44 布局框（不退步修复）、Popover 格位置 | `3193238b5` |
| 深色 Toast 动作钮（01-system ① 按 RD-17 改稿后）、c-ctl 格跟改稿 | `6ef30621c` |
| 预检清单、DEFERRED-A / 交接表处理结果 | `30b6c3cee` |
| 键盘与无障碍测试（无 ✕ Modal、ConfirmDialog 焦点） | `0956c7700` |
| 本 REPORT | 本文件所在提交 |

`2569ad835`～`3193238b5` 已由主会话推到 `origin/redesign`。

## 2. 成功标准

| SC | 结果 | 证据 |
| --- | --- | --- |
| SC-R31b-01 组件全部对齐 | 部分：`views/web-R31b-components.json` 30 条 × 浅深 = 60 张（15 格 × 新页面 / `?env=legacy`），见第 3 节；没过的只剩 c-ctl-0 浅色（行尾说明文字的 `[contrast]` 逐像素判定解释不足）。Web 不适用 / 没有组件的规格格逐格写在 [preflight-checklist.md](preflight-checklist.md) | 第 3 节 |
| SC-R31b-02 新尺寸与新部件 | ✅ Modal 380 档（另加 760 / 860 / 1000）、`icon` 图标块、`subtitle`、`titleSize`、`closable={false}`；ConfirmDialog 改 Web 版式（01-system ②）；Drawer 白圆 ✕（kit `.rbtn`）、`subtitle`（长标题换行、✕ 不缩）、`titleSize`、头部内边距 22 / 0；Drawer 宽度没加 540（RD-27）；已有档位宽度不变（渲染测试量 420 / 560 / 760 / 860 / 1000） | `tests/ui/orbit-2026-modal.test.tsx`；c-confirm-2 |
| SC-R31b-03 旧样式不漏入 | ✅ 做法：沿用 G13「双类写回」——每个带 `btn` 的新组件元素都有 `.<类>:global(.btn)` 重写 kit 尺寸（Overlay ✕ / 菜单、Toast 按钮、Toggle、Segmented、CategoryTabs、FilterOption、勾选类、Disclosure、SearchField 清除、ListRow、UnderlineTabs）；新测试 `tests/ui/orbit-2026-legacy-btn.test.ts` 静态守住；每格另以 `?env=legacy`（加载旧页面的 `orbit-reference.generated.css`）比一次，与新页面环境逐张相同（第 3 节）。只改新组件模块 CSS，旧页面旧按钮不动；R07 壳门禁的旧页面画面全部仍通过 | 测试 + 第 3 节 |
| SC-R31b-04 键盘与无障碍 | ✅ 无 ✕ 的 Modal Esc 关闭、焦点回到打开它的按钮；图标块 `aria-hidden`、不进 Tab 顺序；破坏性 ConfirmDialog 焦点先在キャンセル、非破坏性在主按钮；焦点环照 01-system ② `.focus` 改 `--plum-500`（仍是 outline）；UnderlineTabs / Segmented 方向键；Why 的 ? 视觉 18 + 隐形 24 命中区 | `orbit-2026-modal.test.tsx`、`orbit-2026-ui-render.test.tsx` |
| SC-R31b-05 手写件与调用点 | ✅ 见第 5 节；甲已在交接表 R31b 节被通知 | `d5f27962c`、交接表 |
| SC-R31b-06 待组件库画面重比 | 部分：重比清单 22 张全部重跑；W-R27-13、W-R16-08 浅深通过（DEFERRED-A 改 done）；其余组件部分已对齐，剩余是页面自身原因 → 第 6 节「交还」 | 第 4 节 |
| SC-R31b-07 不退步 | ✅ `pass-baseline-web.json` 265 张全部仍通过；R07 壳门禁组件改动后重跑通过 | `run-01/nr1`、`nr1b` |
| SC-R31b-08 测试与复核 | orbits 全量 7497 条：6 失败，全部在基线 worktree（`e081084b0`，同一 `.env.local`）上同样失败（基线 7 失败），零新增；`typecheck`、`typecheck:app`、`lint` 通过。App 没改文件（App 全量归 R31a）。GitNexus 按 RD-32 不跑。独立复核待主会话安排 | 第 7 节 |

## 3. 逐件对照（Web，`views/web-R31b-components.json`，1440，`--grid 30`，归因 `attribution-redesign-R31b.json`）

展示页小节 `/showcase/components/<小节>-<格>`（`app/showcase/components/[section]/page.tsx` + `cells.tsx`，示例文字放 `cell-samples.json`；画在 (0,0)、整数坐标、固定宽度；Popover 格右移 8 对齐组件的视口边距、region 同步）；浮层格 c-confirm-2 按组件自己的居中定位，region `492,255,446,390`（设计侧整格，`--design-region`）。`?theme=` 固定主题；`?env=legacy` 加载旧页面全局样式。最终一轮 `run-01/components-final`：

| 格 | 浅 | 深 | 浅 · legacy | 深 · legacy |
| --- | --- | --- | --- | --- |
| c-ai-0 | ✅ 0 | ✅ 0 | ✅ 0 | ✅ 0 |
| c-ai-1 | ✅ 0 | ✅ 0 | ✅ 0 | ✅ 0 |
| c-ai-2 | ✅ 0.0147 / 1 带 | ✅ 0 | ✅ 0.0147 / 1 带 | ✅ 0 |
| c-chip-0 | ✅ 0.0149 / 2 带 | ✅ 0 | ✅ 0.0149 / 2 带 | ✅ 0 |
| c-confirm-2 | ✅ 0.0187 / 3 带 | ✅ 0.0134 / 2 带 | ✅ 0.0187 / 3 带 | ✅ 0.0134 / 2 带 |
| c-ctl-0 | ❌ 0.0282 / 5 带（2 未归因） | ✅ 0.0055 | ❌ 0.0282 / 5 带（2 未归因） | ✅ 0.0055 |
| c-err-1 | ✅ 0.0017 | ✅ 0 | ✅ 0.0017 | ✅ 0 |
| c-err-2 | ✅ 0 | ✅ 0 | ✅ 0 | ✅ 0 |
| c-kbd-0 | ✅ 0.0122 / 2 带 | ✅ 0 | ✅ 0.0122 / 2 带 | ✅ 0 |
| c-layer-2 | ✅ 0.0047 | ✅ 0.0027 | ✅ 0.0047 | ✅ 0.0027 |
| c-load-0 | ✅ 0 | ✅ 0 | ✅ 0 | ✅ 0 |
| c-pay-0 | ✅ 0.0514 / 2 带 | ✅ 0.0376 | ✅ 0.0514 / 2 带 | ✅ 0.0376 |
| c-text-0 | ✅ 0.0108 / 1 带 | ✅ 0 | ✅ 0.0108 / 1 带 | ✅ 0 |
| c-toast-0 | ✅ 0.0021 | ✅ 0 | ✅ 0.0021 | ✅ 0 |
| c-why-0 | ✅ 0.0004 | ✅ 0 | ✅ 0.0004 | ✅ 0 |

合计 60 张：通过 58。

归因只用了 `[contrast]`（`.lbl` / `.kbd` / chip 的 RD-05 加深色，全部在 `contrast-substitutions.json` 现有替换里，本 Sprint 没有新增替换对）与 `[raster]`（c-confirm-2 弹窗下沿圆角与动作行的小数 y 栅格；动作行同带有提示行的 `[contrast]` 加深，理由里如实写明）。c-toast-0 / c-ctl-0 用的是 R31a 按 RD-17 / RD-33 改过的 01-system ① ⑮（深色胶囊、完成勾 `--ok`）。

## 4. 不退步与重比

**不退步**（`pass-baseline-web.json`，开工时实跑通过的 265 张）：全量一轮 260 通过；其余 5 张——W-R16-06 浅（截图超时）/ 深（页面没加载完）、W-R27-35b 浅深（wait-for 超时）是负载下的加载问题；W-R16-08 深是真退步（勾选类控件改成按标记大小布局后，R16 表格列宽跟着变）——恢复 44×44 布局框（`3193238b5`）后 R12 + R16 + R27-35b 重跑 27 / 27 通过。合计 **265 / 265 仍通过**。

**重比清单**（`rerun-list.json`；`run-01/rerun2`、`rerun2b`）：

| 交接 | 画面 | 开工 | 现在 | 去向 |
| --- | --- | --- | --- | --- |
| W-R27-13 | W-R27-13 浅 / 深 | 4u / 4u | ✅ / ✅ | done |
| R16-01 | W-R16-08 浅 / 深 | 1u / ✅ | ✅ / ✅（raw 0.0003） | done |
| R15 | W-R15-14m 浅 / 深 | ✅ / ✅ | ✅ / ✅ | 不退步 |
| R15 | W-R15-12（390）浅 / 深 | 2u / 2u | 2u / 2u | 交还 8 |
| R24-05b | W-R24-03 浅 / 深 | 12u / 11u | 12u / 11u | 交还 1 |
| R24-05b | W-R24-09b 浅 / 深 | 9u / 9u | 9u / 9u | 交还 2 |
| R24-05b | W-R24-11 浅 / 深 | 5u / 5u | 5u / 5u | 交还 3 |
| R24-05b | W-R24-12 浅 / 深 | 10u / 9u | 10u / 9u | 交还 4 |
| R24-05b | W-R23-06 浅 / 深 | 2u / 2u | 2u / 2u | 交还 5 |
| W-R26-31 | W-R26-31 浅 / 深 | 10u / 7u | 7u / 4u | 交还 6 |
| R17-17 | W-R17-P26 浅 / 深 | 25u / 19u | 7u / 12u | 交还 7 |

R24-05b 五张的带数没降：整屏带里压着页面本身的差异（下一节），弹层框体、宽度、头部（标题 17 / 18、图标块、副标题、✕）在三联图里已与画板一致。

## 5. 手写件替换与调用点（RD-28 / RD-30）

| 位置 | 原来 | 现在 |
| --- | --- | --- |
| 活动 `EventDetail` | 手写 `.utabs` | `UnderlineTabs`（line = b2 `.utabs`） |
| 主办 `HostConsole` | 手写 `.htabs` | `UnderlineTabs variant="host"`（b6 / b12 `.htabs`，计数 badge） |
| 主办 `HostCenter` / `HostPeople` / `HostMatching` / `HostSetup` | 手写分段 tablist | `Segmented variant="seg"`（kit `.seg`；`HostCenter` 新文案键 `fLabel`） |
| 计划 `BackgroundBlocks` | 手写分段 | `Segmented variant="seg" wide` |
| 活动 `VenuePage` / `EventsScreen` | 手写分段 | `Segmented variant="seg"`（`VenuePage` 新文案键 `venueTabs`） |
| 主办 `HostCohosts` | bare 抽屉 + 手写头部 | 组件 Drawer 标题 + 副标题 + 白圆 ✕（520 / 22；b6 #20 画板按 RD-27 改 520） |
| 计划 `PlanOverview` / `PlanTypeDialogs` | Modal 默认头 + description | `icon` / `subtitle` / `titleSize` / `size={380}` / `closable={false}`；两处抽屉 `titleSize={18}`（推翻 R24 自定 7） |
| 活动 `EventsScreen` 参加コード | 420 + description | `size={380}`，副标题按 #320 放标题行下 4px（推翻 R26 自定 7） |
| ConfirmDialog 全站 | 图标在上（App 式） | Web 版式（主办 3 处、加人 InviteCodeModal 随之变化） |
| 未换 | `HostConsole` レポート 链接分段；`SearchPanel` 类型 chip；计划 `FlowDialog` | 交还 9 |

PLANNER「已查清的事实」2 说已有的 `?env=legacy` 展示页其实不存在，本 Sprint 新建。中途状态（弹层打开）在展示页小节里直接打开组件到达，展示页只在非生产可见（`app/showcase/layout.tsx` 与现有测试）。

## 6. 交还（页面自身原因；主会话分派后追加到交接表对应节）

1. **W-R24-03 前提を見る**：弹窗已对齐；背景计划概要的数据与页高和画板不同，带 3–17 都在背景。
2. **W-R24-09b 記録**：弹窗 380 / 头部已对齐；弹窗正文是计划页自己的结构（名前输入框焦点态、候补行小字、`いつ` 行），比画板高一截，带随之偏移。
3. **W-R24-11 スキップ確認**：弹窗版式已对齐；正文文案与画板不同（少「話した人の点とは分けて、斜線で表示します。」），画板「スキップする」带 `.focus` 焦点环而清单步骤是鼠标点开；需改文案并在清单补键盘步骤。
4. **W-R24-12 面談を提案**：抽屉框体 / 头部 / ✕ 已对齐；画板是已生成下書き的状态，清单步骤没有点「下書きをつくる」；背景候补表数据不同。
5. **W-R23-06 メンバーを追加**：这个弹窗是计划页手写的 `FlowDialog`（不是组件 Modal），约 3px 位移来自它自己的定位；建议换成 Modal（需加 520 档，只加）后重比。
6. **W-R26-31 参加コード**：弹窗已对齐；画板是已输入 7 位码的状态而清单只点开弹窗（`views/web-R26.json` 冻结，没改）；背景イベント页本身的差异。
7. **W-R17-P26 共同運営者**：抽屉 520 / 22 / 头部已对齐；剩余是背景「申込の推移」柱高（mock 数据）与抽屉正文 dy 0 的文字栅格同带。
8. **W-R15-12**：开工时就 2 带（QA 邮箱较短少折一行，整页上移），非组件。
9. **未换的手写件**：`HostConsole` レポート「すべて / 自分の視点」是链接分段，Segmented 没有 `href`（可作组件新参数补）；`SearchPanel` 类型 chip 是 tablist + `aria-controls`，CategoryTabs 是 radiogroup，换了语义会变；计划 `FlowDialog`（同 5）。
10. **没有 Web 组件的规格格**（见预检清单）：c-ai-3 ✓/✕ 与建议 chip、c-load-1 分步清单、c-err-0 同步恢复横条（需要标准文案新键，会同步到 App）、c-err-3 字段错误块、c-sample-2 Web 示例横条与药丸、c-kbd-1 tooltip、c-text-1 / 2——由对应功能 Sprint 或下一轮组件补件。

## 7. 测试

| 项 | 结果 |
| --- | --- |
| orbits 全量（`LANG=en_US.UTF-8`） | 7497 条，6503 过、6 失败、988 跳过；6 条失败（`add-scan-flow` ×2、`add-contact-screens` 手入力、产品清单生成、合并写回、只有 dev 路由引用设计 fixture）在基线 worktree（同一 `.env.local`，7493 条 7 失败）上同样失败，**零新增** |
| `typecheck` / `typecheck:app` / `lint` | 通过 |
| 组件门禁 | `orbit-2026-*`（含新 `orbit-2026-legacy-btn`）、`orbit-modal-standard`、`orbit-button-ratchet`、`orbit-z-scale`、`orbit-2026-css-tokens`、`orbit-2026-scope`、`no-hardcoded-copy`、工具测试 `redesign-pixel-components` 全部通过 |

## 8. 自定决定（工程）

1. 不退步基线用实跑：一台带齐所有 mock 的服务器（`run-web-gates.mjs`）跑全部 Web 清单，开工通过的 265 张作基线；开工就不过的 130 张（各 Sprint 遗留与本机环境差）不作对象。
2. Segmented 默认外观不改（Task 段、壳头像菜单在用），新增 `variant="seg"` = kit `.seg` 给页面分段。
3. 勾选类控件保留 44×44 布局框（R16 表格按它排）；c-ctl 展示格用负外边距把命中区收回标记大小再排行。
4. 焦点环改 `--plum-500`（01-system ② `.focus` 是 kit 唯一画出的焦点环），保持 outline（键盘测试与强制色模式）。
5. 标题 17 没有语义 token，用同值 `--fs-logo`，不改 `tokens.json`（避免与 R31a 并行时同步 App 副本冲突）。
6. 规格格示例文字放 `cell-samples.json`（设计稿示例数据，不是界面文案）；c-ctl 的中文说明按 01-system 页面语言以 `lang="zh"` 渲染。

## 9. 待主会话决定

1. **W-R17-P26**：剩余带是背景柱高（数据）与抽屉文字栅格同带；改清单只比抽屉区域，还是接受。
2. **c-ctl-0 浅色**：带 0 / 1 是行尾说明文字的 RD-05 加深（同一替换在其他带判定通过），工具逐像素对等宽字体那段解释不足（38.8% / 15.8%），是否接受为 `[contrast]`。
3. **Drawer `lg` 600**：PLANNER 契约写「宽度只有 520 / 380」，但 kit `.drawer` 与 01-system 规格是 600，`EventsScreen` 详情抽屉、`ManualContactDrawer` 粘贴模式在用并按 600 画板通过；本 Sprint 保留 lg。
4. **非壳抽屉深色细边**：PLANNER 契约要有，kit `.drawer` 没有；保留现状。
5. 交还 1–10 的分派。

## 10. 交接

- 组件新参数：`Modal`（`size` 380 / 760 / 860 / 1000、`icon`、`subtitle`、`titleSize`、`closable`、`closeOnScrim`、`role`）、`ModalIcon`（kit `.dic` / `.dic.emo`）、`ConfirmDialog`（Web 版式、`emoji`）、`Drawer`（`subtitle`、`titleSize`）、`Segmented`（`variant="seg"`、`className`、`data-*`）、`UnderlineTabs`（`line` / `host`、`count`、`badge`、`href`）、`ConfirmCard`（`emoji`、`reason`、`undo`、`link`、动作 `ghost`）、`WhyButton` / `WhyBody`、`QuotaMeter`、`Bone`、`Avatar tone`、`ToastPreview`、`Button` 转发 ref。
- 旧样式隔离：新组件元素带 `btn` 就必须写 `:global(.btn)` 双类规则（测试会拦）。
- 证据：`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-a2/R31b/run-01/`（`baseline`、`nr1`、`nr1b`、`rerun2`、`components-final`）；内置盘满过一次，证据统一放 ORICO。
- 基线 worktree `/Volumes/ORICO/Dev/worktrees/orbit/a2-base`（`e081084b0`，只用于全量对照，可删）。
