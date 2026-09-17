import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import {
  metLabel,
  OrbitRealCardConnection,
  sourcedValue,
} from "../../app/(app)/app/contacts/orbit-real-card-connection";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import type {
  OrbitContactsViewModel,
  OrbitContactView,
} from "../../app/(app)/app/orbit-contacts-route-view-model";
import { mountOrbitRealCardConnection } from "./contact-relationship-initialization-mount-helper";

// 存量联系人（名片确认时写入的英文句子 + 服务层旧占位值）的真实形状。
const ACCOUNT_EMAIL = "chrome-journey-1788954155@example.invalid";
const LEGACY_SOURCE_LABEL = `Business card confirmed by ${ACCOUNT_EMAIL}`;
const LEGACY_NEXT_STEP = "Review the live contact detail before taking action.";
const LEGACY_CONTEXT = "Live relationship context is available for this contact.";

async function legacyBusinessCardViewModel(): Promise<OrbitContactsViewModel> {
  const routeModel = await loadAppContactDetailRoute({
    contactId: "demo-contact-1",
    mode: "mock",
  });

  assert.equal(routeModel.routeState, "success");

  if (routeModel.routeState !== "success") {
    throw new Error("mock contact detail route did not succeed");
  }

  const viewModel = contactDetailRouteToOrbitContactsViewModel(routeModel, "zh");
  const [base] = viewModel.connections;
  const contact: OrbitContactView = {
    ...base,
    company: "星轨科技有限公司 Xingui Technology Co., Ltd.",
    displayName: "林 若曦",
    industry: "relationship context",
    lastInteraction: LEGACY_CONTEXT,
    met: LEGACY_SOURCE_LABEL,
    nextAction: { text: LEGACY_NEXT_STEP, reason: LEGACY_CONTEXT },
    note: LEGACY_SOURCE_LABEL,
    notes: [
      {
        body: "罗马字姓名: Ruoxi Lin 地址: 上海市浦东新区张江高科技园区 88 号",
        createdAt: "2026-09-01T09:00:00.000Z",
        id: "business-card-batch:demo:1",
      },
    ],
    source: "scan",
    title: "产品总监 · Director of Product",
  };

  return { ...viewModel, connections: [contact] };
}

function render(viewModel: OrbitContactsViewModel, language: "zh" | "en"): string {
  return renderToStaticMarkup(
    <OrbitLanguageProvider initialLanguage={language}>
      <OrbitRealCardConnection contactId={viewModel.connections[0].id} viewModel={viewModel} />
    </OrbitLanguageProvider>,
  );
}

test("contact seeking is labelled as their need, not as the viewer's verified ability", async () => {
  const viewModel = await legacyBusinessCardViewModel();
  const contact = viewModel.connections[0];
  const encounter = contact.encounters[0];
  assert.ok(encounter);
  const scoped = { ...viewModel, connections: [{ ...contact, encounters: [{
    ...encounter,
    context: { ...encounter.context, publicProfile: {
      ...encounter.context.publicProfile,
      offering: ["项目落地与运营经验"],
      seeking: ["创业者"],
    } },
  }] }] };
  const zh = render(scoped, "zh");
  assert.match(zh, /对方希望获得/);
  assert.match(zh, /对方能提供/);
  assert.match(zh, /创业者/);
  assert.match(zh, /项目落地与运营经验/);
  assert.doesNotMatch(zh, /我能为对方提供/);
  const en = render(scoped, "en");
  assert.match(en, /is looking for/);
  assert.doesNotMatch(en, /You →/);
});

test("metLabel keys the source label on the stable source code, never on the stored actor sentence", () => {
  const zh = (copy: { en: string; zh: string }) => copy.zh;
  const en = (copy: { en: string; zh: string }) => copy.en;

  assert.equal(metLabel({ met: LEGACY_SOURCE_LABEL, source: "scan" }, zh), "名片扫描确认");
  assert.equal(metLabel({ met: LEGACY_SOURCE_LABEL, source: "scan" }, en), "Business card scan");
  assert.equal(metLabel({ met: "Business card scan", source: "scan" }, zh), "名片扫描确认");
  // 非名片来源保留真实标签（活动名等），但同样不允许账号邮箱当正文。
  assert.equal(metLabel({ met: "关西创业者晚宴", source: "event" }, zh), "关西创业者晚宴");
  assert.equal(metLabel({ met: `Event confirmed by ${ACCOUNT_EMAIL}`, source: "event" }, zh), "活动导入");
  assert.equal(metLabel({ met: "", source: "qr" }, zh), "现场扫码");
});

