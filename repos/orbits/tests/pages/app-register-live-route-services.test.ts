import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("/app/register resolves invite codes before redirecting to the canonical registration workspace", () => {
  const pageSource = source("app/(app)/app/register/page.tsx");

  assert.match(pageSource, /loadAppRegisterRouteViewModel/);
  assert.match(pageSource, /redirect\(/);
  assert.match(pageSource, /routeModel\.register\.event\.id/);
  assert.match(pageSource, /StateView/);
  assert.doesNotMatch(pageSource, /query\.mode|query\.scenario|destination\.set\("mode"/);
  assert.doesNotMatch(pageSource, /getOrbitRegisterViewModel/);
  assert.doesNotMatch(pageSource, /OrbitRealRegister|Registration complete/);
});

test("app register route loader resolves only a reviewed public event code", async () => {
  const { loadAppRegisterRouteViewModel } = await import(
    "../../app/(app)/app/register/compose-app-register-from-previously-approved-mock-first-capabilities/register-route-view-model"
  );
  const viewModel = await loadAppRegisterRouteViewModel({
    code: "EVTSIGNUP01",
  });

  assert.equal(viewModel.state, "success");

  if (viewModel.state === "success") {
    assert.equal(viewModel.register.event.id, "event_signup_01");
    assert.equal(viewModel.register.event.name, "关西跨境商务对接会");
    assert.deepEqual(Object.keys(viewModel.register), ["event"]);
  }
});

test("legacy register route does not load an unused profile form before redirecting", () => {
  const routeSource = source(
    "app/(app)/app/register/compose-app-register-from-previously-approved-mock-first-capabilities/register-route-view-model.ts",
  );

  assert.doesNotMatch(routeSource, /loadAppProfileRouteViewModel/);
  assert.doesNotMatch(routeSource, /profileRouteToOrbitProfileViewModel/);
  assert.doesNotMatch(routeSource, /profilePreview|industryOptions|offeringTags/);
});

test("/app/register redirects a reviewed code without propagating fixture controls", async () => {
  const Page = (await import("../../app/(app)/app/register/page"))
    .default as (props: {
    searchParams: Promise<Record<string, string | undefined>>;
  }) => Promise<React.ReactElement>;

  await assert.rejects(
    () =>
      Page({
        searchParams: Promise.resolve({
          code: "EVTSIGNUP01",
          language: "en",
          mode: "mock",
          scenario: "failure",
        }),
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "NEXT_REDIRECT" &&
      error.digest.includes(
        "/app/events/event_signup_01/register?language=en",
      ) &&
      !error.digest.includes("mode=") &&
      !error.digest.includes("scenario="),
  );
});

test("app register page fails closed for an unknown public code without retrying the same route", async () => {
  const Page = (await import("../../app/(app)/app/register/page"))
    .default as (props: {
    searchParams: Promise<Record<string, string | undefined>>;
  }) => Promise<React.ReactElement>;
  const html = renderToStaticMarkup(
    await Page({
      searchParams: Promise.resolve({
        code: "demo-event-1",
        mode: "mock",
        scenario: "failure",
      }),
    }),
  );

  assert.match(html, /Registration is not ready/);
  assert.match(html, /PUBLIC_REGISTRATION_EVENT_NOT_FOUND/);
  assert.match(html, /public-catalogue-registration-event-not-found/);
  assert.match(html, /data-state-boundary="shared-ui-state-view"/);
  assert.match(html, /app-register-route-state/);
  assert.doesNotMatch(html, /Climate founders dinner|Retry registration/);
});
