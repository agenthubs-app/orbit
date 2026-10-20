# PX2 D 批：首页、Task／Calendar、Memo 与 Widget 局部诊断

**状态：已交接，像素门禁尚未通过。** 本批从 `origin/redesign` 的 `f6426ca95` 起步；设计初版 `4f8fea4cf`，页面／最终改稿／只读 suite `b50fed670`。范围限 D worktree、本地 `orbit_line_d`、Web 3510、设计 3320、Metro 8085；未连接 Neon／生产，未部署或 push。证据在 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-d/PX2/run-01/`。三联图和数值只对实际到达目标状态的截图有效。

## 改稿与产品改动

| 决定 | 原板／新板 | 改动和原因 | 验证 |
| --- | --- | --- | --- |
| D01 首页样本 | `app.html` #0–3/#33、`web.html` #0–3/#21；编号保持 | 继续用冻结示例日 2026-10-07。两端 `HW_TODO` 与 `HW_SEC` 数组逐字相同，日期同为 `10月7日（水）`；此前 Q5 Gmail 行已删。本批没有虚构 live actor 的计划／活动／人脉数据。 | 两端源数组相等；真实填充 actor 尚未同态。 |
| D06 To-do | `web.html` #14、`b3-daily-actions.html` #14、`app.html` #17/#18；编号保持，内容修订版 | 删除与 open-only 规则冲突的已完成行和无正式来源的期日 chip；三个 Web 空态来源 tile 改为人脉、手写 Memo、日历现有入口，并说明登录／读失败行为。Web 空态改为实际可达链接。App #17 的 open 列表不再混入完成项，#18 样本不画假期日。 | `--list` 编号保持，预检无功能问题；Web 定向交互通过，像素另列。 |
| D07 日历 | `b3-daily-actions.html` #40；编号保持，内容修订版 | 横向时间轴改为午前／午後／夜的实际予定列表；与现行 Task 页签和右栏议程一致。受控本地样本为 4 条个人日程，Google 连接读到零外部事件；冲突只提示已读到的重叠，不承诺自动移动。Web 日视图以实际日程分组，并保留打开详情。 | Calendar presenter 9/9 定向通过；`--list`／预检通过，像素另列。 |
| D08 Memo | `b5-me-inbox.html` #46–52、`b11-nav-v3.html` #36、`app.html` #26、`web.html` #19；编号保持，内容修订版 | 保留手写 Memo 与历史 voice 来源标记，删除新录音／AI／回放和无来源的右栏动作；错误时保留草稿。 | `--list` 编号保持；Web 同态样本有限，像素另列。 |
| D15 Widget | `widgets.html` #0–5；未改稿 | A 批已核对共享 token；局部 renderer 的系统壁纸／玻璃／外壳和 macOS `ImageRenderer` 条件不同，仍以旧 12 图作诊断。正式 WidgetKit 实屏需签名与 App Group X 门禁，未用局部图冒充实屏。 | 见 R19 逐键状态。 |

Web 变更只在 D 页面及 copy；无 API／共享契约变更。App 端仍使用既有手写 Memo、日程和 Home 数据源；本批 App 设计版号变化要在原生可登录后重拍，不能由 Web 截图推断一致。Bridge 协调者可按本报告的改稿、页面路径、验证范围与未完成项更新台账；本线没有写根目录 `bridge/status.md` 或 `bridge/handoffs.md`。

## 验证与采样

设计 `--list` 保持 `app.html` 38、`web.html` 24、`b3-daily-actions.html` 53、`b5-me-inbox.html` 82、`b11-nav-v3.html` 53 块；本批改动的 #17/#18、#14、#19、#40 号不变。对应预检命令退出 `0`，原始清单和契约字段空栏保存在 `run-01/preflight/`；脚本退出 `0` 不等于所有字段已填或业务对齐完成。

| 门禁 | 本批结果与证据 |
| --- | --- |
| Web Task 空态定向 | 先红后绿；Task 两个定向文件 `70/70` 通过，`run-01/logs/task-empty-links-green.log`。三个 tile 是现有 URL，错误或未登录交给对应入口。 |
| Web Calendar 日视图定向 | 先红后绿；`9/9` 通过，分时段、真实重叠及打开详情覆盖在 `calendar-presenter.test.tsx`。 |
| Web / App 类型检查 | 两端 `npm run typecheck` 均退出 `0`；Web 在最终浏览器断言修复后再验仍为 `0`。日志 `run-01/logs/{web,app}-typecheck-final.log`、`web-typecheck-after-repair.log`。 |
| Web copy QA | 当前全库 `249` 问题、退出 `1`；本批新增 Task 文案未出现在问题清单中，见 `run-01/logs/web-copy-qa.log`。不将此门禁写成通过。 |
| Web / App 全量 | Web 首轮 `7,980 / 6,878 pass / 7 fail / 1,095 skip`，比 A 基线新增 Calendar 旧浏览器断言和 CSS token 审计 2 名；修复后定向 `6/6`。最终 Web 全量 `7,980 / 6,881 pass / 5 fail / 1,094 skip`，退出 `1`，五个失败名与 A 批 **逐名相同，新增 0**；`run-01/logs/web-full-final-comparison.json`。App 全量 `3,328 / 3,325 pass / 1 fail / 2 skip`，退出 `1`；唯一失败名属于 A 批两个基线名，**新增 0**，另一个旧失败名本轮未出现；`run-01/logs/app-full-comparison.json`。三次全量均只设 `LANG/LC_ALL` 并经 `heavy.sh d`；Web 首轮 `web-full.log`、修复后 `web-full-final.log`，App `app-full.log`。 |

从 R20b 既有 **4 个 PASS 的 R07 Memo 页壳裁区**抽样：`W-R07-TmemoH-1440-light` 和 `W-R07-TmemoH-1440-dark` 都是有效 PASS（raw `0`、0 带、0 缺块），有效抽样 `2/4 = 50%`，浅深均覆盖。第三张左栏深色为诊断 `0.0014/1/0`，三联图显示合成账号头像 `P` 对画板 `佐`；状态不同，标无效，不当作视觉回退或有效抽样。证据 `run-01/compare/web-pass-sample{,-dark-header}/`。1024 浅深壳也已重拍，均因画板右上「次の一手 3」对空 actor 的零条数据不等态而只作窄宽诊断；本批没有有效的先前 PASS 窄宽样本，抽样覆盖要求在这一项仍未满足。

CSS token 审计修复后曾用原 Task 空态 actor 重拍 `web-task-empty-r4-token`；该 actor 已被本批后续填充 8 条任务，截图是**填充态对空态画板**，诊断 `0.049/17/23` 无效。最终版本另用未填充的 R10 空 actor 重拍，其 `/api/todo/page` 判断／一手／跟进全为 0、`/api/tasks` 0 条，HTTP 均 200（`run-01/raw/task-empty-final-readback.json`）。结果以下表与⑫为准；两张原图都保留。

原生 App 临时包的 linker ad hoc 签名缺 entitlements；本地开发签名试验无 entitlement 时仍报 `ERR_KEY_CHAIN`，加 Keychain 访问组则被 SpringBoard 拒绝启动。登录后的 App 目标态不可达。错误、签名差异和模拟器清理记录见 `run-01/PROVENANCE/native-signing.md`，不能用 RN Web 或登录页代替原生对比。R19 旧局部 renderer 的 12 张均仍 FAIL；其系统壁纸／容器条件与 WidgetKit 实屏不同，另 12 个 X 键未测。

收尾时已停本批启动的 Web 3510、设计 3320、Metro 8085，删除本批专用模拟器并恢复 Next 自动改写的 `next-env.d.ts`、`tsconfig.json`；3000／3500 未触碰。隔离本地数据库中的合成 actor 与原始图仍保留，供上述无效帧和有效截图复核。

## 逐键结果

本批有效截图以 `_evidence-d/PX2/` 为根；“旧”数字和路径取自 PLANNER，**未运行不算 PASS**。原生目标态因临时包 Keychain 失败未到达；R19 的局部诊断与 WidgetKit 实屏分开计数。

### R10（23 键）

| 键 | 画板 / 宽·主题 | D 批状态 | raw / 超带 / 缺块 | 证据或阻塞 |
| --- | --- | --- | --- | --- |
| A-R10-01-app-light | `app.html` #0 · App/浅 | 未运行（原生 Keychain） | 旧 0.1303/8/14 | `D10/app-empty-round2` |
| A-R10-02-app-light | `app.html` #1 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R10.json` |
| A-R10-03-app-light | `app.html` #2 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R10.json` |
| A-R10-03S-app-light | `app.html` #3 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R10.json` |
| A-R10-04-app-light | `app.html` #4 · App/浅 | 未运行（原生 Keychain） | 旧 0.1309/9/20 | `D10/app-edit-round1` |
| A-R10-05-app-light | `app.html` #5 · App/浅 | 未运行（原生 Keychain） | 旧 0.3375/8/18 | `D10/app-library-round1` |
| A-R10-03D-app-dark | `app.html` #33 · App/深 | 未运行（原生 Keychain） | 旧 0.1184/9/12 | `D10/app-populated-q5-review1` |
| A-R10-06-app-light | `b11-nav-v3.html` #20 · App/浅 | 未运行（原生 Keychain） | 旧 0.2037/9/23 | `D10/app-longpress-b11-round3` |
| A-R10-07-app-light | `b11-nav-v3.html` #21 · App/浅 | 未运行（原生 Keychain） | 旧 0.1423/9/20 | `D10/app-drag-b11-round1` |
| A-R10-08-app-light | `b11-nav-v3.html` #22 · App/浅 | 未运行（原生 Keychain） | 旧 0.1377/9/18 | `D10/app-remove-b11-round1` |
| A-R10-09-app-light | `b11-nav-v3.html` #23 · App/浅 | 未运行（原生 Keychain） | 旧 0.1402/8/23 | `D10/app-library-b11-round3` |
| A-R10-10-app-light | `b11-nav-v3.html` #24 · App/浅 | 未运行（原生 Keychain） | 旧 0.2601/9/19 | `D10/app-library-size-b11-round1` |
| A-R10-07D-app-dark | `b11-nav-v3.html` #48 · App/深 | 未运行（原生 Keychain） | 旧 0.1253/9/16 | `D10/app-drag-dark-b11-round1` |
| W-R10-01-1440-light | `web.html` #0 · 1440/浅 | FAIL | 0.0286 / 13 / 11 | run-01/compare/web-r10-empty-r2 |
| W-R10-02-1440-light | `web.html` #1 · 1440/浅 | 未运行 | — | `suite:web-R10.json` |
| W-R10-03-1440-light | `web.html` #2 · 1440/浅 | 未运行 | 旧 0.0522/5/35 | `D10/web-populated-q5-review1` |
| W-R10-04-1440-light | `web.html` #3 · 1440/浅 | 未运行 | 旧 0.0563/7/42 | `D10/web-edit-round1` |
| W-R10-03D-1440-dark | `web.html` #21 · 1440/深 | 未运行 | 旧 0.0503/7/34 | `D10/web-populated-dark-round2` |
| W-R10-05-1440-light | `b11-nav-v3.html` #25 · 1440/浅 | 未运行 | 旧 0.0665/7/43 | `D10/web-edit-b11-round1` |
| W-R10-06-1024-light | `b12-missing-states.html` #86 · 1024/浅 | 无效（动态数量未同态） | 诊断 0.0192 / 1 / 1 | run-01/compare/web-r10-shell-1024 |
| W-R10-06D-1024-dark | `b12-missing-states.html` #87 · 1024/深 | 无效（动态数量未同态） | 诊断 0.0191 / 1 / 2 | run-01/compare/web-r10-shell-1024 |
| W-R10-07-1024-light | `b12-missing-states.html` #88 · 1024/浅 | 未运行 | 旧 0.0647/17/11 | `D10/web-1024-shell-valid/W-R10-07-1024-light` |
| W-R10-07D-1024-dark | `b12-missing-states.html` #89 · 1024/深 | 未运行 | 旧 0.1517/19/8 | `D10/web-1024-shell-valid/W-R10-07D-1024-dark` |

