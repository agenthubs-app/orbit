# PX2 B 批：受信箱、通知设置与加人交叉页

执行基线：`origin/redesign` = `5a3ffeb5d`。本线只在 `redesign-b` 工作，Web 使用 3300、设计稿服务 3350、原生 Metro 8083、库 `orbit_line_b`。证据根：`/Volumes/ORICO/Dev/worktrees/orbit/_evidence-b/PX2/run-01/`。未连接 Neon／生产，未部署、未 push。以下键的数值仅采用与目标态同态、无加载遮罩的原始图；无效帧单列。

## 画板与 fixture 决定

| 决定 | 本线实施与证据 | 尚需的同态数据 |
| --- | --- | --- |
| D04 | b5 #0/#3/#5/#8/#69 改为当前无 mail 的空通知、空会话；#4 为应用内会话草稿／发送态。b11 #29/#30 去掉 mail summary，旧邮件板 #28/#50 明标历史非门禁。新增 b5 #72–#81 的原生暗色及 Web 1024/390 空态。原／新／理由见 `PROVENANCE/d04-d14-board-changes.md`，`preflight/` 有 `--list` 与改稿后预检。 | 本机 QA actor 有 80 联系人、0 inbox notification、0 conversation membership；填充通知、会话、秘书活动需要有来源的同一 actor fixture。无来源的板不计有效像素门禁。 |
| D14 | b11 #14 改为邀请码创建前，新增 #52 为生成后。创建前截图后，仅对本机 QA actor 通过本地 API 生成一次代码；后续读取，不在报告中公开代码／链接。见 `PROVENANCE/r15-generated.md`。 | #14 需要无当前代码 actor；#52 需要已生成代码 actor，两态不能在同一账号同一时刻互换。 |
| R12 文案 | b9 #11 的地址预览补回签名输入与当前解析器均保留的 `東京都`；首张有效暗色图仅在此文字带超阈。改稿后 `--list`／预检见 `preflight/b9-r12-03-revised.*`。 | #1 背景 286 人与当前 actor 80 人不符；#4 缺少授权同名联系人。 |

App R14 页面把首张推送许可卡、通知通道行和秘书两行的高度及顶部间距调到修订板；会话详情行保持原有高度。改动仅在 `NotificationSettingsScreen.tsx`、`PushPermissionSettings.tsx`、`NotificationDeliverySettings.tsx`，未改 API、偏好持久化或跨端 DTO。原生新截图与同版本比较在下表记录。

Web R14 页面把锁屏内容选项并入通知通道卡，给通道行加现有图标，并把静音时间输入压成板上的紧凑行；改动仅在本页的 `notification-delivery-settings.tsx`、`NotificationSettings.module.css`、`NotificationSettingsPageClient.tsx`。`r5` 有效复拍确认缺块减少，但其余差异按⑫交接。

## 逐键结果

`raw / 超阈带 / 缺块` 均取最后一张有效同态图；`—` 表示没有有效同态数字。三联图在所列 `compare/` 目录各键下。每屏同版本最多三轮；到上限后的未过键交⑫。

