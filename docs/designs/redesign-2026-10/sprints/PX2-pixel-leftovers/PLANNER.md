# PX2｜像素余项轮⑪执行计划

> **给执行线：** 先读 [GOAL.md](GOAL.md)、本页、各行所指原 Sprint 的 REPORT／REPORT-D／REVIEW 和 `repos/orbits/scripts/visual/README-redesign.md`。本轮文档基于 `origin/redesign@e39329d51`。实施前重新 `git pull --rebase origin redesign`，以当前 `--list` 核板号；不得把本表的历史失败指标冒充新源码门禁。每项按路径提交并带 `Co-Authored-By: Codex <noreply@openai.com>`，不 push。当前文档编制没有产品代码改动。

## 1. 口径、边界与来源优先级

优先级为：**最后一轮到达正确目标态的原始 `result.json`／`summary.json` 与 triptych** → 对应 Sprint REPORT 的人工更正 → REVIEW 的拒收或豁免撤回 → 旧门禁。PX1 取代 R11a/b/R21 的旧截图数据，R32 RD-25 取代 A-R16-04 的旧 P20 数据。若报告在截图后又修改了 token、文案或页面，那张图只记历史 FAIL，执行批必须重拍；若抓到登录、loading、错误 route、开发菜单、Wrong-state 或无画板，指标记 `—`，原值只放证据路径。`raw` 是诊断参考，不是通行证。下表的 `超带` 是超阈总带数；有未归因带时全屏继续 FAIL。`缺块` 是探针报警数，须逐张目检，不能靠 `[data]` 抹掉元素、位置、数量、顺序或尺寸差。

主类别表示下一步的**第一责任**，而非唯一问题：**A**＝共享组件／token（仅 A 线改）；**S**＝页面局部排版、间距或同态 fixture（按页面归属线）；**D**＝设计源与已定产品契约或目标状态冲突（主会话先代定改稿）；**X**＝本机缺有效签名／系统实屏。A 改完之后页面归属线仍负责本屏重比。R11a/b 页面在 PX1 的窄范围授权内归 E；B 保留其共享数据契约。无板的 R29 只有回归截图，**不计入待比键**。

证据根别名（均为现存路径；表内 `目录/键` 是截图与逐带报告的入口）：

| 别名 | 绝对目录 |
| --- | --- |
| `A32` | `/Volumes/ORICO/Dev/line-a-evidence/R32/run-01` |
| `B13`／`B14` | `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-b/R13/run-01`／`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-b/R14/run-01` |
| `C18b` | `/Users/xzhao/orbit-sprint-evidence/redesign/R18b/run-01` |
| `C18c`／`C28` | `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-c`／`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-c/R28/pixel` |
| `D10`／`D19`／`D20a` | `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-d/R10/run-01`／`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-d/R19/run-01`／`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-d/R20a` |
| `U20a` | `/Users/xzhao/orbit-sprint-evidence/redesign/R20a/run-02` |
| `D20b` | `/Users/xzhao/orbit-sprint-evidence/redesign/R20b/run-02` |
| `E1` | `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-e/PX1/run-01/pixel` |

`b12-missing-states.html` 的补画板编号来自当前文件的 `compare-redesign.mjs --list --json`；其他编号取当前各 suite 的 `board-index`，R32 后拍按有效 `summary.json` 实际解析的板号。本表的一个「键」是 **一张画板 × 一端 × 一个宽度 × 一个主题**；同 ID 的浅深与不同宽度分别计数。表中的 `—/—/—` 表示无有效同态比较，绝不等于零差。

## 2. 逐键余项账本

表中 `raw/超带/缺块` 的数字均为最后有效结果；`未比` 的证据列指出当前 suite 或错态目录，执行时先造可重复的同态 fixture。报告仅给带数而未给缺块时，以对应结果 JSON 核实；无法核实则写 `?`。按来源分段，避免同一画板在旧 Sprint 与 PX1 重复计数。

**登记 678 个未收口键**（逐 Sprint：R10 23；R11a 39；R11b 8；R13 10；R18a 53；R18b 114；R18c 152；R20a 72；R20b 7；R21 11；R28 98；R32 50；R14 3；R19 24；PX1 交叉页 14）。其中「未实拍」只代表清单有目标板、无有效同态数字；实施前以最新版画板和 suite 复核。R19 的 12 键是局部诊断、正式 WidgetKit 实屏另有 12 键未测，均不算 Web/App 验收通过。

### R10（23 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R10-01-app-light | `app.html` #0 | App/浅 | 0.1303/8/14 | S·D：首页/壳数据与位置差 | `D10/app-empty-round2` |
| A-R10-02-app-light | `app.html` #1 | App/浅 | —/—/— | D·D：未实拍：首页日期与示例数据需统一（D01） | `suite:app-R10.json` |
| A-R10-03-app-light | `app.html` #2 | App/浅 | —/—/— | D·D：未实拍：首页日期与示例数据需统一（D01） | `suite:app-R10.json` |
| A-R10-03S-app-light | `app.html` #3 | App/浅 | —/—/— | D·D：未实拍：首页日期与示例数据需统一（D01） | `suite:app-R10.json` |
| A-R10-04-app-light | `app.html` #4 | App/浅 | 0.1309/9/20 | S·D：首页/壳数据与位置差 | `D10/app-edit-round1` |
| A-R10-05-app-light | `app.html` #5 | App/浅 | 0.3375/8/18 | S·D：首页/壳数据与位置差 | `D10/app-library-round1` |
| A-R10-03D-app-dark | `app.html` #33 | App/深 | 0.1184/9/12 | D·D：首页日期与示例数据需统一（D01） | `D10/app-populated-q5-review1` |
| A-R10-06-app-light | `b11-nav-v3.html` #20 | App/浅 | 0.2037/9/23 | S·D：首页/壳数据与位置差 | `D10/app-longpress-b11-round3` |
| A-R10-07-app-light | `b11-nav-v3.html` #21 | App/浅 | 0.1423/9/20 | S·D：首页/壳数据与位置差 | `D10/app-drag-b11-round1` |
| A-R10-08-app-light | `b11-nav-v3.html` #22 | App/浅 | 0.1377/9/18 | S·D：首页/壳数据与位置差 | `D10/app-remove-b11-round1` |
| A-R10-09-app-light | `b11-nav-v3.html` #23 | App/浅 | 0.1402/8/23 | S·D：首页/壳数据与位置差 | `D10/app-library-b11-round3` |
| A-R10-10-app-light | `b11-nav-v3.html` #24 | App/浅 | 0.2601/9/19 | S·D：首页/壳数据与位置差 | `D10/app-library-size-b11-round1` |
| A-R10-07D-app-dark | `b11-nav-v3.html` #48 | App/深 | 0.1253/9/16 | S·D：首页/壳数据与位置差 | `D10/app-drag-dark-b11-round1` |
| W-R10-01-1440-light | `web.html` #0 | 1440/浅 | 0.0329/4/20 | S·D：首页/壳数据与位置差 | `D10/web-empty-valid-round3` |
| W-R10-02-1440-light | `web.html` #1 | 1440/浅 | —/—/— | D·D：未实拍：首页日期与示例数据需统一（D01） | `suite:web-R10.json` |
| W-R10-03-1440-light | `web.html` #2 | 1440/浅 | 0.0522/5/35 | D·D：首页日期与示例数据需统一（D01） | `D10/web-populated-q5-review1` |
| W-R10-04-1440-light | `web.html` #3 | 1440/浅 | 0.0563/7/42 | S·D：首页/壳数据与位置差 | `D10/web-edit-round1` |
| W-R10-03D-1440-dark | `web.html` #21 | 1440/深 | 0.0503/7/34 | D·D：首页日期与示例数据需统一（D01） | `D10/web-populated-dark-round2` |
| W-R10-05-1440-light | `b11-nav-v3.html` #25 | 1440/浅 | 0.0665/7/43 | S·D：首页/壳数据与位置差 | `D10/web-edit-b11-round1` |
| W-R10-06-1024-light | `b12-missing-states.html` #86 | 1024/浅 | 0.0192/1/1 | S·D：首页/壳数据与位置差 | `D10/web-1024-shell-valid/W-R10-06-1024-light` |
| W-R10-06D-1024-dark | `b12-missing-states.html` #87 | 1024/深 | 0.0191/1/2 | S·D：首页/壳数据与位置差 | `D10/web-1024-shell-valid/W-R10-06D-1024-dark` |
| W-R10-07-1024-light | `b12-missing-states.html` #88 | 1024/浅 | 0.0647/17/11 | S·D：首页/壳数据与位置差 | `D10/web-1024-shell-valid/W-R10-07-1024-light` |
| W-R10-07D-1024-dark | `b12-missing-states.html` #89 | 1024/深 | 0.1517/19/8 | S·D：首页/壳数据与位置差 | `D10/web-1024-shell-valid/W-R10-07D-1024-dark` |

### R11a（39 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R11-01-app-light | `app.html` #6 | App/浅 | 0.1217/20/14 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-app-R11a-empty` |
| A-R11-02-app-light | `app.html` #7 | App/浅 | 0.1059/21/16 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-app-R11a-locked5` |
| A-R11-03-app-light | `app.html` #8 | App/浅 | —/—/— | D·E：未实拍：九行分页与画板八行冲突（D02） | `suite:app-R11a.json` |
| A-R11-03d-app-dark | `app.html` #34 | App/深 | 0.0824/23/9 | D·E：九行分页与画板八行冲突（D02） | `E1/final-app-R11a-many286` |
| A-R11-04-app-light | `app.html` #9 | App/浅 | 0.5785/24/11 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-app-R11a-many286` |
| A-R11-05-app-light | `app.html` #29 | App/浅 | 0.1546/20/7 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-app-R11a-many286` |
| A-R11-06-app-light | `b9-import-plan-v2.html` #20 | App/浅 | 0.1414/18/9 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-app-R11a-many286` |
| A-R11-06d-app-dark | `b9-import-plan-v2.html` #27 | App/深 | 0.1282/18/8 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-app-R11a-many286` |
| A-R11-07-app-light | `b9-import-plan-v2.html` #21 | App/浅 | 0.1099/18/11 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-app-R11a-many286` |
| A-R11-08-app-light | `b9-import-plan-v2.html` #22 | App/浅 | 0.1967/18/7 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-app-R11a-many286` |
| A-R11-09-app-light | `b5-me-inbox.html` #60 | App/浅 | 0.8032/25/13 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-app-R11a-many286` |
| A-R11-10-app-light | `b5-me-inbox.html` #42 | App/浅 | 0.0475/17/15 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-app-R11a-many286` |
| A-R11-11-app-light | `b5-me-inbox.html` #43 | App/浅 | 0.0974/19/17 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-app-R11a-many286` |
| A-R11-12-app-light | `b5-me-inbox.html` #44 | App/浅 | 0.0903/19/15 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-app-R11a-many286` |
| A-R11-13-app-light | `b1-onboarding-cards.html` #58 | App/浅 | 0.0137/6/0 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-app-R11a-loading` |
| W-R11-01-1440-light | `web.html` #4 | 1440/浅 | 0.0318/11/22 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-web-R11a-run2-empty` |
| W-R11-01d-1440-dark | `b12-missing-states.html` #511 | 1440/深 | 0.0302/11/21 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-web-R11a-run2-empty` |
| W-R11-02-1440-light | `web.html` #5 | 1440/浅 | —/—/— | S·E：未实拍：人脈列表/筛选/抽屉残差 | `suite:web-R11a.json` |
| W-R11-02d-1440-dark | `b12-missing-states.html` #509 | 1440/深 | 0.0273/12/13 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-web-R11a-run2-locked5` |
| W-R11-03-1440-light | `web.html` #6 | 1440/浅 | 0.0471/21/55 | D·E：九行分页与画板八行冲突（D02） | `E1/final-web-R11a-run2-many286` |
| W-R11-03-1024-1024-light | `b6-host-polish.html` #36 | 1024/浅 | 0.0627/20/44 | D·E：九行分页与画板八行冲突（D02） | `E1/final-web-R11a-run2-many286` |
| W-R11-03-390-390-light | `b6-host-polish.html` #38 | 390/浅 | 0.1216/29/20 | D·E：九行分页与画板八行冲突（D02） | `E1/final-web-R11a-run2-many286` |
| W-R11-06-1440-light | `web.html` #7 | 1440/浅 | 0.0563/26/46 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-web-R11a-run2-many286` |
| W-R11-06d-1440-dark | `b6-host-polish.html` #41 | 1440/深 | 0.0486/23/45 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-web-R11a-run2-many286` |
| W-R11-06-1024-1024-light | `b8-responsive.html` #13 | 1024/浅 | 0.0550/22/24 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-web-R11a-run2-many286` |
| W-R11-06-390-390-light | `b8-responsive.html` #14 | 390/浅 | 0.0827/27/23 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-web-R11a-run2-many286` |
| W-R11-07-1440-light | `b12-missing-states.html` #500 | 1440/浅 | 0.0630/26/44 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-web-R11a-run2-many286` |
| W-R11-07d-1440-dark | `b12-missing-states.html` #501 | 1440/深 | 0.0540/23/47 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-web-R11a-run2-many286` |
| W-R11-07-390-390-light | `b12-missing-states.html` #512 | 390/浅 | 0.1351/26/22 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-web-R11a-run2-many286` |
| W-R11-07-390d-390-dark | `b12-missing-states.html` #513 | 390/深 | 0.1144/25/21 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-web-R11a-run2-many286` |
| W-R11-08-1440-light | `b12-missing-states.html` #502 | 1440/浅 | 0.0452/23/57 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-web-R11a-run2-many286` |
| W-R11-08d-1440-dark | `b12-missing-states.html` #503 | 1440/深 | 0.0404/22/58 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-web-R11a-run2-many286` |
| W-R11-09-1440-light | `b12-missing-states.html` #504 | 1440/浅 | 0.0650/28/46 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-web-R11a-run2-many286` |
| W-R11-09d-1440-dark | `b12-missing-states.html` #505 | 1440/深 | 0.0557/27/49 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-web-R11a-run2-many286` |
| W-R11-09u-1440-light | `b12-missing-states.html` #506 | 1440/浅 | 0.0705/29/36 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-web-R11a-run2-many286` |
| W-R11-09ud-1440-dark | `b12-missing-states.html` #507 | 1440/深 | 0.0506/25/25 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-web-R11a-run2-many286` |
| W-R11-10-1440-light | `b5-me-inbox.html` #61 | 1440/浅 | 0.0821/28/52 | A·A→E：共享行/抽屉/弹层先修，再由 E 重比 | `E1/final-web-R11a-run2-many286` |
| W-R11-11-1440-light | `b5-me-inbox.html` #45 | 1440/浅 | 0.5999/36/55 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-web-R11a-run2-many286` |
| W-R11-12-1440-light | `b1-onboarding-cards.html` #59 | 1440/浅 | 0.0172/7/2 | S·E：人脈列表/筛选/抽屉残差 | `E1/final-web-R11a-run2-loading` |