### R20a（72 键）

| 键 | 画板 / 宽·主题 | D 批状态 | raw / 超带 / 缺块 | 证据或阻塞 |
| --- | --- | --- | --- | --- |
| A-R20-01-app-light | `app.html` #16 · App/浅 | 未运行（原生 Keychain） | 旧 0.1584/19/17 | `U20a/app-pixel-a01-loaded/A-R20-01-app-light` |
| A-R20-02-app-light | `app.html` #17 · App/浅 | 未运行（原生 Keychain） | 旧 0.1161/23/21 | `U20a/app-pixel-a02-round2-ja/A-R20-02-app-light` |
| A-R20-03-app-light | `app.html` #18 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-04-app-light | `b3-daily-actions.html` #0 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-05-app-light | `b3-daily-actions.html` #1 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-06-app-light | `b3-daily-actions.html` #2 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-07-app-light | `b3-daily-actions.html` #3 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-05d-app-dark | `b3-daily-actions.html` #47 · App/深 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-08-app-light | `b3-daily-actions.html` #6 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-09-app-light | `b3-daily-actions.html` #7 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-10-app-light | `b3-daily-actions.html` #8 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-11-app-light | `b3-daily-actions.html` #11 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-12-app-light | `b3-daily-actions.html` #12 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-13-app-light | `b3-daily-actions.html` #13 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-14-app-light | `b3-daily-actions.html` #17 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-15-app-light | `b3-daily-actions.html` #18 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-16-app-light | `b3-daily-actions.html` #20 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-17-app-light | `b3-daily-actions.html` #21 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-18-app-light | `b3-daily-actions.html` #22 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-19-app-light | `b3-daily-actions.html` #23 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-13d-app-dark | `b3-daily-actions.html` #48 · App/深 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-20-app-light | `b3-daily-actions.html` #25 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-21-app-light | `b3-daily-actions.html` #26 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-22-app-light | `b3-daily-actions.html` #27 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-23-app-light | `b3-daily-actions.html` #30 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-24-app-light | `b3-daily-actions.html` #31 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-25-app-light | `b3-daily-actions.html` #32 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-26-app-light | `b3-daily-actions.html` #33 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-27-app-light | `b3-daily-actions.html` #34 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-28-app-light | `b3-daily-actions.html` #35 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-29-app-light | `b3-daily-actions.html` #36 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-25d-app-dark | `b3-daily-actions.html` #49 · App/深 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-30-app-light | `b3-daily-actions.html` #43 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-31-app-light | `b3-daily-actions.html` #44 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-32-app-light | `b3-daily-actions.html` #45 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-32d-app-dark | `b3-daily-actions.html` #50 · App/深 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-33-app-light | `b7-account-misc.html` #40 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-34-app-light | `b7-account-misc.html` #41 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-35-app-light | `b7-account-misc.html` #42 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-36-app-light | `b7-account-misc.html` #43 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-37-app-light | `b11-nav-v3.html` #33 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-38-app-light | `b11-nav-v3.html` #34 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-39-app-light | `b11-nav-v3.html` #35 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-40-app-light | `b11-nav-v3.html` #38 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-41-app-light | `b12-missing-states.html` #92 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-41d-app-dark | `b12-missing-states.html` #93 · App/深 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-42-app-light | `b12-missing-states.html` #94 · App/浅 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| A-R20-42d-app-dark | `b12-missing-states.html` #95 · App/深 | 未运行（原生 Keychain） | — | `suite:app-R20a.json` |
| W-R20-01-1440-light | `web.html` #13 · 1440/浅 | 未运行 | 旧 0.0568/14/28 | `D20a/run-01/web-pixel-w01-matched-date-connection/W-R20-01-1440-light` |
| W-R20-02-1440-light | `web.html` #14 · 1440/浅 | 无效（判断／跟进聚合为空） | 诊断 0.0346 / 12 / 23 | run-01/compare/web-todo-populated-r1；重任务锁写入失败 |
| W-R20-03-1440-light | `b3-daily-actions.html` #4 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |
| W-R20-04-1440-light | `b3-daily-actions.html` #5 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |
| W-R20-05-1440-light | `b3-daily-actions.html` #9 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |
| W-R20-06-1440-light | `b3-daily-actions.html` #10 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |
| W-R20-07-1440-light | `b3-daily-actions.html` #14 · 1440/浅 | FAIL | 0.0263 / 12 / 10 | run-01/compare/web-task-empty-final |
| W-R20-08-1440-light | `b3-daily-actions.html` #15 · 1440/浅 | 未运行 | 旧 0.0361/20/42 | `U20a/pixel-w08-round2/W-R20-08-1440-light` |
| W-R20-09-1440-light | `b3-daily-actions.html` #16 · 1440/浅 | 未运行 | 旧 0.0684/33/73 | `U20a/pixel-w09-round1/W-R20-09-1440-light` |
| W-R20-10-1440-light | `b3-daily-actions.html` #19 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |
| W-R20-11-1440-light | `b3-daily-actions.html` #24 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |
| W-R20-12-1440-light | `b3-daily-actions.html` #28 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |
| W-R20-13-1440-light | `b3-daily-actions.html` #29 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |
| W-R20-09d-1440-dark | `b3-daily-actions.html` #51 · 1440/深 | 未运行 | 旧 0.0616/33/64 | `U20a/pixel-w09-round1/W-R20-09d-1440-dark` |
| W-R20-14-1440-light | `b3-daily-actions.html` #37 · 1440/浅 | 未运行 | 旧 0.0394/19/27 | `U20a/pixel-w14-round3/W-R20-14-1440-light` |
| W-R20-15-1440-light | `b3-daily-actions.html` #38 · 1440/浅 | 未运行 | 旧 0.0380/12/27 | `U20a/pixel-w15-round3/W-R20-15-1440-light` |
| W-R20-16-1440-light | `b3-daily-actions.html` #39 · 1440/浅 | 未运行 | 旧 0.1083/20/42 | `U20a/pixel-w16-round3-mock/W-R20-16-1440-light` |
| W-R20-17-1440-light | `b3-daily-actions.html` #40 · 1440/浅 | FAIL | 0.1827 / 21 / 26 | run-01/compare/web-calendar-day-connected-v5-r1 |
| W-R20-18-1440-light | `b3-daily-actions.html` #41 · 1440/浅 | 未运行 | 旧 0.1469/26/46 | `U20a/pixel-w18-round2/W-R20-18-1440-light` |
| W-R20-19-1440-light | `b3-daily-actions.html` #46 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |
| W-R20-16d-1440-dark | `b3-daily-actions.html` #52 · 1440/深 | 未运行 | 旧 0.1010/21/39 | `U20a/pixel-w16-round3-mock/W-R20-16d-1440-dark` |
| W-R20-20-1440-light | `b7-account-misc.html` #44 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |
| W-R20-21-1440-light | `b7-account-misc.html` #45 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |
| W-R20-22-1440-light | `b11-nav-v3.html` #39 · 1440/浅 | 未运行 | — | `suite:web-R20a.json` |

