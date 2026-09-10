# 2026-09-10 原生验收续查

范围：用户要求继续解决运行中切换系统字号，以及键盘、非空成员与原生成功内容的验收缺口。本次为诊断和只读验收，未修改产品代码、依赖或后端数据。版本为仓库 HEAD `a7f42c78`；此前全量测试结果不作为本次重新执行的结果。

## 已确认的字号故障

环境：iPhone 17 Pro 模拟器，iOS 26.4，402pt，当前 Orbit 开发包；安装源码和 Pod lock 为 React Native 0.86。没有重启应用来掩盖运行中切换问题。

复现：保持 `/schedule` 页面打开，将系统 content size 从 `large` 改为 `accessibility-medium`。标题、分段控件和日期标签出现中部裁切；字号恢复 `large` 后恢复正常。

本次还在个人资料、人脉总览、仪表盘和 AI 页面观察到正常重排，说明故障不是所有页面每次必现。不能用单次正常截图关闭。

只读 LLDB 调试确认实际二进制的开关：

- `enableFabricCommitBranching()` 为 `false`。
- `enableFontScaleChangesUpdatingLayout()` 为 `true`。

日程上 36pt 高文本节点的针对性断点，命中 JavaScript 线程：

| 数据 | 实测 |
| --- | --- |
| `progressState` 的当前原生 `baseShadowNode` 高度 | 64.333328247070313 |
| 状态合并后克隆节点的 `fontSizeMultiplier` | 1.7860000133514404 |
| 同一个克隆节点的高度 | 36 |
| 同一个克隆节点的 `getIsLayoutClean()` | true |
| 合并输入 | props 为空，state 非空 |

调用链：`progressState` (`ShadowTree.cpp:175`) → `ShadowNode::clone` → `ConcreteComponentDescriptor::cloneShadowNode` → `YogaLayoutableShadowNode::completeClone` → `ParagraphShadowNode::shouldNewRevisionDirtyMeasurement` (`ParagraphShadowNode.cpp:67`)。最后的方法只判断 props 是否非空，因此这次仅 state 更新不触发重测。原生字号通知已完成一次正确的测量，随后状态合并把新文字状态与旧 Yoga 尺寸重新组合。

首个宽泛断点命中过固定大小的图标文本，不能证明故障；上表是随后专门针对 36pt 高节点的测量，且断开调试器后再次观察到日程标题 AX 高度为 36，并目视确认截图裁切。未通过调试器改返回值或修改节点数据。

上游有与此现象一致的未关闭问题：[React Native #57512](https://github.com/react/react-native/issues/57512)。本地上述调用链是独立证据，不把 issue 描述当成本地修复证明。

原始截图（本机临时证据，不提交图片）：

- `/tmp/orbit-fontscale-20260910-schedule-accessibility-medium.png`
- `/tmp/orbit-fontscale-20260910-schedule-confirmed.png`

风险：GitNexus 对 `ParagraphShadowNode` 返回 `Target not found` / `UNKNOWN`，第三方源码未收录；不是 0 影响。人工源码及运行时路径表明这里是全 App 原生 Text 的共享测量路径，按高风险处理。尚未实施或验证任何修复。

## 本次补充的真实原生状态

| 项目 | 结果与边界 |
| --- | --- |
| 登录键盘 | 浅色、正常字号；软件键盘确实弹出。滚动后邮箱、密码和登录按钮完整位于键盘上方。未输入凭证、未登录。 |
| 个人资料键盘 | 浅色、正常字号；聚焦“关系目标”后键盘确实弹出。滚动后该多行输入框及“保存资料”完整位于键盘上方。未输入、未保存。 |
| 活动报名 | `/events/event_signup_02/register` 显示真实活动、可跳过问题、选项、补充输入和确认按钮。未选择或提交。此前错误 ID 的 NOT_FOUND 不再作为该页唯一证据。 |
| 参会者 | `/events/event_signup_02/attendees` 成功读取活动，名单为空；不是非空名单验收。 |
| Party 三页 | `event_signup_02` 的 overview、checkin、graph 都显示实际活动；计数为 0，签到未连接、关系分组为空。不是签到成功或非空关系图验收。 |
| 运营控制台 | `event_08`、`event_signup_02` 都返回“尚未配置运营规则”；连同此前 `event_02`，可见的三个 owner 活动都没有配置成功样本。 |
| 报名审核 | owner `event_02` 可进入待审核/已处理界面，队列为空；不再仅有权限失败，但没有非空申请人。 |
| 运营签到 | owner `event_02` 可进入签到台，名单为空；不再仅有权限失败，但没有非空签到名单。 |

键盘证据已目视检查：`/tmp/orbit-keyboard-20260910-login-scroll.png`、`/tmp/orbit-keyboard-20260910-profile-scroll.png`。上述活动页面保留了 `/tmp/orbit-native-20260910-*` 截图与 AX 读取记录；活动截图尚未逐张目视复核，所以本表只声明实际读取状态，不声明所有活动版式验收通过。

## 非空验收仍需保留的边界

- 结构详情、relationship chat、权限非空状态，以及活动运营/审核/签到的非空内容，现有真实数据不足；应使用隔离的原生只读测试响应，不能向真实业务库写入样本或绕过权限。
- Admin 当前没有权威成员目录接口。`adminToView` 从 profile 的旧顶层字段投影最多一条伪成员；当前共享 profile 的 `displayName`、`role`、`handles.email` 不代表管理成员身份。不得为了显示非空行而修改生产映射，把普通用户资料包装为管理员身份。
- Admin 的非空 MemberList 可以做明确标为布局验证的隔离样本，但不能称为后台成员、角色或权限业务验收。
- 正常字号键盘观察不能替代大字号/深色验收；字号原生问题修复后还需复查这些组合。

## 拟议下一步（尚未批准、尚未实施）

1. 保留当前 RN 版本，制作可复现安装、可移除的原生补丁：在文字字号状态变化导致节点克隆时使旧测量失效；先建立能复现状态合并问题的失败回归，再修复和重建模拟器包。避免整屏重挂载，保留编辑草稿、焦点和路由状态；不关闭系统字号缩放。需检验双向切换、重复切换、正常启动及跨页面行为。
2. 补充与生产入口隔离的原生 QA 入口/构建，只提供现有屏幕所需的只读测试响应，所有写请求必须显式拒绝。覆盖上面的非空视觉缺口，Admin 样本只作布局验证。测试响应不进入真实用户缓存或持久化数据。

这涉及原生依赖修复和新的测试装配路径，需要先确认设计；不以此前 UI 设计审批自动批准新的原生依赖方案。未执行 commit、push、部署、清理或业务写操作。调试断点均已删除、进程已 detach；系统字号已恢复 `large`。
