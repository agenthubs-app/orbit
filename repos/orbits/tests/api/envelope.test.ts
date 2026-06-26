import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { AppError, getHttpStatusForAppErrorCode } from "../../shared/errors/app-error";
import * as appErrors from "../../shared/errors/app-error";
import {
  failure,
  RUNTIME_BOUNDARY_HEADER_VALUES,
  runtimeBoundaryHeaders,
  success,
} from "../../shared/api/envelope";
import {
  DEFAULT_FEATURE_MODE,
  resolveFeatureMode,
} from "../../shared/config/feature-mode";
import * as healthRoute from "../../app/api/health/route";
import * as healthErrorRoute from "../../app/api/health/error/route";

const getHealth = healthRoute.GET;
const getHealthError = healthErrorRoute.GET;

function restoreFeatureMode(previousMode: string | undefined): void {
  if (previousMode === undefined) {
    delete process.env.ORBIT_FEATURE_MODE;
  } else {
    process.env.ORBIT_FEATURE_MODE = previousMode;
  }
}

test("success wraps data in the shared API envelope", () => {
  assert.deepEqual(
    success({
      mode: "mock",
      service: "health",
    }),
    {
      success: true,
      data: {
        mode: "mock",
        service: "health",
      },
    },
  );
});

test("failure wraps app errors in the shared API envelope", () => {
  const error = new AppError(
    "INTERNAL_ERROR",
    "A deterministic health failure was requested.",
  );

  assert.deepEqual(failure(error), {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "A deterministic health failure was requested.",
    },
  });
});

test("failure includes explicit non-sensitive runtime context when provided", () => {
  const error = new AppError(
    "INTERNAL_ERROR",
    "A deterministic health failure was requested.",
  );

  assert.deepEqual(
    failure(error, {
      boundary: "developer-admin",
      mode: "mock",
      privacy: "no-relationship-data",
      service: "orbit-runtime",
    }),
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "A deterministic health failure was requested.",
        context: {
          boundary: "developer-admin",
          mode: "mock",
          privacy: "no-relationship-data",
          service: "orbit-runtime",
        },
      },
    },
  );
});

test("failure omits empty runtime context from the envelope", () => {
  const error = new AppError(
    "INTERNAL_ERROR",
    "A deterministic health failure was requested.",
  );

  assert.deepEqual(failure(error, {}), {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "A deterministic health failure was requested.",
    },
  });
});

test("failure masks raw errors with the shared safe internal error message", () => {
  const safeInternalErrorMessage = (
    appErrors as {
      SAFE_INTERNAL_ERROR_MESSAGE?: string;
    }
  ).SAFE_INTERNAL_ERROR_MESSAGE;

  assert.equal(safeInternalErrorMessage, "An unexpected error occurred.");
  assert.deepEqual(failure(new Error("provider token abc123 leaked")), {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: safeInternalErrorMessage,
    },
  });
});

test("shared API boundary exposes runtime headers for route handlers", () => {
  assert.deepEqual(RUNTIME_BOUNDARY_HEADER_VALUES, {
    cacheControl: "no-store",
    cdnCacheControl: "no-store",
    privacy: "no-relationship-data",
    runtimeBoundary: "developer-admin",
    vercelCdnCacheControl: "no-store",
  });
  assert.deepEqual(runtimeBoundaryHeaders("mock"), {
    "Cache-Control": RUNTIME_BOUNDARY_HEADER_VALUES.cacheControl,
    "CDN-Cache-Control": RUNTIME_BOUNDARY_HEADER_VALUES.cdnCacheControl,
    "Vercel-CDN-Cache-Control":
      RUNTIME_BOUNDARY_HEADER_VALUES.vercelCdnCacheControl,
    "X-Orbit-Feature-Mode": "mock",
    "X-Orbit-Privacy": RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    "X-Orbit-Runtime-Boundary":
      RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
  });
});

test("app error codes map to deterministic HTTP status values", () => {
  assert.equal(getHttpStatusForAppErrorCode("VALIDATION_ERROR"), 400);
  assert.equal(getHttpStatusForAppErrorCode("UNAUTHORIZED"), 401);
  assert.equal(getHttpStatusForAppErrorCode("FORBIDDEN"), 403);
  assert.equal(getHttpStatusForAppErrorCode("NOT_FOUND"), 404);
  assert.equal(getHttpStatusForAppErrorCode("CONFLICT"), 409);
  assert.equal(getHttpStatusForAppErrorCode("INTERNAL_ERROR"), 500);
  assert.equal(getHttpStatusForAppErrorCode("SERVICE_UNAVAILABLE"), 503);
});

test("feature mode resolves mock by default and only accepts known runtime modes", () => {
  const previousMode = process.env.ORBIT_FEATURE_MODE;

  assert.equal(DEFAULT_FEATURE_MODE, "mock");

  delete process.env.ORBIT_FEATURE_MODE;
  try {
    assert.equal(resolveFeatureMode(), "mock");
    assert.equal(resolveFeatureMode(""), "mock");
    assert.equal(resolveFeatureMode(" MOCK "), "mock");
    assert.equal(resolveFeatureMode("hybrid"), "hybrid");
    assert.equal(resolveFeatureMode("live"), "live");
    assert.equal(resolveFeatureMode("unsupported"), "mock");
  } finally {
    restoreFeatureMode(previousMode);
  }
});

