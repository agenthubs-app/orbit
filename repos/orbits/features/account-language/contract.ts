import type { AppErrorCode } from "../../shared/errors/app-error";
import type {
  AccountLanguagePreferenceSaveContract,
  AccountLanguagePreferenceSaveReceiptContract,
  OrbitLanguagePreferenceContract,
} from "../../shared/contract/account-language-preference";

export const ACCOUNT_LANGUAGE_PREFERENCE_ERROR_CODES = [
  "LANGUAGE_PREFERENCE_ACTOR_REQUIRED",
  "LANGUAGE_PREFERENCE_MUTATION_INVALID",
  "LANGUAGE_PREFERENCE_VERSION_CONFLICT",
  "LANGUAGE_PREFERENCE_MUTATION_ID_REUSED",
  "LANGUAGE_PREFERENCE_STORE_UNCONFIGURED",
  "LANGUAGE_PREFERENCE_READ_UNAVAILABLE",
  "LANGUAGE_PREFERENCE_SAVE_UNAVAILABLE",
] as const;

export type AccountLanguagePreferenceErrorCode =
  (typeof ACCOUNT_LANGUAGE_PREFERENCE_ERROR_CODES)[number];

export interface AccountLanguagePreferenceErrorDefinition {
  appCode: AppErrorCode;
  code: AccountLanguagePreferenceErrorCode;
  message: string;
  recovery: string;
}

export const ACCOUNT_LANGUAGE_PREFERENCE_ERROR_DEFINITIONS = {
  LANGUAGE_PREFERENCE_ACTOR_REQUIRED: {
    appCode: "UNAUTHORIZED",
    code: "LANGUAGE_PREFERENCE_ACTOR_REQUIRED",
    message: "An authenticated actor is required to read an account language preference.",
    recovery: "Sign in and retry.",
  },
  LANGUAGE_PREFERENCE_MUTATION_INVALID: {
    appCode: "VALIDATION_ERROR",
    code: "LANGUAGE_PREFERENCE_MUTATION_INVALID",
    message: "The language preference request is invalid.",
    recovery: "Keep the selection and submit a supported mode, language, version, and request ID.",
  },
  LANGUAGE_PREFERENCE_VERSION_CONFLICT: {
    appCode: "CONFLICT",
    code: "LANGUAGE_PREFERENCE_VERSION_CONFLICT",
    message: "The account language preference changed after it was opened.",
    recovery: "Keep the selection, reload the latest preference, and retry with its version.",
  },
  LANGUAGE_PREFERENCE_MUTATION_ID_REUSED: {
    appCode: "CONFLICT",
    code: "LANGUAGE_PREFERENCE_MUTATION_ID_REUSED",
    message: "This request ID was already used for a different language preference.",
    recovery: "Keep the selection and retry the changed request with a new request ID.",
  },
  LANGUAGE_PREFERENCE_STORE_UNCONFIGURED: {
    appCode: "SERVICE_UNAVAILABLE",
    code: "LANGUAGE_PREFERENCE_STORE_UNCONFIGURED",
    message: "The account language preference store is not configured.",
    recovery: "Configure the live database before reading or saving account language preferences.",
  },
  LANGUAGE_PREFERENCE_READ_UNAVAILABLE: {
    appCode: "SERVICE_UNAVAILABLE",
    code: "LANGUAGE_PREFERENCE_READ_UNAVAILABLE",
    message: "The account language preference could not be read safely.",
    recovery: "Keep using the device language and retry the account preference read.",
  },
  LANGUAGE_PREFERENCE_SAVE_UNAVAILABLE: {
    appCode: "SERVICE_UNAVAILABLE",
    code: "LANGUAGE_PREFERENCE_SAVE_UNAVAILABLE",
    message: "The language preference save could not be confirmed.",
    recovery: "Keep the selection and retry the same request.",
  },
} as const satisfies Record<
  AccountLanguagePreferenceErrorCode,
  AccountLanguagePreferenceErrorDefinition
>;

export interface AccountLanguagePreferenceSuccess<TData> {
  data: TData;
  success: true;
}

export interface AccountLanguagePreferenceFailure {
  error: AccountLanguagePreferenceErrorDefinition;
  success: false;
}

export type AccountLanguagePreferenceReadResult =
  | AccountLanguagePreferenceSuccess<OrbitLanguagePreferenceContract>
  | AccountLanguagePreferenceFailure;

export type AccountLanguagePreferenceSaveResult =
  | AccountLanguagePreferenceSuccess<AccountLanguagePreferenceSaveReceiptContract>
  | AccountLanguagePreferenceFailure;

export interface AccountLanguagePreferenceService {
  read(input: { actorId: string }): Promise<AccountLanguagePreferenceReadResult>;
  save(input: {
    actorId: string;
    input: AccountLanguagePreferenceSaveContract | Record<string, unknown>;
  }): Promise<AccountLanguagePreferenceSaveResult>;
}
