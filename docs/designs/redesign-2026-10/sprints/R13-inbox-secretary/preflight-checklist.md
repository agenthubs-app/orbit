# R13 画板预检与数据来源（run-01）

2026-10-19，在 B 线静态设计稿服务 `:3351` 上，对 b5 #0–8/#65/#69、b11 #26/#27/#29/#30/#51 运行 `--list` 与 `board-preflight --no-variants`。合入 `origin/redesign@5d277cbe9` 后重跑，序号和缺口未变；最终记录为 `_evidence-b/R13/run-01/list-final-*.txt`、`preflight-final-b5/b11.*`。b8 无独立 R13 的 1024/390 板；b12 无 R13 补板。预检未报告画板内数值自洽错误；`9/3/8` 等数量来自不同演示状态，不能拼作一份数据。

| 元素 / 状态 | 本期真实来源或操作 | 决定与缺口 |
| --- | --- | --- |
| 通知、消息未读数 | `GET /api/inbox/summary` 的 `notifications.unreadCount`、`messages.unreadCount` | 不按当前页行数重算；每日分组只改呈现。 |
| 通知标题、时间、分类、来源 | `/api/inbox/notifications` 的 `items`、`kind`、`sources`、`occurredAt`、`dueAt`、`target` | 秘書由 D-15 来源筛选；失效来源脱敏；`mail_summary` 隐藏。 |
| 秘書首页三张与更多 | `/api/inbox/secretary/preview`，`items`、`hasMore` | live 可用时才显示；无合格活动为空。 |
| 既読、追加、不要、稍后 | `actions` 与通知 action API 的 revision/idempotencyKey | 逐行按能力展示；事件无 snooze，不能画 `1時間後` 假按钮。 |
| Gmail 连接、线程 | 现有集成授权和已准许的线程元数据 | 只在可用状态显示；无正文/摘要；外部回复保持草稿。 |
| Orbit 站内线程及发送 | 现有 conversation、read receipt、outbox/上传 | 真实发送分支缺板，保留业务并请求补板。 |
| 活动期限/准备/推荐内容 | R27 通知、R26 评估、每日规则推荐和实际活动事实 | 无真实价差、人数、emoji chip 字段时隐藏；不照搬示例数值。 |
| 搜索、详情与设置 | 现有线程搜索、通知目标/来源深链、现有可用设置路由 | 搜索须真的过滤；R14 设置尚未交付时不画入口。 |
| 示例标签与数字 | `sample: true` 的同一 demo world | 仅开发演示；生产不含示例。 |
| `7:50 にまとめて`、每日上限/静音 | R14 推送批次与偏好 | R13 无批次数据，隐藏文案。 |

## 板状态

| 画板 | 结论 |
| --- | --- |
| b5 #0/#1/#3–6/#8/#69 | 仅作已有浅色/深色状态对照；其中空态、少量、线程文案仍须按实际能力裁剪。缺失的宽度/主题标「设计稿无，附截图，不进门禁」。 |
| b5 #2/#7/#65；b11 #26/#27/#51 | 含 D-16 邮件要约，R13 门禁作废；可只看布局结构，须主会话补无邮件版本。 |
| b11 #29/#30 | 活动详情结构参考；数据必须取真实活动。#30 四个 emoji chip 无对应字段时不显示，请主会话补无 chip 状态。 |
| b8/b12 | 无独立 R13 板；Web 1024/390、多数深色、App 真实站内发送分支均缺板。 |

预检缺 token 主要是装饰性 phone/web 外框、岛、外边距，按规则 13 不实现；内容中的行高约 `1.45`、`16.33px` 间距、`0.01em` 字距、Web 选中阴影须由 A 线给出 kit/token 对应值。B 线不私造组件或硬编码近似值。

## 请求

| 接收方 | 所需交付 | 验收依据 |
| --- | --- | --- |
| 主会话（共享画板） | b12 追加无 mail 的 A-R13-03/06、W-R13-03/05 浅深版；补 Web 1024/390、各缺深色、Orbit 站内发送、无事实 chip 状态 | 新稳定 ID 后重跑 `--list`、预检、像素门禁。 |
| A 线（组件/token） | 明确内容行高、间距、字距、选中阴影 token；`CategoryTabs` 的选中项在 RN Web `role=tab` 上缺 `aria-selected`，请让选中状态也可被浏览器辅助技术识别；若现有 `Segmented`/`UnderlineTabs`、`SwipeRow`、两栏详情不能表达认可板，补相应属性 | `relationship-inbox-lifecycle` 的选择状态断言及组件门禁；组件与 token 合入后，B 线逐屏最多三轮重比。 |
| D/C 线 | D 首页正式 🔔 到通知 tab、与统一未读一致；D 确认后 C 去マイページ `ShellInboxRow` | 交付提交号及实际点击/数值截图。 |

旧板 b5 #9–13、b11 #31/#32 属 R14，不纳入 R13 门禁。