### R20b（7 键）

| 键 | 画板 / 宽·主题 | D 批状态 | raw / 超带 / 缺块 | 证据或阻塞 |
| --- | --- | --- | --- | --- |
| A-R20b-01-app-light | `app.html` #26 · App/浅 | 未运行（原生 Keychain） | 旧 0.1241/22/17 | `D20b/pixel-app-a01-r2/A-R20b-01-app-light` |
| A-R20b-02-app-light | `b11-nav-v3.html` #36 · App/浅 | 未运行（原生 Keychain） | 旧 0.0843/17/7 | `D20b/pixel-app-a02-r2/A-R20b-02-app-light` |
| A-R20b-03-app-light | `b5-me-inbox.html` #46 · App/浅 | 未运行（原生 Keychain） | 旧 0.6684/28/8 | `D20b/pixel-app-a03-r1/A-R20b-03-app-light` |
| A-R20b-05-app-light | `b5-me-inbox.html` #49 · App/浅 | 未运行（原生 Keychain） | 旧 0.1351/21/10 | `D20b/pixel-app-b5-r1/A-R20b-05-app-light` |
| A-R20b-06-app-light | `b5-me-inbox.html` #50 · App/浅 | 未运行（原生 Keychain） | 旧 0.0792/15/12 | `D20b/pixel-app-b5-r1/A-R20b-06-app-light` |
| A-R20b-07-app-light | `b5-me-inbox.html` #51 · App/浅 | 未运行（原生 Keychain） | 旧 0.1105/21/22 | `D20b/pixel-app-b5-r1/A-R20b-07-app-light` |
| W-R20b-01-1440-light | `web.html` #19 · 1440/浅 | FAIL | 0.0295 / 14 / 15 | run-01/compare/web-memo-r3 |

