export interface ApiErrorBody {
  code: string;
  message: string;
  context?: Readonly<Record<string, string>>;
}

export interface ApiSuccessEnvelope<TData> {
  success: true;
  data: TData;
}

export interface ApiFailureEnvelope {
  success: false;
  error: ApiErrorBody;
}

export type ApiEnvelope<TData> =
  | ApiSuccessEnvelope<TData>
  | ApiFailureEnvelope;

export interface OrbitApiMeta {
  featureMode: string | null;
  privacy: string | null;
  runtimeBoundary: string | null;
  /** true when a 304 replayed the previously remembered body. */
  fromCache?: boolean;
}

export type ApiResult<TData> =
  | (ApiSuccessEnvelope<TData> & {
      meta: OrbitApiMeta;
      status: number;
    })
  | (ApiFailureEnvelope & {
      meta: OrbitApiMeta;
      status: number;
    });
