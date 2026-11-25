import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { PublicEventDetail, PublicEventList, PublicInviteInvalid } from "../../app/(app)/app/orbit-2026/events/PublicEvents";
import { journeyOverview } from "../../shared/mock/demo-world/events-journey";

// 未登录的报名入口去注册页（带 next），顶栏的登录 / 开始也带 next；参加码卡的「登录后报名」仍去登录。

const signup = (next: string) => `/app/account/signup?next=${encodeURIComponent(next)}`;
const login = (next: string) => `/app/account/login?next=${encodeURIComponent(next)}`;

test("the public bar keeps the page the visitor came from", () => {
  for (const html of [
    renderToStaticMarkup(<PublicEventList language="zh" nowIso="2026-11-25T00:00:00.000Z" />),
    renderToStaticMarkup(<PublicInviteInvalid language="zh" />),
  ]) {
    assert.ok(html.includes(`href="${signup("/app/events")}"`));
    assert.ok(html.includes(`href="${login("/app/events")}"`));
  }
  const detail = renderToStaticMarkup(<PublicEventDetail eventId="ev 1" language="zh" />);
  assert.ok(detail.includes(`href="${signup("/app/events/ev%201")}"`));
  const invited = renderToStaticMarkup(<PublicEventDetail eventId="ev-1" language="zh" inviteCode="7QKM-H4TR" />);
  assert.ok(invited.includes(`href="${signup("/app/register/7QKM-H4TR")}"`));
});

async function mountDetail(t: { after: (fn: () => void) => void; mock: { method: (target: object, name: string, impl: (...args: never[]) => unknown) => unknown } }, phone: boolean, inviteCode?: string) {
  const assigned: string[] = [];
  const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const overview = { ...journeyOverview("many", "web"), endsAt: soon(8), registrationClosesAt: soon(5), startsAt: soon(7), registration: { href: "/app/events/ev-1/register", status: "none" } };
  t.mock.method(globalThis, "fetch", async () => Response.json({ success: true, data: overview }));
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  // next/link 的预取在空闲时跑：这里不需要它。
  Object.defineProperty(globalThis, "self", { configurable: true, value: { setTimeout: () => 0, clearTimeout() {} } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    addEventListener() {}, clearTimeout, location: { assign: (href: string) => assigned.push(href), href: "http://localhost/app/events/ev-1" },
    matchMedia: () => ({ addEventListener() {}, matches: phone, removeEventListener() {} }), removeEventListener() {}, setTimeout: () => 0,
  } });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<PublicEventDetail eventId="ev-1" language="zh" inviteCode={inviteCode} />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  t.after(() => {
    act(() => root.unmount());
    Reflect.deleteProperty(globalThis, "self");
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  return { assigned, root };
}

test("desktop: the head registration button goes to sign-up with the registration as next", async (t) => {
  const { root } = await mountDetail(t, false);
  const hrefs = root.root.findAll((node) => node.type === "a").map((node) => node.props.href);
  assert.ok(hrefs.includes(signup("/app/events/ev-1/register")));
  assert.equal(hrefs.includes(login("/app/events/ev-1/register")), false);
});

test("phone: the bottom registration button goes to sign-up with the registration as next", async (t) => {
  const { assigned, root } = await mountDetail(t, true);
  const bar = root.root.findAll((node) => node.type === "button" && JSON.stringify(node.children.filter((child) => typeof child === "string")).includes("免费注册并报名"))[0];
  assert.ok(bar);
  act(() => { bar.props.onClick(); });
  assert.deepEqual(assigned, [signup("/app/events/ev-1/register")]);
});

test("invite code: both the head button and the card's free sign-up return to the code; the card still offers sign-in", async (t) => {
  const { root } = await mountDetail(t, false, "7QKM-H4TR");
  const hrefs = root.root.findAll((node) => node.type === "a").map((node) => node.props.href);
  assert.ok(hrefs.filter((href) => href === signup("/app/register/7QKM-H4TR")).length >= 3);
  assert.ok(hrefs.includes(login("/app/register/7QKM-H4TR")));
});
