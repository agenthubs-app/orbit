# Sprint 0125 — 浏览器版笔记进本地镜像

**Plan revision:** 1。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** 0108 REPORT 第 9 节第 1 条，用户 2026-09-27 回复「Yes」：phoneweb 断网也要能看笔记。
**单一目标:** 浏览器端把 `notes` 加入本地镜像白名单，笔记页在浏览器上本地优先，并更新威胁模型文档。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** 0127 合并后的 `chat-agent`（开工时追加提交号）。执行顺序：0126 → 0127 → 0125 → 0109。
**进入条件:** 用户已决定（2026-09-27）。不涉及 UI 新样式，沿用 0108 的断网提示条与「需要联网」禁用态。

## 已查明的事实（2026-09-27）

- 白名单：`repos/orbit-app/src/data/sync/web-mirror-storage.ts:4` `WEB_MIRROR_DOMAIN_IDS = ["tasks", "personal-schedule"]`；`sync-lifecycle.web.ts` 只为白名单域绑定作用域与拉页。
- 威胁模型：`repos/orbit-app/docs/phoneweb/local-mirror-threat-model.md` 第 1 节表格「白名单域」一行与第 2 节 `notes` 一行（「否…留待第二批评估」）。
- 0108 已给原生做了笔记本地优先：`src/screens/notes/notes-source.ts`（原生）与 `notes-source.web.ts`（浏览器，目前走在线）；`note-source-tasks-source.web.ts` 同理。原生侧的镜像读取逻辑在 `src/view-models/notes-mirror.ts`。
- 浏览器加密只覆盖 `sync_records.payload_json`（AES-GCM，每条独立 IV），`record_id`、修订号、时间戳为明文元数据。

## 范围与文件

1. `WEB_MIRROR_DOMAIN_IDS` 加入 `notes`；浏览器端 `notes-source.web.ts`、`note-source-tasks-source.web.ts` 改为与原生相同的本地优先读取（尽量复用 `notes-mirror.ts`，不另写一套）。
2. 断网：笔记列表、详情显示「截至」，新建、编辑、AI 总结等写入入口禁用并提示需要联网（与 0108 原生一致）。
3. 威胁模型文档：第 1、2 节把 `notes` 改为「是」，写明「用户 2026-09-27 决定」、接受的风险（同源脚本可使用密钥解密笔记正文，包括联系人笔记中的第三方内容）、现有缓解（按源隔离、换身份清库删钥、撤权按 epoch 清空、非 secure context 不落盘）。
4. 已有设备：浏览器里新增一个域，协调器应自动开始拉取；确认不需要清库重建。
- 排除：原生端；服务端；新增同步类别；断网写。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-0125-01 | 浏览器落盘的笔记正文是密文（直接读 OPFS 库看不到正文），元数据按文档所述为明文 | 浏览器测试（先 RED） |
| SC-0125-02 | 换账号、换服务器、撤权（租约不含 notes）后，浏览器里不再有上一身份或被撤域的笔记行 | 浏览器测试（先 RED） |
| SC-0125-03 | 浏览器版笔记列表与详情本地优先；断网显示「截至」、写入入口禁用；在线写入后本地随之更新；网页改动下一次同步后可见 | App 测试 + phoneweb 双账号在线/断网截图（`localhost`，secure context） |
| SC-0125-04 | 非 secure context 仍然不落盘，笔记页回到在线读取且不报错 | 浏览器测试 |
| SC-0125-05 | 威胁模型文档已更新；两端全量无新增失败；typecheck 通过 | 文档 diff + 摘要 |

## 测试

- 档位 M。开发集：0077 的浏览器镜像测试、0108 的笔记本地优先测试；收口：两端全量各一次。
- 运行时：本地生产构建 3100 + phoneweb（`localhost`），双账号，Playwright `setOffline`。付费调用上限 0（注意笔记详情的「AI 总结」不要点）。

## 失败与交接

若发现浏览器端加一个域需要清库重建（例如 schema 版本绑定域列表），在报告里写明对已有浏览器用户的影响（一次重新拉取），不另做迁移。
