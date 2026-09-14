import type {
  AccountLanguagePreferenceSaveContract,
} from "../../shared/contract/account-language-preference";
import { parseOrbitLanguage } from "../../shared/i18n/orbit-language";
import {
  ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS,
  type AccountLanguagePreferenceService,
} from "./contract";
import type { AccountLanguagePreferenceProvider } from "./storage/account-language-live-record-provider";

const mutationPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isExpectedVersion(value: unknown): value is string | null {
  return value === null || (
    typeof value === "string"
    && timestampPattern.test(value)
    && Number.isFinite(Date.parse(value))
  );
}

function parseSaveInput(
  input: AccountLanguagePreferenceSaveContract | Record<string, unknown>,
): AccountLanguagePreferenceSaveContract | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const mode = input.mode;
  const language = typeof input.language === "string"
    ? parseOrbitLanguage(input.language)
    : null;
  if (
    !isExpectedVersion(input.expectedUpdatedAt)
    || typeof input.mutationId !== "string"
    || !mutationPattern.test(input.mutationId)
  ) return null;
  if (mode === "system" && input.language === null) {
    return {
      expectedUpdatedAt: input.expectedUpdatedAt,
      language: null,
      mode,
      mutationId: input.mutationId,
    };
  }
  if (mode === "manual" && language) {
    return {
      expectedUpdatedAt: input.expectedUpdatedAt,
      language,
      mode,
      mutationId: input.mutationId,
    };
  }
  return null;
}

export function createLiveAccountLanguagePreferenceService({
  now = () => new Date().toISOString(),
  provider,
}: {
  now?: () => string;
  provider: AccountLanguagePreferenceProvider;
}): AccountLanguagePreferenceService {
  return {
    async read({ actorId }) {
      if (!actorId.trim()) {
        return {
          success: false,
          error: ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS.LANGUAGE_PREFERENCE_ACTOR_REQUIRED,
        };
      }
      try {
        return { success: true, data: await provider.read(actorId) };
      } catch {
        return {
          success: false,
          error: ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS.LANGUAGE_PREFERENCE_READ_UNAVAILABLE,
        };
      }
    },
    async save({ actorId, input }) {
      if (!actorId.trim()) {
        return {
          success: false,
          error: ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS.LANGUAGE_PREFERENCE_ACTOR_REQUIRED,
        };
      }
      const mutation = parseSaveInput(input);
      if (!mutation) {
        return {
          success: false,
          error: ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS.LANGUAGE_PREFERENCE_MUTATION_INVALID,
        };
      }
      let result;
      try {
        result = await provider.save({ actorId, mutation, updatedAt: now() });
      } catch {
        return {
          success: false,
          error: ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS.LANGUAGE_PREFERENCE_SAVE_UNAVAILABLE,
        };
      }
      if (result.kind === "saved") return { success: true, data: result.receipt };
      const code = result.kind === "version-conflict"
        ? "LANGUAGE_PREFERENCE_VERSION_CONFLICT"
        : result.kind === "mutation-reused"
          ? "LANGUAGE_PREFERENCE_MUTATION_ID_REUSED"
          : "LANGUAGE_PREFERENCE_SAVE_UNAVAILABLE";
      return {
        success: false,
        error: ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS[code],
      };
    },
  };
}
