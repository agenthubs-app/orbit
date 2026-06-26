export const MODULE_MODES = ["mock", "hybrid", "live"] as const;

export type ModuleMode = (typeof MODULE_MODES)[number];

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
    create(mode = defaultMode) {
      const requestedMode = resolveModuleMode(mode);
      const constructor = implementations[requestedMode];

      if (!constructor) {
        return createNotImplementedFailure(
          capabilityId,
          requestedMode,
          availableModes,
        );
      }

      return {
        success: true,
        mode: requestedMode,
        service: constructor({
          capabilityId,
          requestedMode,
        }),
      };
    },
  };
}
