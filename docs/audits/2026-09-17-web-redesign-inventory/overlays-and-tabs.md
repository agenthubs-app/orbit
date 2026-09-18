# 弹窗、抽屉、子 Tab 与隐藏画面目录

这是源码确认的画面类别目录，包含真正 dialog、bottom sheet、菜单、内联编辑/确认、折叠区与数据状态。不是「全部都实际点击验收过」的截图册。完整控制条件、文字/handler、源文件行号见域分卷；相同 ModalShell 下的不同内容按任务分开记录，不用 dialog 标签数代替画面数。

## 1. 弹出层与内联子画面

| 编号 | 所属界面 | 子画面/触发 | 显示内容与控件 | 动作与边界 | 证据域 |
| --- | --- | --- | --- | --- | --- |
| O01 | 共享顶栏 | 登录账号菜单 | 账号/画像等导航、退出 | 本地开关 + 路由/鉴权；会话未知显示占位，不假设已登录 | [01](01-entry-shell.md) |
| O02 | 移动公共导航 | 汉堡菜单与遮罩 | 各业务导航、语言/账户相关入口、关闭 | 遮罩/Esc 关闭；按移动断点出现 | [01](01-entry-shell.md) |
| O03 | CRM | 「更多」导航展开 | 进展、引荐、分析、操作/导入等其他入口 | 本地展开；不是后端查询 | [03](03-contacts.md) |
| O04 | 共享 iOrbit | 提问 dock 展开 | 提问输入、页面上下文 chip、提示、关闭/完整工作区 | 纯展开不产生 run；提交经共享 ask controller 处理 | [01](01-entry-shell.md) |
| O05 | 共享收件箱 | 关系收件箱抽屉 | 标题、两 Tab、未读、宽度拖动、关闭 | 拉取对应数据；对话/提醒权限边界各自保留 | [07](07-schedule-tasks-chat.md) |
| O06 | 收件箱/对话 | 会话详情 | 对象/历史/草稿、回复输入、润色、暂存/交接、返回列表 | rewrite 辅助 API；暂存不表示外部发送 | [07](07-schedule-tasks-chat.md) |
| O07 | 收件箱/对话 | 新建会话表单 | 收件对象、主题/正文、生成草稿、创建、返回 | email-draft 与 relationship-inbox POST 是不同步骤 | [07](07-schedule-tasks-chat.md) |
| O08 | 收件箱/提醒 | 提醒列表与忽略/已读反馈 | 提醒正文、跳转、忽略/批量忽略、空态 | notification state 写入；导航与状态写入需分开 | [07](07-schedule-tasks-chat.md) |
| O09 | 账号 | 登录/注册鉴权卡片 | 邮箱、密码、眼睛、提交、切换、关闭、错误 | 登录/注册分支，不是业务详情 modal | [01](01-entry-shell.md) |
| O10 | 账号 | 重置请求/确认反馈 | 受理、错误、token 无效、新密码确认/结果 | 提交前后不同；邮件受理不等于送达 | [01](01-entry-shell.md) |
| O11 | iOrbit | 历史抽屉/侧栏 | 会话、分组、选中状态、加载/错误、关闭 | 桌面与移动呈现；会话历史接口 | [02](02-ai.md) |
| O12 | iOrbit 历史 | 行「更多」菜单 | 改名、置顶、移动分组、删除 | 受 pending/当前分组等约束；菜单本身只本地状态 | [02](02-ai.md) |
| O13 | iOrbit 历史 | 会话改名 | 标题输入、保存/取消或输入确认状态 | 会话 PATCH，失败保持旧数据/反馈 | [02](02-ai.md) |
| O14 | iOrbit 历史 | 会话删除确认 dialog | 被删对象、确认/取消、pending/error | 会话 DELETE；不得把点击更多直接当删除 | [02](02-ai.md) |
| O15 | iOrbit 历史 | 分组组织区 | 分组名、新增、编辑/删除、移动会话、新建组内会话 | 组织面板是内联展开；revision 与删除冲突保留 | [02](02-ai.md) |
| O16 | iOrbit 消息 | 待办/承诺结果详情展开 | 单项/分组内容、依据、选择条目、确认反馈 | 本地展开 + 显式业务确认；不是一组固定弹窗 | [02](02-ai.md) |
| O17 | iOrbit 消息 | 跟进草稿编辑/交接 | 可编辑内容、复制、交接、生成/失败反馈 | idle/generating/ready/handed/error 分开；非投递回执 | [02](02-ai.md) |
| O18 | iOrbit 消息 | run/action/结果评价子状态 | 执行状态、确认/拒绝/取消/重试、评价与反馈 | run transition、ledger transition 与 outcome feedback 分开 | [02](02-ai.md) |
| O19 | 联系人详情 | 编辑行业 dialog | 主行业/次行业选择、保存/关闭、错误 | PATCH 联系人；分类依赖需保留 | [03](03-contacts.md) |
| O20 | 联系人详情 | 编辑标签 dialog | 自定义标签、新增/移除、保存/关闭、pending/error | PATCH 联系人；不是改变来源标签 | [03](03-contacts.md) |
| O21 | 联系人详情 | 最近互动编辑 dialog | 互动日期/相关字段、保存/关闭、校验 | PATCH 联系人；明确输入才是记录 | [03](03-contacts.md) |
| O22 | 联系人详情 | 添加私密笔记 dialog | 笔记输入、保存/关闭、保存失败 | 当前 editor PATCH 联系人 notes；不自动对方可见 | [03](03-contacts.md) |
| O23 | 联系人详情 | 我的关系设置内联表单 | 「关系阶段」「关系目标」或「跟进内容」「下次跟进时间」；确认、刷新/重试 | hidden/loading/pending/initialized/error；`/api/contacts/[id]/relationship-initialization` GET/POST；交换不代表对方选择，不发消息 | [03](03-contacts.md) |
| O24 | 联系人详情/活动 | 关系沟通与交换授权状态 | 尚未邀请/待接受/已同意/不可用等；可用邀请/沟通入口 | consent/actor/活动范围；不能画成始终可直接聊天 | [03](03-contacts.md)、[05](05-events.md) |
| O25 | 引荐 | 引荐详情 modal | 双方、原因、状态/来源、相关人脉链接、关闭 | 展示记录不证明已发给双方 | [03](03-contacts.md) |
| O26 | 引荐 | 发起引荐表单 modal | 联系人 A/B、原因/介绍、确认/关闭、错误 | introductions POST；不能选择同一对象等校验见明细 | [03](03-contacts.md) |
| O27 | 引荐表单 | 选择联系人 A 或 B 的嵌套选择器 | 搜索/候选、选择/返回 | 本地选择，不另建联系人 | [03](03-contacts.md) |
| O28 | 人脉分析 | 编辑关系目标 dialog | 目标文本、保存/取消、版本/失败 | PUT profile，保存目标后旧报告仍旧，不自动重生成 | [03](03-contacts.md) |
| O29 | 人脉结构 | 图表桶选中与详情入口 | label/count/percentage、缺失信息提示、查看分组详情 | 图形/legend 本地选择；详情为独立路由 | [03](03-contacts.md) |
| O30 | 全部操作 | 台账详情展开/草稿编辑 | 为什么、实际操作、证据、Trace、预览/编辑/复制、可重试撤销取消 | capability 与状态受限；并非所有操作都可撤销 | [03](03-contacts.md) |
| O31 | 名片扫描 | 图片拍摄/预览/替换与识别 | 图片、正在识别、错误、重选/继续 | draft scan，不自动持久化联系人 | [04](04-acquisition.md) |
| O32 | 名片扫描 | 识别字段审核 | 可修改字段、不确定提示、确认意图、保存 | 确认 POST 是真正写入；字段缺失/冲突需可纠正 | [04](04-acquisition.md) |
| O33 | 名片/批次 | 重复联系人审核/确认 | 重复候选、人工选择、重复风险/第二次确认 | 不静默覆盖已有对象；具体合并规则按源码 | [04](04-acquisition.md) |
| O34 | 批次导入 | 项目详情、人工输入、失败恢复 | 上传/提取/审核状态、联系方式候选、替换/重试/跳过/确认 | 旧版/V2 接口不同；幂等/过期/取消/结束独立 | [04](04-acquisition.md) |
| O35 | 名片保存后 | 可编辑邀请/链接与结果 | 邀请准备中、草稿、复制/交接、失败 | 创建或复制邀请不等于发送；不默认触达对方 | [04](04-acquisition.md) |
| O36 | 活动目录 | 地图选中卡片 | pin、选中活动、活动简要内容/详情入口 | 仅有真实坐标才能地图；本地选中不是报名写入 | [05](05-events.md) |
| O37 | 活动详情 | 活动介绍/议程/会后回顾折叠 | 摘要/完整内容、展开/收起、阶段反馈 | 不同 stage 的默认展开不同 | [05](05-events.md) |
| O38 | 活动匹配 | 全部参会者目录展开 | 目录搜索/名单、查看依据与画像 | directoryOpen 不是另一路由；发布/权限门槛 | [05](05-events.md) |
| O39 | 活动匹配 | 参会者详情 dialog | 身份、画像/推荐依据、分组、请求交换/同意/婉拒/撤回/再次申请、关闭 | participant GET；交换接口带 revision 与开放时间 | [05](05-events.md) |
| O40 | 活动约谈 | 提议/反提/改期内联表单 | 候选时段、时区、备注/媒介等、提交/取消编辑 | appointments commands；确认前不能当已落日程 | [05](05-events.md) |
| O41 | 活动报名 | 问题/选项/补充自由文本/画像审核 | 问答卡片、生成/校验、提交/撤回反馈 | registration/interview/persona/application 分离；审核等待不是报名通过 | [05](05-events.md) |
| O42 | 活动交流记录 | 明确交流事实输入 | 用户输入、提交/失败 | 无明确输入不从签到/同桌推断交流 | [05](05-events.md) |
| O43 | 会后中心 | artifact/后续事项状态 | 未生成/处理中/已生成/失败、重试/刷新等可用动作 | 异步产物与确认跟进分开 | [05](05-events.md) |
| O44 | 会后跟进 | 采集 modal 与联系人选择 | 搜索对象、文字/录音、转写草稿、审核、显式保存/关闭 | contacts/search、voice-memos/transcribe、post-event/followup；不会无确认写事实 | [05](05-events.md) |
| O45 | 活动现场 | 参会者详情 bottom sheet | 个人画像、依据、组桌、联系方式交换与约谈相关权限、关闭 | desktop/mobile 来源一致但外形不同 | [05](05-events.md) |
| O46 | 运营 | 开始生成内联确认 | 耗时/生成成本与意图、确认/返回 | generations POST；不是打开页面就启动生成 | [06](06-operations.md) |
| O47 | 运营 | 管线/分片/组桌预览、错误恢复 | 生成状态、错误、两轮结果、重试/发布与回执 | 完成/发布分开；自动重试受限制且配置失败不重试 | [06](06-operations.md) |
| O48 | 角色管理 | 授予表单、撤销反馈 | 主体、角色/范围/期限、revision/error | 活动级 access 权限，不是全平台权限 | [06](06-operations.md) |
| O49 | 准入审核 | 申请者详情与审核决策 | 问答/画像/面试、批准/拒绝理由、容量/撤回/冲突 | selected application 状态；POST 决策，不造成功态 | [06](06-operations.md) |
| O50 | 体验编辑 | 草稿/预览/发布及问题编辑 | 基础信息、意图问题/选项、必填、添加/删除/预览/保存/发布 | draft/published/frozen 和版本冲突分开 | [06](06-operations.md) |
| O51 | 今日 | 安排约见 modal | 「约见服务暂未配置……」、按钮「知道了」 | 仅关闭，不创建约见/发送邀请/写日历 | [07](07-schedule-tasks-chat.md) |
| O52 | 今日/移动日历 | 月历 bottom sheet | 月份、日期、前后月、选日、关闭 | 本地选择；与主日历状态同步 | [07](07-schedule-tasks-chat.md) |
| O53 | 今日 | 时间轴/安排/决策展开与表单 | 事项来源、内容、详情、选择、确认/拒绝等 | 正确记录确认范围；不要把卡片展开当执行 | [07](07-schedule-tasks-chat.md) |
| O54 | 普通任务详情 | 内容/计划/到期/地点/提醒编辑 | 标题备注、日期/时间/时区、提醒、保存/取消、冲突 | tasks PATCH 与 reminders 独立；清空与缺省有区别 | [07](07-schedule-tasks-chat.md) |
| O55 | 普通任务详情 | 删除确认 | 对象、确认/取消、pending/error | tasks DELETE，显式确认 | [07](07-schedule-tasks-chat.md) |
| O56 | 个人安排 | 新建/编辑/删除确认子画面 | 标题、起止、时区、地点备注、保存/取消/删除 | schedule-items，selected 未选择/新建/编辑三态不同 | [07](07-schedule-tasks-chat.md) |
| O57 | 关系任务 | 完成结果/下一步表单 | 活跃目标、继续跟进/培育、内容日期、归档与历史任务处理 | connectionId lifecycle；版本/重复回执不重复写入 | [07](07-schedule-tasks-chat.md) |
| O58 | 画像 | 文字提取草稿与手动审核/预览 | 暂时提取结果、字段编辑、完整度/保存读回 | 提取≠保存，preview≠公开 | [08](08-profile-settings-admin.md) |
| O59 | 设置/记忆 | 创建/编辑与删除确认 | 类别、内容、开关、保存/取消/删除、冲突 | memory API；与反馈/私密笔记区分 | [08](08-profile-settings-admin.md) |
| O60 | 设置/反馈 | 记录详情/删除状态 | run 相关反馈与删除/失败 | feedback API，不是删除会话历史 | [08](08-profile-settings-admin.md) |
| O61 | 设置/自动化 | 自然语言草案、编译与试跑预览 | 复核类型、指令、计划/信号、结果审核、保存 | automations compile/dry-run 与持久化不同 | [08](08-profile-settings-admin.md) |
| O62 | 设置/自动化 | 已存 playbook 编辑/启停/运行/两步删除 | revision、开关、手动 run、确认/取消/反馈 | 只读能力边界；未试跑成功不伪装已实际执行 | [08](08-profile-settings-admin.md) |
| O63 | 设置/集成 | 授权、断开、健康检查、失败边界 | provider 配置/授权/健康/未配置、可用操作 | authorize/DELETE integration/POST health 不是同一动作 | [08](08-profile-settings-admin.md) |
| O64 | 开发面板 | debug 示例操作、敏感确认、Trace 展开 | 各能力特定表单/示例状态、证据/来源 | 仅 dev 可达；不可混进正式客户功能表 | [09](09-dev.md) 及相应域中的 dev 来源 |

