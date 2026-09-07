# Orbit AI 对话界面探索

2026-09-06。用户要求提升对话 UI、制作多个方案，再做成 Sites 原型便于调整。已选定第 2 套 Reading Canvas 并完成独立原型、浏览器验收与私有发布。随后用户批准接入原生应用；实现和 Simulator 检查进度见 [原生验收记录](native-reading-canvas-qa.md)。

私有预览：[Orbit AI · Reading Canvas](https://orbit-reading-canvas.agenthubs-app.chatgpt.site)。本地预览：http://127.0.0.1:4173/。源码位于应用根目录下的 `prototypes/reading-canvas-sites/`，验收报告见 [design-qa.md](../../../prototypes/reading-canvas-sites/design-qa.md)。

Sites 已报告私有发布成功。独立浏览器访问线上地址返回 `401 / Sign in required`，符合私有访问限制；未冒充已登录线上交互验收。本地浏览器已验证同一份构建来源并保持打开。需要用创建站点的 ChatGPT 账号访问。

## 显示顺序（选择编号以此为准）

1. [清爽消息流](quiet-thread.png)：浅蓝用户气泡、开放式 AI 回复、轻量活动结果、底部输入。
2. [专注阅读](reading-canvas.png)：引用式提问、长回复排版、嵌入式活动信息、较宽输入区。
3. [对话与详情](conversation-detail.png)：简短结果行、可收起的活动详情面板、保留对话上下文。

三张都是独立 Image Gen 结果，已在会话中按上述顺序各显示一次。用户已明确选择 `reading-canvas.png`（第 2 张），该图为后续实现的视觉依据。

实施前的范围与验收说明见 [Reading Canvas Sites 设计说明](../../superpowers/specs/2026-09-06-reading-canvas-sites-design.md)。用户已确认视觉、书面说明及 Playwright 验收。25 项浏览器测试、28 项受保护运行时文件检查、构建及 4 项 Sites 产物测试通过。完整移动模板保留；聊天、活动及回复均为本地演示，不发送真实 AI 请求。

## 依据与范围

- [当前对话顶部](reference-conversation-top.png)、[当前对话底部](reference-conversation-bottom.png) 来自正在运行的 iOS App；已查看后作为实际图片附加至全部三次生成。
- 沿用 Ocean-blue：强调色 #006DB8、浅底 #EDF8FF、暖白背景；本次比较布局、信息层级和交互方式，不重新选品牌色。
- 逻辑移动视口 402 × 874pt；生成图实际依次为 851 × 1848、851 × 1849、851 × 1847px，仅含 app 内容，没有系统或设备外壳。
- 图中文字和活动均为设计示例，不代表真实活动、服务响应或可报名状态。参考截图中的既有会话不接入后续公开原型。
- 已知概念图细节：前两张仍写「这周」，而示例活动 9月10日属于当前日期 9月6日的下一周；后续原型统一使用「下周」或不含相对日期的提问。第二张自动扩写了说明、第三张含轻微按钮明暗变化；实施时应保留简短文案与纯色 token，不把生成痕迹视为新需求。
- 选定后再确认独立 Sites 原型的交互范围：输入/发送演示、会话滚动、返回/菜单、结果展开与关闭。不连接真实 AI、账号或后端，不自动报名、发信或新增业务记录。

完整提示词见 [PROMPTS.md](PROMPTS.md)。生成使用内置 Image Gen，原始输出保留，本目录为项目内副本。
