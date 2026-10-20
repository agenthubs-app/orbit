# R18c 画板预检（C 线）

2026-10-20 在 `line-c` 从 `origin/redesign@063c3c65d` 对 `b7-account-misc.html` #19–32、#74、#81 实跑 `--list --json` 和 `board-preflight --board-index`。原稿与 §C-3 改稿的机器结果分别在 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-c/R18c-original-preflight.json`、`R18c-revised-preflight.json`；两次都识别到 16 块，原稿数字冲突 0。**此表只完成预检，不是画板复核认可或像素通过。**

## 五项检查

| 画面 / 原稿 | ① 数字和尺寸 | ② 元素数据来源与行为 | ③ token / 组件 | ④ 文案与行为冲突、改稿 | ⑤ 宽度 / 主题 / 中途态 |
| --- | --- | --- | --- | --- | --- |
| P-A01 #19 账户 | 390×844；30 日 | 账号身份、登录方式、设备由认证服务；导出与退会为真实入口 | kit `ListRow` / `Button`；外框 token 警告不属于 App 内屏 | 删本期不存在的 Pro 行，标题改「データ」 | 浅色有；深色待 b12 |
| P-A02 #20 清除清单 | 390×844；30 日 | 各领域清单由 purge manifest；导出入口到 `/account/exports` | `AppScreen` / `ListRow` / `Button`；无页面私有 kit 替身 | 删除 App Store 订阅说明，改为登录和连携影响；主办活动有报名的阻止态待补 | 浅色有；深色、阻止态待 b12 |
| P-A03 #21 再认证 | 390×844；10/7→11/6 为 30 日 | 登录方法来自账号、challenge/receipt 来自服务端；成功徽记只在再认证完成后 | `Button` / `Checkbox` / `Card`；日文外壳不手画 | Google 示例只给 Google 再确认，不允许切到密码；申请后普通页面不可用，但 pending 登录可用 | 浅色有；深色 #74 |
| P-A04 #22 pending | 390×844；30 日示例 | 申请状态、UTC 截止时间和东京日期来自服务器；取消走 CAS | `AppScreen` / `Button` / 状态组件 | 取消后重新连接 Google；登录后只能进 pending | 浅色有；深色、取消错误待 b12 |
| P-A05 #23 完成 | 390×844 | 静态通用页，无已删账号读取或反馈接口 | `AppScreen` / `Button` | 删除无接收接口的反馈和「邮件已发送」声称 | 浅色有；深色待 b12 |
| P-A06 #28 导出选择 | 390×844；3 项选中、每日 3 次 | 五 scope，前四项逐项 CSV；`plans+tasks` 联动；全部 JSON 独占且包含本人名片图 | `Checkbox` / `Segmented` / `Button`；系统外壳忽略 | 7 日指 ready 后 ZIP 保管，5 分钟下载 URL 由详情即时发 | 浅色有；深色、空选/限额待 b12 |
| P-A07 #29 准备中 | 390×844；样例 2/3 完成 | worker 已完成项数；离页继续，不估算剩余时间 | `Progress` / 状态组件 | 将无来源的 64%/约 1 分钟改为 2/3 真阶段样例 | 浅色有；深色、失败/单渠道通知失败待 b12 |
| P-A08 #30 ready | 390×844；ready+7 日 | ZIP 文件元数据、历史和失效时间由 GET；本人鉴权下载 | `Button` / `ListRow` | 邮件仅链接详情，不发送同一个私有下载 URL | 浅色有；深色、过期待 b12 |
| P-W01 #24 清除清单 | 1440×960；30 日 | 领域清单/导出入口/主办报名阻止来自 live | `ShellPage` / kit `Card` / `Button` | 删 Pro 自动解约与退款；只说明数据、登录和连携 | 浅色有；1024/390/深色、阻止态待 b12 |
| P-W02 #25 再认证 | 1440×960；10/7→11/6 | 密码示例由当前账号决定；fresh receipt 与限次服务端校验 | kit `Modal` / `Input` / `Button`，焦点描边需核组件 token | 删除 Google/密码任意切换；Google 账号走独立 OAuth，再确认时只示当前方法 | 浅色有；深色 #81，1024/390 待 b12；弹层和焦点 |
| P-W03 #26 pending | 1440×960；30 日 | 申请、截止和取消状态由服务器；其他 API 拦截 | kit 状态组件 / `Button` | 删除 Pro 解约承诺 | 浅色有；1024/390/深色及取消失败待 b12 |
| P-W04 #27 完成 | 1440×960 | 静态通用路由；无旧身份回查 | kit `Button` | 删除反馈入口和「邮件已发」声称 | 浅色有；1024/390/深色待 b12 |
| P-W05 #31 选择 | 1440×960；选中 3/5、日 3 次 | 和 A06 同一 scope/mode/format；无空选择提交 | kit `Checkbox` / `Segmented` / `Button` | all-json 独占；无任意 ZIP 大小预测 | 浅色有；1024/390/深色、限额待 b12 |
| P-W06 #32 ready | 1440×960；ready+7 日 | 同一历史/文件详情；下载 URL 5 分钟且重鉴权 | kit `Table` / `Button` | 保管文件 7 日，通知只给详情链接 | 浅色有；1024/390/深色、过期/失败待 b12 |
| P-A09 #74 再认证深 | 390×844；30 日 | 同 A03 的 Google 示例 | 同 A03 | 同 A03 | 深色有；浅色 #21 |
| P-W07 #81 再认证深 | 1440×960；30 日 | 同 W02 的密码示例 | 同 W02 | 同 W02 | 深色有；浅色 #25，1024/390 待 b12；弹层和焦点 |

## 预检结论和余项

- 工具原稿汇总：16 板、近似 token 5、缺 token 71、疑似数字冲突 0、疑似无功能元素 8。缺项大多落在画框、系统状态栏和 Safari 外壳；这些不由产品页面绘制。内容里的 letter spacing、Web 输入焦点阴影和键帽行高需与 R31a/b 组件逐一核对，不能在本线补 token。`#20` 的「音声メモを含む」等内容来源还需与领域读取 adapter 核对。
- §C-3 改稿已经在 b7 的 R18c 段标注，`--list` 和改稿后 `board-preflight` 均 exit 0。Web 账户/导出示例的设置菜单不再显示 Pro；旧的付费画板属本期作废范围，未用来验收。
- b12 末尾现有 68 组 R18c 草案：App P01–P09 / S01–S08 各浅/深；Web P01–P07 / S01–S10 各 1440/1024/390 浅/深。`scripts/visual/views/{app,web}-R18c.json` 已登记原稿和草案，共 43 个 App frame、109 个 Web frame。App Google 再确认草案已与原稿的 Google 账号示例一致；Web 示范密码账号。草案差异和组件缺口仍待主会话复核，不能用作已批准像素基准。
- 补画后对两份登记分别执行 `board-preflight --suite --no-variants`，均 exit 0；152 frame 的数字自洽警告 0。App 近似 token 66、缺 token 257、疑似无功能 1；Web 近似 token 263、缺 token 346、疑似无功能 7。相同草案组件跨宽度与主题重复计数，缺口集中在新草案的自定义字体行高、卡片与外壳样式；这些数目不是组件库已对齐的证据。JSON 和逐项数据来源清单在 `/Volumes/ORICO/Dev/worktrees/orbit/_evidence-c/R18c-{app,web}-board-preflight.{json,md,txt}`。两个 suite 使用 `--no-variants`，宽度/主题覆盖由本登记和 b12 board list 逐项核对；主会话复核仍是正式门禁前置条件。