| 键 | 目标板 | 状态 | 最后有效 raw / 超带 / 缺块 | 证据与原因 |
| --- | --- | --- | --- | --- |
| `A-R13-01-app-light` | b5 #0 | FAIL | `0.0189 / 5 / 1` | `compare/app-captured-r2/`；类别/空态带及原生文字仍异。 |
| `A-R13-02-app-light` | b5 #1 | 未运行 | — | 本机无通知来源，填充板无同态 fixture。 |
| `A-R13-04-app-light` | b5 #3 | FAIL | `0.0155 / 5 / 0` | `compare/app-captured-r2/`；搜索框/空会话文字带未过。 |
| `A-R13-05-app-light` | b5 #4 | 未运行 | — | 本机无授权 conversation membership，无法进入会话详情。 |
| `A-R13-07-app-light` | b11 #29 | 未运行 | — | 本机无截止提醒来源，填充板无同态 fixture。 |
| `A-R13-08-app-light` | b11 #30 | 未运行 | — | 本机无秘书推荐来源，填充板无同态 fixture。 |
| `W-R13-01-1440-light` | b5 #5 | FAIL | `0.0057 / 1 / 4` | `compare/web-R13-empty-r3/`；y210–240 类别/空态带仍超阈，同版本 3 轮已满。 |
| `W-R13-02-1440-light` | b5 #6 | 未运行 | — | 本机无通知来源，填充板无同态 fixture。 |
| `W-R13-04-1440-light` | b5 #8 | FAIL | `0.0027 / 1 / 0` | `compare/web-R13-messages-r3/`；y150–180 搜索/空态文字带仍超阈，同版本 3 轮已满。 |
| `W-R13-04d-1440-dark` | b5 #69 | FAIL | `0.0034 / 1 / 0` | 同上暗色，y150–180；同版本 3 轮已满。 |
| `A-R14-P01-app-light` | b5 #13 | FAIL | `0.0604 / 16 / 3` | `compare/app-captured-r2/`；原生卡片纵向位置改善，文字/开关带仍未过。 |
| `A-R14-P02-app-light` | b11 #32 | FAIL | `0.0482 / 10 / 3` | `compare/app-captured-r2/`；卡片顶边对齐，原生文字/开关带仍未过。 |
| `W-R14-P01-1440-light` | b5 #29 | FAIL | `0.0383 / 21 / 22` | `compare/web-R14-r5/`；合并锁屏行、缩短静音卡后改善，但侧栏、卡片文字/控件和底部自动发现卡仍有残差。 |
| `W-R12-01-1440-light` | b12 #96 | 无效 | — | `compare/web-R12-r1/` 的背景仍在网络加载，且当前 80 人 actor 与 286 人画板不符；已给 suite 增加网络表格等待。 |
| `W-R12-01-1440-dark` | b12 #96 | 无效 | — | 同上暗色。 |
| `W-R12-04-1440-light` | b11 #19 | 无效 | — | `compare/web-R12-r1/` 未到授权同名联系人候选目标态；本机无目标人选。 |
| `W-R12-04-1440-dark` | b11 #19 | 无效 | — | 同上暗色。 |
| `W-R12-03-1440-light` | b9 #11 | PASS | `0.0006 / 0 / 0` | `compare/web-R12-03-r3/`；地址文案对齐后，无归因例外。 |
| `W-R12-03-1440-dark` | b9 #11 | PASS | `0.0008 / 0 / 0` | 同上暗色，无归因例外。 |
| `W-R15-14-1440-light` | b11 #14 | 无效 | — | `compare/web-R15-pre-r1/` 保留原图；弹层进入前态，但背景是当前 80 人而画板 286 人，不能作整屏同态数字。 |
| `W-R15-14-1440-dark` | b11 #14 | 无效 | — | 同上，暗色。 |
| `W-R15-14m-1440-light` | b11 #14 crop | FAIL | `0.1380 / 13 / 3` | `compare/web-R15-pre-r2/`；弹层 hero、三步、FAQ 的纵向尺寸与字体仍异。 |
| `W-R15-14m-1440-dark` | b11 #14 crop | FAIL | `0.0947 / 12 / 4` | 同上暗色；两轮有效裁区到此，生成后账号已建立，不能用同一 fixture 回到前态。 |

新增 b11 #52 的生成后只读状态另计：`W-R15-52-1440-light/dark` 整屏因 80/286 背景世界不一致而无效；`W-R15-52m-1440-light/dark` 是有效裁区 FAIL，最后分别 `0.0561 / 8 / 3` 与 `0.0580 / 8 / 3`，证据为 `compare/web-R15-post-r2/`。原来的 #14 创建前键不能由这一已生成账号重拍；两个状态与对应 fixture 分列保存。

新增板逐键结果如下。D04 的十张都在当前空态同一 actor 下取得有效帧；D14 的整屏因背景人数不符，仅弹层裁区可计有效数字。

