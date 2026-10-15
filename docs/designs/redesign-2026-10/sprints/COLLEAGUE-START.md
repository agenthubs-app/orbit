# 乙开工指南（2026-10-13）

给负责 iOrbit、首页、Task、收件箱 · 秘書 · 推送、人脈、账户、iOS 小组件的同事（乙）。甲（小雨）这边的计划页、加人邀请都在做，**你不用等**，骨架 R01–R09 已全部完成，现在就能开工。

## 1. 开工前读这 5 份（只读相关段落）

1. [README.md](README.md)：「分工」「功能登记表」「骨架通用规则」第 11 条（逐像素还原）、第 12 条（短会话与省额度）。
2. [HOW-TO-START-A-FEATURE-SPRINT.md](HOW-TO-START-A-FEATURE-SPRINT.md)：全文，第 0 节开工、第 8 节像素门禁最重要。
3. [HANDOFF-TO-FEATURE-SPRINTS.md](HANDOFF-TO-FEATURE-SPRINTS.md)：「通用口径」+ 你当前 Sprint 那一节，每条写进 PLANNER 的验收契约。
4. [maintenance/2026-10-12-decisions.md](maintenance/2026-10-12-decisions.md)：用户已拍板的设计口径（§1–§15），不要重新讨论。
5. [screen-ownership.md](screen-ownership.md)：哪些旧屏归你重写。

## 2. 顺序（推荐，已按依赖排好）

| 顺序 | Sprint | 为什么排这里 |
| --- | --- | --- |
| 1 | **组件库像素轮**（R04 / R06 补：交接表 G23、R24-05、U02） | 交接表 G23 本来就记「乙负责组件库时处理」。Modal / Drawer / BottomSheet / Toast 等还没逐件对上 kit，甲的计划页概要（A 组）和你之后的页面都卡在这里；先做完，两边都少返工。不依赖任何未完成的功能。 |
| 2 | R11 人脈、R18 账户 | 最独立。R11 要接甲 R12 / R15 已做好的加人弹层和招待连接（交接表 R11 节）。 |
| 3 | R20 Task | 依赖 R07 / R05 壳（已完成）；メモ「＋ メモを追加」等见交接表 R20 节。 |
| 4 | R21 iOrbit、R13 / R14 收件箱 · 秘書 · 推送 | 甲的 R30 搜索要用 R21 的会话搜索接口，接口先定好告诉甲。 |
| 5 | R10 首页 | 要汇总计划和活动，等甲的计划页定型、R26 活动服务端出来再做，返工最少。 |
| 6 | R19 iOS 小组件 | 依赖首页 / Task 的数据口径。 |

每个 Sprint 照 HOW-TO 先写 `GOAL.md` / `PLANNER.md`（目录 `sprints/Rxx-<名字>/`），独立复核后再实施。

**开工必读补充（2026-10-14）**：写界面前先做 HOW-TO 第 8 节的「画板预检」五项（画板自洽 / 数据来源 / token 齐 / 组件对齐 / 演示数据照画板造），并「边写边比」——甲这边的返工大多来自这五类，提前查能省掉大部分返工。开工时先跑 `node scripts/visual/board-preflight.mjs`（在 `repos/orbits` 下，`--suite views/<端>-<Sprint>.json` 或 `--design <文件> --board <标题>`），它自动查画板自洽和 token 缺口、列出数据来源清单，结果贴进 PLANNER（用法见 `scripts/visual/README-redesign.md`「画板预检工具」）。

## 3. 两人协作规矩

- **分支**：照 HOW-TO 第 0 节开个人分支（如 `redesign-R11-network`，全用连字符），做完合回 `redesign`。甲在 `redesign` 上直接提交，你合回前先 `git pull --rebase` 或合并 `redesign`。
- **只提交自己的文件**：`git commit -m … -- <文件…>` 按路径提交，提交后 `git show --stat HEAD` 核对。
- **共用代码**：`repos/orbits/features/plans/`（计划）、`features/contacts/` 加人与邀请相关、两端组件库 `components/`、token 源，改之前先在交接表或决定表里写一句、告诉甲；热点文件归属按 `screen-ownership.md` 与 R09 REPORT。
- **组件库改动影响全站**：组件库轮每改一个组件，跑一遍 R05 / R07 壳门禁，确认壳没变差。
- **设计口径**：画板冲突、示例数据不自洽时，按「数据自洽 / 已定规则一致 / 较新画板优先」定，统一记进 `2026-10-12-decisions.md` 新一节；不要各自改画板。补画只加在画板文件末尾。
- **门禁**：Web `repos/orbits/scripts/visual/compare-redesign.mjs`（`--suite`、`--only`、`--style-diff`、`--crop`、`--extract-board`），App 用内置 iOS 模拟器真实画面；整屏 raw ≤0.02，超阈值带只能归因 `[data]` / `[raster]`。
- **不要做**：连 Neon、部署、改生产环境变量、付费 AI 真调用（都要用户授权）；改 `repos/orbit-app/.env.local`（用 `.env.development.local`）。

## 4. 甲这边的排期（供对齐）

计划页像素返工（Web 第 3 轮 + App）→ 加人与邀请界面（R12 / R15 返工、R16 新做）→ 活动 R26 / R27 → 主办 R17 → 搜索 R30。计划页 A 组里「待组件库」的画面，等你的组件库轮做完后由甲重比。甲所有被你这边卡住的项（组件库、R11、R20、R21）汇总在 [DEFERRED-A.md](DEFERRED-A.md) 第 1、2 节，你做完一项告诉甲即可。