### R19（24 键）

| 键 | 画板 / 宽·主题 | D 批状态 | raw / 超带 / 缺块 | 证据或阻塞 |
| --- | --- | --- | --- | --- |
| 今日-浅 | `widgets.html` #0 · 局部/浅 | FAIL（旧局部诊断，D 未重拍） | 旧 0.2031/5/1 | `D19/render-compare-round3` |
| 人脈-浅 | `widgets.html` #0 · 局部/浅 | FAIL（旧局部诊断，D 未重拍） | 旧 0.2734/6/1 | `D19/render-compare-round3` |
| 秘書-浅 | `widgets.html` #0 · 局部/浅 | FAIL（旧局部诊断，D 未重拍） | 旧 0.1388/5/1 | `D19/render-compare-round3` |
| 计划-浅 | `widgets.html` #1 · 局部/浅 | FAIL（旧局部诊断，D 未重拍） | 旧 0.1244/11/10 | `D19/render-compare-round3` |
| 分数锁屏-浅 | `widgets.html` #2 · 局部/浅 | FAIL（旧局部诊断，D 未重拍） | 旧 0.8900/3/0 | `D19/render-compare-round3` |
| 活动锁屏-浅 | `widgets.html` #2 · 局部/浅 | FAIL（旧局部诊断，D 未重拍） | 旧 0.5840/3/2 | `D19/render-compare-round3` |
| 今日-深 | `widgets.html` #3 · 局部/深 | FAIL（旧局部诊断，D 未重拍） | 旧 0.7943/6/1 | `D19/render-compare-round3` |
| 人脈-深 | `widgets.html` #3 · 局部/深 | FAIL（旧局部诊断，D 未重拍） | 旧 0.4050/6/1 | `D19/render-compare-round3` |
| 秘書-深 | `widgets.html` #3 · 局部/深 | FAIL（旧局部诊断，D 未重拍） | 旧 0.4533/6/1 | `D19/render-compare-round3` |
| 计划-深 | `widgets.html` #4 · 局部/深 | FAIL（旧局部诊断，D 未重拍） | 旧 0.4681/13/9 | `D19/render-compare-round3` |
| 分数锁屏-深 | `widgets.html` #5 · 局部/深 | FAIL（旧局部诊断，D 未重拍） | 旧 0.9051/3/1 | `D19/render-compare-round3` |
| 活动锁屏-深 | `widgets.html` #5 · 局部/深 | FAIL（旧局部诊断，D 未重拍） | 旧 0.9838/3/1 | `D19/render-compare-round3` |
| 今日-浅-WidgetKit | `widgets.html` #0 · small 170×170/浅 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |
| 人脈-浅-WidgetKit | `widgets.html` #0 · small 170×170/浅 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |
| 秘書-浅-WidgetKit | `widgets.html` #0 · small 170×170/浅 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |
| 计划-浅-WidgetKit | `widgets.html` #1 · medium 364×170/浅 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |
| 分数锁屏-浅-WidgetKit | `widgets.html` #2 · accessory circular 72×72/浅 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |
| 活动锁屏-浅-WidgetKit | `widgets.html` #2 · accessory rectangular 160×72/浅 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |
| 今日-深-WidgetKit | `widgets.html` #3 · small 170×170/深 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |
| 人脈-深-WidgetKit | `widgets.html` #3 · small 170×170/深 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |
| 秘書-深-WidgetKit | `widgets.html` #3 · small 170×170/深 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |
| 计划-深-WidgetKit | `widgets.html` #4 · medium 364×170/深 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |
| 分数锁屏-深-WidgetKit | `widgets.html` #5 · accessory circular 72×72/深 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |
| 活动锁屏-深-WidgetKit | `widgets.html` #5 · accessory rectangular 160×72/深 | 未运行（X 签名 / App Group） | — | `D19/xpc-recheck.md` |