test("health route returns a success envelope in the active feature mode", async () => {
  const previousMode = process.env.ORBIT_FEATURE_MODE;

  delete process.env.ORBIT_FEATURE_MODE;
  try {
    const response = await getHealth();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("cdn-cache-control"), "no-store");
    assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
    assert.equal(response.headers.get("x-orbit-feature-mode"), "mock");
    assert.equal(response.headers.get("x-orbit-runtime-boundary"), "developer-admin");
    assert.equal(response.headers.get("x-orbit-privacy"), "no-relationship-data");
    assert.deepEqual(await response.json(), {
      success: true,
      data: {
        service: "orbit-runtime",
        status: "ok",
        mode: "mock",
        boundary: {
          audience: "developer-admin",
          purpose:
            "Verify the shared API envelope and runtime mode boundary before capability providers run.",
          orbitContext:
            "This probe does not replace the browser relationship workflow.",
          nextStep:
            "Use feature-mode factories for relationship capabilities and keep external actions behind confirmation.",
          mockToLive:
            "Switch providers through ORBIT_FEATURE_MODE and capability factories documented in the Sprint 4 live implementation notes.",
          modeTransition: {
            allowedModes: ["mock", "hybrid", "live"],
            defaultMode: "mock",
            switch:
              "Set ORBIT_FEATURE_MODE to mock, hybrid, or live; missing, empty, and unknown values resolve to mock.",
            providerRule:
              "Capability factories must call resolveFeatureMode() and must not branch on raw environment strings.",
            liveGuardrails:
              "Live mode requires provider-specific configuration, source/evidence provenance, privacy review, confirmation for sensitive external actions, and replacement tests.",
          },
          privacy:
            "No contact, relationship, provider payload, prompt, or external-action data is exposed.",
          provenance:
            "mode is resolved by resolveFeatureMode() from ORBIT_FEATURE_MODE with mock as the fallback.",
        },
      },
    });
  } finally {
    restoreFeatureMode(previousMode);
  }
});

test("health routes fall back to mock for invalid runtime mode values", async () => {
  const previousMode = process.env.ORBIT_FEATURE_MODE;

  process.env.ORBIT_FEATURE_MODE = "provider-token-preview";
  try {
    const response = await getHealth();
    const errorResponse = await getHealthError();
    const body = await response.json();
    const errorBody = await errorResponse.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("cdn-cache-control"), "no-store");
    assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
    assert.equal(response.headers.get("x-orbit-feature-mode"), "mock");
    assert.equal(body.success, true);
    assert.equal(body.data.mode, "mock");

    assert.equal(errorResponse.status, 500);
    assert.equal(errorResponse.headers.get("cache-control"), "no-store");
    assert.equal(errorResponse.headers.get("cdn-cache-control"), "no-store");
    assert.equal(
      errorResponse.headers.get("vercel-cdn-cache-control"),
      "no-store",
    );
    assert.equal(errorResponse.headers.get("x-orbit-feature-mode"), "mock");
    assert.equal(errorBody.success, false);
    assert.equal(errorBody.error.context.mode, "mock");
  } finally {
    restoreFeatureMode(previousMode);
  }
});

test("health routes force dynamic evaluation for runtime mode resolution", () => {
  assert.equal(
    (healthRoute as typeof healthRoute & { dynamic?: string }).dynamic,
    "force-dynamic",
  );
  assert.equal(
    (healthErrorRoute as typeof healthErrorRoute & { dynamic?: string }).dynamic,
    "force-dynamic",
  );
});

test("health error route returns a deterministic failure envelope", async () => {
  const previousMode = process.env.ORBIT_FEATURE_MODE;

  delete process.env.ORBIT_FEATURE_MODE;
  try {
    const response = await getHealthError();

    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("cdn-cache-control"), "no-store");
    assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
    assert.equal(response.headers.get("x-orbit-feature-mode"), "mock");
    assert.equal(response.headers.get("x-orbit-runtime-boundary"), "developer-admin");
    assert.equal(response.headers.get("x-orbit-privacy"), "no-relationship-data");
    assert.deepEqual(await response.json(), {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "A deterministic health failure was requested.",
        context: {
          boundary: "developer-admin",
          mode: "mock",
          privacy: "no-relationship-data",
          provenance:
            "mode is resolved by resolveFeatureMode() from ORBIT_FEATURE_MODE with mock as the fallback.",
          remediation:
            "Check ORBIT_FEATURE_MODE, confirm capability providers use the shared envelope, and verify no provider payload or relationship data was serialized.",
          service: "orbit-runtime",
        },
      },
    });
  } finally {
    restoreFeatureMode(previousMode);
  }
});

test("live implementation notes document the runtime boundary before live providers", () => {
  const liveImplementationNotes = readFileSync(
    join(
      process.cwd(),
      "shared/api/create-the-shared-api-and-runtime-mode-boundary-used-by-all-capabilities/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  for (const requiredPattern of [
    /shared\/services\/<capability>\/live-\*\.ts/,
    /resolveFeatureMode\(\)/,
    /ORBIT_FEATURE_MODE/,
    /ORBIT_SUPABASE_URL/,
    /ORBIT_SUPABASE_SERVICE_ROLE_KEY/,
    /ORBIT_AUTH_CLIENT_ID/,
    /ORBIT_OCR_PROVIDER_API_KEY/,
    /ORBIT_EMAIL_CALENDAR_OAUTH_SCOPES/,
    /ORBIT_NOTIFICATION_PROVIDER_API_KEY/,
    /ORBIT_AI_PROVIDER_API_KEY/,
    /Supabase URL and service keys/,
    /Email and calendar OAuth scopes/,
    /source or evidence provenance/,
    /explicit confirmation and an external action sandbox/,
    /replacement-test coverage/,
    /developer\/admin boundary/i,
    /x-orbit-runtime-boundary/i,
    /non-sensitive runtime context/i,
    /remediation guidance/i,
    /relationship workflow/i,
    /boundary\.modeTransition/,
    /allowedModes/,
    /mock, hybrid, or live/,
    /must not branch on raw environment strings/,
  ]) {
    assert.match(liveImplementationNotes, requiredPattern);
  }
});
