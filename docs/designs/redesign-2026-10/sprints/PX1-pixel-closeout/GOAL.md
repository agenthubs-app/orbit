# Sprint PX1 — 像素收口轮 1（人脈与 iOrbit）

## 要实现什么

由 E 线 Codex 在 `redesign-e`（`line-e`）补跑三组已交页面的像素门禁：R11a 人脈一覧与連絡先詳細的 Web、App 清单及「待 R11」回归；R11b 人脈分析尚未跑的 App 清单；R21 iOrbit 已失败的 Web 六图、App 五图。PX1 是既有功能的证据和页面修正轮，不扩成新功能 Sprint。

R11a 先复用 R11b 已交的设计数据源 `empty`、`locked5`、`few14`、`many286`，补成 Web 读取和 App 本机镜像都能复现的联系人 fixture；详情、招待连接、人物类型确认卡和以前の値也要有受控状态。R11b App 先把新建的 `Orbit PX1 16e` 开发包实际指向本线 Web API `:3800`，把设置、健康检查、请求回执和复原方法写成可复用步骤，再跑 `app-R11b.json`。R21 以已留下的逐带失败为起点，修 E 线页面自身的结构和样式；共享 Drawer、FullDrawer、token、壳或别线页面的缺口写精确交还。

## 做完能看到什么

- R11a 的空、5 人、14 人、286 人及详情状态由同一设计数据驱动；Web、App 数字与状态自洽，App 真实模拟器截图和 Web 门禁均有记录。
- R11b App 的七个既定视图在 `:3800` 的响应和真实模拟器画面下完成逐带检查；连错端口时能按文档恢复，不把「人数读取失败」当像素差。
- R21 Web 六图、App 五图逐带归因并重比。数据文字、栅格化和已登记的对比度替换只在可核验的范围内放行；抽屉方向、实体卡缺失、间距和页脚位置等结构差仍要修或列未过。
- 每张有画板的画面留下画板、实现、diff、raw、超阈带数及归因；无画板的宽度、主题和中途态明确标「设计稿无，附截图，不进门禁」。

## 怎么验收

按 [PLANNER.md](PLANNER.md) 的 SC 表逐项操作。Web 用现有 `views/web-R11a.json`、`web-R21.json`，App 用 `app-R11a.json`、`app-R11b.json`、`app-R21.json`；另重跑交接 R11-16 指出的 R05、R12、R15、R16、R30 受影响画面。两端都按 README RD-29 与决定表 §20 判：每条超阈带须有真实 `[data]`、`[raster]` 或受清单约束的 `[contrast]` 归因；raw 记录为参考，结构差不得归因放行。每屏最多三轮；仍未过的列原因、责任文件和交还对象，不标 done。

所有重测试、浏览器与模拟器门禁经 `/Volumes/ORICO/Dev/worktrees/orbit/_runs/heavy.sh e -- <cmd>` 排队，同一条线同时最多一个重任务；证据放 ORICO。使用本机 `orbit_line_e`、Web `:3800`、Metro `:8088` 和新建 iPhone 16e 模拟器；不连 Neon、生产，不部署。本 Sprint 的完成以实际 REPORT 和独立复核为准，本页不是通过记录。