| 键 | 板 | 状态 | raw / 超带 / 缺块 | 证据 |
| --- | --- | --- | --- | --- |
| `A-R13-D04-01-app-dark` | b5 #72 | FAIL | `0.0181 / 5 / 1` | `compare/app-captured-r2/` |
| `A-R13-D04-04-app-dark` | b5 #73 | FAIL | `0.0145 / 5 / 0` | `compare/app-captured-r2/` |
| `W-R13-D04-01-1024-1024-light` | b5 #74 | FAIL | `0.0078 / 3 / 4` | `compare/web-R13-responsive-r3/` |
| `W-R13-D04-01-390-390-light` | b5 #75 | FAIL | `0.0191 / 9 / 1` | 同上 |
| `W-R13-D04-04-1024-1024-light` | b5 #76 | FAIL | `0.0058 / 2 / 2` | 同上 |
| `W-R13-D04-04-390-390-light` | b5 #77 | FAIL | `0.0132 / 6 / 0` | 同上 |
| `W-R13-D04-01d-1024-1024-dark` | b5 #78 | FAIL | `0.0113 / 4 / 2` | 同上 |
| `W-R13-D04-01d-390-390-dark` | b5 #79 | FAIL | `0.0247 / 8 / 1` | 同上 |
| `W-R13-D04-04d-1024-1024-dark` | b5 #80 | FAIL | `0.0069 / 3 / 2` | 同上 |
| `W-R13-D04-04d-390-390-dark` | b5 #81 | FAIL | `0.0163 / 6 / 0` | 同上 |
| `W-R15-52-1440-light` | b11 #52 | 无效 | — | `compare/web-R15-post-r2/`；80/286 背景人数不符 |
| `W-R15-52-1440-dark` | b11 #52 | 无效 | — | 同上 |
| `W-R15-52m-1440-light` | b11 #52 crop | FAIL | `0.0561 / 8 / 3` | 同上 |
| `W-R15-52m-1440-dark` | b11 #52 crop | FAIL | `0.0580 / 8 / 3` | 同上 |

原 23 键为 `2 PASS / 10 FAIL / 6 无效 / 5 未运行`；新增 D04/D14 14 键为 `0 PASS / 12 FAIL / 2 无效 / 0 未运行`。合计 37 键中的有效像素结果是 `2 PASS / 22 FAIL`；其余 13 键未进入有效分母。

无效帧单独保留：`compare/web-R14-r1/` 和 `web-R14-r2/` 均截到「設定を更新…」加载态，第二轮的 `[data-notification-settings]` 等待超时；本地同一 actor 的 `/api/account/me`、`/api/inbox/delivery/preferences`、`/api/inbox/discovery/preferences` 随后均 HTTP 200 且数据可读。`compare/web-R14-r3/` 暖态复拍得到首张有效图；页面改动后的 `compare/web-R14-r4/` 与原生启动重叠，数据标记未出现且截图等字体超过 30 秒，记 ERROR、不计像素轮次。单独执行的 `compare/web-R14-r5/` 是有效图，raw 从 `0.0406` 降至 `0.0383`、缺块从 `38` 降至 `22`，仍有 `21` 未归因超阈带。`compare/web-R12-03-r2/` 两张因 Playwright 截图等待字体超过 30 秒而报错，未计像素轮次；第三轮串行有效且 PASS。`compare/web-R15-post-r1/` 的未加载生成后帧不计目标态数字。

新增 b5 #72–#81 的回归键已在 `compare/web-R13-responsive-r3/` 和 `compare/app-captured-r2/` 有效复拍。Web 1024 通知浅/深分别 `0.0078 / 3 / 4`、`0.0113 / 4 / 2`，消息浅/深 `0.0058 / 2 / 2`、`0.0069 / 3 / 2`；390 通知浅/深 `0.0191 / 9 / 1`、`0.0247 / 8 / 1`，消息浅/深 `0.0132 / 6 / 0`、`0.0163 / 6 / 0`，8 张均 FAIL。窄屏主要是类别芯片换行、标记已读按钮与搜索区位置；第三轮后交⑫。App 暗色空通知 `0.0181 / 5 / 1`、空消息 `0.0145 / 5 / 0`，均 FAIL，证据在 `compare/app-captured-r2/`。

