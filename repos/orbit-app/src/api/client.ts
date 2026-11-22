import { serverReachability } from "./server-reachability";
import { pageCopyFreshness } from "../data/sync/page-copy-freshness";
import type {
  ApiEnvelope,
  ApiErrorBody,
  ApiResult,
  OrbitApiMeta
} from "./types";
import {
  DEFAULT_ORBIT_API_BASE_URL,
  normalizeOrbitApiBaseUrl
} from "./base-url";
import { notifySessionExpired } from "./session-expiry";
import { iorbitR21Copy } from "../i18n/iorbitR21";
import { currentOrbitLanguage } from "../i18n/locale-core";
import { currentTranslator, type MessageKey } from "../i18n/messages";
import type { OrbitLanguage } from "./contract/language";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface OrbitApiClientOptions {
  authCookieHeader?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  /** The UI language, sent as `x-orbit-lang` on every request so localized server answers match the app; a request's own header wins. */
  language?: string;
  /** Conditional-GET memory shared by every client of this process; tests pass their own. */
  conditionalCache?: OrbitConditionalCache;
}

export type OrbitApiRequestOptions = {
  headers?: Readonly<Record<string, string>>;
  responseType?: "bytes";
  signal?: AbortSignal;
  /** How long to wait for the whole answer before giving up with the usual network failure; 0 waits forever. Default: see requestTimeoutMs. */
  timeoutMs?: number;
} & (
  | { body?: unknown; rawBody?: never }
  | { body?: never; rawBody: Uint8Array<ArrayBuffer> }
);

export interface OrbitApiBytes {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
}

export const MAX_ORBIT_BINARY_BYTES = 10 * 1024 * 1024;

// A request that never answers must end as an ordinary network failure so screens show their retry UI instead of spinning.
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
// AI turns, plan drafts, assessments, card scans, imports and uploads can legitimately run for minutes (server maxDuration up to 180 s).
export const LONG_REQUEST_TIMEOUT_MS = 180_000;
const LONG_RUNNING_WRITE_PATHS: readonly RegExp[] = [
  /^\/api\/ai\//u,
  /^\/api\/agent\//u,
  /^\/api\/chat\//u,
  /^\/api\/events\/assessments(?:[/?]|$)/u,
  /^\/api\/events\/[^/]+\/join\/(?:next|profile|submit)(?:[/?]|$)/u,
  /^\/api\/contact-drafts\//u,
  /^\/api\/contacts\/(?:import|business-card)(?:[/?]|$)/u,
  /^\/api\/profile(?:[/?]|$)/u,
  /^\/api\/(?:analysis|network\/analysis|network\/snapshot)(?:[/?]|$)/u,
  /^\/api\/message-drafts(?:[/?]|$)/u,
  /\/draft(?:[?]|$)/u,
  /\/generate(?:[?]|$)/u,
  /^\/api\/host\/events\/[^/]+\/matching(?:[/?]|$)/u
];

/** The default wait for one request: long for uploads and for writes that run AI or heavy work, otherwise 20 s. */
export function requestTimeoutMs(method: string, path: string, options: OrbitApiRequestOptions = {}): number {
  if (options.timeoutMs !== undefined) return options.timeoutMs;
  if (options.rawBody !== undefined) return LONG_REQUEST_TIMEOUT_MS;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (method !== "GET" && LONG_RUNNING_WRITE_PATHS.some((pattern) => pattern.test(normalizedPath))) return LONG_REQUEST_TIMEOUT_MS;
  return DEFAULT_REQUEST_TIMEOUT_MS;
}

const REQUEST_STOPPED = Symbol("orbit-request-stopped");

interface RequestDeadline {
  readonly signal: AbortSignal;
  /** Rejects with REQUEST_STOPPED once the caller aborts or the time runs out, so a fetch or body read that ignores the signal still ends. */
  until<T>(promise: Promise<T>): Promise<T>;
  timedOut(): boolean;
  dispose(): void;
}

// One AbortSignal for fetch that fires on the caller's signal or on the timeout (AbortSignal.any is not on every RN runtime).
function requestDeadline(callerSignal: AbortSignal | undefined, timeoutMs: number): RequestDeadline {
  const controller = new AbortController();
  let expired = false;
  let stop: (reason: typeof REQUEST_STOPPED) => void = () => undefined;
  const stopped = new Promise<never>((_resolve, reject) => { stop = reject; });
  stopped.catch(() => undefined);
  const abort = () => {
    stop(REQUEST_STOPPED);
    if (!controller.signal.aborted) controller.abort(callerSignal?.reason);
  };
  if (callerSignal?.aborted) abort();
  else callerSignal?.addEventListener("abort", abort);
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (timeoutMs > 0 && Number.isFinite(timeoutMs) && !controller.signal.aborted) {
    timer = setTimeout(() => {
      expired = true;
      abort();
    }, timeoutMs);
  }
  return {
    signal: controller.signal,
    until: <T>(promise: Promise<T>) => Promise.race([promise, stopped]),
    timedOut: () => expired,
    dispose() {
      if (timer !== null) clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abort);
    }
  };
}

