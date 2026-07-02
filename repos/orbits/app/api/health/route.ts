import { NextResponse } from "next/server";
import {
  runtimeBoundaryHeaders,
  success,
} from "../../../shared/api/envelope";
import {
  DEFAULT_FEATURE_MODE,
  FEATURE_MODES,
  resolveFeatureMode,
} from "../../../shared/config/feature-mode";

// Health route 是最小运行时探针：验证 shared envelope、feature mode 和边界 headers。
// 它不会读取任何关系数据，也不会触发 capability provider。
export const dynamic = "force-dynamic";

const healthBoundary = {
  audience: "developer-admin",
  purpose:
    "Verify the shared API envelope and runtime mode boundary before capability providers run.",
  orbitContext: "This probe does not replace the browser relationship workflow.",
  nextStep:
    "Use feature-mode factories for relationship capabilities and keep external actions behind confirmation.",
  mockToLive:
    "Switch providers through ORBIT_MODULE_MODE, falling back to ORBIT_FEATURE_MODE, and capability factories documented in the live implementation notes.",
  modeTransition: {
    allowedModes: FEATURE_MODES,
    defaultMode: DEFAULT_FEATURE_MODE,
    switch:
      "Set ORBIT_MODULE_MODE to mock, hybrid, or live; ORBIT_FEATURE_MODE remains a fallback for older scripts. Missing, empty, and unknown values resolve to mock.",
    providerRule:
      "Capability factories must call resolveFeatureMode() and must not branch on raw environment strings.",
    liveGuardrails:
      "Live mode requires provider-specific configuration, source/evidence provenance, privacy review, confirmation for sensitive external actions, and replacement tests.",
  },
  privacy:
    "No contact, relationship, provider payload, prompt, or external-action data is exposed.",
  provenance:
    "mode is resolved by resolveFeatureMode() from ORBIT_MODULE_MODE before ORBIT_FEATURE_MODE, with mock as the fallback.",
} as const;

export function GET(): Response {
  const mode = resolveFeatureMode();

  return NextResponse.json(
    success({
      service: "orbit-runtime",
      status: "ok",
      mode,
      boundary: healthBoundary,
    }),
    {
      headers: runtimeBoundaryHeaders(mode),
      status: 200,
    },
  );
}
