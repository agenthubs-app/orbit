# BR-029 — 个人日程设置与独立详情

- 日期：2026-09-17；P1；source_ready/consumer_ready，verification blocked（实际业务验收未齐）。ROOT已接单；B唯一0053 run-01已结束，固定功能75151e986f0b91b696dda9d9da1dc0e4a467cc33及报告66b1a4a47300621e0ef2fa57169f275dad1631d5，不重开Generator。
- 授权：用户提供参考图要求编写并委派Sprint，复用既有提交、精确merge chat-agent、运行验证与push授权。
- Web：代码及必要0051读取/手机视口依赖精确合入chat-agent 27a45a2bedb19013e2f7f0bba6d3187bec369c74；未merge整Phone祖先。生产build退出0，BUILD_ID TK0eR2gz-zYC78Oh5wYoU，主3000 PID68625/句柄55802，health200/live，原费用ledger/guard不初始化或重置。
- App：新界面源码已合；Metro127.0.0.1:8082 PID69917/句柄63327 status running；主DA Simulator原构建96099退出0/BUILD SUCCEEDED，安装退出0、主包运行PID75083，实际RCT_jsLocation为127.0.0.1:8082。
- Phone：原父协调精确组合f4e1059a596ec18305c13490e240e2440e81a604已发布32100/32110，Backend BUILD WbjgA-0punhZpxu677_5j、supervisor80755/backend80766/front80768，dist-unset-origin指纹f50abcbc384735be15553b12cc7690791fbd2d6edde7f9fca5e2c66d915abd74。固定ngrok域名及冻结322xx未动；源非主线整祖先，保留Phone原报名/问卷/视口功能。

## 用户可见变化及契约

个人日程稳定/schedule/personal/<encoded-id>现在独立阅读，/edit编辑、/new新建；大标题、合并日期/起止时间、30/60/120分钟与当地全天，线上/线下与安全会议链接，关联自己可读取的人脉/笔记。Web没有虚构/app/notes页面，只在个人日程页点击关联精确noteId经现有认证GET只读查看；关闭/换scope清正文，不扩笔记source/ACL/写入。提醒/重复无执行能力明确未支持，不自动分享或外发。

个人/api/schedule-items集合和/:id GET/POST/PATCH/DELETE统一x-orbit-personal-schedule-version:2显式新表示；无header保持v1白名单，旧PATCH省略新字段不清除。沿用actor/workspace、expectedUpdatedAt、稳定幂等key与严格回执，再独立GET。新增可选allDay/timeZone/meetingMethod/meetingUrl/contactIds/noteIds，严格URL/IANA/当前关系权限校验；聚合不泄露URL/关系。同步副本走既有sync，不新建存储/通用离线协议；0051未齐v3、删除和离线生命周期不能因日程关联完成而关闭。

## 实际证据与开放验收

ROOT集成树和主线merge前write-tree一致：38b185431349c0e826cc358460de2ff4987d2644。实际完整App14文件179/179、Web9文件55/55、两端types0/guard0；日志在.worktrees/integrate-sprint0053-20260917/build/harness-state/evidence/sprint-0053/root-integration/。初次App151/152保存按钮超viewport失败保留；查明缺9fe7eea既有viewport后机械接入，未放宽assert。AppScreen/OrbitTabBar CRITICAL及首页映射HIGH仍适用；ROOT actual staged detect182符号/73路径，affected0不是零风险，linked图谱盲区UNKNOWN。

B原一次I App3128/3125pass/3fail、Web3621/3356pass/59fail/206skip均exit1；App运行期改测试带版本不确定性，后续定向通过不覆盖原失败。Web57名称匹配旧日志仅证明同名曾失败。固定REPORT保留原源SHA/偏差，不宣布全库绿色。

ROOT已实际原生点击新建30分钟日程→POST201→独立GET200×2→详情；改期页1小时快选18:00→19:00→PATCH200→独立GET200×2→详情；再改全天→PATCH200→GET200×2→详情。一次手动日期输入重复追加造成校验失败，纠正输入后保存，未冒产品缺陷。仅本次自建记录随后经编辑→删除→确认，DELETE200、集合GET200、日历0项且标题缺席；原有记录未动。服务脱敏精确记录指纹77fc892a，日志build/harness-state/evidence/sprint-0053/root-runtime/web-production-runtime.log及native-detail-30min.png；未provider调用、未重置预算。

实际原生显示缺陷：30分钟详情显示1,800秒、1小时显示3,600秒、全天显示86,400秒；Detail使用Intl.NumberFormat minute，Hermes差异仍待核因。全天半开结束日期直接显示次日亦待核显示语义。B只做独立只读诊断，不重开原run/第三repair；不能将mock绿色代替实际失败。

Web写→App回读：未运行；App写→Phone同账号同数据库回读：未运行。跨天/链接/关系、原生键盘字号和参考视觉矩阵仍未齐。代码/文档e369903a9已普通push退出0且ls-remote核一致，后续只含文档不改变运行源码27。build/health/Metro不是业务SC通过，Sprint保持blocked，实际进度与只读后续见ROOT checkpoint。

## Phone最终发布与失败保留

Phone App组合16完整文件196/196、两端types0；Web最初37/41四失败保留，固定成功消费者补齐后受影响完整17/17。原默认Turbopack跨root链接失败及错误导出保留；后端改用既有webpack成功，不重复成功build。第一发布前端残留127.0.0.1:32110导致公网同源错误边界；清缓存后的空字符串又被Provider判无效，第二产物QA本地失败、公网未跑。两次均回退既有确证可用前端，旧版公开登录恢复实证保留。最终仅unset API变量、独立TMPDIR/clear导出，compiled Provider只传browserOrigin并省略configuredBaseUrl；配置解析为导出后佐证，不伪记前置。先独立32410真实登录/读取通过并关闭preview，才IPC发布最终前端，不放宽安全校验/改产品。

最终原QA44559退出0：本地Chromium、公开Chromium、公开WebKit均登录到首页、account/history/v2个人集合200(count1)、新建页和已有同一详情200、JSerror0、非导航取消networkfailure0。原raw分别记录9/6/13次导航取消读取，不冒零请求失败；业务写0/model0，因此不证明保存或同actor跨端回读。ROOT完整实际读取final-release-receipt.json及原raw；证据在/Volumes/ORICO/Dev/phoneweb-runtime-20260916/private/release-0053-f4e1059a5/final-release-receipt.json与其private父目录phoneweb-0053-final-runtime-check-browser-receipt.json。当前产物复用Phone node_modules链接，非自足npm-ci包；prepareRelease工具空串配置错误另TODO，不动未提交工具或已验322xx。原生显示及同账号写回读仍缺，Sprint不completed。