### R11b（8 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R11b-01-app-light | `b5-me-inbox.html` #32 | App/浅 | 0.0861/21/14 | A·A→E：共享图表/行 token 后 E 重比 | `E1/final-app-R11b-locked5` |
| A-R11b-02-app-light | `b5-me-inbox.html` #33 | App/浅 | 0.0486/17/1 | A·A→E：共享图表/行 token 后 E 重比 | `E1/app-r11b-gradient-run2-few14` |
| A-R11b-03-app-light | `b5-me-inbox.html` #34 | App/浅 | 0.0834/18/4 | D·E：无来源卡/阶段契约与画板冲突（D03） | `E1/final-app-R11b-many286` |
| A-R11b-03D-app-dark | `b5-me-inbox.html` #67 | App/深 | 0.0861/18/4 | D·E：无来源卡/阶段契约与画板冲突（D03） | `E1/final-app-R11b-many286` |
| A-R11b-04-app-light | `b5-me-inbox.html` #35 | App/浅 | 0.0827/16/17 | D·E：无来源卡/阶段契约与画板冲突（D03） | `E1/final-app-R11b-many286` |
| A-R11b-05-app-light | `b5-me-inbox.html` #36 | App/浅 | 0.1241/17/8 | A·A→E：共享图表/行 token 后 E 重比 | `E1/final-app-R11b-many286` |
| A-R11b-06-app-light | `b5-me-inbox.html` #37 | App/浅 | 0.1818/21/19 | A·A→E：共享图表/行 token 后 E 重比 | `E1/final-app-R11b-many286` |
| W-R11b-04-1440-light | `b5-me-inbox.html` #41 | 1440/浅 | 0.0304/12/17 | D·E：自动 PASS 但 `[data]` 隐去缺卡，结构待 D03 | `E1/regression-web-R11b-many286` |

### R13（10 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R13-01-app-light | `b5-me-inbox.html` #0 | App/浅 | 0.1376/20/14 | S·B：受信箱缺同源事件/线程样本（D04） | `B13/app-pixel-recheck/A-R13-01-app-light` |
| A-R13-02-app-light | `b5-me-inbox.html` #1 | App/浅 | 0.0612/12/10 | S·B：受信箱缺同源事件/线程样本（D04） | `B13/app-pixel-final` |
| A-R13-04-app-light | `b5-me-inbox.html` #3 | App/浅 | 0.0720/16/13 | D·B：受信箱缺同源事件/线程样本（D04） | `B13/app-pixel-recheck/A-R13-04-app-light` |
| A-R13-05-app-light | `b5-me-inbox.html` #4 | App/浅 | 0.0885/22/16 | D·B：受信箱缺同源事件/线程样本（D04） | `B13/app-pixel-final` |
| A-R13-07-app-light | `b11-nav-v3.html` #29 | App/浅 | 0.0704/16/11 | D·B：受信箱缺同源事件/线程样本（D04） | `B13/app-pixel-final` |
| A-R13-08-app-light | `b11-nav-v3.html` #30 | App/浅 | 0.0621/15/8 | D·B：受信箱缺同源事件/线程样本（D04） | `B13/app-pixel-final` |
| W-R13-01-1440-light | `b5-me-inbox.html` #5 | 1440/浅 | 0.0332/13/30 | S·B：受信箱缺同源事件/线程样本（D04） | `B13/web-pixel-final` |
| W-R13-02-1440-light | `b5-me-inbox.html` #6 | 1440/浅 | 0.0234/12/25 | S·B：受信箱缺同源事件/线程样本（D04） | `B13/web-pixel-final` |
| W-R13-04-1440-light | `b5-me-inbox.html` #8 | 1440/浅 | 0.0377/19/41 | D·B：受信箱缺同源事件/线程样本（D04） | `B13/web-pixel-final` |
| W-R13-04d-1440-dark | `b5-me-inbox.html` #69 | 1440/深 | 0.0558/20/39 | D·B：受信箱缺同源事件/线程样本（D04） | `B13/web-pixel-final` |

### R18a（53 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R18a-01-app-light | `b5-me-inbox.html` #14 | App/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-02-app-light | `b5-me-inbox.html` #15 | App/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-03-app-light | `b12-missing-states.html` #546 | App/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-03-app-dark | `b12-missing-states.html` #547 | App/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-04-app-light | `b5-me-inbox.html` #17 | App/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-05-app-light | `b5-me-inbox.html` #21 | App/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-06-app-light | `b5-me-inbox.html` #22 | App/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-07-app-light | `b5-me-inbox.html` #23 | App/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-07-app-dark | `b5-me-inbox.html` #23 | App/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-08-app-light | `b5-me-inbox.html` #24 | App/浅 | —/—/— | A·A→C：未实拍：标题/行 token 先修，再由 C 重比 | `suite:app-R18a.json` |
| A-R18a-09-app-light | `b12-missing-states.html` #548 | App/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-09-app-dark | `b12-missing-states.html` #549 | App/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-10-app-light | `b7-account-misc.html` #46 | App/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-11-app-light | `b7-account-misc.html` #47 | App/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| A-R18a-12-app-light | `b7-account-misc.html` #48 | App/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:app-R18a.json` |
| W-R18a-P01-1440-light | `b5-me-inbox.html` #18 | 1440/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P02-1440-light | `b5-me-inbox.html` #19 | 1440/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P03-1440-light | `b12-missing-states.html` #516 | 1440/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P03-1440-dark | `b12-missing-states.html` #517 | 1440/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P04-1440-light | `b5-me-inbox.html` #26 | 1440/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P05-1440-light | `b5-me-inbox.html` #27 | 1440/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P06-1440-light | `b5-me-inbox.html` #28 | 1440/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P06-1440-dark | `b5-me-inbox.html` #28 | 1440/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P07-1440-light | `b12-missing-states.html` #518 | 1440/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P07-1440-dark | `b12-missing-states.html` #519 | 1440/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P08-1440-light | `b12-missing-states.html` #520 | 1440/浅 | 0.0478/4/24 | A·A→C：标题/行 token 先修，再由 C 重比 | `C18c/R18c-R18a-appearance-fullboard-run-01b` |
| W-R18a-P08-1440-dark | `b12-missing-states.html` #521 | 1440/深 | 0.0473/5/21 | A·A→C：标题/行 token 先修，再由 C 重比 | `C18c/R18c-R18a-appearance-fullboard-run-01b` |
| W-R18a-P09-1440-light | `b7-account-misc.html` #49 | 1440/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P10-1440-light | `b7-account-misc.html` #50 | 1440/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P11-1440-light | `b12-missing-states.html` #522 | 1440/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P11-1440-dark | `b12-missing-states.html` #523 | 1440/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P12-1024-light | `b12-missing-states.html` #524 | 1024/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P12-1024-dark | `b12-missing-states.html` #525 | 1024/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P13-1024-light | `b12-missing-states.html` #526 | 1024/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P13-1024-dark | `b12-missing-states.html` #527 | 1024/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P14-1024-light | `b12-missing-states.html` #528 | 1024/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P14-1024-dark | `b12-missing-states.html` #529 | 1024/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P15-1024-light | `b12-missing-states.html` #530 | 1024/浅 | 0.0529/5/22 | A·A→C：标题/行 token 先修，再由 C 重比 | `C18c/R18c-R18a-appearance-fullboard-run-01b` |
| W-R18a-P15-1024-dark | `b12-missing-states.html` #531 | 1024/深 | 0.0544/5/20 | A·A→C：标题/行 token 先修，再由 C 重比 | `C18c/R18c-R18a-appearance-fullboard-run-01b` |
| W-R18a-P16-1024-light | `b12-missing-states.html` #532 | 1024/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P16-1024-dark | `b12-missing-states.html` #533 | 1024/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P17-390-light | `b12-missing-states.html` #534 | 390/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P17-390-dark | `b12-missing-states.html` #535 | 390/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P18-390-light | `b12-missing-states.html` #536 | 390/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P18-390-dark | `b12-missing-states.html` #537 | 390/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P19-390-light | `b12-missing-states.html` #538 | 390/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P19-390-dark | `b12-missing-states.html` #539 | 390/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P20-390-light | `b12-missing-states.html` #540 | 390/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P20-390-dark | `b12-missing-states.html` #541 | 390/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P21-390-light | `b12-missing-states.html` #542 | 390/浅 | 0.1063/10/17 | S·C：我的页/设置样本与标题壳 | `C18c/R18c-R18a-appearance-fullboard-run-01b` |
| W-R18a-P21-390-dark | `b12-missing-states.html` #543 | 390/深 | 0.1179/12/14 | S·C：我的页/设置样本与标题壳 | `C18c/R18c-R18a-appearance-fullboard-run-01b` |
| W-R18a-P22-390-light | `b12-missing-states.html` #544 | 390/浅 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |
| W-R18a-P22-390-dark | `b12-missing-states.html` #545 | 390/深 | —/—/— | S·C：未实拍：我的页/设置样本与标题壳 | `suite:web-R18a.json` |

