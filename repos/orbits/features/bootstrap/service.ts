import type {
  AppBootstrapFailure,
  AppBootstrapInput,
  AppBootstrapResult,
} from "./contract";
import {
  appBootstrapFailureContext,
  appBootstrapFailureToAppError,
} from "./contract";

export type AppBootstrapServiceResult<TResult> = TResult | Promise<TResult>;

// App Bootstrap service 定义应用启动时需要的一次性壳层数据读取能力。
// 它只暴露 contract 层的输入/输出，不关心 mock、live 或未来后端实现细节。
export interface AppBootstrapService {
  // 读取导航、账户状态、feature mode 等首屏依赖数据。
  getAppBootstrap: (
    input?: AppBootstrapInput,
  ) => AppBootstrapServiceResult<AppBootstrapResult>;
}

export {
  appBootstrapFailureContext,
  appBootstrapFailureToAppError,
};

export type {
  AppBootstrapFailure,
  AppBootstrapInput,
  AppBootstrapResult,
};
