import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";
import { generateEventRegistrationQuestions } from "../../features/events/registration/question-generator";
import { resolveEventRegistrationEligibility } from "../../features/events/registration/eligibility";

test("actual registration page SSR is read-only and never attempts model prewarming", async () => {
  let attempts = 0, generations = 0;
  const event = { ...mockEventRecords[0], startsAt: "2030-01-01T09:00:00.000Z", endsAt: "2030-01-01T12:00:00.000Z", status: "confirmed" as const };
  const emptyComponent = () => null;
  const fixtures: Record<string, unknown> = {
    StateView: emptyComponent, OrbitReferenceStyles: emptyComponent, OrbitVisualFreezeRuntime: emptyComponent, EventRegistrationWorkspace: emptyComponent,
    // Orbit_0918 报名弹窗壳（events-0918/event-register-modal，`../../` import 同样被夹具替换）：只透传 children。
    EventRegisterModal: ({ children }: { children: unknown }) => children,
    auth: async () => ({ user: { id: "synthetic-actor", name: "Fixture" } }),
    resolveAuthenticatedApiActorFromSession: async () => ({ id: "synthetic-actor", name: "Fixture", email: "fixture@example.com" }),
    normalizeOrbitLanguage: (language: string) => language, getOrbitServerLanguage: async () => "en", localizeOrbitTree: (value: unknown) => value,
    eventTitleForId: () => null, localizedEventTitle: () => event.title, bilingualSegment: (value: string) => value,
    loadEventForRegistration: async () => event,
    eventRegistrationRuntimeService: { get: async () => null }, readRuntimeEventRegistrationWindow: async () => ({ availability: "open" }),
    resolveEventRegistrationEligibility,
    createConfiguredEventAdmissionJourneyService: () => ({ getState: async () => ({ admissionControlled: false, application: null }) }),
    createProfileService: () => ({ getProfile: async () => ({ success: false }) }),
    signAdaptiveInterviewQuestion: () => { throw new Error("Read-only SSR must not synthesize an AI interview proof."); },
    eventRegistrationReturnPath: () => "/app/events/fixture/register", redirect: () => { throw new Error("Unexpected redirect."); },
    generateEventRegistrationQuestions: async (input: Parameters<typeof generateEventRegistrationQuestions>[0]) => {
      generations++;
      return generateEventRegistrationQuestions({ ...input, modelRunner: async () => { attempts++; throw new Error("SSR must not invoke the model."); } });
    },
  };
  const bundle = await build({
    entryPoints: ["app/(app)/app/events/[id]/register/page.tsx"], bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", packages: "external",
    plugins: [{ name: "slow-boundary-fixtures", setup(builder) {
      builder.onResolve({ filter: /^\.\./ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onResolve({ filter: /^\.\// }, args => args.importer.endsWith("page.tsx") ? { path: args.path, namespace: "fixture" } : undefined);
      builder.onResolve({ filter: /^next\/navigation$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: Object.keys(fixtures).map(name => `export const ${name}=fixtures.${name};`).join("\n"), loader: "js" }));
    } }],
  });
  const module = { exports: {} as { default: (input: unknown) => Promise<unknown> } };
  runInNewContext(bundle.outputFiles[0]!.text, { fixtures, module, exports: module.exports, require: createRequire(import.meta.url), process });
  const result = await module.exports.default({ params: Promise.resolve({ id: event.id }), searchParams: Promise.resolve({ language: "en" }) });
  assert.ok(result);
  assert.equal(generations, 1);
  assert.equal(attempts, 0);
});
