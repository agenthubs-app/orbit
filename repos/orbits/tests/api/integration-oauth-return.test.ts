import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createIntegrationAuthorizeGetHandler } from "../../app/api/integrations/[provider]/authorize/handler";
import { createIntegrationCallbackGetHandler } from "../../app/api/integrations/[provider]/callback/handler";
import { createIntegrationOAuthState } from "../../features/integrations/oauth-state";
import { integrationSessionBinding } from "../../features/integrations/session-binding";

const secret = "local-oauth-return-tests";
const context = { params: Promise.resolve({ provider: "google_calendar" }) };
const cookie = "authjs.session-token=local-session";
const session = async () => ({ user: { id: "a", email: "a@example.test" } });

function fixture() {
  let registered: string | undefined;
  let consumed = false;
  const exchanges: string[] = [];
  const authorize = createIntegrationAuthorizeGetHandler({
    resolveSession: session, secret: () => secret,
    service: () => ({
      async registerOAuthState(input) { registered = input.state; },
      authorizationUrl({ state }) { return `https://provider.invalid/authorize?state=${encodeURIComponent(state)}`; },
    }),
  });
  const callback = createIntegrationCallbackGetHandler({
    resolveSession: session, secret: () => secret,
    resolveActor: async () => ({ id: "a", accountId: "a", userId: "a", workspaceId: "w" }),
    service: () => ({
      async consumeOAuthState(input) { if (consumed || input.state !== registered) return false; consumed = true; return true; },
      async exchangeCode({ code }) { exchanges.push(code); },
      async listAuthorizations() { return []; },
    }),
    inbox: () => { throw Error("no expiry notification expected"); },
  });
  const callbackRequest = (state: string, query = "", sessionCookie = cookie) => new Request(
    `http://localhost/api/integrations/google_calendar/callback?code=local-code&state=${encodeURIComponent(state)}${query}`,
    { headers: { cookie: `${sessionCookie}; orbit-integration-state-google_calendar=${state}` } },
  );
  return { authorize, callback, callbackRequest, exchanges, register(state: string) { registered = state; } };
}

test("authorize carries the allowed return key through signed state and callback ignores query overrides", async () => {
  for (const [query, expected] of [
    ["?returnTo=settings", "/app/settings"], ["?returnTo=calendar", "/app/tasks?tab=calendar"],
    ["", "/app/tasks?tab=calendar"], ["?returnTo=https%3A%2F%2Fevil.test", "/app/tasks?tab=calendar"],
    ["?returnTo=%2F%2Fevil.test", "/app/tasks?tab=calendar"], ["?returnTo=constructor", "/app/tasks?tab=calendar"],
  ]) {
    const f = fixture();
    const authorization = await f.authorize(new Request(`http://localhost/api/integrations/google_calendar/authorize${query}`, { headers: { cookie } }), context);
    assert.equal(authorization.status, 307);
    const state = new URL(authorization.headers.get("location")!).searchParams.get("state")!;
    assert.ok(state);
    const response = await f.callback(f.callbackRequest(state, "&returnTo=https%3A%2F%2Fevil.test"), context);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), `http://localhost${expected}`);
    assert.match(response.headers.get("set-cookie")!, /orbit-integration-state-google_calendar=;.*Max-Age=0/);
    assert.deepEqual(f.exchanges, ["local-code"]);
    assert.equal((await f.callback(f.callbackRequest(state), context)).status, 400, "one-time state cannot be replayed");
    assert.deepEqual(f.exchanges, ["local-code"]);
  }
});

test("legacy and unrecognized signed return values default to calendar", async () => {
  for (const returnTo of [undefined, "https://evil.test", "//evil.test", "__proto__", "toString"]) {
    const f = fixture();
    const state = createIntegrationOAuthState({ provider: "google_calendar", actorId: "a", sessionBinding: integrationSessionBinding(new Request("http://localhost", { headers: { cookie } }))!, secret });
    const value = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString("utf8"));
    if (returnTo === undefined) delete value.returnTo; else value.returnTo = returnTo;
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    const signed = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
    f.register(signed);
    const response = await f.callback(f.callbackRequest(signed), context);
    assert.equal(response.headers.get("location"), "http://localhost/app/tasks?tab=calendar");
  }
});

test("tampered return state and a different authenticated session fail before exchange", async () => {
  const f = fixture();
  const authorization = await f.authorize(new Request("http://localhost/api/integrations/google_calendar/authorize?returnTo=settings", { headers: { cookie } }), context);
  const state = new URL(authorization.headers.get("location")!).searchParams.get("state")!;
  const value = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString("utf8"));
  const tampered = `${Buffer.from(JSON.stringify({ ...value, returnTo: "calendar" })).toString("base64url")}.${state.split(".")[1]}`;
  assert.equal((await f.callback(f.callbackRequest(tampered), context)).status, 400);
  assert.equal((await f.callback(f.callbackRequest(state, "", "authjs.session-token=other"), context)).status, 400);
  assert.deepEqual(f.exchanges, []);
});
