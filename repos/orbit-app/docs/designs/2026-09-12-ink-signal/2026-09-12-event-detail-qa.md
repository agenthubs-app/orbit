# 活动详情对照 · 2026-09-12

范围：`2a-活动详情` 与实际 `/events/[id]`。仅 App 本地实现；不提交、推送或部署。本文件为进行中的 QA，不代表整包完成。

## 对照证据

源 `design_handoff_orbit_ink_signal/screenshots/2a-活动详情.png` 与最新 `/tmp/orbit-ink-signal-event-detail-390-round8.png` 已在同一输入中打开。均为 390×844 CSS pt、2×、780×1688 PNG，浅色、相同公开活动、初始滚动位置。比较 App 内容，不复制源稿的手机外框和虚构状态栏。完整字体／图标在此密度可以阅读，无需额外裁剪。时间轴修正前的 round3 和修正后的 round5、round6、round7、round8 均曾与源稿成对检查。

- 字体：系统字族；24/900 活动标题，15/800 分段标题，14/22 介绍，13pt 主办方和人数。标题在图片之后，支持真实字号缩放。
- 布局：16pt inset、96pt 封面、四格日期／时间／地点／主办方，底部固定报名、滚动内容自然占位。时间轴多余间距已修正，参会者行对齐到源稿附近，残余约 3pt 为 P3。
- 配色：白底、墨黑、信号蓝、浅灰分隔。深色沿用本产品能力，没有选用被淘汰的深色稿。
- 图片：使用已有真实活动图片及 Ionicons；源稿的示意渐变不替代真实封面。没有把整屏截图作为页面，也没有重画手机状态栏。
- 内容：主办方无可导航 ID，因此只读；报名人数／议程无数据时明确提示或保留真实开始时间，不填入设计样例。原有现场、费用、证据、会前准备及会后复核位于公开信息之后。

## 发现与迭代

1. P2 · 时间轴节奏偏松，已修复。round3 的参会者行比源稿下移约 15pt。实际 HTML 每行仅描述上方 1pt 间距；页面另继承 `agendaBody.gap`，每行多出 4pt。去除此额外间距后，round5／round6 已重新对照相同初始视口；对应布局回归先失败再通过。
2. P2 · 窄屏确认提示挤成细列，已修复。修正前 320pt／1.6 倍字号的“确认后不会发送消息”在确认按钮旁分成三行。加入提示最小宽度后，最新 `/tmp/orbit-ink-signal-event-detail-private-320-followup.png` 显示它完整换到下一行，已重新打开检查；源稿未提供此状态。
3. 320pt／1.6 倍目标建议标题曾被单行省略。实际失败测试复现后已解除单行限制；`/tmp/orbit-ink-signal-event-detail-private-320-goal.png` 已查看，文字完整、输入和确认动作可达。开场白和跟进草稿长文本测试通过。

公开状态与真实内容的两项早期复审问题已修复：canonical 历史活动显示“已结束”，关闭报名但保留参会者入口；五种明确服务端占位精确转为用户文案，真实英文内容保持。相关三项回归先失败再通过，独立复核 APPROVE。

## 验证与未验范围

最终定向 `/tmp/orbit-ink-signal-event-detail-target6.log`：195/195，63.952 秒，exit 0。全量 `/tmp/orbit-ink-signal-event-detail-full4.log`：1803/1803，0 失败／跳过／取消，134.258 秒，exit 0。类型检查 `/tmp/orbit-ink-signal-event-detail-typecheck11.log`：exit 0；diff check 通过。活动详情新增 144 项回归，最终独立只读复审 APPROVE，Critical／Important／Minor 均为 0。这些为下一批个人页代码实施前的基线，不包括随后新增的个人页测试。

后续复审修复了个人模块多语言内容被旧显示层替换的问题，同时对实际 live/mock 服务占位做精确映射，正常包含 live/generated/provider 的业务文字保留。精确表另有原型键问题，已改为 own-property 查询；`__proto__`、`constructor`、`toString` 的读取与确认回执均有先失败后通过的真实路由测试。真实会后确认提示、建议理由和清单文案也用已核对的服务字符串覆盖，未渲染的溯源字段没有扩张。

中间 full2 为 1796/1797，唯一名片 ingest 测试在点击后等待导航时超时；原样单独运行通过，不并行另一浏览器套件的 full3 为 1797/1797，最终 full4 为 1803/1803。未修改名片生产行为、超时或断言，不把中间失败记为通过。

另在已有失败测试中加入可选截图，`/tmp/orbit-ink-signal-event-detail-public-failure-qa.log`：2/2，exit 0；已打开 `/tmp/orbit-ink-signal-event-detail-public-failure.png`。页面保留返回与明确重试，不展示报名或分享。此前已逐一查看 320pt／1.6 字号、820pt、390pt 深色，以及个人加载／空／等待／失败／目标与开场白长文本的实际截图。正常入口、三项个人写入、双击、失败草稿、刷新、身份切换、旧回调与迟到 401 均有实际交互覆盖，浏览器 pageerror 断言为零。

现有测试运行真实路由、RNW、hooks、HTTP client 和 view-model；仅外部请求、认证／路由环境及原生边界受控。截图不是 iOS 原生或跨端真实账号验收。原生字号热切换、VoiceOver、分享面板和同账号跨端读写未验证。

final result: passed
