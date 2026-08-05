# 活动运营中心与活动范围角色

`/app/events/center` 是按当前登录账号过滤的运营活动入口。它不是工作区级后台，也不显示或授权其他活动：一条活动仅在以下任一条件满足时出现：

- 当前账号是 Event Core 中该活动的 organizer；
- 当前账号拥有该活动一条有效的委派角色记录。

负责人由已完成 cutover 的 Event Core organizer 派生，不会写成可撤销的委派记录。委派记录保存于事件访问控制的版本化 assignment head/version 存储；撤销后不再出现在有效成员表，但保留版本号以支持安全地重新授予。

## Canonical cutover

运营入口、标题、地点、时间和角色授权只读取 Event Core v2 字段（`lifecycle_state_v2` 是 cutover 标记）。不得为旧 `event_ops_events` 行再接入 `orbit_records`、公共目录或其他 legacy read-through 来补齐展示；那会把活动域分裂固化为双读路径。

如果一个历史角色记录对应的活动尚未完成 Event Core cutover，中心只会显示“活动资料待迁移 / 迁移待确认”的受控卡片：不展示旧标题、地点、时间或角色，不提供详情、运营、签到、分析或角色管理链接。assignment GET/PUT/DELETE 和所有 capability guard 同样会拒绝该活动，直到经过审核的 Event Core backfill/operator 流程写入 canonical Event Core record。中心卡片用于提示待迁移事项，不构成授权。

## 角色边界

| 角色 | 中心可见入口 |
| --- | --- |
| `owner` | 运营台、签到台、角色管理 |
| `operations` | 运营台、签到台 |
| `check_in` | 签到台 |
| `reviewer` | 仅显示“审核入口待实现” |
| `read_only_analyst` | 活动汇总分析 |

页面入口只是降低误操作；服务端仍以事件 ID、当前 actor 和 capability 逐请求判定。角色管理页和 `GET /api/events/:id/access/roles` 都只允许该活动的 Event Core organizer。不得通过工作区成员资格、全局运营角色或活动标题猜测来扩大可见范围。

## 变更与并发

角色管理 UI 在每次 PUT 或 DELETE 前请求该 subject 的 assignment head，并把刚读取的 `expectedRevision` 写入请求。这样即使已撤销账号不在有效列表中，重新授权也会使用其保留的最新版本；服务端返回冲突时，UI 刷新成员表并要求管理员确认后重试。

## 当前账号标识输入

当前授权边界只接受并显示精确 `actorId`。这是有意为之：本系统尚未接入一个经过授权、可审计的人名/邮箱目录，因此页面不把 actor ID 伪装成姓名，也不提供全库模糊搜索。输入框会明确标为“账号 ID（精确值）”。

### P1：精确邮箱解析器

后续如需“按邮箱添加”，应新增一个只接受完整、规范化邮箱的受控解析端点，而不是在浏览器或角色存储上做模糊查询。建议边界为：

1. 仅活动负责人可调用，并先完成当前活动的 `roles.manage` capability 检查；
2. 以认证身份源的精确、规范化邮箱匹配返回单一 actor ID；零个或多个匹配一律要求人工处理；
3. 不在活动中心批量枚举工作区成员，不返回无关账号资料；
4. 前端把解析结果显示为“已解析账号 ID”，授权请求仍携带 actor ID 与版本号；
5. 为解析动作记录调用人、活动、输入的脱敏指纹、结果和时间，遵守身份源的可见性与保留规则。

在该解析器落地并完成权限审查前，继续使用精确 actor ID。
