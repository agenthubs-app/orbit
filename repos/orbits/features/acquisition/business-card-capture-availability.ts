import {
  resolveFeatureMode,
  type FeatureMode,
} from "../../shared/config/feature-mode";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../shared/storage/live-database-config";

export type BusinessCardCaptureAvailabilityReason =
  | "ready"
  | "live_mode_required"
  | "ocr_provider_unconfigured"
  | "contact_storage_unconfigured";

export interface BusinessCardCaptureAvailability {
  available: boolean;
  contactStorageConfigured: boolean;
  mode: FeatureMode;
  ocrProviderConfigured: boolean;
  reason: BusinessCardCaptureAvailabilityReason;
}

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Resolves only configuration readiness. It never calls OCR, storage, or any
 * external provider, so rendering the import hub remains side-effect free.
 */
export function resolveBusinessCardCaptureAvailability(
  env: LiveDatabaseEnv = process.env,
): BusinessCardCaptureAvailability {
  const mode = resolveFeatureMode(
    env.ORBIT_MODULE_MODE ?? env.ORBIT_FEATURE_MODE,
  );
  const ocrProviderConfigured =
    configured(env.DEEPSEEK_API_KEY) ||
    configured(env.GEMINI_API_KEY) ||
    configured(env.GOOGLE_API_KEY);
  const contactStorageConfigured =
    resolveLiveDatabaseConnectionConfig(env) !== null;

  if (mode !== "live") {
    return {
      available: false,
      contactStorageConfigured,
      mode,
      ocrProviderConfigured,
      reason: "live_mode_required",
    };
  }

  if (!ocrProviderConfigured) {
    return {
      available: false,
      contactStorageConfigured,
      mode,
      ocrProviderConfigured,
      reason: "ocr_provider_unconfigured",
    };
  }

  if (!contactStorageConfigured) {
    return {
      available: false,
      contactStorageConfigured,
      mode,
      ocrProviderConfigured,
      reason: "contact_storage_unconfigured",
    };
  }

  return {
    available: true,
    contactStorageConfigured,
    mode,
    ocrProviderConfigured,
    reason: "ready",
  };
}