## 此前 PASS 抽查

A 批登记的 R31b Web 组件格此前自动 PASS 58 张。本线从 toast、confirm、layer、chip、text、why 六格各取浅／深 1 张，共 `12/58 = 20.7%`；`compare/web-pass-sample/summary.json` 为 **12/12 PASS、0 未归因**。`W-R31b-c-confirm-2-1440-light` 仍报告左上角 `x0–24/y0–24` 圆角背景缺块提示 1 个，与 A 报告相同；三联图中标题、正文、按钮完整，原始警告保留。

R31a App 此前自动 PASS 43 张。本线取 confirm、AI、why、chip、text 各浅／深一张；`compare/app-pass-sample/summary.json` 为 **10/10 PASS、0 未归因、0 缺块**，即 `10/43 = 23.3%`。两端合并为 `22/(58+43) = 21.8%`。App 用 B 模拟器原生截图，Web 为 1440；本批新增 1024/390 空态另在 D04 逐键记录为 FAIL，未混入此前 PASS 抽样。

## 类型与全量门禁

| 门禁 | 本线最终结果 | 与 A 批最新基线比较 |
| --- | --- | --- |
| Web typecheck | 退出 `0`，`logs/web-typecheck-final-restored.log`；关闭 B Web 开发服务并还原 Next 自动生成配置后执行 | 类型检查通过。 |
| App typecheck | 退出 `0`，`logs/app-typecheck-final.log`；在三处 R14 原生布局修改后执行 | 类型检查通过。 |
| Web 全量 | 退出 `1`，`7,979` 测试、`6,934` pass、`5` fail、`1,040` skip；`logs/web-full-final.log` | 五个失败名与 `_evidence-a2/PX2/run-01/logs/web-full.log` 逐名相同，**新增 0**。 |
| App 全量 | 退出 `1`，`3,328` 测试、`3,324` pass、`2` fail、`2` skip；`logs/app-full-final.log` | 两个失败名与 `_evidence-a2/PX2/run-01/logs/app-full.log` 逐名相同，**新增 0**。 |

全量仍有既存失败，不能标全量 PASS。Web 五项为 `manifest generation writes the required repository artifacts`、`merging fills empty fields…`、`only the dev route imports the design fixtures`、`e2e: upload 4 cards…`、`R12 review m9: when the duplicate lookup fails…`；App 两项为 `the original split key set retains its current approved copy snapshot` 与 `S1 これまでのコード: 「同じ人かも」…統合する merges…`。两端最终全量均只设置 `LANG`、`LC_ALL`，通过 `heavy.sh b` 串行执行。较早一次并发启动被中断，`logs/web-full-interrupted.log` 与空的 `logs/app-full.log` 保留但不计为完成的全量；最终数值仅取上表两个完整日志。

## ⑫ 已知像素差与同态数据交接

下表续用逐键结果的 `raw / 超阈带 / 缺块`。相对证据路径均在本报告开头的证据根下；每个 `compare/<轮次>/<键>/` 同时有 `design.png`、`app.png`、`diff.png`、`triptych.png` 和 `result.json`。所有下面的有效 FAIL 都有 `unattributed = overBands`，逐条带的 y 范围、偏移及颜色在各自 `result.json`，无静态归因豁免；这些键均不在“此前 PASS”抽样分母。`原生`为模拟器设备点宽度，`Web` 为浏览器视口宽度。

