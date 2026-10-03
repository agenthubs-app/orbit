/**
 * W0059 SC-W0059-04（入口单测）：iOrbit 对话里「查看」／「查看联系人」与人脉路由 VM 的详情链接
 * 对 id 做 URL 编码（只改拼接，不改去处）；程序化跳转前记下一次性导航意图，详情关闭时后退回这里。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { act, create } from "react-test-renderer";

import { PanelCards } from "../../app/(app)/app/agent/iorbit-0918/iorbit-rich-components";
import { contactDetailHref } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { DETAIL_RETURN_STORAGE_KEY } from "../../app/(app)/app/contacts/network-0918/detail-return";

const SPECIAL = "contact:a/b c?#%";
const ENCODED = `/app/contacts/${encodeURIComponent(SPECIAL)}`;

test("contacts route VM: detail href encodes the id after stripping the contact: prefix", () => {
  assert.equal(contactDetailHref({ displayName: "X", id: "contact:a/b c?#%" } as never), `/app/contacts/${encodeURIComponent("a/b c?#%")}`);
  assert.equal(contactDetailHref({ displayName: "X", id: "plain-1" } as never), "/app/contacts/plain-1");
  assert.equal(contactDetailHref({ displayName: "Kenji Watanabe", id: "contact:x" } as never), "/app/contacts/demo-contact-1");
});

test("iOrbit chat 「查看」 navigates to the encoded detail href and records the return intent first", async (t) => {
  const storage = new Map<string, string>();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
      location: { origin: "https://orbit.example", pathname: "/app/agent", search: "?q=hi" },
      sessionStorage: { getItem: (k: string) => storage.get(k) ?? null, removeItem: (k: string) => void storage.delete(k), setItem: (k: string, v: string) => void storage.set(k, v) },
    },
  });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
  });
  const navigated: string[] = [];
  const panel = {
    items: [{ connection: { company: "Nexa", displayName: "田中", g: "g", id: SPECIAL, industry: "", initial: "田", pipelineStatus: "to_contact", title: "" }, match: 80, opener: "", reason: "" }],
    kind: "people",
    panelTitle: "人",
  } as never;
  let root: ReturnType<typeof create> | undefined;
  await act(async () => {
    root = create(<PanelCards language="zh" navigate={(href) => navigated.push(href)} panel={panel} t={(c) => c.zh} />);
  });
  const view = root!.root.find((node) => node.type === "button" && node.props.className === "btn btn-ghost btn-sm" && JSON.stringify(node.children).includes("查看"));
  await act(async () => view.props.onClick());
  assert.deepEqual(navigated, [ENCODED]);
  const intent = JSON.parse(storage.get(DETAIL_RETURN_STORAGE_KEY) ?? "null");
  assert.equal(intent.from, "/app/agent?q=hi");
  assert.equal(intent.to, ENCODED);
  act(() => root!.unmount());
});
