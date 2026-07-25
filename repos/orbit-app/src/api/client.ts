import type { ApiEnvelope, ApiResult, OrbitApiMeta } from "./types";
import {
  DEFAULT_ORBIT_API_BASE_URL,
  normalizeOrbitApiBaseUrl
} from "./base-url";
import { notifySessionExpired } from "./session-expiry";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface OrbitApiClientOptions {
  authCookieHeader?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export interface OrbitApiRequestOptions {
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
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

const INVALID_ENVELOPE_MESSAGE =
  "Orbit 服务返回的数据格式暂时无法识别，请稍后重试。";
const INVALID_JSON_MESSAGE = "Orbit 服务返回的数据暂时无法解析，请稍后重试。";
const NETWORK_ERROR_MESSAGE = "暂时无法连接 Orbit 服务，请检查网络后再试。";
const NON_JSON_RESPONSE_MESSAGE =
  "Orbit 服务返回了无法识别的内容，请稍后重试。";

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
      message: INVALID_JSON_MESSAGE
    };
  }
}

function requestInit(
  method: OrbitApiMethod,
  options: OrbitApiRequestOptions,
  authCookieHeader: string
): RequestInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {})
  };

  if (authCookieHeader.trim()) {
    headers.Cookie = authCookieHeader.trim();
  }

  if (options.body === undefined) {
    return { credentials: "include", headers, method };
  }

  return {
    body: JSON.stringify(options.body),
    credentials: "include",
    headers: {
      ...headers,
      "Content-Type": "application/json"
    },
    method
  };
}

async function request<TData>(
  baseUrl: string,
  authCookieHeader: string,
  fetchImpl: FetchLike,
  method: OrbitApiMethod,
  path: string,
  options: OrbitApiRequestOptions = {}
): Promise<ApiResult<TData>> {
  let response: Response;

  try {
    response = await fetchImpl(
      pathToUrl(baseUrl, path),
      requestInit(method, options, authCookieHeader)
    );
  } catch {
    return failureResult(
      0,
      { featureMode: null, privacy: null, runtimeBoundary: null },
      "ORBIT_APP_NETWORK_ERROR",
      NETWORK_ERROR_MESSAGE
    );
  }

  // 401 说明这次请求带的会话已经失效。这里只广播事实，
  // 登出与跳转由 AuthSessionProvider 决定（它才知道当前是否处于登录态）。
  if (response.status === 401) {
    notifySessionExpired();
  }

  const meta = metaFromResponse(response);
  const contentType = response.headers.get("Content-Type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return failureResult(
      response.status,
      meta,
      "ORBIT_APP_NON_JSON_RESPONSE",
      NON_JSON_RESPONSE_MESSAGE
    );
  }

  const payload = await readJson(response);

  if (!payload.ok) {
    return failureResult(
      response.status,
      meta,
      "ORBIT_APP_INVALID_JSON",
      payload.message
    );
  }

  if (!isEnvelope<TData>(payload.value)) {
    return failureResult(
      response.status,
      meta,
      "ORBIT_APP_INVALID_ENVELOPE",
      INVALID_ENVELOPE_MESSAGE
    );
  }

  return {
    ...payload.value,
    meta,
    status: response.status
  };
}

export function createOrbitApiClient({
  authCookieHeader = "",
  baseUrl = configuredBaseUrl(),
  fetchImpl = fetch
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
        options
      );
    },
    get<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(
        normalizedBaseUrl,
        authCookieHeader,
        fetchImpl,
        "GET",
        path,
        options
      );
    },
    patch<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(
        normalizedBaseUrl,
        authCookieHeader,
        fetchImpl,
        "PATCH",
        path,
        options
      );
    },
    post<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(
        normalizedBaseUrl,
        authCookieHeader,
        fetchImpl,
        "POST",
        path,
        options
      );
    },
    put<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(
        normalizedBaseUrl,
        authCookieHeader,
        fetchImpl,
        "PUT",
        path,
        options
      );
    }
  };
}
