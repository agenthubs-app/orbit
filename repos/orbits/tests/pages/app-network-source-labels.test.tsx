import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { contactDetailRouteToOrbitContactsViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-view-model-adapter";
import { loadAppContactDetailRoute } from "../../app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service";
import { NetworkDetailModal } from "../../app/(app)/app/contacts/network-0918/network-detail-modal";
import { SOURCE_LABEL, sourceOf } from "../../app/(app)/app/contacts/network-0918/network-model";
import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import type { OrbitContactView } from "../../app/(app)/app/orbit-contacts-route-view-model";

// Behaviour carried over from the retired orbit-real-card-connection tests:
// the source label is keyed on the stable source code (never on the stored
// actor sentence) and localizes per UI language; a contact's seeking is
// labelled as their need, not as the viewer's ability.

const ACCOUNT_EMAIL = "chrome-journey-1788954155@example.invalid";
const LEGACY_SOURCE_LABEL = `Business card confirmed by ${ACCOUNT_EMAIL}`;

async function legacyBusinessCardContact(): Promise<OrbitContactView> {
  const routeModel = await loadAppContactDetailRoute({ contactId: "demo-contact-1", mode: "mock" });
  assert.equal(routeModel.routeState, "success");
  if (routeModel.routeState !== "success") throw new Error("mock contact detail route did not succeed");
  const [base] = contactDetailRouteToOrbitContactsViewModel(routeModel, "zh").connections;
  const encounter = base.encounters[0];
  assert.ok(encounter);
  return {
    ...base,
    company: "星轨科技有限公司 Xingui Technology Co., Ltd.",
    displayName: "林 若曦",
    met: LEGACY_SOURCE_LABEL,
    source: "scan",
    title: "产品总监 · Director of Product",
    encounters: [{
      ...encounter,
      context: { ...encounter.context, publicProfile: {
        ...encounter.context.publicProfile,
        offering: ["项目落地与运营经验"],
        seeking: ["创业者"],
      } },
    }],
  };
}

function render(contact: OrbitContactView, language: "zh" | "en"): string {
  return renderToStaticMarkup(
    <OrbitLanguageProvider initialLanguage={language}>
      <NetworkDetailModal contact={contact} closeHref="/app/contacts" onFollow={() => {}} />
    </OrbitLanguageProvider>,
  );
}

test("SOURCE_LABEL keys the source label on the stable source code in every UI language", () => {
  assert.equal(SOURCE_LABEL[sourceOf({ source: "scan" })].zh, "名片导入");
  assert.equal(SOURCE_LABEL[sourceOf({ source: "scan" })].en, "Business cards");
  assert.equal(SOURCE_LABEL[sourceOf({ source: "event" })].zh, "活动认识");
  assert.equal(SOURCE_LABEL[sourceOf({ source: "referral" })].zh, "朋友引荐");
  assert.equal(SOURCE_LABEL[sourceOf({ source: "contact" })].zh, "通讯录");
  // 现场扫码 / 手动 / 交换没有自己的来源卡，折叠到「其他来源」，仍然不依赖存储的句子。
  for (const source of ["qr", "manual", "exchange"] as const) {
    assert.equal(SOURCE_LABEL[sourceOf({ source })].zh, "其他来源");
    assert.equal(SOURCE_LABEL[sourceOf({ source })].en, "Other");
  }
});

test("contact detail labels a business-card contact by source code in zh and en", async () => {
  const contact = await legacyBusinessCardContact();
  const zh = render(contact, "zh");
  // 账号邮箱与「confirmed by」句绝不能出现在渲染结果里（旧详情 metLabel 守卫的移植）。
  assert.doesNotMatch(zh, /example\.invalid/);
  assert.doesNotMatch(zh, /confirmed by/i);
  assert.match(zh, /⇢ 来自 名片导入/);
  assert.match(zh, /来源<\/span><strong class="nw-ov-v">名片导入</);
  assert.match(zh, /林 若曦/);
  assert.match(zh, /星轨科技有限公司 Xingui Technology Co\., Ltd\. · 产品总监 · Director of Product/);
  const en = render(contact, "en");
  assert.doesNotMatch(en, /example\.invalid/);
  assert.doesNotMatch(en, /confirmed by/i);
  assert.match(en, /⇢ From Business cards/);
  assert.match(en, /Source<\/span><strong class="nw-ov-v">Business cards</);
  assert.doesNotMatch(en, /名片导入/);
});

test("contact seeking is labelled as their need, not as the viewer's verified ability", async () => {
  const contact = await legacyBusinessCardContact();
  const zh = render(contact, "zh");
  assert.match(zh, /对方需求<\/strong><span class="nw-li"><span class="nw-li-dot">•<\/span>创业者/);
  assert.match(zh, /项目落地与运营经验/);
  assert.doesNotMatch(zh, /我能为对方提供/);
  const en = render(contact, "en");
  assert.match(en, /What they need<\/strong><span class="nw-li"><span class="nw-li-dot">•<\/span>创业者/);
  assert.match(en, /What they offer/);
  assert.doesNotMatch(en, /You →/);
});
