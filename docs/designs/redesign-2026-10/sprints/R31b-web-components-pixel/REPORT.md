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
| 深色 Toast 动作钮（01-system ① 按 RD-17 改稿后）、c-ctl 格跟改稿 | `265dc2445` |
| 预检清单、DEFERRED-A / 交接表处理结果 | `e1a6fc8b5` |
| 键盘与无障碍测试（无 ✕ Modal、ConfirmDialog 焦点） | `a5d5d1878` |
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
| SC-R31b-07 不退步 | ✅ `pass-baseline-web.json` 265 张全部仍通过；本轮首跑的 6 张加载／fixture 问题经定向补跑全部通过 | `run-01/nr1`、`nr1b`；复核处理 |
| SC-R31b-08 测试与复核 | 本轮 orbits 全量 7534 条：7 失败（原有 6 项 + 修复前快照已失败的按钮门禁），零新增；`typecheck`、`typecheck:app`、`lint` 通过。App 没改文件；App 全量对照引用 R31a REPORT §5（下方第 7 节注明来源与状态）。GitNexus 按 RD-32 不跑。独立复核见本轮「复核处理」。 | 第 7 节、复核处理 |

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
| 活动 `EventsScreen` 参加コード | 420 + description | `size={380}`，`subtitle` + `subtitleBelowHead` 按 #320 放标题行下 4px（推翻 R26 自定 7；复核 M2 后不再加页面正文节点） |
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
| App 全量对照（R31a 负责） | [R31a REPORT §5](</Volumes/ORICO/Dev/worktrees/orbit/redesign-a/docs/designs/redesign-2026-10/sprints/R31a-app-components-pixel/REPORT.md>) 的 2026-10-18 16:44 工作稿记录最近一轮 3338 项：失败项为基线同名与负载超时（后者串行复核），新增失败 0，`tsc` 0。该文档尚在 `line-a` 收口，R31b 只引用其 App 全量证据，不把 Web 测试当作 App 已验证。 |

## 8. 自定决定（工程）

1. 不退步基线用实跑：一台带齐所有 mock 的服务器（`run-web-gates.mjs`）跑全部 Web 清单，开工通过的 265 张作基线；开工就不过的 130 张（各 Sprint 遗留与本机环境差）不作对象。
2. Segmented 默认外观不改（Task 段、壳头像菜单在用），新增 `variant="seg"` = kit `.seg` 给页面分段。
3. 勾选类控件保留 44×44 布局框（R16 表格按它排）；c-ctl 展示格用负外边距把命中区收回标记大小再排行。
4. 焦点环改 `--plum-500`（01-system ② `.focus` 是 kit 唯一画出的焦点环），保持 outline（键盘测试与强制色模式）。
5. 新参数标题 17 没有语义 token，用同值 `--fs-logo`；旧 Modal 默认仍用 `--fs-dialog-title`。不改 `tokens.json`（避免与 R31a 并行时同步 App 副本冲突）。
6. 规格格示例文字放 `cell-samples.json`（设计稿示例数据，不是界面文案）；c-ctl 的中文说明按 01-system 页面语言以 `lang="zh"` 渲染。

## 9. §52 主会话代定

1. **W-R17-P26**：按 §52-1 只比抽屉区域；背景「申込の推移」柱高不计。
2. **c-ctl-0 浅色**：按 §52-2 保留 RD-05 加深；两带 `[contrast]` 人工例外接受，工具仍报 fail。裁剪图与逐带说明在归因文件，见「复核处理」。
3. **Drawer `lg` 600**：按 §52-3 保留 lg；RD-17 的 520 / 380 限于新内容抽屉的选档。
4. **非壳抽屉深色细边**：按 §52-4 删除，重比见「复核处理」。
5. 交还 1–10 归 R32 清理轮（§52-5）。

## 10. 交接

- 组件新参数：`Modal`（`size` 380 / 760 / 860 / 1000、`icon`、`subtitle`、`subtitleBelowHead`、`titleSize`、`closable`、`closeOnScrim`、`role`；旧默认头部外观保留）、`ModalIcon`（kit `.dic` / `.dic.emo`）、`ConfirmDialog`（Web 版式、`emoji`）、`Drawer`（`subtitle`、`titleSize`）、`Segmented`（`variant="seg"`、`className`、`data-*`）、`UnderlineTabs`（`line` / `host`、`count`、`badge`、`href`）、`ConfirmCard`（`emoji`、`reason`、`undo`、`link`、动作 `ghost`）、`WhyButton` / `WhyBody`、`QuotaMeter`、`Bone`、`Avatar tone`、`ToastPreview`、`Button` 转发 ref。
- 旧样式隔离：新组件元素带 `btn` 就必须写 `:global(.btn)` 双类规则（测试会拦）。
- 证据：`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-a2/R31b/run-01/`（`baseline`、`nr1`、`nr1b`、`rerun2`、`components-final`）；内置盘满过一次，证据统一放 ORICO。
- 开发轮全量对照使用过基线 worktree `/Volumes/ORICO/Dev/worktrees/orbit/a2-base`（`e081084b0`）；本轮复核时该目录已不存在。新增观察到的按钮门禁另用修复前提交的源码快照复现，见第 11 节。

## 11. 复核处理（RD-25，§52）