### R32（4 键）

| 键 | 画板 / 宽·主题 | D 批状态 | raw / 超带 / 缺块 | 证据或阻塞 |
| --- | --- | --- | --- | --- |
| A-R05-S02-app-dark | `app.html` #2 · App 裁区 14,756,362,62/深 | 未运行（旧 A 局部 FAIL） | 旧 0.0261/1/0 | `A32/r05-valid-22` |
| A-R05-S03-app-dark | `app.html` #8 · App 裁区 14,756,362,62/深 | 未运行（继承 A 局部 FAIL） | 旧 0.0164 / 1 / 0 | _evidence-a2/PX2/run-04/compare/app-r05-dark-bar |
| A-R05-S06-app-dark | `app.html` #16 · App 裁区 14,756,362,62/深 | 未运行（旧 A 局部 FAIL） | 旧 0.0186/1/0 | `A32/r05-valid-22` |
| A-R05-S08-app-dark | `app.html` #17 · App 裁区 14,756,362,62/深 | 未运行（旧 A 局部 FAIL） | 旧 0.0171/1/0 | `A32/r05-valid-22` |


## ⑫ 已知像素差与门禁

以下路径以 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-d/PX2/run-01/compare/` 为根，每个键目录均有 `design.png`、`app.png`、`diff.png`、`triptych.png` 和 `result.json`。数值是比较器的 raw／超阈 30px 带／缺内容带；超阈带尚未完成逐带归因，因此都保持 FAIL。画板号保持不变，内容修订以本批提交为准。

| 有效失败键与证据目录 | 差异位置和实测 | 已试版本／后续责任 |
| --- | --- | --- |
| `W-R10-01-1440-light` · `web-r10-empty-r2/W-R10-01-1440-light/` | 首页空态上半部与卡片：raw `0.0286`／`13`／`11`，主要 y90–510。首个同态版 `0.0327/14/20`；Home 标题字重／间距调整后下降，但右侧卡片和空态文案仍偏移。 | D 批完成 CSS 局部修正；下一轮需先固定同一空 actor 的全部首屏数据与设计卡片，再逐带核对共享壳。 |
| `W-R20-07-1440-light` · `web-task-empty-final/W-R20-07-1440-light/` | Task 空态导航／标题及三个来源 tile，最终 raw `0.0263`／`12`／`10`；显著带 y120–270、300–330、390–420、540–660，12 带均未归因。先前三轮依次 `0.0324/17/20`、`0.0328/13/16`、`0.0244/11/10`；最终版因 CSS 字号改用既有 token、换未填充 actor，再得当前数字。 | D 批已让 tile 指向可达入口并修订样本轨道；最终版仍 FAIL。后续由 Task 页壳负责人按 diff 校准位置和文本，并维持真实链接行为。 |
| `W-R20-17-1440-light` · `web-calendar-day-connected-v5-r1/W-R20-17-1440-light/` | Calendar 日列表／右栏：raw `0.1827`／`21`／`26`；y90–720 广泛不符，列表设计 x118、实际 x84，午前标签约 y229/y225、首项文字约 y283/y266。连接只读零外部事件由浏览器 fixture 固定，4 条个人日程是真实本地 API 数据。设计 v2→v5 有效轮 `0.1853/18/28`、`0.1805/18/19`、`0.1805/18/19`、`0.1827/21/26`；最后一轮排除设计全局 `.cb` 绝对定位干扰。 | D 批完成真实日列表与静态重叠提示；下一轮需要按 `diff.png` 校准 Task/Calendar 共用壳、列表横向起点和分组纵距，再在同一 fixture 重拍。不得用连接不可用状态或假外部事件替代。fixture 与限制见 `PROVENANCE/web-calendar-connected.md`。 |
| `W-R20b-01-1440-light` · `web-memo-r3/W-R20b-01-1440-light/` | Memo 列表／详情，raw `0.0295`／`14`／`15`；主要 y120–270、360–390、480–570、630–690。四条真实手写笔记对齐后，设计 v2 `0.0653/17/25` 降至 v3 `0.0295/14/15`，但创建顺序和细部行距仍不同。 | D 批移除虚构 voice/AI/联系人动作；下一轮需将样本笔记顺序与内容也固定，再针对列表与详情的带差校准。不能为像素强改生产排序规则。 |

`W-R20-02-1440-light` 诊断图 `web-todo-populated-r1/` 为 **无效状态**：虽然 actor 有 8 个手工任务，`/api/todo/page` 的判断／跟进聚合为空，不能把 `0.0346/12/23` 视为有效失败或改善。R10 1024 两张的设计动态数量为 3，空 actor 为 0，同样无效。R32 `A-R05-S03-app-dark` 沿用 A 批局部 FAIL `0.0164/1/0`，不是 D 批通过：y0–30 底栏背景设计 `#2c2c34`、原生 `#2c242c`，ΔE `4.8`；共享 `GlassSurface` 受真实系统模糊背景影响，需在可登录原生包恢复后重拍再定修复。R19 的 12 张旧局部 FAIL 与 12 张 WidgetKit 未运行按上表分列。

