# BR-029 — 个人日程设置与独立详情

- 日期：2026-09-17；P1；source_ready/consumer_ready，verification blocked（实际业务验收未齐）。ROOT已接单；B唯一0053 run-01已结束，固定功能75151e986f0b91b696dda9d9da1dc0e4a467cc33及报告66b1a4a47300621e0ef2fa57169f275dad1631d5，不重开Generator。
- 授权：用户提供参考图要求编写并委派Sprint，复用既有提交、精确merge chat-agent、运行验证与push授权。
- Web：代码及必要0051读取/手机视口依赖精确合入chat-agent 27a45a2bedb19013e2f7f0bba6d3187bec369c74；未merge整Phone祖先。生产build退出0，BUILD_ID TK0eR2gz-zYC78Oh5wYoU，主3000 PID68625/句柄55802，health200/live，原费用ledger/guard不初始化或重置。
- App：新界面源码已合；Metro127.0.0.1:8082 PID69917/句柄63327 status running；主DA Simulator native build原句柄96099运行中，尚未安装/验收。投资人321xx及冻结322xx保持旧产物，不能当0053部署。

## 用户可见变化及契约

个人日程稳定/schedule/personal/<encoded-id>现在独立阅读，/edit编辑、/new新建；大标题、合并日期/起止时间、30/60/120分钟与当地全天，线上/线下与安全会议链接，关联自己可读取的人脉/笔记。Web没有虚构/app/notes页面，只在个人日程页点击关联精确noteId经现有认证GET只读查看；关闭/换scope清正文，不扩笔记source/ACL/写入。提醒/重复无执行能力明确未支持，不自动分享或外发。

个人/api/schedule-items集合和/:id GET/POST/PATCH/DELETE统一x-orbit-personal-schedule-version:2显式新表示；无header保持v1白名单，旧PATCH省略新字段不清除。沿用actor/workspace、expectedUpdatedAt、稳定幂等key与严格回执，再独立GET。新增可选allDay/timeZone/meetingMethod/meetingUrl/contactIds/noteIds，严格URL/IANA/当前关系权限校验；聚合不泄露URL/关系。同步副本走既有sync，不新建存储/通用离线协议；0051未齐v3、删除和离线生命周期不能因日程关联完成而关闭。

## 实际证据与开放验收

ROOT集成树和主线merge前write-tree一致：38b185431349c0e826cc358460de2ff4987d2644。实际完整App14文件179/179、Web9文件55/55、两端types0/guard0；日志在.worktrees/integrate-sprint0053-20260917/build/harness-state/evidence/sprint-0053/root-integration/。初次App151/152保存按钮超viewport失败保留；查明缺9fe7eea既有viewport后机械接入，未放宽assert。AppScreen/OrbitTabBar CRITICAL及首页映射HIGH仍适用；ROOT actual staged detect182符号/73路径，affected0不是零风险，linked图谱盲区UNKNOWN。

B原一次I App3128/3125pass/3fail、Web3621/3356pass/59fail/206skip均exit1；App运行期改测试带版本不确定性，后续定向通过不覆盖原失败。Web57名称匹配旧日志仅证明同名曾失败。固定REPORT保留原源SHA/偏差，不宣布全库绿色。

Web写→App回读：未运行；App写→Web/Phone回读：未运行。SC05创建→详情→改期/全天/跨天/线上链接/当前关系、原生键盘字号/视觉、准确自建ID清理及适用push/远端SHA未齐。build/health/Metro不是业务SC通过。ROOT继续原native句柄→安装明确8082→同账号同数据库真实交互→必要合并树全量及远端闭环。尚无真实记录/provider/费用写入，服务及设备锁保持原owner。
