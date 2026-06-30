// 模块模式是整个代码库的运行时切换约定：
// mock 用于可重复的本地/测试数据，live 用于真实 provider，
// hybrid 预留给“部分真实、部分 mock”的迁移状态。
export const MODULE_MODES = ["mock", "hybrid", "live"] as const;

export type ModuleMode = (typeof MODULE_MODES)[number];

// 默认必须保守地停在 mock，避免缺环境变量时意外调用真实服务。
export const DEFAULT_MODULE_MODE: ModuleMode = "mock";

export const NOT_IMPLEMENTED_ERROR_CODE = "NOT_IMPLEMENTED" as const;

export interface ServiceFactoryContext {
  capabilityId: string;
  requestedMode: ModuleMode;
}

export type ServiceConstructor<TService> = (
  context: ServiceFactoryContext,
) => TService;

export interface ServiceFactoryConfig<TService> {
  capabilityId: string;
  defaultMode?: ModuleMode;
  implementations: Partial<Record<ModuleMode, ServiceConstructor<TService>>>;
}

export interface ServiceResolutionSuccess<TService> {
  success: true;
  mode: ModuleMode;
  service: TService;
}

export interface ServiceResolutionFailure {
  success: false;
  error: {
    code: typeof NOT_IMPLEMENTED_ERROR_CODE;
    message: string;
    capabilityId: string;
    requestedMode: ModuleMode;
    availableModes: ModuleMode[];
  };
}

export type ServiceResolution<TService> =
  | ServiceResolutionSuccess<TService>
  | ServiceResolutionFailure;

export interface ModuleServiceFactory<TService> {
  capabilityId: string;
  defaultMode: ModuleMode;
  availableModes: ModuleMode[];
  create: (mode?: ModuleMode | string) => ServiceResolution<TService>;
}

// mode 可以来自 URL、测试入参或环境变量，所以统一做 trim/lowercase 和白名单校验。
function isModuleMode(value: string): value is ModuleMode {
  return MODULE_MODES.includes(value as ModuleMode);
}

function modeLabel(mode: ModuleMode): string {
  return `${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
}

export function resolveModuleMode(
  mode = process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
): ModuleMode {
  const normalizedMode = mode?.trim().toLowerCase() ?? "";

  if (isModuleMode(normalizedMode)) {
    return normalizedMode;
  }

  return DEFAULT_MODULE_MODE;
}

// 缺少某个实现时返回结构化失败，而不是直接 throw。
// API route 可以把这个失败转成稳定的错误响应，测试也能断言缺口。
export function createNotImplementedFailure(
  capabilityId: string,
  requestedMode: ModuleMode,
  availableModes: ModuleMode[],
): ServiceResolutionFailure {
  return {
    success: false,
    error: {
      code: NOT_IMPLEMENTED_ERROR_CODE,
      message: `${modeLabel(requestedMode)} service for capability "${capabilityId}" is not implemented. Use mock mode until a live provider is registered.`,
      capabilityId,
      requestedMode,
      availableModes,
    },
  };
}

// 每个 feature 的 service-factory 都通过这里注册实现。
// 调用方只依赖 capability interface，不直接 import mock/live 具体类。
export function createModuleServiceFactory<TService>({
  capabilityId,
  defaultMode = DEFAULT_MODULE_MODE,
  implementations,
}: ServiceFactoryConfig<TService>): ModuleServiceFactory<TService> {
  const availableModes = MODULE_MODES.filter(
    (mode) => implementations[mode] !== undefined,
  );

  return {
    capabilityId,
    defaultMode,
    availableModes,
    create(mode) {
      const requestedMode =
        mode === undefined
          ? resolveModuleMode(
              process.env.ORBIT_MODULE_MODE ??
                process.env.ORBIT_FEATURE_MODE ??
                defaultMode,
            )
          : resolveModuleMode(mode);
      const constructor = implementations[requestedMode];
      // hybrid 是迁移态：未替换成 hybrid provider 的 capability 继续走 mock，
      // 但 live 仍必须显式注册，避免误触真实外部系统。
      const hybridFallbackConstructor =
        requestedMode === "hybrid" ? implementations.mock : undefined;
      const resolvedConstructor = constructor ?? hybridFallbackConstructor;

      if (!resolvedConstructor) {
        return createNotImplementedFailure(
          capabilityId,
          requestedMode,
          availableModes,
        );
      }

      return {
        success: true,
        mode: requestedMode,
        service: resolvedConstructor({
          capabilityId,
          requestedMode,
        }),
      };
    },
  };
}
