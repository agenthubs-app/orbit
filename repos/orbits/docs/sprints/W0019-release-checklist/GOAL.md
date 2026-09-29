# Sprint W0019 — 上线清单与大目标收口

## 要实现什么

交给用户一页可以逐条核对的生产上线清单（`RELEASE-CHECKLIST.md`），并在本地合并树上做一次大目标 2 收口的全量测试对照。生产环境只做**只读**核查，任何写操作、部署、迁移、改开关都不在本 Sprint 内。

## 做完能看到什么

- `docs/sprints/W0019-release-checklist/RELEASE-CHECKLIST.md`，每一项都写明状态（已核实／待核实／阻塞）、证据、负责人（用户／协调者）：
  - **发布门**（部署前必须完成）：
    - W0025 运行时：生产 Vercel Node/ICU/Unicode 与 Neon PG 版本、编码、`und-x-icu` 排序规则元组，是否匹配跟进排序白名单和联系人搜索的核准组合。
    - 公开活动目录：生产里有没有「已发布但没激活 canonical」的活动。
    - 流量总账：用户路径 ≤1.2 GB，`/api/account/me` ≤2.5 GB，登录检查 ≤3.0 GB，与 Neon 免费额度 5 GB/月对照。
  - 上线步骤：
    - 发布 SHA（生产当前落后主线）。
    - 迁移顺序与回退。
    - `ORBIT_GUIDE_DEMO`／`ORBIT_GUIDE_DEMO_SINCE` 的取值。
    - 维护任务。
  - 上线后核对：
    - D32 规定每周看一次 Neon 出站，到 3.5 GB 启动下一轮瘦身或升级套餐。
    - W0021、W0028～W0032 要求的 Neon 语句返回量核对。
  - 后续候选：去重后列成清单，供用户排序，不在本次发布范围。
- 大目标 2 收口的本地全量对照：
  - 基线 `c61ecbc2`（大目标 2 开始前）对照当前 `chat-agent`。
  - 附已知偶发失败和基线失败清单，以及一次本地生产构建。

## 前置

W0018、W0021～W0033 均已 completed（已满足）。只读核查由协调者用 Neon／Vercel MCP 代为执行，或由 Generator 在有工具时按清单执行。需要部署才能核实的项交 W0020，须用户另行授权。

完整验收项见 [PLANNER.md](PLANNER.md)。当前状态见[登记表](../README.md#sprint-登记表)。