| 项 | 本轮本地提交 |
| --- | --- |
| S1 | `814ab4acf` |
| M1 | `acc209eeb` |
| M2 | `a23a5c477` |
| M3 | `c68f078c8` |
| M4 | `ff605362e`、`5ff94a033` |
| M5 | `a02f9f4a9` |
| m | `1176474a0` |
| REPORT | 本文件所在提交 |

- **S1**：`attribution-redesign-R31b.json` 给 c-ctl-0 浅色及 legacy 的带 0 / 1 写了 `[contrast]`、§52-2 人工判定和每带设计／实现裁剪图路径。原始工具报告分别有 38.8% / 15.8% 未解释像素；裁剪图显示位置和控件一致，差异集中在 RD-05 加深的等宽说明字。两个环境的对应裁剪图逐字节相同。**结论为「§52 例外接受」，不是「自动门禁通过」**；自动门禁结果与本轮重跑摘要另记在下方。
- **M1**：删去非壳 Drawer 两条深色细边规则及因此多余的 bare 覆盖；浏览器测试同时验证显式深色主题和系统深色主题均为 `border-top-width: 0px`。抽屉区域重比结果见下方。
- **M2**：参加コード副标题改为 `Modal subtitle` + `subtitleBelowHead`，副标题仍在整条标题行下 4px，输入区仍接 14px 间距；没有增加页面正文节点。浏览器布局测试已过，W-R26-31 重比见下方。
- **M3**：`HostPeople` 给 `Segmented` 传页面类，767px 以下恢复 `overflow-x: auto`、`max-width: 100%` 与 `min-width: 0`。390px 浏览器测试量到 4 个页签、tablist 314px、卡片 354px、内部可滚动宽 390px，tablist 右沿在卡片内。
- **M4**：`orbit-2026-legacy-btn` 用 Chromium 对照新／旧页面 CSS 的正常、按下、禁用实际计算样式；覆盖旧 `.btn:active` 对 Segmented 的额外平移。禁用主按钮、IconButton、Toggle 保留各自背景／字色与默认光标；按下态保留 Button 的 0.96、IconButton 的 0.9 缩放，Segmented / Toggle 不平移。旧页面 `.btn` 的 0.5px 平移在新作用域内清除。
- **M5**：旧 Modal 默认值恢复开工前的标题 `16px / 800 / 1.35`、关闭钮 `36px`／透明底／`20px` 图标；只有传 `icon`、`subtitle` 或 `titleSize` 才用新版 `17px / 700` 与 `34px` 关闭钮。采用 REVIEW 允许的「新外观限于新参数」方案；浏览器计算样式断言覆盖旧默认与新参数。
- **m**：`run-web-gates.mjs` 只合并本次新摘要，子进程退出非零或缺少预期 key 会返回非零。模拟退出失败、缺 key、已生成新摘要但退出失败、成功、fixture 切换失败的 5 个测试均通过；旧摘要没有混入。第 1 节已更正三个提交号；第 7 节补 R31a App 全量对照来源。

定向测试证据：`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-a2/R31b/fix/focused-tests.log`（37 / 37）与 `run-web-gates-tests.log`（5 / 5）。

本轮像素重跑证据在 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-a2/R31b/fix/`：

| 门禁 | 结果 | 说明 |
| --- | --- | --- |
| `components/summary.json` | 58 / 60 自动通过 | 唯二失败为 c-ctl-0 浅色及 legacy 浅色，各 2 未归因带；按 §52-2 人工例外接受，自动门禁仍 fail |
| `M1-W-R17-P26/all-summary.json` | 浅 7、深 6 未归因带 | §52-1 只裁 `906,14,520,932` 抽屉；三联图可见深色顶部细边已去掉，余带为字形／内容的像素差，门禁仍 fail |
| `M1-W-R24-12/all-summary.json` | 浅 10、深 9 未归因带 | 抽屉重比仍受页面状态与正文差异影响（第 6 节交还 4），门禁仍 fail |
| `M2-W-R26-31/all-summary.json` | 浅 7、深 4 未归因带 | 截图中 Modal 已出现，但 `--wait-for [role=dialog]` 本轮超时；门禁仍 fail，页面与画板状态差异见第 6 节交还 6 |
| `noregression/` + 两次定向补跑 | 265 / 265 通过 | 首轮 263 条新记录、259 通过；R25 legacy 补跑 4 / 4、R30 搜索补跑第二轮 2 / 2。按基线 key 合并后预期 265、实际 265、通过 265，无缺失或额外 key |

不退步首轮 `noregression/all-summary.json` 只含本次新结果：预期 265 key，实际 263 条、259 通过；W-R25-12 浅深在导航中断后缺 key，W-R25-13 浅深的画面显示「このプランは見つかりません」，W-R30-P01 浅／P01d 深截到「検索中…」。脚本因子进程失败与缺 key 返回 1，没有把旧摘要补进来。`noregression-r25-legacy-retry1/all-summary.json` 四张全部通过；`noregression-r30-retry1/` 仍截到加载态，`noregression-r30-retry2/all-summary.json` 两张全部通过（raw 各 0.0006）。合并时只用本轮新摘要中对应 key 的最后成功结果。

本轮 orbits 全量日志为 `full-tests.log`：7534 项，6538 过、7 失败、989 跳过。六项与第 7 节所记基线失败同名；另一个 `orbit-button-ratchet` 上限 79／实测 80，在修复前 `f6923b753` 源码快照上亦为 80（`ratchet-pre-fix.log`），本轮没有增加无 `.btn` 的按钮。`typecheck`、`typecheck:app`、`lint` 本轮均退出 0。
