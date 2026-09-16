# 个人日程设计与能力边界

## 唯一视觉参考

用户2026-09-16提供 [参考图](assets/personal-schedule-reference.png)，实际归档SHA256 `cd214c66f57cadaa1e395727b7186db1e5619c388cc4890b4e93c823265a39e7`。使用图中两部手机内的应用内容，不复制外部说明板、圆角手机框、9:41状态栏、电池或其他系统元素。截图中的姓名、公司、日期、标题和关联笔记仅是示例，不写入真实账号。

设计目标：保留现有Ink Signal主题、字体和图标体系，应用内容对齐参考图的信息层级。内边距约16，标题约24～28/800，时间约24/800，信息行至少44高；日期与起止时间放同一轻边框卡片，主保存／进入会议按钮深色，链接与操作用主题蓝。深色和大字号使用既有token，不硬编码图稿浅色。

## 当前实际源码

规划源码：主线8f00f91cd7e3637813e9b9d574b06f8dfefd1bf5及Phone固定f7c8a15123b78cfa732db10c7642573b921f3dfe。`PersonalScheduleScreen` 当前新建和查看都渲染同一个编辑器，标题／开始日期／开始时间／结束日期／结束时间／地点六个独立输入块；没有独立阅读详情。`PersonalScheduleList`、首页和日历都使用 `/schedule/personal/<encoded-id>`，保留此稳定详情地址。

现有认证接口 `/api/schedule-items` POST、个人集合GET、`/:id` GET/PATCH/DELETE具备owner校验、expectedUpdatedAt和idempotencyKey；持久源是actor/workspace下的personal_schedule_items，回执personal_schedule_mutations。当前个人DTO只包含基本标题/时间/地点，strict schema不接受新设计字段。canonical schedule有allDay/timeZone/meetingMethod但个人写入未接，不能只改UI或把“全天”写成24小时普通日程。

GitNexus绑定根仓库8f00，`PersonalScheduleScreen` context可定位真实编辑器/认证/服务器调用；wrapper没有映射incoming不代表没有路由消费者，以上真实地址已读源码确认。执行者对每个修改符号先impact，并追踪列表、schedule authority、Web客户端、AI schedule读取和离线schema的传递影响。

## 交互与数据约定

- 新建：顶栏取消／保存、底部保存日程；大标题后时间块。30/60/120分钟根据合法开始instant推算结束，跨午夜自动切换结束日期，保留用户明确改期；未改变原时间的编辑保留秒数与UTC instant。
- 日期／时间选择可以展开现有表单控件或轻量选择面板，不增加四行常驻输入，不凭当前设备日期替换已保存日期。全天采用该时区当地起始日期至次日日期的半开区间；DST日可能23/25小时，不以固定24小时推算。
- 详情：仅自己可见、大标题、起止数字/箭头、日期/实际时长/保存时区，地点与真实关联对象紧凑排列。无结束时间显示未设置，不杜撰默认30分钟。`今天`按所展示时区的真实日期判断。
- 编辑地址 `/schedule/personal/<encoded-id>/edit`；详情“改期”进同一编辑器并聚焦时间块，不先保存。成功正式回执后独立GET，再显示详情和已保存消息；新旧双保存按钮共用同步single-flight。
- 线上/线下映射meetingMethod video/in_person，线上可填meetingUrl，线下保存location；清除/切换需明确移除不再适用字段，不残留隐藏链接。链接只接受https/http完整URL，拒绝javascript/data/file等；打开必须用户点击，不自动访问或加入会议。
- contactIds/noteIds只表达自己的私有关联；验证当前actor/workspace可访问对象，最多50个/类、唯一ID。删除或撤权对象不再显示正文/身份，也不能因关联而扩权。截图“会出现在对方的跟进里”不实施为自动写其他用户数据；产品提示改为“仅你可见的日程关联”。
- 提醒／重复当前无个人日程完整执行接口，先真实能力盘点；不自动创建Push或周期实例、不将配置存储冒充生效。未支持时显示简短不可编辑说明，或不展示相关操作；已存在未知字段保留，不解释成“不重复/无提醒”。支持这些新执行能力另列后续工作，不暗中扩大本Sprint。
- 仅保存于Orbit的说明与时区附注合并，用户正文不翻译。联系人和笔记搜索复用现有有界认证接口；选择与详情跳转真实ID，不捏造记录或迁移旧备注。

## 协作锁

0050报名与0051笔记原Generator均已结束并释放所有源锁和执行槽。0053由现有B任务在独立worktree实施，执行依赖固定0051最终42fcd36208b1291b00371bc2e8777f02ff301e41，消费固定onBack/notes读取接口；关联笔记只改日程自己的关系，不修改笔记域，四字典本Sprint新增键由B独占。ROOT启动前登记唯一run-01与Planner哈希；真实服务／账号／Simulator仍ROOT独占。0051尚缺v3、删除和离线证据，日程只读关联不能掩盖这些未完成事项。