### R18b（114 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R18b-11H-public-app-light | `b12-missing-states.html` #556 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-11H-public-app-dark | `b12-missing-states.html` #557 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-11T-public-app-light | `b12-missing-states.html` #564 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-11T-public-app-dark | `b12-missing-states.html` #565 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-11P-public-app-light | `b12-missing-states.html` #572 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-11P-public-app-dark | `b12-missing-states.html` #573 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-08-public-app-light | `b12-missing-states.html` #608 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-08-public-app-dark | `b12-missing-states.html` #609 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-01-no-google-light-app-light | `b12-missing-states.html` #732 | App/浅 | 0.1142/13/4 | S·C：认证状态样本与布局 | `C18b/app-a01-no-google-light-r2` |
| A-R18b-01-no-google-dark-app-dark | `b12-missing-states.html` #733 | App/深 | 0.0932/11/4 | S·C：认证状态样本与布局 | `C18b/app-a01-no-google-dark-r1` |
| A-R18b-02-no-google-light-app-light | `b12-missing-states.html` #736 | App/浅 | 0.0580/11/3 | S·C：认证状态样本与布局 | `C18b/app-a02-no-google-light-r3` |
| A-R18b-02-no-google-dark-app-dark | `b12-missing-states.html` #737 | App/深 | 0.0879/12/7 | S·C：认证状态样本与布局 | `C18b/app-a02-no-google-dark-r1-valid` |
| A-R18b-03-no-google-light-app-light | `b12-missing-states.html` #744 | App/浅 | 0.1223/12/5 | S·C：认证状态样本与布局 | `C18b/app-a03-no-google-light-r3` |
| A-R18b-03-no-google-dark-app-dark | `b12-missing-states.html` #745 | App/深 | 0.1248/13/5 | S·C：认证状态样本与布局 | `C18b/app-a03-no-google-dark-r1` |
| A-R18b-04-light-app-light | `b12-missing-states.html` #754 | App/浅 | 0.1100/9/5 | D·C：找回密码邮箱输入与画板冲突（D05） | `C18b/app-a04-light-r2` |
| A-R18b-04-dark-app-dark | `b12-missing-states.html` #755 | App/深 | 0.1123/9/5 | D·C：找回密码邮箱输入与画板冲突（D05） | `C18b/app-a04-dark-r1` |
| A-R18b-05-valid-light-app-light | `b12-missing-states.html` #758 | App/浅 | 0.0462/11/5 | S·C：认证状态样本与布局 | `C18b/app-a05-light-r3` |
| A-R18b-05-valid-dark-app-dark | `b12-missing-states.html` #759 | App/深 | 0.0504/12/4 | S·C：认证状态样本与布局 | `C18b/app-a05-valid-dark-r1` |
| A-R18b-05-invalid-light-app-light | `b12-missing-states.html` #760 | App/浅 | 0.0349/6/3 | S·C：认证状态样本与布局 | `C18b/app-a05-invalid-light-r2` |
| A-R18b-05-invalid-dark-app-dark | `b12-missing-states.html` #761 | App/深 | 0.0349/6/3 | S·C：认证状态样本与布局 | `C18b/app-a05-invalid-dark-r1` |
| A-R18b-01-google-light-app-light | `b12-missing-states.html` #730 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-01-google-dark-app-dark | `b12-missing-states.html` #731 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-02-google-light-app-light | `b12-missing-states.html` #734 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-02-google-dark-app-dark | `b12-missing-states.html` #735 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-02-pending-count-light-app-light | `b12-missing-states.html` #738 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-02-pending-count-dark-app-dark | `b12-missing-states.html` #739 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-02-pending-unknown-light-app-light | `b12-missing-states.html` #740 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-02-pending-unknown-dark-app-dark | `b12-missing-states.html` #741 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-03-google-light-app-light | `b12-missing-states.html` #742 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-03-google-dark-app-dark | `b12-missing-states.html` #743 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-03-existing-light-app-light | `b12-missing-states.html` #746 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-03-existing-dark-app-dark | `b12-missing-states.html` #747 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-03-success-light-app-light | `b12-missing-states.html` #748 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-03-success-dark-app-dark | `b12-missing-states.html` #749 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-03-auto-failed-light-app-light | `b12-missing-states.html` #750 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-03-auto-failed-dark-app-dark | `b12-missing-states.html` #751 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-03-password-72-light-app-light | `b12-missing-states.html` #752 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-03-password-72-dark-app-dark | `b12-missing-states.html` #753 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-04-accepted-light-app-light | `b12-missing-states.html` #756 | App/浅 | —/—/— | D·C：未实拍：找回密码邮箱输入与画板冲突（D05） | `suite:app-R18b.json` |
| A-R18b-04-accepted-dark-app-dark | `b12-missing-states.html` #757 | App/深 | —/—/— | D·C：未实拍：找回密码邮箱输入与画板冲突（D05） | `suite:app-R18b.json` |
| A-R18b-05-password-72-light-app-light | `b12-missing-states.html` #762 | App/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| A-R18b-05-password-72-dark-app-dark | `b12-missing-states.html` #763 | App/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:app-R18b.json` |
| W-R18b-08-public-1440-light | `b12-missing-states.html` #610 | 1440/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-08-public-1440-dark | `b12-missing-states.html` #611 | 1440/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-08-public-1024-light | `b12-missing-states.html` #614 | 1024/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-08-public-1024-dark | `b12-missing-states.html` #615 | 1024/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-08-public-390-light | `b12-missing-states.html` #618 | 390/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-08-public-390-dark | `b12-missing-states.html` #619 | 390/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-public-1440-light | `b12-missing-states.html` #550 | 1440/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-public-1440-dark | `b12-missing-states.html` #551 | 1440/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-public-1024-light | `b12-missing-states.html` #552 | 1024/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-public-1024-dark | `b12-missing-states.html` #553 | 1024/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-public-390-light | `b12-missing-states.html` #554 | 390/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-public-390-dark | `b12-missing-states.html` #555 | 390/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-expanded-1440-light | `b12-missing-states.html` #574 | 1440/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-expanded-1440-dark | `b12-missing-states.html` #575 | 1440/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-expanded-1024-light | `b12-missing-states.html` #576 | 1024/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-expanded-1024-dark | `b12-missing-states.html` #577 | 1024/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-expanded-390-light | `b12-missing-states.html` #578 | 390/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-expanded-390-dark | `b12-missing-states.html` #579 | 390/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-empty-1440-light | `b12-missing-states.html` #582 | 1440/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-empty-1440-dark | `b12-missing-states.html` #583 | 1440/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-empty-1024-light | `b12-missing-states.html` #584 | 1024/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-empty-1024-dark | `b12-missing-states.html` #585 | 1024/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-empty-390-light | `b12-missing-states.html` #586 | 390/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11H-empty-390-dark | `b12-missing-states.html` #587 | 390/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11T-public-1440-light | `b12-missing-states.html` #558 | 1440/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11T-public-1440-dark | `b12-missing-states.html` #559 | 1440/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11T-public-1024-light | `b12-missing-states.html` #560 | 1024/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11T-public-1024-dark | `b12-missing-states.html` #561 | 1024/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11T-public-390-light | `b12-missing-states.html` #562 | 390/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11T-public-390-dark | `b12-missing-states.html` #563 | 390/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11P-public-1440-light | `b12-missing-states.html` #566 | 1440/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11P-public-1440-dark | `b12-missing-states.html` #567 | 1440/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11P-public-1024-light | `b12-missing-states.html` #568 | 1024/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11P-public-1024-dark | `b12-missing-states.html` #569 | 1024/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11P-public-390-light | `b12-missing-states.html` #570 | 390/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-11P-public-390-dark | `b12-missing-states.html` #571 | 390/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-01-no-google-1440-light-1440-light | `b12-missing-states.html` #652 | 1440/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-01-no-google-1440-dark-1440-dark | `b12-missing-states.html` #653 | 1440/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-01-no-google-1024-light-1024-light | `b12-missing-states.html` #654 | 1024/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-01-no-google-1024-dark-1024-dark | `b12-missing-states.html` #655 | 1024/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-01-no-google-390-light-390-light | `b12-missing-states.html` #656 | 390/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-01-no-google-390-dark-390-dark | `b12-missing-states.html` #657 | 390/深 | 0.0368/11/0 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-02-no-google-1440-light-1440-light | `b12-missing-states.html` #664 | 1440/浅 | 0.0277/13/3 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-02-no-google-1440-dark-1440-dark | `b12-missing-states.html` #665 | 1440/深 | 0.0140/3/1 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-02-no-google-1024-light-1024-light | `b12-missing-states.html` #666 | 1024/浅 | 0.0610/16/5 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-02-no-google-1024-dark-1024-dark | `b12-missing-states.html` #667 | 1024/深 | 0.0376/10/7 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-02-no-google-390-light-390-light | `b12-missing-states.html` #668 | 390/浅 | 0.0552/16/2 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-02-no-google-390-dark-390-dark | `b12-missing-states.html` #669 | 390/深 | 0.0354/8/4 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-03-no-google-1440-light-1440-light | `b12-missing-states.html` #676 | 1440/浅 | 0.0400/14/11 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-03-no-google-1440-dark-1440-dark | `b12-missing-states.html` #677 | 1440/深 | 0.0222/7/7 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-03-no-google-1024-light-1024-light | `b12-missing-states.html` #678 | 1024/浅 | 0.0796/18/8 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-03-no-google-1024-dark-1024-dark | `b12-missing-states.html` #679 | 1024/深 | 0.0517/12/7 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-03-no-google-390-light-390-light | `b12-missing-states.html` #680 | 390/浅 | 0.0823/18/2 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-03-no-google-390-dark-390-dark | `b12-missing-states.html` #681 | 390/深 | 0.0547/11/4 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-04-request-1440-light-1440-light | `b12-missing-states.html` #706 | 1440/浅 | —/—/— | D·C：未实拍：找回密码邮箱输入与画板冲突（D05） | `suite:web-R18b.json` |
| W-R18b-04-request-1440-dark-1440-dark | `b12-missing-states.html` #707 | 1440/深 | 0.0107/4/1 | D·C：找回密码邮箱输入与画板冲突（D05） | `C18b/web-auth-matrix-r2` |
| W-R18b-04-request-1024-light-1024-light | `b12-missing-states.html` #708 | 1024/浅 | 0.0582/15/6 | D·C：找回密码邮箱输入与画板冲突（D05） | `C18b/web-auth-matrix-r2` |
| W-R18b-04-request-1024-dark-1024-dark | `b12-missing-states.html` #709 | 1024/深 | 0.0370/10/5 | D·C：找回密码邮箱输入与画板冲突（D05） | `C18b/web-auth-matrix-r2` |
| W-R18b-04-request-390-light-390-light | `b12-missing-states.html` #710 | 390/浅 | 0.0441/16/2 | D·C：找回密码邮箱输入与画板冲突（D05） | `C18b/web-auth-matrix-r2` |
| W-R18b-04-request-390-dark-390-dark | `b12-missing-states.html` #711 | 390/深 | 0.0249/9/4 | D·C：找回密码邮箱输入与画板冲突（D05） | `C18b/web-auth-matrix-r2` |
| W-R18b-05-valid-1440-light-1440-light | `b12-missing-states.html` #718 | 1440/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-05-valid-1440-dark-1440-dark | `b12-missing-states.html` #719 | 1440/深 | 0.0093/4/1 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-05-valid-1024-light-1024-light | `b12-missing-states.html` #720 | 1024/浅 | 0.0530/14/5 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-05-valid-1024-dark-1024-dark | `b12-missing-states.html` #721 | 1024/深 | 0.0319/9/4 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-05-valid-390-light-390-light | `b12-missing-states.html` #722 | 390/浅 | 0.0456/16/2 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-05-valid-390-dark-390-dark | `b12-missing-states.html` #723 | 390/深 | 0.0249/10/4 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-05-invalid-1440-light-1440-light | `b12-missing-states.html` #724 | 1440/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-05-invalid-1440-dark-1440-dark | `b12-missing-states.html` #725 | 1440/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-05-invalid-1024-light-1024-light | `b12-missing-states.html` #726 | 1024/浅 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-05-invalid-1024-dark-1024-dark | `b12-missing-states.html` #727 | 1024/深 | —/—/— | S·C：未实拍：认证状态样本与布局 | `suite:web-R18b.json` |
| W-R18b-05-invalid-390-light-390-light | `b12-missing-states.html` #728 | 390/浅 | 0.0906/19/9 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |
| W-R18b-05-invalid-390-dark-390-dark | `b12-missing-states.html` #729 | 390/深 | 0.0496/9/11 | S·C：认证状态样本与布局 | `C18b/web-auth-matrix-r2` |

R18b 键名里的 `invalid` 指「无效验证码」目标状态；有数字的两张是有效目标截图，不是被剔除的无效抓拍。

