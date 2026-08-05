import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const journeySource = readFileSync(
  new URL(
    "../../features/events/admission/journey-service.ts",
    import.meta.url,
  ),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL(
    "../../features/events/admission/journey-runtime.ts",
    import.meta.url,
  ),
  "utf8",
);
const applicationHandlerSource = readFileSync(
  new URL(
    "../../app/api/events/[id]/admission/application/handler.ts",
    import.meta.url,
  ),
  "utf8",
);

test("admission journey is canonical-only and has no registration or fixture fallback", () => {
  assert.match(journeySource, /eventCoreService\.getPublishedEvent/u);
  assert.match(journeySource, /admissionService\.submitApplication/u);
  assert.match(journeySource, /verifyInterviewResponseSubmissions/u);
  assert.doesNotMatch(
    journeySource,
    /eventRegistrationRuntimeService|loadEventForRegistration|public-catalogue|mock|fixture|fallback/u,
  );
  assert.match(runtimeSource, /createConfiguredEventCoreService/u);
  assert.match(runtimeSource, /createConfiguredEventAdmissionService/u);
  assert.doesNotMatch(runtimeSource, /createMock|createHybrid|fallback/u);
});

test("application API resolves identity server-side and never accepts raw profile answers", () => {
  assert.match(applicationHandlerSource, /resolveAuthenticatedApiActor/u);
  assert.match(applicationHandlerSource, /authenticatedApiActorRequiredResponse/u);
  assert.match(applicationHandlerSource, /exactApplicationBody/u);
  assert.doesNotMatch(
    applicationHandlerSource,
    /eventRegistrationRuntimeService|loadEventForRegistration|legacyResponsesFromAnswers/u,
  );
});
