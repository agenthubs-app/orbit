# BR-026 — 三类通知与统一持久记录

2026-09-16；Bridge协调者；web_status source_ready；app_status consumer_ready；verification_status verified（本地共同环境）。功能/主线e045651b3，用户授权本session0037～0040。

三类提醒/建议/动态记录与来源版本、read/disposition分离、CAS及幂等动作已实现。Web为契约真源；App副本由sync:contract生成。同账号Web与iPhone17Pro共用31037/隔离PG，真实提醒App读→Web回读、Web处理→App回读，源待办仍未完成；另有约谈确认和名片批次待复核。中日英、暗色大字号、原生Release和Web最终构建已验证。全量失败与局部修复、QA约谈前置授权夹具等限制见[0038报告](../repos/orbit-app/docs/sprints/0038-typed-notification-inbox/REPORT.md)。

0039消费新记录服务，不重写任务采纳；0040接实际工作器/Push与旧流切换。当前按精确actor开关灰度，API读取补业务投影，部分旧读取保留；通知分批扫描计算全局未读。模型发现、远程发布及provider→device未验收，BR-011缺项保持。本次未修改0033～0036同步实现，无新增AI/OCR费用。