test("sourcedValue treats service-layer English placeholders as absent", () => {
  assert.equal(sourcedValue("relationship context"), "");
  assert.equal(sourcedValue("Relationship Context"), "");
  assert.equal(sourcedValue(LEGACY_NEXT_STEP), "");
  assert.equal(sourcedValue(LEGACY_CONTEXT), "");
  assert.equal(sourcedValue(LEGACY_SOURCE_LABEL), "");
  assert.equal(sourcedValue("  企业级 SaaS  "), "企业级 SaaS");
  assert.equal(sourcedValue(undefined), "");
});

test("contact detail renders a business-card contact without the account email or English placeholders (zh)", async () => {
  const html = render(await legacyBusinessCardViewModel(), "zh");

  assert.doesNotMatch(html, new RegExp(ACCOUNT_EMAIL.replace(/[.@]/g, "\\$&")));
  assert.doesNotMatch(html, /confirmed by/i);
  assert.doesNotMatch(html, /before taking action/i);
  assert.doesNotMatch(html, /Live relationship context is available/i);
  assert.doesNotMatch(html, />relationship context</i);

  assert.match(html, /认识于 名片扫描确认/);
  assert.match(html, /认识来源<\/span><span class="nc-fv">名片扫描确认/);
  assert.match(html, /<span class="nc-fk">行业<\/span>/);
  assert.match(html, /<span>未分类<\/span>/);
  assert.match(html, /aria-label="编辑主要行业"/);
  assert.match(html, /<span class="nc-fk">最近互动<\/span>/);
  assert.match(html, /<span>暂无互动记录<\/span>/);
  assert.match(html, /aria-label="编辑最近互动"/);
  // SSR cannot infer the relationship state before the client readback.
  assert.match(html, /关系状态尚未确认/);
  assert.doesNotMatch(html, /暂无来源明确的下一步建议。/);

  // 时间线：名片备注正文原样保留，标签本地化，证据 id 作为等宽标识展示。
  assert.match(html, /罗马字姓名: Ruoxi Lin 地址: 上海市浦东新区张江高科技园区 88 号/);
  assert.match(html, /来源证据<span class="nc-eid mono">business-card-batch:demo:1<\/span>/);
});

test("contact detail renders the same legacy contact in English without leaking the account email", async () => {
  const html = render(await legacyBusinessCardViewModel(), "en");

  assert.doesNotMatch(html, new RegExp(ACCOUNT_EMAIL.replace(/[.@]/g, "\\$&")));
  assert.doesNotMatch(html, /confirmed by/i);
  assert.match(html, /Relationship state unavailable/);
  assert.doesNotMatch(html, /No sourced next step is available\./);
  assert.match(html, /Met via Business card scan/);
  assert.doesNotMatch(html, />relationship context</i);
  assert.match(html, /<span class="nc-fk">Industry<\/span>/);
  assert.match(html, /<span>Unclassified<\/span>/);
  assert.match(html, /aria-label="Edit primary industry"/);
});

for (const [language, emptyCopy] of [
  ["zh", "暂无来源明确的下一步建议。"],
  ["en", "No sourced next step is available."],
] as const) {
  test(`mounted legacy readback keeps the sourced next-step privacy guard (${language})`, async (t) => {
    const viewModel = await legacyBusinessCardViewModel();
    let reads = 0;
    const root = await mountOrbitRealCardConnection(t, {
      contactId: viewModel.connections[0].id,
      language,
      viewModel,
      fetcher: (async (input, init) => {
        reads += 1;
        assert.equal(String(input), `/api/contacts/${encodeURIComponent(viewModel.connections[0].id)}/relationship-initialization`);
        assert.equal(init?.cache, "no-store");
        assert.equal(init?.credentials, "same-origin");
        assert.equal(init?.method, undefined);
        return new Response(null, { status: 404 });
      }) as typeof fetch,
    });
    assert.equal(reads, 1);
    const rendered = JSON.stringify(root.toJSON());
    assert.match(rendered, new RegExp(emptyCopy.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
    assert.doesNotMatch(rendered, /chrome-journey-1788954155@example\.invalid/);
    assert.doesNotMatch(rendered, /confirmed by|before taking action|Live relationship context is available|>relationship context</iu);
    assert.doesNotMatch(rendered, /依据：Live relationship context/);
  });
}
