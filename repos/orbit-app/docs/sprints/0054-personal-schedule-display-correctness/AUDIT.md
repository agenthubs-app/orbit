# Sprint0054 — 实际失败与边界

2026-09-17 JST；ROOT产品基线27a45a2bedb19013e2f7f0bba6d3187bec369c74，后续主线文档1bc3b13c8不改变产品；Phone产品f4e1059a596ec18305c13490e240e2440e81a604。

ROOT已在主DA设备、安装新主包并实读127.0.0.1:8082后，实际新建18:00–18:30→POST201/独立GET200→详情显示1,800秒；改期1小时→PATCH200/GET200→3,600秒；全天→PATCH200/GET200→86,400秒及17日/18日。仅自建记录已删除/GET集合200/日历0项，原日志和截图留在ignored build/harness-state/evidence/sprint-0053/root-runtime/。

personalScheduleDetail的durationMinutes=(endsAt-startsAt)/60000，仍为实际分钟；PersonalScheduleDetailScreen使用Intl.NumberFormat的unit minute。B独立只读对照报告同formatter在Node22/隔离Chromium保留minute，而真实原生换成seconds；支持运行时单位格式边界，不证明记录算错，也未独立检查当前二进制内部实现。最小修正复用既有home.durationMinutes插值，不升级引擎/全局polyfill/再次除60。

App详情VM和Web PersonalDetail直接读取endsAt的当地日期，但全天沿用半开[start,end)。既有home/calendar读取endsAt-1ms得到实际占用末日；这一阅读投影可以复用。不能减24小时、用分钟/1440推天数或修改canonical/editor排他结束。

0053原Generator已closed，原App/Web全量失败及原生显示失败必须保留。0054只承接这两个新确认的显示边界，不克隆旧Sprint或降低SC。0052现A独占matching契约及四字典；本修正消费既有文案，无字典/共享schema写入，不抢0052源或运行环境。GitNexus当前刷新受原生worker崩溃影响，由ROOT独占处理；计划编制不编辑产品符号，启动前仍须实际impact。