### R18c（152 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R18c-P01-original-app-light | `b7-account-misc.html` #19 | App/浅 | 0.0654/8/5 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-native-P01-run-03` |
| A-R18c-P02-original-app-light | `b7-account-misc.html` #20 | App/浅 | 0.1262/8/20 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-native-P-matrix-run-01` |
| A-R18c-P03-original-app-light | `b7-account-misc.html` #21 | App/浅 | 0.1510/7/11 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-native-P-matrix-run-01` |
| A-R18c-P04-original-app-light | `b7-account-misc.html` #22 | App/浅 | 0.1303/6/11 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-app-native-P-matrix-run-01` |
| A-R18c-P05-original-app-light | `b7-account-misc.html` #23 | App/浅 | 0.0251/3/0 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-app-native-P05-run-04` |
| A-R18c-P06-original-app-light | `b7-account-misc.html` #28 | App/浅 | 0.1630/9/11 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-native-P-matrix-run-01` |
| A-R18c-P07-original-app-light | `b7-account-misc.html` #29 | App/浅 | 0.1363/7/5 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-native-P-matrix-run-01` |
| A-R18c-P08-original-app-light | `b7-account-misc.html` #30 | App/浅 | 0.1442/7/9 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-native-P-matrix-run-01` |
| A-R18c-P09-original-app-dark | `b7-account-misc.html` #74 | App/深 | 0.1220/7/10 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-native-P-matrix-run-01` |
| A-R18c-P01-draft-light-app-light | `b12-missing-states.html` #764 | App/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-P01-draft-dark-app-dark | `b12-missing-states.html` #765 | App/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-P02-draft-light-app-light | `b12-missing-states.html` #766 | App/浅 | 0.0398/5/16 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P02-draft-dark-app-dark | `b12-missing-states.html` #767 | App/深 | 0.1206/7/13 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P03-draft-light-app-light | `b12-missing-states.html` #768 | App/浅 | 0.0609/7/8 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P03-draft-dark-app-dark | `b12-missing-states.html` #769 | App/深 | 0.1257/7/7 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P04-draft-light-app-light | `b12-missing-states.html` #770 | App/浅 | 0.1481/7/9 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P04-draft-dark-app-dark | `b12-missing-states.html` #771 | App/深 | 0.1522/9/11 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P05-draft-light-app-light | `b12-missing-states.html` #772 | App/浅 | —/—/— | A·A→C：未实拍：共享标题/行/按钮先修，再由 C 重比 | `suite:app-R18c.json` |
| A-R18c-P05-draft-dark-app-dark | `b12-missing-states.html` #773 | App/深 | —/—/— | A·A→C：未实拍：共享标题/行/按钮先修，再由 C 重比 | `suite:app-R18c.json` |
| A-R18c-P06-draft-light-app-light | `b12-missing-states.html` #774 | App/浅 | 0.1147/9/11 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P06-draft-dark-app-dark | `b12-missing-states.html` #775 | App/深 | 0.1152/9/11 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P07-draft-light-app-light | `b12-missing-states.html` #776 | App/浅 | 0.1134/7/9 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P07-draft-dark-app-dark | `b12-missing-states.html` #777 | App/深 | 0.1141/7/10 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P08-draft-light-app-light | `b12-missing-states.html` #778 | App/浅 | 0.1022/7/10 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P08-draft-dark-app-dark | `b12-missing-states.html` #779 | App/深 | 0.1033/7/9 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P09-draft-light-app-light | `b12-missing-states.html` #780 | App/浅 | 0.0609/7/8 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-P09-draft-dark-app-dark | `b12-missing-states.html` #781 | App/深 | 0.1257/7/7 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-app-b12-P-matrix-run-01` |
| A-R18c-S01-draft-light-app-light | `b12-missing-states.html` #782 | App/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S01-draft-dark-app-dark | `b12-missing-states.html` #783 | App/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S02-draft-light-app-light | `b12-missing-states.html` #784 | App/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S02-draft-dark-app-dark | `b12-missing-states.html` #785 | App/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S03-draft-light-app-light | `b12-missing-states.html` #786 | App/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S03-draft-dark-app-dark | `b12-missing-states.html` #787 | App/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S04-draft-light-app-light | `b12-missing-states.html` #788 | App/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S04-draft-dark-app-dark | `b12-missing-states.html` #789 | App/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S05-draft-light-app-light | `b12-missing-states.html` #790 | App/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S05-draft-dark-app-dark | `b12-missing-states.html` #791 | App/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S06-draft-light-app-light | `b12-missing-states.html` #792 | App/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S06-draft-dark-app-dark | `b12-missing-states.html` #793 | App/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S07-draft-light-app-light | `b12-missing-states.html` #794 | App/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S07-draft-dark-app-dark | `b12-missing-states.html` #795 | App/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S08-draft-light-app-light | `b12-missing-states.html` #796 | App/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| A-R18c-S08-draft-dark-app-dark | `b12-missing-states.html` #797 | App/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:app-R18c.json` |
| W-R18c-P01-original-1440-light | `b7-account-misc.html` #24 | 1440/浅 | 0.0581/4/29 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-P01-run-01b` |
| W-R18c-P02-original-1440-light | `b7-account-misc.html` #25 | 1440/浅 | 0.8459/10/16 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-P-matrix-run-01` |
| W-R18c-P03-original-1440-light | `b7-account-misc.html` #26 | 1440/浅 | 0.0260/5/14 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-P-matrix-run-01` |
| W-R18c-P04-original-1440-light | `b7-account-misc.html` #27 | 1440/浅 | 0.0072/1/2 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-pixel-run-03` |
| W-R18c-P05-original-1440-light | `b7-account-misc.html` #31 | 1440/浅 | 0.0350/5/29 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-web-P-matrix-run-01` |
| W-R18c-P06-original-1440-light | `b7-account-misc.html` #32 | 1440/浅 | 0.0388/5/33 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-P-matrix-run-01` |
| W-R18c-P07-original-1440-dark | `b7-account-misc.html` #81 | 1440/深 | 0.0920/7/26 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-P-matrix-run-01` |
| W-R18c-P01-1440-draft-light-1440-light | `b12-missing-states.html` #798 | 1440/浅 | 0.0207/4/17 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P01-1440-draft-dark-1440-dark | `b12-missing-states.html` #799 | 1440/深 | 0.0546/4/20 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P01-1024-draft-light-1024-light | `b12-missing-states.html` #800 | 1024/浅 | 0.0392/5/18 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P01-1024-draft-dark-1024-dark | `b12-missing-states.html` #801 | 1024/深 | 0.0807/5/20 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P01-390-draft-light-390-light | `b12-missing-states.html` #802 | 390/浅 | 0.0732/7/13 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P01-390-draft-dark-390-dark | `b12-missing-states.html` #803 | 390/深 | 0.1269/7/12 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P02-1440-draft-light-1440-light | `b12-missing-states.html` #804 | 1440/浅 | 0.0211/3/12 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P02-1440-draft-dark-1440-dark | `b12-missing-states.html` #805 | 1440/深 | 0.0545/4/11 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P02-1024-draft-light-1024-light | `b12-missing-states.html` #806 | 1024/浅 | 0.0396/5/12 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P02-1024-draft-dark-1024-dark | `b12-missing-states.html` #807 | 1024/深 | 0.0804/5/13 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P02-390-draft-light-390-light | `b12-missing-states.html` #808 | 390/浅 | 0.1283/7/12 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P02-390-draft-dark-390-dark | `b12-missing-states.html` #809 | 390/深 | 0.1640/7/8 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P03-1440-draft-light-1440-light | `b12-missing-states.html` #810 | 1440/浅 | 0.0228/4/8 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P03-1440-draft-dark-1440-dark | `b12-missing-states.html` #811 | 1440/深 | 0.0549/4/6 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P03-1024-draft-light-1024-light | `b12-missing-states.html` #812 | 1024/浅 | 0.0421/5/9 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P03-1024-draft-dark-1024-dark | `b12-missing-states.html` #813 | 1024/深 | 0.0814/5/7 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P03-390-draft-light-390-light | `b12-missing-states.html` #814 | 390/浅 | 0.1652/6/10 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P03-390-draft-dark-390-dark | `b12-missing-states.html` #815 | 390/深 | 0.1718/6/11 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P04-1440-draft-light-1440-light | `b12-missing-states.html` #816 | 1440/浅 | —/—/— | A·A→C：未实拍：共享标题/行/按钮先修，再由 C 重比 | `suite:web-R18c.json` |
| W-R18c-P04-1440-draft-dark-1440-dark | `b12-missing-states.html` #817 | 1440/深 | —/—/— | A·A→C：未实拍：共享标题/行/按钮先修，再由 C 重比 | `suite:web-R18c.json` |
| W-R18c-P04-1024-draft-light-1024-light | `b12-missing-states.html` #818 | 1024/浅 | —/—/— | A·A→C：未实拍：共享标题/行/按钮先修，再由 C 重比 | `suite:web-R18c.json` |
| W-R18c-P04-1024-draft-dark-1024-dark | `b12-missing-states.html` #819 | 1024/深 | —/—/— | A·A→C：未实拍：共享标题/行/按钮先修，再由 C 重比 | `suite:web-R18c.json` |
| W-R18c-P04-390-draft-light-390-light | `b12-missing-states.html` #820 | 390/浅 | —/—/— | A·A→C：未实拍：共享标题/行/按钮先修，再由 C 重比 | `suite:web-R18c.json` |
| W-R18c-P04-390-draft-dark-390-dark | `b12-missing-states.html` #821 | 390/深 | —/—/— | A·A→C：未实拍：共享标题/行/按钮先修，再由 C 重比 | `suite:web-R18c.json` |
| W-R18c-P05-1440-draft-light-1440-light | `b12-missing-states.html` #822 | 1440/浅 | 0.0576/5/15 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P05-1440-draft-dark-1440-dark | `b12-missing-states.html` #823 | 1440/深 | 0.0613/5/16 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P05-1024-draft-light-1024-light | `b12-missing-states.html` #824 | 1024/浅 | 0.0820/7/15 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P05-1024-draft-dark-1024-dark | `b12-missing-states.html` #825 | 1024/深 | 0.0875/7/15 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P05-390-draft-light-390-light | `b12-missing-states.html` #826 | 390/浅 | 0.1530/9/13 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P05-390-draft-dark-390-dark | `b12-missing-states.html` #827 | 390/深 | 0.1619/11/14 | A·A→C：共享标题/行/按钮先修，再由 C 重比 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P06-1440-draft-light-1440-light | `b12-missing-states.html` #828 | 1440/浅 | 0.0253/5/10 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P06-1440-draft-dark-1440-dark | `b12-missing-states.html` #829 | 1440/深 | 0.0294/5/10 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P06-1024-draft-light-1024-light | `b12-missing-states.html` #830 | 1024/浅 | 0.0381/6/11 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P06-1024-draft-dark-1024-dark | `b12-missing-states.html` #831 | 1024/深 | 0.0417/6/12 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P06-390-draft-light-390-light | `b12-missing-states.html` #832 | 390/浅 | 0.0950/9/9 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P06-390-draft-dark-390-dark | `b12-missing-states.html` #833 | 390/深 | 0.1093/11/9 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P07-1440-draft-light-1440-light | `b12-missing-states.html` #834 | 1440/浅 | 0.0211/3/12 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P07-1440-draft-dark-1440-dark | `b12-missing-states.html` #835 | 1440/深 | 0.0545/4/11 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P07-1024-draft-light-1024-light | `b12-missing-states.html` #836 | 1024/浅 | 0.0396/5/12 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P07-1024-draft-dark-1024-dark | `b12-missing-states.html` #837 | 1024/深 | 0.0804/5/13 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P07-390-draft-light-390-light | `b12-missing-states.html` #838 | 390/浅 | 0.1283/7/12 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-P07-390-draft-dark-390-dark | `b12-missing-states.html` #839 | 390/深 | 0.1640/7/8 | S·C：数据权利原生/网页状态与布局 | `C18c/R18c-web-b12-P-matrix-run-01` |
| W-R18c-S01-1440-draft-light-1440-light | `b12-missing-states.html` #840 | 1440/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S01-1440-draft-dark-1440-dark | `b12-missing-states.html` #841 | 1440/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S01-1024-draft-light-1024-light | `b12-missing-states.html` #842 | 1024/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S01-1024-draft-dark-1024-dark | `b12-missing-states.html` #843 | 1024/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S01-390-draft-light-390-light | `b12-missing-states.html` #844 | 390/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S01-390-draft-dark-390-dark | `b12-missing-states.html` #845 | 390/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S02-1440-draft-light-1440-light | `b12-missing-states.html` #846 | 1440/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S02-1440-draft-dark-1440-dark | `b12-missing-states.html` #847 | 1440/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S02-1024-draft-light-1024-light | `b12-missing-states.html` #848 | 1024/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S02-1024-draft-dark-1024-dark | `b12-missing-states.html` #849 | 1024/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S02-390-draft-light-390-light | `b12-missing-states.html` #850 | 390/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S02-390-draft-dark-390-dark | `b12-missing-states.html` #851 | 390/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S03-1440-draft-light-1440-light | `b12-missing-states.html` #852 | 1440/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S03-1440-draft-dark-1440-dark | `b12-missing-states.html` #853 | 1440/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S03-1024-draft-light-1024-light | `b12-missing-states.html` #854 | 1024/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S03-1024-draft-dark-1024-dark | `b12-missing-states.html` #855 | 1024/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S03-390-draft-light-390-light | `b12-missing-states.html` #856 | 390/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S03-390-draft-dark-390-dark | `b12-missing-states.html` #857 | 390/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S04-1440-draft-light-1440-light | `b12-missing-states.html` #858 | 1440/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S04-1440-draft-dark-1440-dark | `b12-missing-states.html` #859 | 1440/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S04-1024-draft-light-1024-light | `b12-missing-states.html` #860 | 1024/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S04-1024-draft-dark-1024-dark | `b12-missing-states.html` #861 | 1024/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S04-390-draft-light-390-light | `b12-missing-states.html` #862 | 390/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S04-390-draft-dark-390-dark | `b12-missing-states.html` #863 | 390/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S05-1440-draft-light-1440-light | `b12-missing-states.html` #864 | 1440/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S05-1440-draft-dark-1440-dark | `b12-missing-states.html` #865 | 1440/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S05-1024-draft-light-1024-light | `b12-missing-states.html` #866 | 1024/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S05-1024-draft-dark-1024-dark | `b12-missing-states.html` #867 | 1024/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S05-390-draft-light-390-light | `b12-missing-states.html` #868 | 390/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S05-390-draft-dark-390-dark | `b12-missing-states.html` #869 | 390/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S06-1440-draft-light-1440-light | `b12-missing-states.html` #870 | 1440/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S06-1440-draft-dark-1440-dark | `b12-missing-states.html` #871 | 1440/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S06-1024-draft-light-1024-light | `b12-missing-states.html` #872 | 1024/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S06-1024-draft-dark-1024-dark | `b12-missing-states.html` #873 | 1024/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S06-390-draft-light-390-light | `b12-missing-states.html` #874 | 390/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S06-390-draft-dark-390-dark | `b12-missing-states.html` #875 | 390/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S07-1440-draft-light-1440-light | `b12-missing-states.html` #876 | 1440/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S07-1440-draft-dark-1440-dark | `b12-missing-states.html` #877 | 1440/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S07-1024-draft-light-1024-light | `b12-missing-states.html` #878 | 1024/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S07-1024-draft-dark-1024-dark | `b12-missing-states.html` #879 | 1024/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S07-390-draft-light-390-light | `b12-missing-states.html` #880 | 390/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S07-390-draft-dark-390-dark | `b12-missing-states.html` #881 | 390/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S08-1440-draft-light-1440-light | `b12-missing-states.html` #882 | 1440/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S08-1440-draft-dark-1440-dark | `b12-missing-states.html` #883 | 1440/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S08-1024-draft-light-1024-light | `b12-missing-states.html` #884 | 1024/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S08-1024-draft-dark-1024-dark | `b12-missing-states.html` #885 | 1024/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S08-390-draft-light-390-light | `b12-missing-states.html` #886 | 390/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S08-390-draft-dark-390-dark | `b12-missing-states.html` #887 | 390/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S09-1440-draft-light-1440-light | `b12-missing-states.html` #888 | 1440/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S09-1440-draft-dark-1440-dark | `b12-missing-states.html` #889 | 1440/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S09-1024-draft-light-1024-light | `b12-missing-states.html` #890 | 1024/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S09-1024-draft-dark-1024-dark | `b12-missing-states.html` #891 | 1024/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S09-390-draft-light-390-light | `b12-missing-states.html` #892 | 390/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S09-390-draft-dark-390-dark | `b12-missing-states.html` #893 | 390/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S10-1440-draft-light-1440-light | `b12-missing-states.html` #894 | 1440/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S10-1440-draft-dark-1440-dark | `b12-missing-states.html` #895 | 1440/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S10-1024-draft-light-1024-light | `b12-missing-states.html` #896 | 1024/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S10-1024-draft-dark-1024-dark | `b12-missing-states.html` #897 | 1024/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S10-390-draft-light-390-light | `b12-missing-states.html` #898 | 390/浅 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |
| W-R18c-S10-390-draft-dark-390-dark | `b12-missing-states.html` #899 | 390/深 | —/—/— | S·C：未实拍：数据权利原生/网页状态与布局 | `suite:web-R18c.json` |

