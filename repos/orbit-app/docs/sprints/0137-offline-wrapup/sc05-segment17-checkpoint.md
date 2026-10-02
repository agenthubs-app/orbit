# Sprint 0137 · SC05 Segment 17 检查点

2026-10-03 JST。此文只登记部分验收证据；Sprint 0137 与 SC05 均未完成。

- A 线同一 run 在独立工作区 `/Volumes/ORICO/Dev/MacMovedData/dot-codex/worktrees/sprint-0137-offline-wrapup/orbit` 注册固定的 `segment-17-dynamic-no-db-exact-four`，仅含四个此前未接受的测试文件：`repos/orbits/tests/capabilities/orbit-ai-live-trace-store.test.ts`、`repos/orbits/tests/pages/app-canonical-agent-personal-scope.test.ts`、`repos/orbits/tests/pages/knowledge-wiki-page.test.tsx`、`repos/orbits/tests/pages/orbit-ai-trace-debug-page.test.tsx`。这些 harness 与证据文件位于被忽略的 `build/harness-state`，不构成产品代码提交。
- exact-set、源哈希、旧集合重叠和旧调用者兼容的 harness 测试按 RED→GREEN 执行，最终 10/10；runner/core/config 的 `node --check` 通过。运行前四个当前源哈希均匹配冻结清单，前 15 份已接受清单有 618 个唯一文件，与新四文件交集为零。
- 同一 A runtime HEAD `eb8f1491242ae2b00ed24bb188ee2f3ee6854bc1`、Server tree `d97e966830bb3e654e4f6167abf349c0f640e38d` 下，fresh `--check` 后仅运行一次受限 Segment 17：TAP **20/20**，0 fail/skip/cancel/todo，子进程及 wrapper 退出码均为 0；shared core 接受。运行器记录子进程数据库别名、provider 凭据、付费 AI、观察到的 INET 连接均为零，最低系统盘空闲 6,790,544 KiB。该观察不等于全机网络或数据库完全不变。
- 原始 summary SHA-256 为 `88e8ae33da5209f91a79b35949f489beb261968062fae5c6140a42870d2aa2f7`，TAP SHA-256 为 `33fab4d2212ad40f57b6a7f971828d81ab415c283d399ee7b3a9eeccc495e615`，空付费账本 SHA-256 为 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`。原 summary 把四文件误称为 “Six paths”；原件未修改，追加了 `*.correction.json`（SHA-256 `e296bdf1815bba129980630ca98fcc5fa1d595c6ce0ce4b79e74c6bf6b3e0be8`）。后验 5432 客户端出现四条 `node:96114`，属于受保护的既有 3000 服务；不能声称全机 PG 客户端列表不变，也没有证据显示测试子进程连接了数据库。
- 严格接受集现为 **622/926**，仍有 **304** 项未接受。SC04 的登录后九页原生签名／账号验收、SC05 的完整零失败验收仍缺失；不得把本段定向运行写成 Sprint 完成。测试后系统盘又低于 5 GiB，依约暂停依赖构建；没有清理用户数据、部署或 push。

原始证据保存在上述 A 工作区的 `build/harness-state/evidence/sprint-0137/run-01/`，文件前缀 `sc05-coordinator-2026-10-01-001-segment-17-dynamic-no-db-exact-four-attempt-1`。主线 GitNexus `orbit-root` 索引版本不兼容，文档路径影响分析返回 `UNKNOWN`；精确文本检索未发现新文件被代码引用，不把 `UNKNOWN` 视为低风险。
