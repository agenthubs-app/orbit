import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ACCOUNT_SESSION_ERROR_CODES,
  ACCOUNT_SESSION_ERROR_DEFINITIONS,
} from "../../features/account/contract";
import {
  mockAccountSessionFixture,
  mockPendingDemoSignInFixture,
  mockSignedOutSessionFixture,
} from "../../features/account/fixtures";
import { createMockAccountSessionService } from "../../features/account/mock-service";
import {
  MockAccountSessionCapabilityDemo,
  MOCK_ACCOUNT_SESSION_CAPABILITY_SLUG,
} from "../../features/account/mock-account-session/debug-view";
import * as meRoute from "../../app/api/account/me/route";
import * as signOutRoute from "../../app/api/account/session/sign-out/route";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("account contract exposes demo sign-in, signed-out, and require-account behavior", () => {
  const service = createMockAccountSessionService();
  const demoSignIn = service.demoSignIn();
  const signedOut = service.getSignedOutSession();
  const pending = service.getPendingDemoSignIn();
  const requiresAccount = service.requireAccount("signed-out");

  assert.deepEqual(ACCOUNT_SESSION_ERROR_CODES, [
    "DEMO_SIGN_IN_PENDING",
    "SIGNED_OUT",
    "ACCOUNT_REQUIRED",
  ]);
  assert.equal(
    ACCOUNT_SESSION_ERROR_DEFINITIONS.ACCOUNT_REQUIRED.appCode,
    "UNAUTHORIZED",
  );

  assert.equal(demoSignIn.success, true);
  assert.equal(demoSignIn.data.state, "success");
  assert.equal(demoSignIn.data.account.id, mockAccountSessionFixture.account.id);
  assert.deepEqual(demoSignIn.data.provenance.evidenceIds, [
    "evidence:demo-founder-profile",
    "evidence:manual-demo-sign-in",
  ]);

  assert.equal(signedOut.success, true);
  assert.equal(signedOut.data.state, "empty");
  assert.equal(signedOut.data.account, null);
  assert.equal(signedOut.data.session.status, "signed-out");
  assert.equal(
    signedOut.data.provenance.source,
    mockSignedOutSessionFixture.provenance.source,
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(
    pending.data.session.mockSessionId,
    mockPendingDemoSignInFixture.session.mockSessionId,
  );

  assert.equal(requiresAccount.success, false);
  assert.equal(requiresAccount.error.code, "ACCOUNT_REQUIRED");
  assert.equal(requiresAccount.error.appCode, "UNAUTHORIZED");
});

test("mock account session service is deterministic and has no external provider calls", () => {
  const service = createMockAccountSessionService();

  assert.deepEqual(service.getCurrentSession(), service.demoSignIn());
  assert.deepEqual(
    service.getCurrentSession({ scenario: "signed-out" }),
    service.getSignedOutSession(),
  );
  assert.deepEqual(service.signOut(), service.getSignedOutSession());

  for (const filePath of [
    "features/account/contract.ts",
    "features/account/fixtures.ts",
    "features/account/service.ts",
    "features/account/mock-service.ts",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|oauth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|localStorage|indexedDB/);
    assert.doesNotMatch(source, /calendar|email|notification|provider call/i);
  }
});

test("account API routes return stable envelopes for demo and signed-out probes", async () => {
  const meResponse = await meRoute.GET(
    new Request("https://orbit.local/api/account/me"),
  );
  const signOutResponse = await signOutRoute.POST(
    new Request("https://orbit.local/api/account/session/sign-out", {
      method: "POST",
    }),
  );

  assert.equal(meResponse.status, 200);
  assert.equal(meResponse.headers.get("cache-control"), "no-store");
  assert.equal(meResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await meResponse.json(), {
    success: true,
    data: createMockAccountSessionService().demoSignIn().data,
  });

  assert.equal(signOutResponse.status, 200);
  assert.equal(signOutResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await signOutResponse.json(), {
    success: true,
    data: createMockAccountSessionService().getSignedOutSession().data,
  });
});

test("account API routes document controlled empty and failure paths", async () => {
  const emptyResponse = await meRoute.GET(
    new Request("https://orbit.local/api/account/me?scenario=signed-out"),
  );
  const failureResponse = await meRoute.GET(
    new Request("https://orbit.local/api/account/me?scenario=require-account"),
  );

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: createMockAccountSessionService().getSignedOutSession().data,
  });

  assert.equal(failureResponse.status, 401);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "UNAUTHORIZED",
      message:
        "A mock account is required before this relationship action can run.",
      context: {
        accountErrorCode: "ACCOUNT_REQUIRED",
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock account session failure came from deterministic fixture rules.",
        service: "mock-account-session",
      },
    },
  });
});

test("mock account session debug route renders success, empty, pending, and failure states", () => {
  const html = renderToStaticMarkup(
    React.createElement(MockAccountSessionCapabilityDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );

  assert.equal(MOCK_ACCOUNT_SESSION_CAPABILITY_SLUG, "mock-account-session");
  assert.match(pageSource, /MOCK_ACCOUNT_SESSION_CAPABILITY_SLUG/);
  assert.match(pageSource, /MockAccountSessionCapabilityDemo/);

  assert.match(html, /Mock account session capability/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Ari Lane/);
  assert.match(html, /source-backed demo workspace/);
  assert.match(html, /ACCOUNT_REQUIRED/);
  assert.match(html, /Run these probes against the dev server/);
  assert.match(html, /GET \/api\/account\/me\?scenario=require-account/);
  assert.match(html, /Expect 401 failure envelope/);
  assert.match(
    html,
    /features\/account\/mock-account-session\/LIVE_IMPLEMENTATION\.md/,
  );
});

test("mock account session live handoff covers replacement requirements", () => {
  const doc = readFileSync(
    join(
      projectRoot,
      "features/account/mock-account-session/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.match(doc, /Live service and provider files/i);
  assert.match(doc, /Switch mechanism/i);
  assert.match(doc, /Required env vars and permissions/i);
  assert.match(doc, /Privacy and provenance constraints/i);
  assert.match(doc, /Replacement tests/i);
  assert.match(doc, /features\/account\/service\.ts/);
  assert.match(doc, /features\/account\/mock-service\.ts/);
  assert.match(doc, /app\/api\/account\/me\/route\.ts/);
  assert.match(doc, /ORBIT_SUPABASE_URL/);
  assert.match(doc, /source and evidence provenance/i);
});