### R20a（72 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R20-01-app-light | `app.html` #16 | App/浅 | 0.1584/19/17 | S·D：Task/Calendar 数据与页面残差 | `U20a/app-pixel-a01-loaded/A-R20-01-app-light` |
| A-R20-02-app-light | `app.html` #17 | App/浅 | 0.1161/23/21 | D·D：期日/来源 tile/日程结构待改稿（D06/07） | `U20a/app-pixel-a02-round2-ja/A-R20-02-app-light` |
| A-R20-03-app-light | `app.html` #18 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-04-app-light | `b3-daily-actions.html` #0 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-05-app-light | `b3-daily-actions.html` #1 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-06-app-light | `b3-daily-actions.html` #2 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-07-app-light | `b3-daily-actions.html` #3 | App/浅 | —/—/— | D·D：未实拍：期日/来源 tile/日程结构待改稿（D06/07） | `suite:app-R20a.json` |
| A-R20-05d-app-dark | `b3-daily-actions.html` #47 | App/深 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-08-app-light | `b3-daily-actions.html` #6 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-09-app-light | `b3-daily-actions.html` #7 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-10-app-light | `b3-daily-actions.html` #8 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-11-app-light | `b3-daily-actions.html` #11 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-12-app-light | `b3-daily-actions.html` #12 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-13-app-light | `b3-daily-actions.html` #13 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-14-app-light | `b3-daily-actions.html` #17 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-15-app-light | `b3-daily-actions.html` #18 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-16-app-light | `b3-daily-actions.html` #20 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-17-app-light | `b3-daily-actions.html` #21 | App/浅 | —/—/— | D·D：未实拍：期日/来源 tile/日程结构待改稿（D06/07） | `suite:app-R20a.json` |
| A-R20-18-app-light | `b3-daily-actions.html` #22 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-19-app-light | `b3-daily-actions.html` #23 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-13d-app-dark | `b3-daily-actions.html` #48 | App/深 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-20-app-light | `b3-daily-actions.html` #25 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-21-app-light | `b3-daily-actions.html` #26 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-22-app-light | `b3-daily-actions.html` #27 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-23-app-light | `b3-daily-actions.html` #30 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-24-app-light | `b3-daily-actions.html` #31 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-25-app-light | `b3-daily-actions.html` #32 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-26-app-light | `b3-daily-actions.html` #33 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-27-app-light | `b3-daily-actions.html` #34 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-28-app-light | `b3-daily-actions.html` #35 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-29-app-light | `b3-daily-actions.html` #36 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-25d-app-dark | `b3-daily-actions.html` #49 | App/深 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-30-app-light | `b3-daily-actions.html` #43 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-31-app-light | `b3-daily-actions.html` #44 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-32-app-light | `b3-daily-actions.html` #45 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-32d-app-dark | `b3-daily-actions.html` #50 | App/深 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-33-app-light | `b7-account-misc.html` #40 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-34-app-light | `b7-account-misc.html` #41 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-35-app-light | `b7-account-misc.html` #42 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-36-app-light | `b7-account-misc.html` #43 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-37-app-light | `b11-nav-v3.html` #33 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-38-app-light | `b11-nav-v3.html` #34 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-39-app-light | `b11-nav-v3.html` #35 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-40-app-light | `b11-nav-v3.html` #38 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-41-app-light | `b12-missing-states.html` #92 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-41d-app-dark | `b12-missing-states.html` #93 | App/深 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-42-app-light | `b12-missing-states.html` #94 | App/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| A-R20-42d-app-dark | `b12-missing-states.html` #95 | App/深 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:app-R20a.json` |
| W-R20-01-1440-light | `web.html` #13 | 1440/浅 | 0.0568/14/28 | S·D：Task/Calendar 数据与页面残差 | `D20a/run-01/web-pixel-w01-matched-date-connection/W-R20-01-1440-light` |
| W-R20-02-1440-light | `web.html` #14 | 1440/浅 | 0.0516/14/28 | D·D：期日/来源 tile/日程结构待改稿（D06/07） | `U20a/pixel-w02-round3-mock/W-R20-02-1440-light` |
| W-R20-03-1440-light | `b3-daily-actions.html` #4 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |
| W-R20-04-1440-light | `b3-daily-actions.html` #5 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |
| W-R20-05-1440-light | `b3-daily-actions.html` #9 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |
| W-R20-06-1440-light | `b3-daily-actions.html` #10 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |
| W-R20-07-1440-light | `b3-daily-actions.html` #14 | 1440/浅 | 0.0323/17/20 | D·D：期日/来源 tile/日程结构待改稿（D06/07） | `U20a/pixel-rd33-round3/W-R20-07-1440-light` |
| W-R20-08-1440-light | `b3-daily-actions.html` #15 | 1440/浅 | 0.0361/20/42 | S·D：Task/Calendar 数据与页面残差 | `U20a/pixel-w08-round2/W-R20-08-1440-light` |
| W-R20-09-1440-light | `b3-daily-actions.html` #16 | 1440/浅 | 0.0684/33/73 | S·D：Task/Calendar 数据与页面残差 | `U20a/pixel-w09-round1/W-R20-09-1440-light` |
| W-R20-10-1440-light | `b3-daily-actions.html` #19 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |
| W-R20-11-1440-light | `b3-daily-actions.html` #24 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |
| W-R20-12-1440-light | `b3-daily-actions.html` #28 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |
| W-R20-13-1440-light | `b3-daily-actions.html` #29 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |
| W-R20-09d-1440-dark | `b3-daily-actions.html` #51 | 1440/深 | 0.0616/33/64 | S·D：Task/Calendar 数据与页面残差 | `U20a/pixel-w09-round1/W-R20-09d-1440-dark` |
| W-R20-14-1440-light | `b3-daily-actions.html` #37 | 1440/浅 | 0.0394/19/27 | S·D：Task/Calendar 数据与页面残差 | `U20a/pixel-w14-round3/W-R20-14-1440-light` |
| W-R20-15-1440-light | `b3-daily-actions.html` #38 | 1440/浅 | 0.0380/12/27 | S·D：Task/Calendar 数据与页面残差 | `U20a/pixel-w15-round3/W-R20-15-1440-light` |
| W-R20-16-1440-light | `b3-daily-actions.html` #39 | 1440/浅 | 0.1083/20/42 | S·D：Task/Calendar 数据与页面残差 | `U20a/pixel-w16-round3-mock/W-R20-16-1440-light` |
| W-R20-17-1440-light | `b3-daily-actions.html` #40 | 1440/浅 | 0.2505/24/27 | D·D：期日/来源 tile/日程结构待改稿（D06/07） | `U20a/pixel-w17-round3-mock/W-R20-17-1440-light` |
| W-R20-18-1440-light | `b3-daily-actions.html` #41 | 1440/浅 | 0.1469/26/46 | S·D：Task/Calendar 数据与页面残差 | `U20a/pixel-w18-round2/W-R20-18-1440-light` |
| W-R20-19-1440-light | `b3-daily-actions.html` #46 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |
| W-R20-16d-1440-dark | `b3-daily-actions.html` #52 | 1440/深 | 0.1010/21/39 | S·D：Task/Calendar 数据与页面残差 | `U20a/pixel-w16-round3-mock/W-R20-16d-1440-dark` |
| W-R20-20-1440-light | `b7-account-misc.html` #44 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |
| W-R20-21-1440-light | `b7-account-misc.html` #45 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |
| W-R20-22-1440-light | `b11-nav-v3.html` #39 | 1440/浅 | —/—/— | S·D：未实拍：Task/Calendar 数据与页面残差 | `suite:web-R20a.json` |

### R20b（7 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R20b-01-app-light | `app.html` #26 | App/浅 | 0.1241/22/17 | S·D：手写 Memo 与右栏页面残差；无契约动作待 D08 | `D20b/pixel-app-a01-r2/A-R20b-01-app-light` |
| A-R20b-02-app-light | `b11-nav-v3.html` #36 | App/浅 | 0.0843/17/7 | D·D：Memo AI/录音/右栏动作无契约（D08） | `D20b/pixel-app-a02-r2/A-R20b-02-app-light` |
| A-R20b-03-app-light | `b5-me-inbox.html` #46 | App/浅 | 0.6684/28/8 | D·D：Memo AI/录音/右栏动作无契约（D08） | `D20b/pixel-app-a03-r1/A-R20b-03-app-light` |
| A-R20b-05-app-light | `b5-me-inbox.html` #49 | App/浅 | 0.1351/21/10 | D·D：Memo AI/录音/右栏动作无契约（D08） | `D20b/pixel-app-b5-r1/A-R20b-05-app-light` |
| A-R20b-06-app-light | `b5-me-inbox.html` #50 | App/浅 | 0.0792/15/12 | D·D：Memo AI/录音/右栏动作无契约（D08） | `D20b/pixel-app-b5-r1/A-R20b-06-app-light` |
| A-R20b-07-app-light | `b5-me-inbox.html` #51 | App/浅 | 0.1105/21/22 | D·D：Memo AI/录音/右栏动作无契约（D08） | `D20b/pixel-app-b5-r1/A-R20b-07-app-light` |
| W-R20b-01-1440-light | `web.html` #19 | 1440/浅 | 0.0772/22/32 | S·D：手写 Memo 左列表/右详情与样本差；无来源动作待 D08 | `D20b/pixel-web-w01-r3/W-R20b-01-1440-light` |

### R21（11 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R21-03-app-light | `b4-plan-iorbit.html` #34 | App/浅 | 0.0900/19/8 | D·E：会话混合卡/起始态与 DTO 冲突（D09） | `E1/final-app-R21-none` |
| A-R21-04-app-light | `b4-plan-iorbit.html` #38 | App/浅 | 0.4258/28/16 | D·E：会话混合卡/起始态与 DTO 冲突（D09） | `E1/final-app-R21-none` |
| A-R21-13-app-dark | `b4-plan-iorbit.html` #56 | App/深 | 0.0898/19/7 | A·A→E：共享左抽屉/锚点菜单先修，再由 E 重比 | `E1/final-app-R21-none` |
| A-R21-14-app-dark | `b4-plan-iorbit.html` #57 | App/深 | 0.3035/26/12 | A·A→E：共享左抽屉/锚点菜单先修，再由 E 重比 | `E1/app-r21-menu-run2-none` |
| A-R21-N01-app-light | `b11-nav-v3.html` #41 | App/浅 | 0.1021/17/13 | A·A→E：共享左抽屉/锚点菜单先修，再由 E 重比 | `E1/final-app-R21-none` |
| W-R21-03-1440-light | `b4-plan-iorbit.html` #37 | 1440/浅 | 0.0599/20/39 | D·E：会话混合卡/起始态与 DTO 冲突（D09） | `E1/final-web-R21-none` |
| W-R21-R01-1024-light | `b8-responsive.html` #9 | 1024/浅 | 0.0462/15/30 | A·A→E：共享左抽屉/锚点菜单先修，再由 E 重比 | `E1/final-web-R21-none` |
| W-R21-R02-390-light | `b8-responsive.html` #10 | 390/浅 | 0.1938/25/15 | A·A→E：共享左抽屉/锚点菜单先修，再由 E 重比 | `E1/web-r21-phone-run2-none` |
| W-R21-R03-1024-light | `b8-responsive.html` #11 | 1024/浅 | 0.7383/30/32 | A·A→E：共享左抽屉/锚点菜单先修，再由 E 重比 | `E1/web-r21-drawer-run2-none` |
| W-R21-R04-390-light | `b8-responsive.html` #12 | 390/浅 | 0.2787/29/18 | A·A→E：共享左抽屉/锚点菜单先修，再由 E 重比 | `E1/web-r21-drawer-run2-none` |
| W-R21-R05-390-dark | `b8-responsive.html` #18 | 390/深 | 0.1370/25/15 | A·A→E：共享左抽屉/锚点菜单先修，再由 E 重比 | `E1/web-r21-phone-run2-none` |

