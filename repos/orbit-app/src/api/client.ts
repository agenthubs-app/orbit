import type { ApiEnvelope, ApiResult, OrbitApiMeta } from "./types";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface OrbitApiClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export interface OrbitApiRequestOptions {
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
}

export interface OrbitApiClient {
  readonly baseUrl: string;
  get: <TData>(
    path: string,
    options?: OrbitApiRequestOptions
  ) => Promise<ApiResult<TData>>;
  post: <TData>(
    path: string,
    options?: OrbitApiRequestOptions
  ) => Promise<ApiResult<TData>>;
}

function configuredBaseUrl(): string {
  return process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL ?? "http://localhost:3000";
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, "");
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
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not parse JSON"
    };
  }
}

function requestInit(
  method: "GET" | "POST",
  options: OrbitApiRequestOptions
): RequestInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {})
  };

  if (options.body === undefined) {
    return { headers, method };
  }

  return {
    body: JSON.stringify(options.body),
    headers: {
      ...headers,
      "Content-Type": "application/json"
    },
    method
  };
}

async function request<TData>(
  baseUrl: string,
  fetchImpl: FetchLike,
  method: "GET" | "POST",
  path: string,
  options: OrbitApiRequestOptions = {}
): Promise<ApiResult<TData>> {
  let response: Response;

  try {
    response = await fetchImpl(
      pathToUrl(baseUrl, path),
      requestInit(method, options)
    );
  } catch (error) {
    return failureResult(
      0,
      { featureMode: null, privacy: null, runtimeBoundary: null },
      "ORBIT_APP_NETWORK_ERROR",
      error instanceof Error ? error.message : "Network request failed"
    );
  }

  const meta = metaFromResponse(response);
  const contentType = response.headers.get("Content-Type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return failureResult(
      response.status,
      meta,
      "ORBIT_APP_NON_JSON_RESPONSE",
      `Expected JSON from ${path}, received ${contentType || "unknown content type"}`
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
      `Response from ${path} did not match the Orbit API envelope`
    );
  }

  return {
    ...payload.value,
    meta,
    status: response.status
  };
}

export function createOrbitApiClient({
  baseUrl = configuredBaseUrl(),
  fetchImpl = fetch
}: OrbitApiClientOptions = {}): OrbitApiClient {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    baseUrl: normalizedBaseUrl,
    get<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(normalizedBaseUrl, fetchImpl, "GET", path, options);
    },
    post<TData>(path: string, options?: OrbitApiRequestOptions) {
      return request<TData>(
        normalizedBaseUrl,
        fetchImpl,
        "POST",
        path,
        options
      );
    }
  };
}