export interface OrbitApiClient {
  readonly baseUrl: string;
  delete: <TData>(
    path: string,
    options?: OrbitApiRequestOptions
  ) => Promise<ApiResult<TData>>;
  get: <TData>(
    path: string,
    options?: OrbitApiRequestOptions
  ) => Promise<ApiResult<TData>>;
  patch: <TData>(
    path: string,
    options?: OrbitApiRequestOptions
  ) => Promise<ApiResult<TData>>;
  post: <TData>(
    path: string,
    options?: OrbitApiRequestOptions
  ) => Promise<ApiResult<TData>>;
  put: <TData>(
    path: string,
    options?: OrbitApiRequestOptions
  ) => Promise<ApiResult<TData>>;
}

type OrbitApiMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

const inFlightGetsByFetch = new WeakMap<
  FetchLike,
  Map<string, Promise<ApiResult<unknown>>>
>();

// QA 2026-11-21: the device-made failure text follows the published screen language
// (OrbitLocaleProvider publishes it), so a ja / en screen never shows Chinese errors.
function apiMessage(key: MessageKey): string {
  return currentTranslator()(key);
}
const API_ERROR_MESSAGE_KEYS: Readonly<Record<string, MessageKey>> = {
  CONFLICT: "common.api.conflict",
  FORBIDDEN: "common.api.forbidden",
  INTERNAL_ERROR: "common.api.internal",
  NOT_FOUND: "common.api.notFound",
  SERVICE_UNAVAILABLE: "common.api.unavailable",
  UNAUTHORIZED: "common.api.unauthorized",
  VALIDATION_ERROR: "common.api.validation"
};
const BUSINESS_CARD_SCAN_ERROR_MESSAGE_KEYS: Readonly<Record<string, MessageKey>> = {
  BUSINESS_CARD_IMAGE_REQUIRED: "common.api.cardImageRequired",
  BUSINESS_CARD_IMAGE_TOO_LARGE: "common.api.cardImageTooLarge",
  BUSINESS_CARD_IMAGE_UNSUPPORTED: "common.api.cardImageUnsupported",
  BUSINESS_CARD_OCR_PROVIDER_FAILED: "common.api.cardOcrFailed",
  BUSINESS_CARD_OCR_UNCONFIGURED: "common.api.cardOcrUnconfigured",
  BUSINESS_CARD_SCAN_OCR_LIVE_STORE_FAILED: "common.api.cardScanStoreFailed",
  BUSINESS_CARD_SCAN_OCR_LIVE_STORE_UNCONFIGURED: "common.api.cardScanStoreUnconfigured"
};

function configuredBaseUrl(): string {
  return DEFAULT_ORBIT_API_BASE_URL;
}

function normalizeBaseUrl(value: string): string {
  return normalizeOrbitApiBaseUrl(value);
}

function pathToUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeBaseUrl(baseUrl)}${normalizedPath}`;
}

function metaFromResponse(response: Response): OrbitApiMeta {
  return {
    featureMode: response.headers.get("X-Orbit-Feature-Mode"),
    privacy: response.headers.get("X-Orbit-Privacy"),
    runtimeBoundary: response.headers.get("X-Orbit-Runtime-Boundary")
  };
}

// 条件请求：按请求身份（baseUrl、会话 Cookie、路径、显式 headers）记住上一次成功
// JSON GET 的 ETag 与 envelope，只放内存。服务端 304 时回放；ETag 由服务端按
// actor 生成，换账号不会命中，因此不会回放别人的响应体。
interface RememberedConditionalResponse {
  etag: string;
  envelope: ApiResult<unknown>;
}

export type OrbitConditionalCache = Map<string, RememberedConditionalResponse>;

// 屏幕各自 useMemo 出 client 实例；记忆必须跨实例共享，否则换个屏幕就永远命不中。
const sharedConditionalCache: OrbitConditionalCache = new Map();

function conditionalGetKey(
  baseUrl: string,
  authCookieHeader: string,
  path: string,
  options: OrbitApiRequestOptions
): string | null {
  if (options.body !== undefined || options.rawBody !== undefined || options.responseType === "bytes") return null;
  return concurrentGetKey(baseUrl, authCookieHeader, path, options);
}

function failureResult(
  status: number,
  meta: OrbitApiMeta,
  code: string,
  message: string
): ApiResult<never> {
  return {
    success: false,
    error: { code, message },
    meta,
    status
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiErrorBody(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.code === "string" && typeof value.message === "string";
}

function isEnvelope<TData>(value: unknown): value is ApiEnvelope<TData> {
  if (!isRecord(value)) {
    return false;
  }

  if (value.success === true) {
    return "data" in value;
  }

  return value.success === false && isApiErrorBody(value.error);
}

// A server sentence is shown as written only when it is in the screen language:
// Japanese text carries kana, Chinese text has Han without kana. Anything else
// (the server's English developer text, a Chinese sentence on a ja screen) falls
// back to the device's own wording for the error code.
function isInLanguage(value: string, language: OrbitLanguage): boolean {
  const kana = /[\u3040-\u30ff]/u.test(value);
  if (language === "ja") return kana;
  if (language === "zh") return !kana && /[\u3400-\u9fff]/u.test(value);
  return false;
}

/** Sprint 0117: exported so a device-computed failure shows the text the server's answer would. */
export function localizedApiErrorMessage(
  error: ApiErrorBody,
  status: number
): string {
  const language = currentOrbitLanguage();
  const businessCardErrorCode =
    error.context?.businessCardScanOcrErrorCode?.trim() ?? "";
  const businessCardMessageKey =
    BUSINESS_CARD_SCAN_ERROR_MESSAGE_KEYS[businessCardErrorCode];

  if (businessCardMessageKey) {
    return apiMessage(businessCardMessageKey);
  }

  const serverMessage = error.message.trim();

  if (isInLanguage(serverMessage, language)) {
    return serverMessage;
  }

  if (status === 429) {
    return apiMessage("common.api.rateLimited");
  }

  if (error.code === "PIN_LIMIT") {
    return iorbitR21Copy[language].pinLimit;
  }

  const key = API_ERROR_MESSAGE_KEYS[error.code];
  return apiMessage(
    key ?? (status >= 500 ? "common.api.unavailable" : "common.api.failed")
  );
}

async function readJson(response: Response): Promise<
  | { ok: true; value: unknown }
  | {
      ok: false;
      message: string;
    }
> {
  try {
    return { ok: true, value: await response.json() };
  } catch {
    return {
      ok: false,
      message: apiMessage("common.api.invalidJson")
    };
  }
}

function requestInit(
  method: OrbitApiMethod,
  options: OrbitApiRequestOptions,
  authCookieHeader: string
): RequestInit {
  const normalizedAuthCookieHeader = authCookieHeader.trim();
  const headers: Record<string, string> = {
    Accept: options.responseType === "bytes" ? "image/*" : "application/json",
    ...(options.headers ?? {})
  };

  if (normalizedAuthCookieHeader) {
    headers.Cookie = normalizedAuthCookieHeader;
  }

  if (options.rawBody !== undefined) {
    return {
      body: options.rawBody,
      credentials: normalizedAuthCookieHeader ? "omit" : "include",
      headers,
      method,
      ...(options.signal ? { signal: options.signal } : {})
    };
  }

  if (options.body === undefined) {
    return {
      // React Native 先从原生 cookie jar 写 Cookie，再把这里的显式 Cookie
      // 追加进去。显式会话存在时必须关闭 jar，避免同名 token 被合并后损坏。
      credentials: normalizedAuthCookieHeader ? "omit" : "include",
      headers,
      method,
      ...(options.signal ? { signal: options.signal } : {})
    };
  }

  return {
    body: JSON.stringify(options.body),
    // Web 不提供显式 Cookie，仍由浏览器管理 HttpOnly 会话。
    credentials: normalizedAuthCookieHeader ? "omit" : "include",
    headers: {
      ...headers,
      "Content-Type": "application/json"
    },
    method,
    ...(options.signal ? { signal: options.signal } : {})
  };
}

function networkFailure(): ApiResult<never> {
  return failureResult(
    0,
    { featureMode: null, privacy: null, runtimeBoundary: null },
    "ORBIT_APP_NETWORK_ERROR",
    apiMessage("common.api.network")
  );
}

async function request<TData>(
  baseUrl: string,
  authCookieHeader: string,
  fetchImpl: FetchLike,
  method: OrbitApiMethod,
  path: string,
  options: OrbitApiRequestOptions = {},
  conditionalCache: OrbitConditionalCache = sharedConditionalCache
): Promise<ApiResult<TData>> {
  const deadline = requestDeadline(options.signal, requestTimeoutMs(method, path, options));
  try {
    return await requestOnce<TData>(baseUrl, authCookieHeader, fetchImpl, method, path, options, conditionalCache, deadline);
  } catch (error) {
    // The caller aborted or the time ran out while the answer was still arriving.
    if (error === REQUEST_STOPPED) return networkFailure();
    throw error;
  } finally {
    deadline.dispose();
  }
}

async function requestOnce<TData>(
  baseUrl: string,
  authCookieHeader: string,
  fetchImpl: FetchLike,
  method: OrbitApiMethod,
  path: string,
  options: OrbitApiRequestOptions,
  conditionalCache: OrbitConditionalCache,
  deadline: RequestDeadline
): Promise<ApiResult<TData>> {
  if (options.rawBody !== undefined) {
    const meta = { featureMode: null, privacy: null, runtimeBoundary: null };
    if (options.body !== undefined) {
      return failureResult(0, meta, "ORBIT_APP_INVALID_BODY", apiMessage("common.api.invalidEnvelope"));
    }
    if (options.rawBody.byteLength > MAX_ORBIT_BINARY_BYTES) {
      return failureResult(0, meta, "ORBIT_APP_BINARY_TOO_LARGE", apiMessage("common.api.nonJson"));
    }
  }
  const conditionalKey = method === "GET" ? conditionalGetKey(baseUrl, authCookieHeader, path, options) : null;
  const remembered = conditionalKey ? conditionalCache.get(conditionalKey) : undefined;
  const conditionalOptions: OrbitApiRequestOptions = {
    ...options,
    ...(remembered ? { headers: { ...(options.headers ?? {}), "If-None-Match": remembered.etag } } : {}),
    signal: deadline.signal
  } as OrbitApiRequestOptions;
  let response: Response;

  try {
    response = await deadline.until(fetchImpl(
      pathToUrl(baseUrl, path),
      requestInit(method, conditionalOptions, authCookieHeader)
    ));
  } catch {
    // Sprint 0131: an aborted request says nothing about the server; any other thrown fetch means it could not be reached.
    // A timeout is not proof either (the server may be slow), so it only ends this request.
    if (!options.signal?.aborted && !deadline.timedOut()) serverReachability.markUnreachable(baseUrl);
    return networkFailure();
  }

  serverReachability.markReachable(baseUrl);
  // LF1: a write the server accepted ends every page copy's fresh window.
  if (method !== "GET" && response.ok) pageCopyFreshness.noteWrite();

  // 401 说明这次请求带的会话已经失效。这里只广播事实，
  // 登出与跳转由 AuthSessionProvider 决定（它才知道当前是否处于登录态）。
  if (response.status === 401) {
    notifySessionExpired();
  }

  const meta = metaFromResponse(response);

  if (response.status === 304 && conditionalKey) {
    if (!remembered) {
      return failureResult(304, meta, "ORBIT_APP_STALE_CONDITIONAL_RESPONSE", apiMessage("common.api.staleConditional"));
    }
    return {
      ...(remembered.envelope as ApiResult<TData>),
      meta: { ...remembered.envelope.meta, fromCache: true },
      status: 200
    };
  }

  const contentType = response.headers.get("Content-Type") ?? "";

  if (options.responseType === "bytes" && response.ok &&
      !contentType.toLowerCase().includes("application/json")) {
    if (Number(response.headers.get("Content-Length")) > MAX_ORBIT_BINARY_BYTES) {
      return failureResult(response.status, meta, "ORBIT_APP_BINARY_TOO_LARGE", apiMessage("common.api.nonJson"));
    }
    try {
      const bytes = new Uint8Array(await deadline.until(response.arrayBuffer()));
      if (bytes.byteLength > MAX_ORBIT_BINARY_BYTES) {
        return failureResult(response.status, meta, "ORBIT_APP_BINARY_TOO_LARGE", apiMessage("common.api.nonJson"));
      }
      return { success: true, data: { bytes, contentType } as TData, meta, status: response.status };
    } catch (error) {
      if (error === REQUEST_STOPPED) throw error;
      return failureResult(response.status, meta, "ORBIT_APP_BINARY_READ_ERROR", apiMessage("common.api.network"));
    }
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    return failureResult(
      response.status,
      meta,
      "ORBIT_APP_NON_JSON_RESPONSE",
      apiMessage("common.api.nonJson")
    );
  }

  const payload = await deadline.until(readJson(response));
  // An abort during the body read surfaces as a JSON parse error; report it as the stop it was.
  if (!payload.ok && deadline.signal.aborted) return networkFailure();

  if (!payload.ok) {
    return failureResult(
      response.status,
      meta,
      "ORBIT_APP_INVALID_JSON",
      "message" in payload ? payload.message : "Invalid JSON response"
    );
  }

  if (!isEnvelope<TData>(payload.value)) {
    return failureResult(
      response.status,
      meta,
      "ORBIT_APP_INVALID_ENVELOPE",
      apiMessage("common.api.invalidEnvelope")
    );
  }

  if (payload.value.success === false) {
    return {
      ...payload.value,
      error: {
        ...payload.value.error,
        message: localizedApiErrorMessage(payload.value.error, response.status)
      },
      meta,
      status: response.status
    };
  }

  if (options.responseType === "bytes") {
    return failureResult(response.status, meta, "ORBIT_APP_NON_BINARY_RESPONSE", apiMessage("common.api.nonJson"));
  }

  const result: ApiResult<TData> = { ...payload.value, meta, status: response.status };
  const etag = response.headers.get("ETag");
  if (conditionalKey && response.status === 200 && etag) {
    conditionalCache.set(conditionalKey, { etag, envelope: result as ApiResult<unknown> });
  }
  return result;
}

function concurrentGetKey(
  baseUrl: string,
  authCookieHeader: string,
  path: string,
  options: OrbitApiRequestOptions
): string {
  const headers = Object.entries(options.headers ?? {}).sort(([left], [right]) =>
    left.localeCompare(right)
  );

  return JSON.stringify([baseUrl, authCookieHeader.trim(), path, headers, options.responseType ?? "json"]);
}

function coalescedGet<TData>(
  baseUrl: string,
  authCookieHeader: string,
  fetchImpl: FetchLike,
  path: string,
  options: OrbitApiRequestOptions = {},
  conditionalCache: OrbitConditionalCache = sharedConditionalCache
): Promise<ApiResult<TData>> {
  if (options.body !== undefined || options.rawBody !== undefined || options.signal) {
    return request<TData>(
      baseUrl,
      authCookieHeader,
      fetchImpl,
      "GET",
      path,
      options,
      conditionalCache
    );
  }

  const requests = inFlightGetsByFetch.get(fetchImpl) ?? new Map();
  inFlightGetsByFetch.set(fetchImpl, requests);
  const key = concurrentGetKey(baseUrl, authCookieHeader, path, options);
  const existing = requests.get(key) as Promise<ApiResult<TData>> | undefined;

  if (existing) {
    return existing;
  }

  const pending = request<TData>(
    baseUrl,
    authCookieHeader,
    fetchImpl,
    "GET",
    path,
    options,
    conditionalCache
  );
  requests.set(key, pending as Promise<ApiResult<unknown>>);
  const clear = () => {
    if (requests.get(key) === pending) {
      requests.delete(key);
    }
  };
  void pending.then(clear, clear);

  return pending;
}

// The language goes into the per-request headers, so the conditional-GET and in-flight keys include it.
function withLanguage(options: OrbitApiRequestOptions | undefined, language: string): OrbitApiRequestOptions | undefined {
  if (!language) return options;
  const headers = options?.headers ?? {};
  if (Object.keys(headers).some(name => name.toLowerCase() === "x-orbit-lang")) return options;
  return { ...(options ?? {}), headers: { "x-orbit-lang": language, ...headers } } as OrbitApiRequestOptions;
}

export function createOrbitApiClient({
  authCookieHeader = "",
  baseUrl = configuredBaseUrl(),
  fetchImpl = fetch,
  language = "",
  conditionalCache = sharedConditionalCache
}: OrbitApiClientOptions = {}): OrbitApiClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    baseUrl: normalizedBaseUrl,
    delete<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(
        normalizedBaseUrl,
        authCookieHeader,
        fetchImpl,
        "DELETE",
        path,
        withLanguage(options, language)
      );
    },
    get<TData>(path: string, options?: OrbitApiRequestOptions) {
      return coalescedGet<TData>(
        normalizedBaseUrl,
        authCookieHeader,
        fetchImpl,
        path,
        withLanguage(options, language),
        conditionalCache
      );
    },
    patch<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(
        normalizedBaseUrl,
        authCookieHeader,
        fetchImpl,
        "PATCH",
        path,
        withLanguage(options, language)
      );
    },
    post<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(
        normalizedBaseUrl,
        authCookieHeader,
        fetchImpl,
        "POST",
        path,
        withLanguage(options, language)
      );
    },
    put<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(
        normalizedBaseUrl,
        authCookieHeader,
        fetchImpl,
        "PUT",
        path,
        withLanguage(options, language)
      );
    }
  };
}