### R28（98 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R28-01-light-app-light | `b1-onboarding-cards.html` #10 | App/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-02-light-app-light | `b1-onboarding-cards.html` #11 | App/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-02-dark-app-dark | `b1-onboarding-cards.html` #61 | App/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-01-dark-app-dark | `b12-missing-states.html` #901 | App/深 | 0.1985/9/11 | S·C：引导进度/原生步骤与同态样本 | `C28/A01-dark-round1-b12` |
| A-R28-03-light-app-light | `b1-onboarding-cards.html` #12 | App/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-03-dark-app-dark | `b12-missing-states.html` #903 | App/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-04-light-app-light | `b1-onboarding-cards.html` #13 | App/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-04-dark-app-dark | `b12-missing-states.html` #905 | App/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-05-light-app-light | `b1-onboarding-cards.html` #14 | App/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-05-dark-app-dark | `b12-missing-states.html` #907 | App/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-06-light-app-light | `b1-onboarding-cards.html` #15 | App/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-06-dark-app-dark | `b12-missing-states.html` #909 | App/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-04-error-light-app-light | `b12-missing-states.html` #910 | App/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-04-error-dark-app-dark | `b12-missing-states.html` #911 | App/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-07-locked-light-app-light | `b12-missing-states.html` #912 | App/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:app-R28.json` |
| A-R28-07-locked-dark-app-dark | `b12-missing-states.html` #913 | App/深 | 0.0864/6/5 | D·C：计划确认区或 W08 裁区需改稿（D10） | `C28/A07-locked-dark-round3` |
| A-R28-07-current-light-app-light | `b12-missing-states.html` #914 | App/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:app-R28.json` |
| A-R28-07-current-dark-app-dark | `b12-missing-states.html` #915 | App/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:app-R28.json` |
| A-R28-07-plan-light-app-light | `b12-missing-states.html` #916 | App/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:app-R28.json` |
| A-R28-07-plan-dark-app-dark | `b12-missing-states.html` #917 | App/深 | 0.1106/8/11 | D·C：计划确认区或 W08 裁区需改稿（D10） | `C28/A07-plan-dark-round1` |
| A-R28-07-complete-light-app-light | `b12-missing-states.html` #918 | App/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:app-R28.json` |
| A-R28-07-complete-dark-app-dark | `b12-missing-states.html` #919 | App/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:app-R28.json` |
| A-R28-08-light-app-light | `b12-missing-states.html` #920 | App/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:app-R28.json` |
| A-R28-08-dark-app-dark | `b12-missing-states.html` #921 | App/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:app-R28.json` |
| A-R28-09-light-app-light | `b12-missing-states.html` #922 | App/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| A-R28-09-dark-app-dark | `b12-missing-states.html` #923 | App/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:app-R28.json` |
| W-R28-01-1440-light-1440-light | `b12-missing-states.html` #924 | 1440/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-01-1440-dark-1440-dark | `b12-missing-states.html` #925 | 1440/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-01-1024-light-1024-light | `b12-missing-states.html` #926 | 1024/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-01-1024-dark-1024-dark | `b12-missing-states.html` #927 | 1024/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-01-390-light-390-light | `b12-missing-states.html` #928 | 390/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-01-390-dark-390-dark | `b12-missing-states.html` #929 | 390/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-02-1440-light-1440-light | `b12-missing-states.html` #930 | 1440/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-02-1440-dark-1440-dark | `b12-missing-states.html` #931 | 1440/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-02-1024-light-1024-light | `b12-missing-states.html` #932 | 1024/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-02-1024-dark-1024-dark | `b12-missing-states.html` #933 | 1024/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-02-390-light-390-light | `b12-missing-states.html` #934 | 390/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-02-390-dark-390-dark | `b12-missing-states.html` #935 | 390/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-03-1440-light-1440-light | `b12-missing-states.html` #936 | 1440/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-03-1440-dark-1440-dark | `b12-missing-states.html` #937 | 1440/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-03-1024-light-1024-light | `b12-missing-states.html` #938 | 1024/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-03-1024-dark-1024-dark | `b12-missing-states.html` #939 | 1024/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-03-390-light-390-light | `b12-missing-states.html` #940 | 390/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-03-390-dark-390-dark | `b12-missing-states.html` #941 | 390/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-04-1440-light-1440-light | `b12-missing-states.html` #942 | 1440/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-04-1440-dark-1440-dark | `b12-missing-states.html` #943 | 1440/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-04-1024-light-1024-light | `b12-missing-states.html` #944 | 1024/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-04-1024-dark-1024-dark | `b12-missing-states.html` #945 | 1024/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-04-390-light-390-light | `b12-missing-states.html` #946 | 390/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-04-390-dark-390-dark | `b12-missing-states.html` #947 | 390/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-05-1440-light-1440-light | `b12-missing-states.html` #948 | 1440/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-05-1440-dark-1440-dark | `b12-missing-states.html` #949 | 1440/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-05-1024-light-1024-light | `b12-missing-states.html` #950 | 1024/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-05-1024-dark-1024-dark | `b12-missing-states.html` #951 | 1024/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-05-390-light-390-light | `b12-missing-states.html` #952 | 390/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-05-390-dark-390-dark | `b12-missing-states.html` #953 | 390/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-06-1440-light-1440-light | `b12-missing-states.html` #954 | 1440/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-06-1440-dark-1440-dark | `b12-missing-states.html` #955 | 1440/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-06-1024-light-1024-light | `b12-missing-states.html` #956 | 1024/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-06-1024-dark-1024-dark | `b12-missing-states.html` #957 | 1024/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-06-390-light-390-light | `b12-missing-states.html` #958 | 390/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-06-390-dark-390-dark | `b12-missing-states.html` #959 | 390/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-07-locked-1440-light-1440-light | `b12-missing-states.html` #960 | 1440/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-locked-1440-dark-1440-dark | `b12-missing-states.html` #961 | 1440/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-locked-1024-light-1024-light | `b12-missing-states.html` #962 | 1024/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-locked-1024-dark-1024-dark | `b12-missing-states.html` #963 | 1024/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-locked-390-light-390-light | `b12-missing-states.html` #964 | 390/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-locked-390-dark-390-dark | `b12-missing-states.html` #965 | 390/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-current-1440-light-1440-light | `b12-missing-states.html` #966 | 1440/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-current-1440-dark-1440-dark | `b12-missing-states.html` #967 | 1440/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-current-1024-light-1024-light | `b12-missing-states.html` #968 | 1024/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-current-1024-dark-1024-dark | `b12-missing-states.html` #969 | 1024/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-current-390-light-390-light | `b12-missing-states.html` #970 | 390/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-current-390-dark-390-dark | `b12-missing-states.html` #971 | 390/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-plan-1440-light-1440-light | `b12-missing-states.html` #972 | 1440/浅 | 0.0277/5/6 | D·C：计划确认区或 W08 裁区需改稿（D10） | `C28/W07-plan-1440-light-round2` |
| W-R28-07-plan-1440-dark-1440-dark | `b12-missing-states.html` #973 | 1440/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-plan-1024-light-1024-light | `b12-missing-states.html` #974 | 1024/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-plan-1024-dark-1024-dark | `b12-missing-states.html` #975 | 1024/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-plan-390-light-390-light | `b12-missing-states.html` #976 | 390/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-plan-390-dark-390-dark | `b12-missing-states.html` #977 | 390/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-complete-1440-light-1440-light | `b12-missing-states.html` #978 | 1440/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-complete-1440-dark-1440-dark | `b12-missing-states.html` #979 | 1440/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-complete-1024-light-1024-light | `b12-missing-states.html` #980 | 1024/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-complete-1024-dark-1024-dark | `b12-missing-states.html` #981 | 1024/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-complete-390-light-390-light | `b12-missing-states.html` #982 | 390/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-07-complete-390-dark-390-dark | `b12-missing-states.html` #983 | 390/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-08-1440-light-1440-light | `b12-missing-states.html` #984 | 1440/浅 | 0.0583/25/6 | D·C：计划确认区或 W08 裁区需改稿（D10） | `C28/W08-1440-light-round2` |
| W-R28-08-1440-dark-1440-dark | `b12-missing-states.html` #985 | 1440/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-08-1024-light-1024-light | `b12-missing-states.html` #986 | 1024/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-08-1024-dark-1024-dark | `b12-missing-states.html` #987 | 1024/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-08-390-light-390-light | `b12-missing-states.html` #988 | 390/浅 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-08-390-dark-390-dark | `b12-missing-states.html` #989 | 390/深 | —/—/— | D·C：未实拍：计划确认区或 W08 裁区需改稿（D10） | `suite:web-R28.json` |
| W-R28-09-1440-light-1440-light | `b12-missing-states.html` #990 | 1440/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-09-1440-dark-1440-dark | `b12-missing-states.html` #991 | 1440/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-09-1024-light-1024-light | `b12-missing-states.html` #992 | 1024/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-09-1024-dark-1024-dark | `b12-missing-states.html` #993 | 1024/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-09-390-light-390-light | `b12-missing-states.html` #994 | 390/浅 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |
| W-R28-09-390-dark-390-dark | `b12-missing-states.html` #995 | 390/深 | —/—/— | S·C：未实拍：引导进度/原生步骤与同态样本 | `suite:web-R28.json` |

W-R28-01 1440 浅的最后有效**旧板**比较是 `b1-onboarding-cards.html` #16，raw 0.0402／8 带／23 缺块（`C28/W01-1440-light-round3`）；现清单改为 `b12-missing-states.html` #924，故该键在表中仍记未比，必须按新板重拍。A08 `C28/A08-...` 为错路由，指标无效。

### R32（50 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R27-06-app-light | `b2-events-flow.html` #6 | App/浅 | 0.0632/16/0 | S·A：空计划卡几何／底栏仍有实差 | `A32/A-R27-06` |
| A-R27-06-app-dark | `b2-events-flow.html` #6 | App/深 | 0.0603/15/0 | S·A：空计划卡几何／底栏仍有实差 | `A32/A-R27-06` |
| A-R27-09-app-light | `b2-events-flow.html` #9 | App/浅 | 0.0610/16/0 | S·A：筛选 chip 间距仍异，三轮封顶 | `A32/A-R27-09` |
| A-R27-09-app-dark | `b2-events-flow.html` #9 | App/深 | 0.0508/14/0 | S·A：筛选 chip 间距仍异，三轮封顶 | `A32/A-R27-09` |
| A-R27-35-app-light | `b2-events-flow.html` #35 | App/浅 | 0.0531/16/1 | D·A：Toast Undo 缺服务撤回契约（D11） | `A32/A-R27-35` |
| A-R27-35-app-dark | `b2-events-flow.html` #35 | App/深 | 0.0856/17/2 | D·A：Toast Undo 缺服务撤回契约（D11） | `A32/A-R27-35` |
| A-R25-11-app-light | `b4-plan-iorbit.html` #28 | App/浅 | 0.1003/19/9 | A·A：Popover 高度/背景需共享组件后复比 | `A32/A-R25-11` |
| A-R25-11-app-dark | `b4-plan-iorbit.html` #28 | App/深 | 0.0876/19/8 | A·A：Popover 高度/背景需共享组件后复比 | `A32/A-R25-11` |
| A-R24-05-app-light | `b12-missing-states.html` #198 | App/浅 | 0.1049/21/7 | A·A：行内 chip 与 sheet 几何需共享组件 | `A32/A-R24-05` |
| A-R24-05-app-dark | `b12-missing-states.html` #198 | App/深 | 0.0964/18/7 | A·A：行内 chip 与 sheet 几何需共享组件 | `A32/A-R24-05` |
| A-R24-16-app-light | `b4-plan-iorbit.html` #6 | App/浅 | 0.2667/23/16 | D·A：P15 sheet 87% 对共享 80% 上限（D12） | `A32/A-R24-16` |
| A-R24-16-app-dark | `b4-plan-iorbit.html` #6 | App/深 | 0.2100/22/17 | D·A：P15 sheet 87% 对共享 80% 上限（D12） | `A32/A-R24-16` |
| A-R25-01-app-light | `b4-plan-iorbit.html` #19 | App/浅 | 0.1721/21/15 | D·A：P16 分数 128 对服务 45，来源待 D12 | `A32/A-R25-01` |
| A-R25-01-app-dark | `b4-plan-iorbit.html` #19 | App/深 | 0.1438/21/15 | D·A：P16 分数 128 对服务 45，来源待 D12 | `A32/A-R25-01` |
| A-R25-12-app-light | `b4-plan-iorbit.html` #29 | App/浅 | 0.1008/17/7 | D·A：P17 分项／总分口径待 D12 | `A32/A-R25-12` |
| A-R25-12-app-dark | `b4-plan-iorbit.html` #29 | App/深 | 0.0852/16/6 | D·A：P17 分项／总分口径待 D12 | `A32/A-R25-12` |
| A-R24-12-app-light | `b4-plan-iorbit.html` #9 | App/浅 | 0.0703/13/3 | D·A：P18 完整类型标签缺读字段（D13） | `A32/A-R24-12` |
| A-R24-12-app-dark | `b4-plan-iorbit.html` #9 | App/深 | 0.0552/12/3 | D·A：P18 完整类型标签缺读字段（D13） | `A32/A-R24-12` |
| A-R25-08-app-light | `b4-plan-iorbit.html` #24 | App/浅 | 0.0770/18/9 | D·A：P19 分项／超额语义待 D12 | `A32/A-R25-08` |
| A-R25-08-app-dark | `b4-plan-iorbit.html` #24 | App/深 | 0.0649/18/7 | D·A：P19 分项／超额语义待 D12 | `A32/A-R25-08` |
| W-R24-03-1440-light | `b12-missing-states.html` #208 | 1440/浅 | 0.0215/6/3 | S·A：底部活动卡/背景/Modal 残差 | `A32/W-R24-03` |
| W-R24-03-1440-dark | `b12-missing-states.html` #208 | 1440/深 | 0.0184/5/3 | S·A：底部活动卡/背景/Modal 残差 | `A32/W-R24-03` |
| W-R24-09b-1440-light | `b12-missing-states.html` #230 | 1440/浅 | 0.0557/9/23 | D·A：W02 角色/来源读字段缺失（D13） | `A32/W-R24-09b` |
| W-R24-09b-1440-dark | `b12-missing-states.html` #230 | 1440/深 | 0.0425/9/21 | D·A：W02 角色/来源读字段缺失（D13） | `A32/W-R24-09b` |
| W-R24-11-1440-light | `b12-missing-states.html` #246 | 1440/浅 | 0.0264/3/6 | D·A：W03 完整类型标签缺失（D13） | `A32/W-R24-11` |
| W-R24-11-1440-dark | `b12-missing-states.html` #246 | 1440/深 | 0.0205/3/4 | D·A：W03 完整类型标签缺失（D13） | `A32/W-R24-11` |
| W-R24-12-1440-light | `b4-plan-iorbit.html` #12 | 1440/浅 | 0.0444/10/28 | D·A：W04 推荐分数与服务不符（D13） | `A32/W-R24-12` |
| W-R24-12-1440-dark | `b4-plan-iorbit.html` #12 | 1440/深 | 0.0396/9/31 | D·A：W04 推荐分数与服务不符（D13） | `A32/W-R24-12` |
| W-R23-06-1440-light | `b12-missing-states.html` #140 | 1440/浅 | 0.0175/2/1 | A·A：W05 Modal 520 档未交 | `A32/W-R23-06` |
| W-R23-06-1440-dark | `b12-missing-states.html` #140 | 1440/深 | 0.0157/2/0 | A·A：W05 Modal 520 档未交 | `A32/W-R23-06` |
| W-R26-31-1440-light | `b12-missing-states.html` #320 | 1440/浅 | 0.0254/8/6 | D·A：W06 七位画板按钮与八位契约冲突（D13） | `A32/W-R26-31` |
| W-R26-31-1440-dark | `b12-missing-states.html` #320 | 1440/深 | 0.0152/4/5 | D·A：W06 七位画板按钮与八位契约冲突（D13） | `A32/W-R26-31` |
| A-R05-S01-app-light | `app.html` #2 | App 裁区 0,50,390,58/浅 | 0.0828/2/1 | A·A：壳顶栏日期/字色或底栏残差 | `A32/r05-valid-22` |
| A-R05-S01-app-dark | `app.html` #2 | App 裁区 0,50,390,58/深 | 0.0847/2/1 | A·A：壳顶栏日期/字色或底栏残差 | `A32/r05-valid-22` |
| A-R05-S02-app-dark | `app.html` #2 | App 裁区 14,756,362,62/深 | 0.0261/1/0 | A·A：深色壳底栏色差或裁区残差 | `A32/r05-valid-22` |
| A-R05-S03-app-dark | `app.html` #8 | App 裁区 14,756,362,62/深 | 0.0165/1/0 | A·A：深色壳底栏色差或裁区残差 | `A32/r05-valid-22` |
| A-R05-S05-app-light | `app.html` #16 | App 裁区 0,50,390,128/浅 | 0.0202/2/0 | A·A：壳顶栏日期/字色或底栏残差 | `A32/r05-valid-22` |
| A-R05-S05-app-dark | `app.html` #16 | App 裁区 0,50,390,128/深 | 0.0203/2/0 | A·A：壳顶栏日期/字色或底栏残差 | `A32/r05-valid-22` |
| A-R05-S06-app-dark | `app.html` #16 | App 裁区 14,756,362,62/深 | 0.0186/1/0 | A·A：深色壳底栏色差或裁区残差 | `A32/r05-valid-22` |
| A-R05-S07-app-light | `app.html` #17 | App 裁区 0,50,390,128/浅 | 0.0195/2/0 | A·A：壳顶栏日期/字色或底栏残差 | `A32/r05-valid-22` |
| A-R05-S07-app-dark | `app.html` #17 | App 裁区 0,50,390,128/深 | 0.0196/2/0 | A·A：壳顶栏日期/字色或底栏残差 | `A32/r05-valid-22` |
| A-R05-S08-app-dark | `app.html` #17 | App 裁区 14,756,362,62/深 | 0.0171/1/0 | A·A：深色壳底栏色差或裁区残差 | `A32/r05-valid-22` |
| A-R05-S09-app-light | `app.html` #26 | App 裁区 0,50,390,128/浅 | 0.0196/2/0 | A·A：壳顶栏日期/字色或底栏残差 | `A32/r05-valid-22` |
| A-R05-S09-app-dark | `app.html` #26 | App 裁区 0,50,390,128/深 | 0.0197/2/0 | A·A：壳顶栏日期/字色或底栏残差 | `A32/r05-valid-22` |
| A-R05-S10-app-light | `app.html` #26 | App 裁区 14,756,362,62/浅 | 0.0279/1/0 | S·A：Memo 正文露入底栏裁区 | `A32/r05-valid-22` |
| A-R05-S10-app-dark | `app.html` #26 | App 裁区 14,756,362,62/深 | 0.0369/2/0 | S·A：Memo 正文露入底栏裁区 | `A32/r05-valid-22` |
| A-R05-S11-app-light | `b5-me-inbox.html` #16 | App 裁区 0,50,390,64/浅 | 0.0528/2/0 | S·C：R18 我的页顶栏缺副标题、标题下移 | `A32/r05-valid-22` |
| A-R05-S11-app-dark | `b5-me-inbox.html` #16 | App 裁区 0,50,390,64/深 | 0.0525/2/0 | S·C：R18 我的页顶栏缺副标题、标题下移 | `A32/r05-valid-22` |
| A-R24-13-app-light | `b4-plan-iorbit.html` #0 | App/浅 | —/—/— | D·A：P14 仍是候补选择态，缺面谈表单契约（D11） | `A32/A-R24-13` |
| A-R24-13-app-dark | `b4-plan-iorbit.html` #0 | App/深 | —/—/— | D·A：P14 仍是候补选择态，缺面谈表单契约（D11） | `A32/A-R24-13` |

