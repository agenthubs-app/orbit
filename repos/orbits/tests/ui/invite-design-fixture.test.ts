import assert from "node:assert/strict";
import test from "node:test";

import { inviteDesignFixturesEnabled, inviteDesignView } from "../../app/i/_landing/design-fixture";

// R15 返工复核 M2: the read-only `?design=done` fixture of the public /i/<code> page is local-mock only.
const preview = { kind: "preview" as const, preview: { code: "H8MW-4QZT", expiresAt: "2026-10-14T18:00:00+09:00", shared: { displayName: "松井 遥" }, status: "active" as const, inviterAlreadyConnected: false, isOwnCode: false } };
const MOCK = { NODE_ENV: "development", ORBIT_REDESIGN_MOCK: "add-scan,invite-codes" };

test("the fixture is on only with ORBIT_REDESIGN_MOCK naming invite-codes (or all) outside production", () => {
  assert.equal(inviteDesignFixturesEnabled(MOCK), true);
  assert.equal(inviteDesignFixturesEnabled({ NODE_ENV: "development", ORBIT_REDESIGN_MOCK: "all" }), true);
  assert.equal(inviteDesignFixturesEnabled({ NODE_ENV: "development" }), false, "no mock switch");
  assert.equal(inviteDesignFixturesEnabled({ NODE_ENV: "development", ORBIT_REDESIGN_MOCK: "add-scan" }), false, "another mock");
  assert.equal(inviteDesignFixturesEnabled({ ...MOCK, NODE_ENV: "production" }), false, "never in production");
  assert.equal(inviteDesignFixturesEnabled({ ...MOCK, VERCEL_ENV: "production" }), false, "never on the production deployment");
});

test("?design=done opens 完了 with the inviter's shared fields; anything else, or no preview, opens nothing", () => {
  const view = inviteDesignView("done", preview, MOCK);
  assert.equal(view?.view, "done");
  assert.deepEqual(view?.view === "done" ? view.result.peer : null, { displayName: "松井 遥" });
  assert.equal(inviteDesignView("confirm", preview, MOCK), undefined);
  assert.equal(inviteDesignView(undefined, preview, MOCK), undefined);
  assert.equal(inviteDesignView("done", { kind: "unavailable", limited: false }, MOCK), undefined);
  assert.equal(inviteDesignView("done", preview, { ...MOCK, NODE_ENV: "production" }), undefined);
  assert.equal(inviteDesignView("done", preview, { NODE_ENV: "development" }), undefined);
});