| 未过键 | 板 / 宽 / 主题 | 最后有效证据与已试轮次 | 主要差异位置；下一责任 |
| --- | --- | --- | --- |
| `A-R13-01-app-light` | b5 #0 / 原生 / 浅 | `compare/app-captured-r2/A-R13-01-app-light/`；r1→r2 | y60–270 类别与空态字、1 缺块；B 页面 owner。 |
| `A-R13-04-app-light` | b5 #3 / 原生 / 浅 | `compare/app-captured-r2/A-R13-04-app-light/`；r1→r2 | y60–270 搜索框与空会话字；B 页面 owner。 |
| `W-R13-01-1440-light` | b5 #5 / 1440 / 浅 | `compare/web-R13-empty-r3/W-R13-01-1440-light/`；r1→r3 | y210–240 类别/空态、4 缺块；B 页面 owner。 |
| `W-R13-04-1440-light` | b5 #8 / 1440 / 浅 | `compare/web-R13-messages-r3/W-R13-04-1440-light/`；r1→r3 | y150–180 搜索/空态字；B 页面 owner。 |
| `W-R13-04d-1440-dark` | b5 #69 / 1440 / 深 | `compare/web-R13-messages-r3/W-R13-04d-1440-dark/`；r1→r3 | y150–180 搜索/空态字；B 页面 owner。 |
| `A-R14-P01-app-light` | b5 #13 / 原生 / 浅 | `compare/app-captured-r2/A-R14-P01-app-light/`；r1→r2 | y120–180 许可卡字、y300–540 四分类文字/开关，3 缺块；B App 页面 owner。 |
| `A-R14-P02-app-light` | b11 #32 / 原生 / 浅 | `compare/app-captured-r2/A-R14-P02-app-light/`；r1→r2 | y60–240 标题/说明/两行文字，3 缺块；B App 页面 owner。 |
| `W-R14-P01-1440-light` | b5 #29 / 1440 / 浅 | `compare/web-R14-r5/W-R14-P01-1440-light/`；r1/r2 无效→r3 有效→r4 ERROR→r5 有效 | y90–240 侧栏/分类控件，y300–570 静音卡/锁屏行，y690–900 自动发现卡；21 未归因带、22 缺块；B Web 页面 owner。 |
| `W-R15-14m-1440-light` | b11 #14 crop / 1440 / 浅 | `compare/web-R15-pre-r2/W-R15-14m-1440-light/`；r1→r2 | y60–180 弹层 hero/步骤与 FAQ，3 缺块；B 加人页 owner。 |
| `W-R15-14m-1440-dark` | b11 #14 crop / 1440 / 深 | `compare/web-R15-pre-r2/W-R15-14m-1440-dark/`；r1→r2 | y60–180 同上暗色，4 缺块；B 加人页 owner。 |
| `W-R15-52m-1440-light` | b11 #52 crop / 1440 / 浅 | `compare/web-R15-post-r2/W-R15-52m-1440-light/`；r1 无效→r2 | y90–210 生成后代码卡/说明，3 缺块；B 加人页 owner。 |
| `W-R15-52m-1440-dark` | b11 #52 crop / 1440 / 深 | `compare/web-R15-post-r2/W-R15-52m-1440-dark/`；r1 无效→r2 | y90–210 同上暗色，3 缺块；B 加人页 owner。 |
| `A-R13-D04-01-app-dark` | b5 #72 / 原生 / 深 | `compare/app-captured-r2/A-R13-D04-01-app-dark/`；r1→r2 | y60–270 类别/空态字、1 缺块；B 页面 owner。 |
| `A-R13-D04-04-app-dark` | b5 #73 / 原生 / 深 | `compare/app-captured-r2/A-R13-D04-04-app-dark/`；r1→r2 | y60–270 搜索/空态字；B 页面 owner。 |
| `W-R13-D04-01-1024-1024-light` | b5 #74 / 1024 / 浅 | `compare/web-R13-responsive-r3/W-R13-D04-01-1024-1024-light/`；r1→r3 | y180–450 类别/空态，4 缺块；B 页面 owner。 |
| `W-R13-D04-01d-1024-1024-dark` | b5 #78 / 1024 / 深 | `compare/web-R13-responsive-r3/W-R13-D04-01d-1024-1024-dark/`；r1→r3 | y90–450 同上暗色，2 缺块；B 页面 owner。 |
| `W-R13-D04-04-1024-1024-light` | b5 #76 / 1024 / 浅 | `compare/web-R13-responsive-r3/W-R13-D04-04-1024-1024-light/`；r1→r3 | y150–240 搜索/空态，2 缺块；B 页面 owner。 |
| `W-R13-D04-04d-1024-1024-dark` | b5 #80 / 1024 / 深 | `compare/web-R13-responsive-r3/W-R13-D04-04d-1024-1024-dark/`；r1→r3 | y90–240 同上暗色，2 缺块；B 页面 owner。 |
| `W-R13-D04-01-390-390-light` | b5 #75 / 390 / 浅 | `compare/web-R13-responsive-r3/W-R13-D04-01-390-390-light/`；r1→r3 | y0–120 壳、y150–330 类别换行/已读按钮，1 缺块；B 页面 owner。 |
| `W-R13-D04-01d-390-390-dark` | b5 #79 / 390 / 深 | `compare/web-R13-responsive-r3/W-R13-D04-01d-390-390-dark/`；r1→r3 | y0–120 壳、y150–330 类别换行/已读按钮，1 缺块；B 页面 owner。 |
| `W-R13-D04-04-390-390-light` | b5 #77 / 390 / 浅 | `compare/web-R13-responsive-r3/W-R13-D04-04-390-390-light/`；r1→r3 | y0–180 壳/消息筛选与搜索，底部导航；B 页面 owner。 |
| `W-R13-D04-04d-390-390-dark` | b5 #81 / 390 / 深 | `compare/web-R13-responsive-r3/W-R13-D04-04d-390-390-dark/`；r1→r3 | y0–180 同上暗色，底部导航；B 页面 owner。 |