### R14（3 键）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| A-R14-P01-app-light | `b5-me-inbox.html` #13 | App/浅 | 0.0821/21/17 | S·B：通知页标题、卡片与列表间距 | `B14/pixel-app-notifications-last` |
| A-R14-P02-app-light | `b11-nav-v3.html` #32 | App/浅 | 0.0567/12/11 | S·B：秘書提醒卡与导航 | `B14/pixel-app-secretary-last` |
| W-R14-P01-1440-light | `b5-me-inbox.html` #29 | 1440/浅 | 0.0348/23/38 | S·B：修订通知板仍有结构/缺块 | `B14/pixel-revised-web-notifications-v2` |

### R19（24 键：12 局部诊断＋12 正式实屏）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| 今日-浅 | `widgets.html` #0 | 局部/浅 | 0.2031/5/1 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |
| 人脈-浅 | `widgets.html` #0 | 局部/浅 | 0.2734/6/1 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |
| 秘書-浅 | `widgets.html` #0 | 局部/浅 | 0.1388/5/1 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |
| 计划-浅 | `widgets.html` #1 | 局部/浅 | 0.1244/11/10 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |
| 分数锁屏-浅 | `widgets.html` #2 | 局部/浅 | 0.8900/3/0 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |
| 活动锁屏-浅 | `widgets.html` #2 | 局部/浅 | 0.5840/3/2 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |
| 今日-深 | `widgets.html` #3 | 局部/深 | 0.7943/6/1 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |
| 人脈-深 | `widgets.html` #3 | 局部/深 | 0.4050/6/1 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |
| 秘書-深 | `widgets.html` #3 | 局部/深 | 0.4533/6/1 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |
| 计划-深 | `widgets.html` #4 | 局部/深 | 0.4681/13/9 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |
| 分数锁屏-深 | `widgets.html` #5 | 局部/深 | 0.9051/3/1 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |
| 活动锁屏-深 | `widgets.html` #5 | 局部/深 | 0.9838/3/1 | X·D：macOS 局部 renderer；正式 WidgetKit 实屏未测 | `D19/render-compare-round3` |

正式 WidgetKit 实屏门禁另列如下；局部 renderer 的数字不得迁入系统实屏行。

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| 今日-浅-WidgetKit | `widgets.html` #0 | small 170×170/浅 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |
| 人脈-浅-WidgetKit | `widgets.html` #0 | small 170×170/浅 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |
| 秘書-浅-WidgetKit | `widgets.html` #0 | small 170×170/浅 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |
| 计划-浅-WidgetKit | `widgets.html` #1 | medium 364×170/浅 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |
| 分数锁屏-浅-WidgetKit | `widgets.html` #2 | accessory circular 72×72/浅 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |
| 活动锁屏-浅-WidgetKit | `widgets.html` #2 | accessory rectangular 160×72/浅 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |
| 今日-深-WidgetKit | `widgets.html` #3 | small 170×170/深 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |
| 人脈-深-WidgetKit | `widgets.html` #3 | small 170×170/深 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |
| 秘書-深-WidgetKit | `widgets.html` #3 | small 170×170/深 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |
| 计划-深-WidgetKit | `widgets.html` #4 | medium 364×170/深 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |
| 分数锁屏-深-WidgetKit | `widgets.html` #5 | accessory circular 72×72/深 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |
| 活动锁屏-深-WidgetKit | `widgets.html` #5 | accessory rectangular 160×72/深 | —/—/— | X·D：正式系统实屏未测，待签名/App Group 授权 | `D19/xpc-recheck.md` |

### PX1 交叉页（14 键；不重复计 R11a/b/R21）

| 唯一键 | 画板 | 宽/主题 | raw/超带/缺块 | 类别·责任与原因 | 证据入口 |
| --- | --- | --- | --- | --- | --- |
| W-R12-01-1440-light | `b12-missing-states.html` #96 | 1440/浅 | 0.0361/19/23 | S·B：加人入口与目标态 | `E1/cross-web-add-R12-many286` |
| W-R12-01-1440-dark | `b12-missing-states.html` #96 | 1440/深 | 0.0274/19/24 | S·B：加人入口与目标态 | `E1/cross-web-add-R12-many286` |
| W-R12-04-1440-light | `b11-nav-v3.html` #19 | 1440（裁区 520）/浅 | 0.0724/15/9 | S·B：加人入口与目标态 | `E1/cross-web-add-R12-many286` |
| W-R12-04-1440-dark | `b11-nav-v3.html` #19 | 1440（裁区 520）/深 | 0.0587/15/10 | S·B：加人入口与目标态 | `E1/cross-web-add-R12-many286` |
| W-R12-03-1440-light | `b9-import-plan-v2.html` #11 | 1440（裁区 600）/浅 | 0.0019/1/0 | S·B：加人入口与目标态 | `E1/cross-web-add-R12-many286` |
| W-R12-03-1440-dark | `b9-import-plan-v2.html` #11 | 1440（裁区 600）/深 | 0.0021/1/0 | S·B：加人入口与目标态 | `E1/cross-web-add-R12-many286` |
| W-R15-14-1440-light | `b11-nav-v3.html` #14 | 1440/浅 | 0.1891/29/58 | D·B：邀请码前/后态待 D14 | `E1/cross-web-invite-R15-many286` |
| W-R15-14-1440-dark | `b11-nav-v3.html` #14 | 1440/深 | 0.0995/28/51 | D·B：邀请码前/后态待 D14 | `E1/cross-web-invite-R15-many286` |
| W-R15-14m-1440-light | `b11-nav-v3.html` #14 | 1440（裁区 560）/浅 | 0.3684/18/19 | D·B：邀请码前/后态待 D14 | `E1/cross-web-invite-R15-many286` |
| W-R15-14m-1440-dark | `b11-nav-v3.html` #14 | 1440（裁区 560）/深 | 0.1685/17/17 | D·B：邀请码前/后态待 D14 | `E1/cross-web-invite-R15-many286` |
| W-R30-P03-1440-light | `b5-me-inbox.html` #59 | 1440（裁区 680）/浅 | 0.2873/12/7 | D·A：搜索 actor/结果待 D14 | `E1/cross-web-R30-many286` |
| A-R30-P08-app-light | `b5-me-inbox.html` #56 | App/浅 | 0.0430/13/3 | D·A：搜索 actor/结果待 D14 | `E1/cross-app-R30-many286` |
| A-R05-02-app-light | `app.html` #8 | App/浅 | 0.1006/20/12 | A·A：壳/返回链 | `E1/cross-app-R05-many286` |
| A-R05-02-app-dark | `app.html` #8 | App/深 | 0.0777/20/7 | A·A：壳/返回链 | `E1/cross-app-R05-many286` |


## 3. A 线先行批：共享基建与精确回归集

- [ ] **A1 文字／颜色 token。** 对 R18c 28px 标题、R19 近似／缺失 token 与暗板串色、R10／R32 深色底栏采样，先用画板与 `--style-diff` 给 token 名、目标值、受影响组件、主题；只在 A 自有 token／kit 路径修改。重比 C 的 R18a/R18c 标题和账户行、D 的 R10/R19 局部及 R32 的 R05 暗色裁区。`[contrast]` 只能引用已批准的 `contrast-substitutions.json`，不能为“看起来近似”新增豁免。
- [ ] **A2 行与弹层。** 复核 `ListRow` 长文案／行高、`Modal` 520 宽档、`PopoverRow` 禁用态、计划前提行内 chip、`BottomSheet` 上限与设计稿高差；R11a 抽屉、R21 左开 `Drawer`／`FullDrawer` 及锚点菜单按共享 API 做一批。A 的提交列出实际改动的组件、前后测量、受影响键：R11a Web 详情／编辑与 App 加人／筛选／确认、R11b App ring/行、R21 Web R03/R04 与 App 04/14、R32 P12/P13/P15/W05、R13 行／Tab、R18c P05/P04。P15 的 87% 对 80% 冲突先走 D 类代定，不擅改全局上限。
- [ ] **A3 组件语义及复核。** `Toggle` 的 RN Web `aria-checked`、`CategoryTabs` 的 `aria-selected` 与相关视觉选中态须一起验；修复后通知／受信箱／设置页各做定向回归。组件变更可能影响既有 PASS：按受影响导入/样式图列出回归键，至少对通过键抽查 20%，不以新的组件绿测推断页面像素过。

每个 A 项先给页面线版本号和受影响键清单；A 线只改组件/token/共享视觉工具，页面差由页面线继续。A 高风险共享变更须带定向测试和 Web/App typecheck 退出 0，所有直接命中画面新 triptych 才能结束该项。

## 4. B → C → D → E 页面批与三轮门禁

每批先固定 `origin/redesign` SHA、画板 SHA、fixture 版本和正确目标态，作一次预检，再跑 `--only`、必要时 `--style-diff`，最后跑本批完整 suite。使用 `heavy.sh` 串行排浏览器／原生门禁和全量测试；每屏每个**同一源码＋设计＋fixture 版本**最多三轮。旧 Sprint 已封顶的键必须有 A 组件、主会话改稿或页面事实的**实质版本变化**才能作为 PX2 新基线；不能把同图重算、静态归因或无效截图当新增轮次。第三轮仍 FAIL 则写明最后 raw/带/缺块、准确位置与下一责任，交⑫「已知像素差」。

