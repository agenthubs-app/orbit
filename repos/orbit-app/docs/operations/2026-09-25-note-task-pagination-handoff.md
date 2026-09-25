# 笔记关联任务分页交接

基线：根工作区`chat-agent` / Web与App共同父提交`f52812b1`；本批仅本地实现、验证，没有安装App或发布服务器。

NoteDetailScreen原先下载`/api/tasks`再过滤，现在使用`/api/tasks/note-page?noteId=…&limit=20&cursor=…`。页面显示全局总数、当前20条摘要；下一页替换，支持返回第一页和进入完整任务详情。完成/取消任务仍保留；摘要不带正文或历史。新契约与运行时schema由`npm run sync:contract`同步，不手改副本。

权限与失败：本人有效笔记确认后才加载；回执必须匹配actor/note，读取使用network-only，父级scope变化重建列表。接口缺失/失败不能展示假空页，也不能回退`/api/tasks`。这里只对本人任务按来源筛选，不给关联账号或联系人额外授权。

部署依赖：服务端新增端点、`orbit_records_tasks_note_source_idx`索引及至少32字节读取游标签名密钥先就绪，再发布App。旧App可继续使用旧接口，但不会获得本项节流收益；不能将源码同步等同手机已升级。

验证：本地真实NoteDetailScreen浏览器交互覆盖20→5条换页、回首页、任务链接、错误actor/note拒绝、读取失败和重试；笔记交互加契约/schema同步22项通过，零跳过。服务端本地PG证明增加1万无关任务后第一页仍3,202 B/1 SQL，使用来源索引。App完整类型检查通过；完整App回归结果在Web执行账本补记。没有实机、真实网络或生产流量验收证据。

未完成：笔记页关联事件名称读取仍使用旧事件列表；其他消费者、历史通知回填、剩余通知来源以及发布/生产流量验证继续开放。不修改根bridge里其他进行中的交接内容。

最终App全量3629项，3628通过、1失败、零跳过；唯一失败为已有5个Web页面缺原生路由：`/agent/actions`、`/agent/plan`、`/agent/strategy`、`/events/[id]/live`、`/profile/continue`。因此不能宣称跨端发布门全部通过。本批服务端完整类型检查通过；旧profile契约混入运行时代码另有Web契约检查失败，保留为独立缺项。
