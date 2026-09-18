# Next 页面以外的静态 Web 入口

`public` 中发现两个 HTML 文件，按 Next 的静态文件规则可作为直接地址访问。它们不属于 64 个 `page.tsx` 路由统计，需单独登记。以下为源码检查；未将静态演示的交互或数据作为当前产品已交付证据。

## 1. `/orbit-reference/orbit-reference.html`

来源：[HTML](</Users/li/work/orbit/repos/orbits/public/orbit-reference/orbit-reference.html>)。

标题：「Orbit · 全流程集成 (可点击演示)」。分区：顶部演示控制栏、左侧分组导航、右侧桌面 browser frame 与手机 frame、当前画面 caption/模拟 URL。桌面与手机通过 iframe/message 联动内部演示路由。

控制栏：桌面 + 手机、仅桌面、仅手机；强调色选择。它们是演示设备/样式控制，不是客户账户设置。

外层菜单的 25 个演示入口：

| 分组 | 演示地址 | 菜单文字/说明 |
| --- | --- | --- |
| 公开层 | `/` | 首页 · AI 入口；Orbit Agent 聊天入口 · three.js 动效 |
| 公开层 | `/agent` | Orbit Agent；问人弹人 / 问人弹活动 · 右侧动态窗口 |
| 公开层 | `/explore` | 活动浏览；搜索 · 状态/行业筛选 · 列表 ⇄ 地图 |
| 公开层 | `/events/TBC26S` | 活动详情；封面 · 议程 · 参会者墙 · 报名 |
| 公开层 | `/o/tbc26s` | 主办方公开页；主办方简介 · TA 的全部活动 |
| 鉴权 | `/account/login` | 登录；邮箱密码 · 验证码兜底 |
| 鉴权 | `/account/signup` | 注册；邮箱 → 验证码 → 密码 |
| 鉴权 | `/account/forgot-password` | 找回密码；验证码重置 |
| 个人枢纽 | `/home` | 个人主页；我的活动 · 画像入口 · 数据条 |
| 个人枢纽 | `/home/events` | 我的活动；全部报名 · 状态筛选 |
| 个人枢纽 | `/home/profile` | 通用画像；复用档案编辑 |
| 个人枢纽 | `/home/schedule` | 日程安排；从名片夹约见 · 交往记录 |
| CRM | `/home/cards` | 名片夹列表；跨活动 · 跟进状态 · 搜索 |
| CRM | `/home/cards/c1` | 名片详情；跟进 / 笔记 / 见面记录 / 联系方式 |
| CRM | `/home/cards/graph` | 人脉图谱；你为中心 · 行业聚类 · 缩放 |
| CRM | `/home/cards/intros` | 引荐记录；发起引荐 · 牵线人 |
| CRM | `/home/cards/pipeline` | 跟进管线；待联系 / 在推进 / 已合作 |
| CRM | `/home/cards/scan` | 扫名片；上传 JPG/PNG/PDF · AI 提取去重 |
| 现场 | `/party` | 现场主页；推荐人脉 / 座位 / 流程 + 底部 tab |
| 现场 | `/party/checkin` | 点击签到；到点一键签到 |
| 现场 | `/party/graph` | 关系图谱；节点/缩放/行业筛选 |
| 活动方后台 | `/admin/access` | 后台登录；magic link 登录 |
| 活动方后台 | `/admin` | 仪表盘工作区；报名/签到/匹配 · 分组 · AI |
| 活动方后台 | `/admin/events` | 活动管理 · 新建；timeline 流程 · 自定义表单 |
| 产品平台后台 | `/platform` | 平台后台；账号管理 · 活动审核 · 批准/驳回 |

上述「验证码」「magic link」「新建」「平台审核」是旧演示菜单原文，不是正式产品现状结论。内部嵌入应用还声明 `/register` 和 `/login-admin` 等路径及未知画面 placeholder；没有将它们重复计算为生产 Next 路由。

该文件包含大型内嵌 HTML/脚本资源。其内部每个模拟弹窗、模拟数据内容没有单独运行验收，也不在正式产品控件 1,220 项中；如果后续要重设计这个演示工具本身，需另设明确范围进行内嵌应用盘点。

## 2. `/docs/building-block-development.html`

来源：[HTML](</Users/li/work/orbit/repos/orbits/public/docs/building-block-development.html>)。

标题：「Orbit 积木式模块化开发方法」。是一页开发方法文档，不是用户工作台。

分区与文字标题：

- hero：「积木式模块化开发方法」；摘要：「页面不认识 mock，也不认识 provider」。
- 它解决的问题。
- 一块积木的四层：Contract、Service Interface、Implementation、Factory。
- 推荐文件结构。
- 一个模块的开发顺序。
- 团队怎么分工。
- 抽换真实组件的规则：可以变 / 不能变。
- Sprint 粒度：合适 / 偏大 / 偏小。
- 完成标准。
- 不要这样做：页面直接 import mock、contract 跟着 provider 摇摆、一个 sprint 做太多能力、测试为了配置改代码。
- 名片扫描怎么落地。

主要交互是章节锚点/文档导航，正文展示开发约定；不是名片识别、报名或权限管理业务按钮。完整正文保留在上述源码，不将文档中的代码样例误当正在调用的 API。
