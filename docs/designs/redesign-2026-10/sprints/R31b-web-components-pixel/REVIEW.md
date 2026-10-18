# R31b REVIEW

**结论：暂不判收口。** SC-R31b-01 的门禁仍失败；另有与 §52、RD-28 不符的改动。以下路径和行号可供主会话在 `redesign` 上修复。

## S

- **S1｜组件像素门禁未闭环。** [REPORT.md:27](</Volumes/ORICO/Dev/worktrees/orbit/redesign/docs/designs/redesign-2026-10/sprints/R31b-web-components-pixel/REPORT.md:27>) 记载 58/60 通过；浅色 `c-ctl-0` 及 legacy 版各有两带未归因，原始 [result.json:105](</Volumes/ORICO/Dev/worktrees/orbit/_evidence-a2/R31b/run-01/components-final/web-R31b-components/1/W-R31b-c-ctl-0-1440-light/result.json:105>) 仍为 `fail`。§52 已代定人工接受口径，但文字归因尚未形成可复核的门禁例外记录。附两带裁剪图与人工判定，明确区分“§52 例外接受”和“自动门禁通过”。

## M

- **M1｜深色 Drawer 仍画细边。** [Overlay.module.css:118](</Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/app/(app)/app/orbit-2026/ui/Overlay.module.css:118>) 与决定表 §52-4“去掉细边”冲突。删除两条深色边框规则并重比抽屉。
- **M2｜调用点改了页面布局。** [EventsScreen.tsx:474](</Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/app/(app)/app/orbit-2026/events/EventsScreen.tsx:474>) 把副标题从 `description` 移为正文 `<div>`，另设 4px 外边距，超出 RD-28 的“只换参数”。改由组件参数表达，或登记为页面布局交还，SC-R31b-05 改标部分。
- **M3｜主办窄屏滚动规则失效。** [HostPeople.tsx:119](</Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/app/(app)/app/orbit-2026/host/HostPeople.tsx:119>) 换成 `Segmented` 后不再带页面的 `s.seg`；[host.module.css:184](</Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/app/(app)/app/orbit-2026/host/host.module.css:184>) 的 767px 以下横向滚动与限宽规则因此不命中。恢复规则并验证四个页签在 390px 下不撑宽页面。
- **M4｜旧 `.btn` 回归测试不覆盖交互。** [legacy-btn.test.ts:22](</Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/tests/ui/orbit-2026-legacy-btn.test.ts:22>) 只检查属性名存在，错误数值也可通过；旧 CSS 的 `.btn:active` 还会额外平移控件。现有 30 对截图只覆盖静态格。补正常、按下、禁用态的实际计算样式对照。
- **M5｜默认外观的不退步证据不足。** [Overlay.module.css:42](</Volumes/ORICO/Dev/worktrees/orbit/redesign/repos/orbits/app/(app)/app/orbit-2026/ui/Overlay.module.css:42>) 改了默认标题字号、字重及关闭钮；现有渲染测试只量宽度，265 张基线也不含开工即失败的 130 张。对受影响的旧 Modal 状态补局部前后对照，或把新外观限定到新参数。

## m

- [run-web-gates.mjs:61](</Volumes/ORICO/Dev/worktrees/orbit/redesign/docs/designs/redesign-2026-10/sprints/R31b-web-components-pixel/run-web-gates.mjs:61>) 忽略子进程退出码，且可合并输出目录里的旧摘要；应在失败或缺少预期 key 时退出非零。
- [REPORT.md:16](</Volumes/ORICO/Dev/worktrees/orbit/redesign/docs/designs/redesign-2026-10/sprints/R31b-web-components-pixel/REPORT.md:16>) 后三项提交号与实际 `265dc2445`、`e1a6fc8b5`、`a5d5d1878` 不符；更正追溯记录。SC-R31b-08 所要求的 App 全量对照也应补 R31a 证据引用。

## 核实通过

12 个指定提交未改 App、导航壳或别线功能文件；`scripts/visual` 的工具代码变更仅为已批准的 `--region` 修复及测试。原始摘要可交叉证明既有通过画面 265/265 仍通过；30 对普通／legacy 格的实现截图逐字节相同。定向测试：工具与静态检查 9/9、Modal 浏览器测试 8/8、主办渲染 10/10。重任务锁被其他线占用，本次未独立重跑截图门禁；上述像素结论依据原始结果及截图复核。仓库未修改。