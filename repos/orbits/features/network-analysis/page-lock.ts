/**
 * R11b（PLANNER §2 B-1）：人脈分析整页锁的服务端入口。规则本体在两端共用的
 * `shared/compute/network-analysis-page-lock.ts`（App 经 sync:contract 拿副本，不能 import 服务端文件）。
 *
 * 只给 R11b 分析页与它的数据加载路径用；`analysis-threshold.ts` / `analysis-threshold-reader.ts`
 * 的 3 位已确认联系人门槛保持原样，只约束快照生成 / 重算（R11a 详情、R28 引导照旧调用它们）。
 */
export {
  NETWORK_ANALYSIS_STABLE_CONTACTS,
  NETWORK_ANALYSIS_UNLOCK_CONTACTS,
  networkAnalysisPageLock,
  type NetworkAnalysisPageLock,
} from "../../shared/compute/network-analysis-page-lock";
