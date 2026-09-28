# Sprint W0020 — Preview 复验

**Plan revision:** 2（2026-09-28 由原 W0019 拆出）。**模式:** existing-codebase / single-generator。运行状态只在登记表。
**原需求:** RV-04（Preview 复验部分）。**单一目标:** 在 Preview 用测试账号复验关键场景并测量 Neon 流量。
**易读目标:** [GOAL.md](GOAL.md)。
**基线:** W0019 的 `chat-agent` HEAD。
**进入条件:** W0019 completed；用户已明确授权四项：①`--target preview` 部署；②Preview 库迁移；③Preview 打开 `ORBIT_GUIDE_DEMO`；④Preview 库写入测试数据。**任一缺失不启动 run**（不消耗 run-01），在登记表标 blocked 并列出所缺授权。

## 上下文包（从这里起步，不通读其他 REPORT）

- 必读：
  - `repos/orbits/AGENTS.md`「Free-Plan Cloud Budget」：先查当前额度，用显式的小操作预算；不跑批量种子、全量导出、keep-alive、无界 worker。
  - `docs/operations/free-staging-budget.md`：Neon `orbit-staging-20260917`／`orange-forest-30108072`（Free）、workspace `workspace:orbit-small-staging-20260917`、Vercel 项目只发 Preview、`vercel.staging.json` **没有 cron 和 Queue**（所以 Preview 验证不了维护调度链路，只验证页面与接口）；现有测试账号与私有配置位置；空库初始化保护。
  - `docs/operations/main-test-dataset.md`：已批准的只追加小数据集做法。
  - W0018 REPORT「交给 W0020」的关键场景（建议 1、2、4、8、10）；W0017 REPORT 流量表。
- 易错边界：
  - 部署只用 `--target preview` 和 `vercel.staging.json`；不碰生产项目、生产库和正式域名。
  - Preview 测试数据：不跑 W0016 的整套本地种子；按 `main-test-dataset.md` 写一个只追加、带预算的最小脚本，只建本 Sprint 需要的账号与数据，执行前 dry-run 并给出预计写入行数。
  - 不在 Preview 做真实名片识别（没有复制模型凭据）；场景 6 不复验。
  - 流量测量：复验前读一次 Neon 用量，复验结束后等待 30 分钟再读一次；只读取、不导出数据。

## 范围与文件

- 新建：Preview 最小测试数据脚本（`scripts/`，只追加、带 dry-run 与预算）。
- 修改：无产品代码；发现问题登记新 Sprint。

## 验收契约

| SC | 可观察行为 | 必需证据 |
| --- | --- | --- |
| SC-W0020-01 | 部署前核实：Preview 额度读数、要部署的 SHA、`vercel.staging.json`、目标库为 staging；预算写明（请求数、SQL 次数、返回字节上限） | REPORT 记录 |
| SC-W0020-02 | 关键场景在 Preview 桌面＋手机复验，记录 DOM、HTTP 与截图 | 证据目录 |
| SC-W0020-03 | Neon 流量：复验前、复验结束后 30 分钟两次读数；增量不超过预算的 2 倍，且不超过 W0017 对同等操作量的估算加 50%，否则判为异常并停下调查 | 读数表 |

## 最小测试与检查

- 档位：I。本地全量已在 W0019 做过，不重复。

## 失败与交接

流量异常或场景失败时停止后续云端操作，登记新 Sprint；结果交用户决定是否上线生产。
