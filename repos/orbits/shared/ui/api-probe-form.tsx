"use client";

import { type FormEvent, useState } from "react";

type ApiProbeMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

interface ApiProbeRequestInput {
  action: string;
  arrayFields?: readonly string[];
  entries: readonly (readonly [string, FormDataEntryValue])[];
  method: ApiProbeMethod;
  origin: string;
}

interface ApiProbeRequest {
  body?: string;
  headers?: Readonly<Record<string, string>>;
  method: ApiProbeMethod;
  url: string;
}

export function buildApiProbeRequest({
  action,
  arrayFields = [],
  entries,
  method,
  origin,
}: ApiProbeRequestInput): ApiProbeRequest {
  const url = new URL(action, origin);

  if (method === "GET") {
    for (const [name, value] of entries) {
      if (typeof value === "string") {
        url.searchParams.append(name, value);
      }
    }
    return {
      method,
      url: `${url.pathname}${url.search}${url.hash}`,
    };
  }

  if (entries.length === 0) {
    return {
      method,
      url: `${url.pathname}${url.search}${url.hash}`,
    };
  }

  const arrayFieldSet = new Set(arrayFields);
  const body: Record<string, string | string[]> = {};
  for (const [name, value] of entries) {
    if (typeof value !== "string") {
      continue;
    }
    if (arrayFieldSet.has(name)) {
      const current = body[name];
      body[name] = Array.isArray(current) ? [...current, value] : [value];
    } else {
      body[name] = value;
    }
  }

  return {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
    url: `${url.pathname}${url.search}${url.hash}`,
  };
}

interface ApiProbeSubmitOptions {
  action: string;
  arrayFields?: readonly string[];
  method: ApiProbeMethod;
}

export function useApiProbeForm() {
  const [result, setResult] = useState<{
    message: string;
    state: "failure" | "idle" | "pending" | "success";
  }>({ message: "", state: "idle" });

  const submit = async (
    event: FormEvent<HTMLFormElement>,
    { action, arrayFields, method }: ApiProbeSubmitOptions,
  ) => {
    event.preventDefault();
    const request = buildApiProbeRequest({
      action,
      arrayFields,
      entries: [...new FormData(event.currentTarget).entries()],
      method,
      origin: window.location.origin,
    });

    setResult({ message: "Request pending…", state: "pending" });
    try {
      const response = await fetch(request.url, {
        body: request.body,
        headers: request.headers,
        method: request.method,
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
        success?: boolean;
      } | null;
      const appResult =
        payload?.success === false
          ? (payload.error?.code ??
            payload.error?.message ??
            "failure envelope")
          : payload?.success === true
            ? "success envelope"
            : "unrecognized envelope";
      setResult({
        message: `${response.status} ${appResult}`,
        state: response.ok && payload?.success === true ? "success" : "failure",
      });
    } catch {
      setResult({
        message: "Network request failed before an API envelope was returned.",
        state: "failure",
      });
    }
  };

  return { result, submit };
}