| 批 | 页面归属和第一组工作 | 出批条件 |
| --- | --- | --- |
| **B** | R13 受信箱／秘書、R14 三修订板；R12／R15 的 PX1 交叉页由各原页面 owner 处理。先接主会话的无 mail、无虚假 R14 快捷方式画板与授权线程／活动同态样本，再逐元素核标题壳、卡片与按钮。 | 10 张 R13 有板、3 张 R14 有板及 PX1 B 交叉失败键逐条 PASS 或清楚列入⑫；无板 Web 1024／390 与 App 暗色只留实现回归，不作假画板。 |
| **C** | R18a 我的页／设置、R18b 公共认证、R18c 数据权利、R28 引导。先 A 的标题／ListRow 回传与 A04 邮箱画板代定；每个公开认证状态固定 provider 开关、202/409/hash，R28 固定进度/扫码回程。 | 已实拍失败键逐条重比，未运行矩阵先补同态步骤；Web 三宽浅深、App 浅深只对认可板入分母。R18b 旧截图早于 CSS token 修复，必须新拍。 |
| **D** | R10 首页／壳、R20a Task/Calendar、R20b Memo；R19 先在局部 renderer 解决可复现的 token/布局问题，正式 WidgetKit 留 X 门禁。先补真实数据源／受控 fixture，主会话处理 W02/W07/W17 和 Memo AI/录音稿。 | 首页、Task、Memo 的有效目标态门禁逐键 PASS 或交⑫；App 原生不得用 RN Web，R19 的局部图不得计 WidgetKit 实屏 PASS。 |
| **E** | PX1 授权的 R11a/b 页面与 R21 iOrbit。复用同一 actor 的 0/5/14/286 四态、锁定左 Drawer、同一段会话；R11b 无来源卡、R21 混合卡/起始态先待主会话代定。R30 搜索归 A，E 只做 R11a 的落点和返回滚动回归。 | 39 张 R11a、7 张 R11b App、R11b Web 结构例外与 11 张 R21 逐键重比；不把已接纳的 R11b Web `[data]` 缺卡片当清洁 PASS。 |

每批只改自身页面、copy、只读测试 fixture 和本批 suite；共享契约交原 owner、A 组件由 A 修改、D 壳由 D 修改。跨端可见状态、API 或同步变化先读 `bridge/status.md`、`bridge/handoffs.md`，以模板给协调者本端版本、另一端影响、未完成与验证范围；仅类型检查不算业务对齐。

## 5. 验收与证据操作

1. **合法归因。** RD-16 要求排版、颜色、间距、字号、字重、圆角、阴影、图标、元素有无及顺序与画板一致；文字内容不同才可能是 `[data]`。RD-29 改为 Web/App 同一逐带判定：raw 只参考，所有超阈带必须逐带说明 `[data]`、经裁剪实测的字形／原生 1–3px 栅格残差 `[raster]` 或已批准对比替代 `[contrast]`。几何整块偏移、缺卡、错宽、色值不符、文本折行受容器改变，都不得当 `[raster]` 或 `[data]`。
2. **有效截图。** 固定画板、路线、状态、账号、时间与样本；`--list` 核序号，保存设计图、原生/浏览器原图、diff、triptych、逐带 JSON、`--style-diff`、目标态/请求回执。错误页、首次过渡帧、登录页、未展开 sheet、开发警告覆盖、旧版页面截图一律标无效，不占通过分母。缺块即使自动 pass 也必须逐块人工复核；R11b Web 04 与 R32 既有 `[data]` 例外列入重点抽样。
3. **每线证据根。** A `_evidence-a2/PX2/`，B `_evidence-b/PX2/`，C `_evidence-c/PX2/`，D `_evidence-d/PX2/`，E `_evidence-e/PX2/`，均位于 `/Volumes/ORICO/Dev/worktrees/orbit/`；每批 `run-01/{preflight,raw,compare,style-diff,attribution,logs,PROVENANCE}`，不覆盖旧 Sprint 原图。归因文件按 suite 版本提交，外部 evidence 保留原始失败。
4. **资源。** 命令形态 `/Volumes/ORICO/Dev/worktrees/orbit/_runs/heavy.sh <a|b|c|d|e> -- <具体命令>`，各线和全局一次只跑一个重任务；队列、超时、低磁盘不算门禁通过。A 继续 Web `3210`／设计 `3211`／Metro `8087`；B `3300`／`3350`／`8083`；C `3400`／独立设计端口／`8081`；D 改用 Web `3510`／设计 `3320`／Metro `8085`；E `3800`／设计 `3320`／Metro `8088`。D/E 共用设计端口时串行。**不停止或占用 3000、3500**；结束仅停自己启动的服务/模拟器，恢复自己生成的 Next 文件差异。
5. **收口。** 逐线 typecheck 退出 0；必要定向交互与像素门禁同版本，整批结果汇总 PASS/FAIL/无效/未运行；从此前 PASS 键按至少 20% 抽样，覆盖浅深、窄宽、组件受影响和有缺块/归因例外的键。对不能归因的剩余每屏列「已知像素差」：设计/实现/差图、位置或元素、raw/超带/缺块、已试版本和责任，交⑫总验收。不因定向绿测或零新增全量失败名写全量 PASS。

## 6. D 类：给主会话的逐项改稿建议

以下均为**建议**，未经主会话代定不得由页面线直接改稿或用 `[data]` 放行。

| 编号 | 冲突与受影响键 | 推荐改稿方案；重比前置 |
| --- | --- | --- |
| D01 | R10 Web/App 首页样本日期、填充数据曾含 Q5 Gmail 行；Q5 行已删除，余数据／日期仍异。 | 保持去 Gmail 的已批准版本，给 Web #2 / App #33 与空态固定同一示例日和计划、活动、人脈、秘書数据；若要实时日期，画板改为相对日期规则并配合可冻结时钟。 |
| D02 | R11a W-R11-03 390 画板八行而已定分页首屏九行；列表日期和邀请更新日期彼此不是同一时钟。 | 画板统一九行（或明确裁区只显示八行但第九行可滚动），把全部相对日期写到同一冻结时钟；不要让页面违背九行服务分页来造图。 |
| D03 | R11b 机会/洞察画板有无来源卡片，分析钻取的四阶段与当前分类契约不一致；W-R11b-04 的既有 `[data]` 缺卡片不是结构通过。 | 保留产品已定“无来源不造卡”的规则，删去或标为有来源的独立状态板；阶段与行业排序要么按现有 DTO 重画，要么先给 B 线正式契约变更与同源 fixture，再重比。 |
| D04 | R13 b5/b11 板含 `mail_summary`、R14 快捷方式和本机不存在的授权线程／活动。 | 补无 mail、无未交快捷方式的稳定 ID 空态与 fixture 态；Web 补 1024/390、App 补认可暗板及发送状态。主会话先确定受信箱标题词和壳插槽。 |
| D05 | R18b A-04 找回密码画板无邮箱输入，但真实请求必填邮箱；部分公共状态只有登记、没有可达 fixture。 | 在请求态加邮箱输入及校验/错误态，保留实际安全 `next`/hash 流；对未实拍的 202/409/72 字节状态补稳定同态样本，不删业务字段换像素。 |
| D06 | R20a W-R20-02 期日 chip 缺读源，已定完成行即时消失却留在画板；W-R20-07 三个空态来源 tile 缺目标／权限／失败行为。 | 按已批准 open-only 行为删完成行或标独立“完成前”板；期日只有正式来源后才画。三 tile 推荐改成现有可达入口，逐项写权限与失败态；若只是示意则删交互外观并注明不可点击。 |
| D07 | R20a W-R20-17 横向时间轴与当前日程列表结构不一致。 | 选定列表作为正式产品后把日视图画板重画为分时段列表；若保留时间轴，先批准 D 线另立实现范围，不在像素轮偷做新日历。 |
| D08 | R20b b5 #46/#47/#48/#49/#50/#51 画了未交 AI／录音／回放；Web #19 右栏「お礼の下書きを作る」、To-do、下一步按钮无可达服务；App A02 录音文案误导。 | 保留可验手写 Memo，删未实现录音/AI/回放与无来源右栏动作，或给每个动作明确服务、状态、错误回执后另立功能；修 A02 文案，发布新板号/版本才重比。 |
| D09 | R21 会话画板混合人物/活动卡及计划加入确认，当前已存消息只有文本且场景 DTO 一次只容一类面板；b4 与 b11 起始态同路由却不同。 | 推荐把原板拆为“真实文本会话”和“有结构化 items 的演示会话”两状态，先确定支持混合卡与确认的服务 DTO；不许客户端覆层假卡。为 b4/b11 各给显式只读状态选择与 actor-owned fixture。 |
| D10 | R28 W08 画板仅 900px 引导横条，实路由为 2779px 人脈整页；A07 计划类型确认区与设计尺寸冲突。 | W08 改为明确局部裁区及坐标，或重画完整目标页；A07 按已定类型核对行为重排画板而不裁掉必需步骤，固定服务进度和联系人数样本。 |
| D11 | R32 P06 的 b2 #29／#31 同人分别写加藤／伊藤；P09 Toast「元に戻す」无服务撤回契约；P14 面谈种类/日期/memo 与当前候补选择态不同。 | 同一会場人物名统一；P09 推荐删 Undo 并画真实结果态，若保留则先交服务撤回契约；P14 先由计划域给完整写字段和可到达表单，若不交则画当前候补态。 |
| D12 | R32 P15 画板 sheet 约 87% 高、共享 kit 上限 80%；P16/P17/P19 的 128 分／上乗せ与服务 45 或「あと10」口径不一致。 | 推荐把 P15 板压到 80% 或明确单屏组件例外；分数与四类来源先用计划服务实际返回的固定样本重算，再改 P16/P17/P19 板，不能只改页面总分。 |
| D13 | R32 P18/W03 完整「弁護士（投資契約）」与当前 `shortLabel` 仅「弁護士」；W02 候补角色/LinkedIn 没在读契约；W04 四个推荐分数 88/78/61/52 与服务 95/80/65/65 不符；W06 七位码被画成可提交而合同为八位。 | 推荐先按现行契约重画短标签、公司候补、服务算出的四数和七位禁用态；若要求完整标签/角色/分数，则由计划域先给可读字段/新计分规则；八位激活只在第八格填满的独立板展示。 |
| D14 | PX1 的 R15 W-R15-14 实际在“创建邀请码”前态，画板是生成后的代码；R30 搜索 80 人而 R11a 世界 286，且无“近い条件なら”结果。 | R15 拆创建前/生成后两板并提供只读已生成码 fixture；R30 固定同一 286 人 actor 和可返回相近行业的搜索状态，入口点击链与 R11a 过滤落点同测。 |
| D15 | R19 `widgets.html` 的近似 token、暗板串色和系统外壳与 SwiftUI 局部 renderer 差异；正式 App Group/WidgetKit 实屏不可在当前本机授权下取证。 | 先由 A 修 token／暗板，D 对局部家族页只作诊断；主会话确定真实系统边距、隐私遮盖与各降级态画板，用户授权正式 Team/App Group/签名后以 WidgetKit 实屏重新立门禁。 |

## 7. 不进像素分母与⑫交接

- **R29**：Web 36 新旧对照、App 10 新旧对照和九张异常态都是“设计稿无”；来源 [R29 REPORT](../R29-admin-refresh/REPORT.md) 的 `line-a-evidence/R29/comparison.html`。保留行为/视觉回归，不给 raw/超带/缺块，也不列“未过画面”。
- **无板与错态**：R10 Web 390、R13 1024/390 与 App 暗色、R18b 尚未到达的认证状态、R20a Web W19 错误注入过晚、R28 A08 错路由、R32 P14 错目标、PX1 W-R12-02 无当前板/A-R05-10 返回链，均先解决板或目标态；表中若有 suite 键，指标仍为 `—`。
- **X 门禁**：R19 的 12 张局部比较有 raw，但 WidgetKit 实屏的六 family × 浅深、锁屏隐私、点击和同源 App Group 回读仍未测。没有用户签名授权，⑪ 只可交局部差清单，⑫ 不得标实屏 PASS。
- **交⑫格式**：每一张最终未过键保存唯一键、画板路径/#、宽/主题、原生/浏览器图、raw/超带/缺块、每带归因或未归因、三轮版本、阻塞 owner/决定、是否被 20% 抽查。任何 skip、无效帧或图像复用须独立计数，不能从分母消失。

## 8. 主会话审批与代定（RD-33，2026-10-21 00:50）

**批准本计划。** 执行顺序：A 批单独先行 → B 批与 C 批并行 → D 批与 E 批并行（每线各自 worktree、heavy.sh 串行重任务）。

**硬预算（主会话代定 §PX2-0）：** 每批墙钟上限 **4 小时**（A 批 3 小时）；每屏同一版本三轮上限不变。到预算即停止新增迭代，已跑键如实记 PASS/FAIL，未跑键与未过键全部进⑫「已知像素差」清单。不得为凑通过放宽归因。

**D 类逐项代定（§PX2-D01～D15）：** 一律取「画板对齐真实产品与现行契约」一侧，不为像素新增功能或改契约。改稿由该画面所属页面线在本批开头执行（记原／新／理由、新板号），再 `--list`／预检后入分母：
- D01 采纳：固定同一冻结示例日与样本数据。
- D02 画板统一九行，相对日期用同一冻结时钟。
- D03 删除无来源卡片；阶段/排序按现有 DTO 重画；W-R11b-04 不计清洁 PASS。
- D04 补无 mail、无未交快捷方式的空态与 fixture 态；受信箱标题词沿用当前产品用词；Web 1024/390、App 暗板只在有板时入分母。
- D05 A-04 请求态加邮箱输入与校验/错误态；补可达同态样本。
- D06 删完成行；期日 chip 有正式来源才画；三 tile 改成现有可达入口并写权限/失败态。
- D07 选列表：日视图画板重画为分时段列表。
- D08 删未实现的录音/AI/回放与无来源右栏动作；修 A02 文案。
- D09 拆为「真实文本会话」与「结构化 items 演示会话」两状态；不做客户端假卡；b4/b11 各给只读状态与 fixture。
- D10 W08 改为明确局部裁区与坐标；A07 按已定类型核对行为重排。
- D11 同一人名统一；P09 删 Undo 画真实结果态；P14 画当前候补态。
- D12 P15 压到 80%；分数按计划服务真实返回的固定样本重算 P16/P17/P19。
- D13 按现行契约重画短标签、公司候补、服务算出的四个分数与七位禁用态。
- D14 R15 拆创建前/生成后两板；R30 固定 286 人 actor 与可返回相近结果的搜索状态。
- D15 A 先修 token/暗板；WidgetKit 实屏为 X 门禁，待用户授权签名，⑫ 不标 PASS。
