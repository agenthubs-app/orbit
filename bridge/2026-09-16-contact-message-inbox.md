# BR-025 — 联系人真实消息独立收件箱

2026-09-16；Bridge协调者；总状态 verified，web_status source_ready，app_status consumer_ready，verification_status verified（本地共同环境）。用户授权本session实现0037～0040并按规则集成chat-agent。

Web/App功能与主线均 a591494b0。消息为默认入口，通知独立；按actor/服务记住页签，真实姓名和原文，独立计数、外层未读点。现有 conversations接口追加可选cursor/unreadTotal，旧App兼容；显式发送requestId幂等，已读只推进对方消息游标。原生收件箱回复已真实发送，不再只保存草稿。

在live生产Web31037、隔离PostgreSQL和独立iPhone17Pro QA bundle，用两合成测试账号完成Web发→对方回复→App回复→同账号Web重开，响应丢失重试仅一条，15秒前台到达与独立全部已读。账号迟到/失败隔离由行为测试验证，原生中日英/暗色/大字号已检查。两端typecheck、Web最终生产构建、原生构建通过；全量曾失败及局部修复/基线比较如实见[0037报告](../repos/orbit-app/docs/sprints/0037-contact-message-inbox/REPORT.md)。

未做远程发布、真实Push或新通知类别；BR-011仍保留Push缺项。服务分页不是数据库级会话分页，前台刷新回到第一页。0038继续接统一通知记录，0039/0040接线前核对0036/0035。原服务/其他Simulator未接管，无外部真实联系人消息、无新增AI/OCR费用。