上述编号是文档编号，不代表恰好 64 个 modal 实例，也不代表所有画面可用同一个角色同时打开。

## 2. 子 Tab、筛选与视图切换

| 所属界面 | 层级/维度 | 选项与区别 | 是否换路由/请求 | 证据 |
| --- | --- | --- | --- | --- |
| 首页 | 四幕/桌面移动呈现 | 主入口、产品说明、个人用户、活动方等对应源码幕；桌面/移动树分开 | 幕切换本地，不四条路由 | [01](01-entry-shell.md) |
| 公共导航 | 语言 | zh/en/ja 的文案能力按组件实际支持；部分组件仅 zh/en | 语言状态/保留参数；不是所有页面有完整三语内容 | [01](01-entry-shell.md) |
| 收件箱 | 第一层 Tab | 对话 threads / 提醒 alerts | 本地 Tab + 对应数据读取 | [07](07-schedule-tasks-chat.md) |
| 收件箱/对话 | 子画面 | 列表 / 详情 / 新建 / 草稿交接状态 | 同抽屉内；非额外 Tab 标签 | [07](07-schedule-tasks-chat.md) |
| iOrbit | 主视图 | 仪表盘 / 打开的对话 / 历史侧栏或抽屉 | 同工作区；会话 query/session 与恢复读取 | [02](02-ai.md) |
| iOrbit 历史 | 分组与菜单 | 全部/某分组、组织面板、移动菜单目标分组 | 本地选择 + 后端组织读写 | [02](02-ai.md) |
| 人脉列表 | 搜索与过滤 | 关系/来源等实际标签与条件，列表元数据展开 | 前端过滤/模型来源以明细为准；不要发明 API | [03](03-contacts.md) |
| 人脉进展 | 关系分类 | 来源支持的阶段分类与卡片 | 分类展示，不拖拽写 stage | [03](03-contacts.md) |
| 人脉分析 | 第一层 Tab | 概览 overview / 结构 structure / 机会 opportunities | 本地 Tab；路由支持 initialTab，graph alias 指向 structure | [03](03-contacts.md) |
| 人脉分析/结构 | 第二层维度 | 行业 industry / 地区 location / 角色 role / 关系 relationship | 本地切维度并清空选桶 | [03](03-contacts.md) |
| 人脉分析/结构 | 第三层选桶 | 每个维度的动态桶与缺失数据桶 | 本地选桶；成员详情另一路由 | [03](03-contacts.md) |
| 名片导入 | 来源选择 | scan 与各其他渠道入口；大量渠道仍未接通 | 本地来源区切换；不可用边界不写入 | [04](04-acquisition.md) |
| 名片/批次 | 工作流阶段 | 上传 → 识别/提取 → 人工审核 → 确认/重复确认 → 回执/邀请 | 不是必须每步都有 Tab；请求/写入必须显式 | [04](04-acquisition.md) |
| 活动发现 | 范围 | all / registered / upcoming / active / ended，按身份与 source 支持 | scope 参数与数据读取，不是五种活动实体 | [05](05-events.md) |
| 活动发现 | 展示方式 | 模块 modules / 地图 map | 本地切换；无坐标不能虚构位置 | [05](05-events.md) |
| 我的活动 | 状态过滤 | 当前实现 HomeFilter 的筛选标签/计数，桌面和移动树 | 过滤/上下文导航；不等于公开目录 scope | [05](05-events.md) |
| 活动详情 | 旅程阶段 | 会前 / 会中 / 会后及报名、审核、画像、结果发布状态 | 数据/权限状态，不是可随意切换以改变业务状态 | [05](05-events.md) |
| 活动现场 | 第一层 Tab | 现场主页 home / 推荐给你 recommendations / 全部参会者 attendees / 分组 table / 关系图谱 graph / 流程议程 agenda | 同页 local tab；table 有组号/座位条件 | [05](05-events.md) |
| 活动现场/分组 | 两轮安排 | 按真实 source 的轮次/桌号/座位与推荐理由 | 不是硬编码给每人「5 桌」 | [05](05-events.md) |
| 准入审核 | 处理范围 | 待审核 pending / 已处理 processed | 读取对应审核列表；选中申请为另一层详情 | [06](06-operations.md) |
| 最小权限签到 | 状态范围 | 全部 / 未签到 / 已签到，加搜索 | 本地展示/读取；签到 POST 是独立操作 | [06](06-operations.md) |
| 运营 | 生成/配置/结果状态 | 配置、生成中、失败、完成未发布、已发布、名单与签到等区 | 常为分区，不全是 Tab | [06](06-operations.md) |
| 报告 | 授权视图 | organizer_aggregate / attendee_report；两者均授权才提供切换 | 本地视图切换；GET 两份 endpoint 后依据权限显示 | [06](06-operations.md) |
| 今日 | 时间显示 | day / month、月份/选中日、移动月历 sheet | 本地日历状态；followups alias view=day | [07](07-schedule-tasks-chat.md) |
| 普通任务 | 状态 | 待办 open / 已完成 completed | GET tasks?status；切状态不修改任务 | [07](07-schedule-tasks-chat.md) |
| 关系任务 | 当前/历史/异常对象 | 与普通任务状态过滤独立，不同来源/生命周期 | 独立模型边界，不从普通任务完成推断关系更新 | [07](07-schedule-tasks-chat.md) |
| 个人安排 | 选择状态 | 未选择 / 新建 / 编辑已有项 | 本地 editor，保存才写 schedule-items | [07](07-schedule-tasks-chat.md) |
| 画像 | 输入方式 | text 提取 / manual 手动 | 提取 API 与保存 API 分开 | [08](08-profile-settings-admin.md) |
| 设置 | 多节，不冒称全部是 Tab | 外观、记忆、反馈、自动化、执行/集成 | 各节加载/编辑状态独立 | [08](08-profile-settings-admin.md) |
| 设置/记忆 | 分类 | 关于我、目标、偏好、边界 | 列表/表单条件；开关关闭不代表删除全部记录 | [08](08-profile-settings-admin.md) |
| 设置/自动化 | trigger/frequency | schedule / signal；once / daily / weekly；时区/周几或信号/重要性 | 按类型展示不同字段；compile/dry-run/save 分开 | [08](08-profile-settings-admin.md) |
| 开发能力 | 模式/契约/示例 | mock/hybrid/live、各能力特定操作与状态 | dev 来源，不能当正式路由 feature 开通依据 | [09](09-dev.md) |

## 3. 所有画面都要保留的状态轴

这不是让每个页面画所有排列组合，而是按真实服务能力确定：

- 身份：会话未知、匿名、已登录；个人与活动级主办方/审核/签到权限；无访问权。
- 数据：初次加载、空、部分可用、真实 source 缺失、配置缺失、资源不存在/过期。
- 写入：可编辑、校验错误、提交中、成功读回、幂等重放、ACK 丢失、revision 冲突、权限变化、失败可重试/不可重试。
- AI：未提交、预填、生成中、失败、可审核结果、确认/拒绝、交接；生成≠发布，草稿≠发送。
- 日程/关系：候选≠确认，完成任务≠完成沟通，交换≠对方认可关系目标，签到/同桌≠发生交流。
- 设备：桌面侧栏、移动菜单/底栏/sheet、滚动/键盘焦点；CSS 隐藏的另一树不算当前屏幕可见控件。

运行时目前未覆盖这些状态的全部组合；没有把静态条件分支冒称已验证画面。
