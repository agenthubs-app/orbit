import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { ContactEnrichmentInline } from "../../app/(app)/app/contacts/network-0918/contact-enrichment-inline";
import { NetworkDetailModal } from "../../app/(app)/app/contacts/network-0918/network-detail-modal";

// W0045（W45-2）：详情弹窗 hero 区的行业／职级／地区轻量编辑，保存走 PATCH，来源以服务端返回为准。

const zh = (copy: { zh: string; en: string }) => copy.zh;
const contact = {
  id: "c1", displayName: "架空 花子", initial: "架", company: "架空商事", title: "営業本部長", industry: "", source: "event", stage: "Active", pipelineStatus: "in_progress", location: "東京都千代田区",
  met: "", lastInteraction: "", nextAction: null, valueTags: [], notes: [], encounters: [],
  primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal",
  seniorityLevel: "director", region: { countryCode: "JP", city: "Tokyo" },
  enrichmentOrigins: { industry: "ai", seniorityLevel: "ai", region: "card" },
} as never;

test("the hero shows industry, seniority with its group, region and where each value came from", () => {
  const html = renderToStaticMarkup(<NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />);
  assert.match(html, /data-network-detail-enrichment/);
  assert.match(html, /总监 · 决策层/);
  assert.match(html, /日本 · 东京/);
  assert.match(html, /data-enrichment-origin="ai"[^>]*>AI 推断/);
  assert.match(html, /data-enrichment-origin="card"[^>]*>名片规则/);
  const empty = renderToStaticMarkup(<ContactEnrichmentInline contact={{ id: "c2" } as never} language="zh" t={zh} />);
  assert.equal((empty.match(/<strong>—<\/strong>/g) ?? []).length, 3, "missing values render as dashes, never invented");
  assert.doesNotMatch(empty, /data-enrichment-origin/);
});

test("editing sends only the changed fields to PATCH and shows the server's manual provenance", async (t) => {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    return Response.json({ success: true, data: { contact: {
      primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal",
      seniorityLevel: "vp", region: { countryCode: "SG", city: "Singapore" },
      enrichment: { version: 1, fields: { industry: { origin: "ai" }, seniorityLevel: { origin: "user" }, region: { origin: "user" } } },
    } } });
  });
  let renderer: ReactTestRenderer;
  act(() => { renderer = create(<ContactEnrichmentInline contact={contact} language="zh" t={zh} />); });
  const find = (props: Record<string, unknown>) => renderer!.root.findByProps(props);
  act(() => find({ "data-enrichment-edit": true }).props.onClick());
  const select = (label: string) => renderer!.root.findAllByType("select").find(entry => entry.props["aria-label"] === label)!;
  const input = () => renderer!.root.findAllByType("input").find(entry => entry.props["aria-label"] === "城市")!;
  assert.equal(find({ "data-enrichment-save": true }).props.disabled, true, "nothing to save until something changes");
  act(() => select("职级").props.onChange({ target: { value: "vp" } }));
  act(() => select("国家／地区").props.onChange({ target: { value: "SG" } }));
  assert.equal(input().props.value, "", "changing the country clears the city");
  act(() => input().props.onChange({ target: { value: "Singapore" } }));
  await act(async () => { await find({ "data-enrichment-save": true }).props.onClick(); });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.url, "/api/contacts/c1");
  assert.deepEqual(requests[0]!.body, { seniorityLevel: "vp", region: { countryCode: "SG", city: "Singapore" } }, "industry was not touched, so it is not sent");
  const html = JSON.stringify(renderer!.toJSON());
  assert.match(html, /副总裁 · 决策层/);
  assert.match(html, /"新加坡"/);
  assert.doesNotMatch(html, /新加坡 · 新加坡/, "a city-state is not repeated");
  assert.equal(renderer!.root.findAll(node => node.props["data-enrichment-origin"] === "user").length, 2);
});

test("in demo mode the edit button only triggers the write guard and sends nothing", (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({}));
  const guarded: string[] = [];
  let renderer: ReactTestRenderer;
  act(() => { renderer = create(<ContactEnrichmentInline contact={contact} guardWrite={label => guarded.push(label)} language="zh" t={zh} />); });
  act(() => renderer!.root.findByProps({ "data-enrichment-edit": true }).props.onClick());
  assert.deepEqual(guarded, ["联系人资料"]);
  assert.equal(renderer!.root.findAllByType("select").length, 0);
  assert.equal(fetchMock.mock.callCount(), 0);
});