无效／未运行键分别为：`A-R13-02-app-light`（b5 #1）、`A-R13-05-app-light`（b5 #4）、`A-R13-07-app-light`（b11 #29）、`A-R13-08-app-light`（b11 #30）、`W-R13-02-1440-light`（b5 #6），均缺本机 actor 的授权通知/线程/秘书活动来源；fixture owner 提供同一 actor 的来源事件后重拍。`W-R12-01-1440-light/dark`（b12 #96）与 `W-R15-14-1440-light/dark`（b11 #14）及新增 #52 整屏，分别因 80/286 人背景世界不符；R12/R15 fixture owner 提供同规模、同态来源，再做整屏门禁。`W-R12-04-1440-light/dark`（b11 #19）缺授权同名联系人目标，R12 fixture owner 需提供。上述无效帧都保留在逐键结果所列路径，不借用其 raw 数字；未运行键没有截图。D14 前后状态独立，生成后不能复用为创建前；Bridge 协调者在⑫台账分别登记。

## Web / App 交接（Bridge 协调者接收）

- 状态：本线 `source_ready`，Web/App 都是局部像素开放，不作 `verified`；像素验收范围以上表的有效键为准。下一责任方是 B 页面 owner、同态 fixture owner 与 Bridge 协调者，分别处理局部布局、来源数据和台账。
- 用户可见变化：原生通知设置卡片与通道/秘书行的纵向间距接修订板；Web 通知设置的锁屏选项并入推送卡、静音时间输入压成同一行；受信箱空态画板改为现有无 mail 的产品状态。功能开关、保存和错误处理保留。
- Web 页面与 API：`/app/inbox`、`/app/settings/notifications`、`/app/contacts/new` 是本轮读图入口；没有改 HTTP 方法、字段、Schema、actor 校验、幂等或刷新策略。App 消费点是 `/inbox` 和 `/settings/notifications`，仅本线三处 R14 布局值调整。Web 写→App 回读、App 写→Web 回读均未运行；本线没有改共享契约，业务对齐仍取既有 Bridge 台账，不由像素或 typecheck 推定。
- 版本与证据：基线 `5a3ffeb5d` 加本次 B 提交；`compare/` 保存浏览器／原生设计、实现、差图和每带 JSON。R13 填充态的 80 人 QA actor 缺来源事件/会话；R12/R15 背景的 286 人要求未满足。无生产部署，本次布局改动无旧 App 契约迁移。
- Bridge 台账：本线按子目录边界只写 `REPORT-B.md` 与 B 自有文件；由协调者按 `bridge/templates/handoff.md` 更新根目录 `bridge/status.md`、`bridge/handoffs.md`，不得把 typecheck 或路由可达标为业务像素对齐。