R19 局部键各自的 `widgets.html` 画板号、数值及旧 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-d/R19/run-01/render-compare-round3/` 原图已逐键列在上表；实屏门禁记录在同一 `run-01/xpc-recheck.md`。A 批预检还给出六板 `19 near / 70 missing / 2` 暗色串色：主要差在系统外壳圆角、边距、dock 图标与玻璃叠色，不能把 renderer 图片当成 WidgetKit 实屏。局部 renderer 在旧同版已到第三轮，本批未改 renderer 或重用图片宣称新一轮通过；后续由主会话确定真实系统边距／隐私态画板，WidgetKit 仍待签名和 App Group 环境。四个有效 Web FAIL 均不是此前 PASS 键的抽样；抽样结果与窄宽缺口单列于“验证与采样”。

**Bridge 交接。** 本端版本为本批 D 提交和上表画板修订；Web 仅改 Task 空态入口、Calendar 日列表、Home CSS 与文案，App 产品源码未改。另一端影响是 App #17/#18 Task、#26 Memo 的设计样本变更，以及首页／底栏仍需原生同态重拍。未完成项是 4 个有效 Web FAIL、R10 窄宽有效抽样、原生 App 目标态、WidgetKit X 键和完整跨端同账号结果；验证范围仅为上表所列本地 actor、浏览器与定向测试。请 Bridge 协调者据此更新台账，当前状态不得写成业务对齐完成。
