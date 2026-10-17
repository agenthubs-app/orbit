import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";
import { bundleScenarios, launch, openScenario } from "./helpers/ui-harness";

// Exercise the real private presenters and kit controls. API/CAS receipts and
// native permission/OAuth boundaries have separate tests; these are not device evidence.
const entry = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AccountEditorContent } from "./src/screens/me/AccountEditorContent";
import { AccountPreviewContent } from "./src/screens/me/AccountPreviewContent";
import { AccountSettingsContent } from "./src/screens/me/AccountSettingsContent";
import { AccountSuggestionsContent } from "./src/screens/me/AccountSuggestionsContent";
import { MyPageContent } from "./src/screens/me/MyPageContent";
import { createTranslator } from "./src/i18n/messages";
import { openProfileEditSession } from "./src/data/profile-edit-session";
import { demoAccountProfiles } from "../orbits/shared/mock/demo-world/account";
const t = createTranslator("ja");
window.accountActions = [];
const record = value => window.accountActions.push(value);
function Editor() {
  const profile = demoAccountProfiles.complete.profile;
  const [draft, setDraft] = useState(() => openProfileEditSession({actorId:"browser",apiOrigin:"http://fixture"}, profile).draft);
  return <><AccountEditorContent draft={draft} t={t} patch={fields => setDraft(value => ({...value,...fields}))} onTags={field=>record(field)} />
    <section aria-label="preview"><AccountPreviewContent profile={{...profile,...draft}} t={t} /></section></>;
}
function Settings() {
  const [language, setLanguage] = useState("ja"); const [appearance,setAppearance] = useState("system");
  return <AccountSettingsContent t={t} name="佐藤 健一" email="" language={language} appearance={appearance} development={false}
    permissions={[{key:"camera",status:"denied",onPress:()=>record("permission:camera")}]}
    onOpen={record} onLanguage={setLanguage} onAppearance={setAppearance} onSignOut={()=>record("logout")} />;
}
function MyPage() { return <MyPageContent data={demoAccountProfiles.regular} t={t} candidates={[]} unread={0} going={0} hostEntry={null} onOpen={record} onCandidate={()=>{}} />; }
const initialCards = [{id:"one",name:"佐藤 健一",company:"Orbit",source:"chat",target:"self",createdAt:"2026-10-07",fields:[{id:"one:role",key:"role",label:"役職",current:"担当",proposed:"責任者",value:"責任者"},{id:"one:bio",key:"bio",label:"自己紹介",current:"",proposed:"製造業の導入支援",value:"製造業の導入支援"}]},
  {id:"two",name:"佐藤 健一",company:"Orbit",source:"activity",target:"self",createdAt:"2026-10-07",fields:[{id:"two:company",key:"organization",label:"会社",current:"旧会社",proposed:"新会社",value:"新会社"}]}];
function Suggestions() {
  const [cards,setCards] = useState(initialCards); const [selected,setSelected] = useState(new Set()); const [filter,setFilter] = useState("all");
  return <AccountSuggestionsContent cards={cards} t={t} selected={selected} filter={filter} busy={Boolean(window.uiFixture.busy)} onFilter={setFilter}
    onSelect={id=>setSelected(values=>{const next=new Set(values);next.has(id)?next.delete(id):next.add(id);return next;})}
    onDismiss={id=>setCards(values=>values.map(card=>({...card,fields:card.fields.filter(field=>field.id!==id)})).filter(card=>card.fields.length))}
    onAll={id=>setSelected(values=>new Set([...values,...cards.find(card=>card.id===id).fields.map(field=>field.id)]))}
    onApply={()=>record([...selected].sort())} onEntry={record} />;
}
const View = window.uiFixture.scenario === "editor" ? Editor : window.uiFixture.scenario === "settings" ? Settings : window.uiFixture.scenario === "profile" ? MyPage : Suggestions;
createRoot(document.getElementById("root")).render(<View />);
`;
let script: string;
let browser: Browser;
test.before(async () => { script = await bundleScenarios(entry); browser = await launch(); });
test.after(async () => { await browser?.close(); });

test("R18a editor controls update the public preview and visibility without exposing handles", { timeout: 15000 }, async t => {
  const page = await openScenario(browser, script, { scenario: "editor" }); t.after(() => page.close());
  page.setDefaultTimeout(3000);
  const preview = page.getByRole("region", { name: "preview" });
  await page.getByLabel("会社", { exact: true }).fill("新しい会社");
  await preview.getByText(/新しい会社/).waitFor();
  await page.getByRole("switch").first().click();
  assert.equal(await preview.getByText(/新しい会社/).count(), 0);
  await page.getByRole("switch").first().click();
  await preview.getByText(/新しい会社/).waitFor();
  assert.equal(await preview.getByText(/@/).count(), 0);
  await preview.getByText(/名刺交換した相手のみ/).waitFor();
});

test("R18a settings controls select language/appearance and retain exact destinations", { timeout: 15000 }, async t => {
  const page = await openScenario(browser, script, { scenario: "settings" }); t.after(() => page.close());
  page.setDefaultTimeout(3000);
  await page.getByRole("tab", { name: "English", exact: true }).click();
  assert.equal(await page.getByRole("tab", { name: "English", exact: true }).getAttribute("aria-selected"), "true");
  await page.getByRole("tab", { name: "ダーク", exact: true }).click();
  assert.equal(await page.getByRole("tab", { name: "ダーク", exact: true }).getAttribute("aria-selected"), "true");
  await page.getByRole("button", { name: /連携/ }).click();
  await page.getByRole("button", { name: /iOrbit が使う情報/ }).click();
  await page.getByRole("button", { name: /カメラ/ }).click();
  assert.deepEqual(await page.evaluate(() => (window as unknown as { accountActions: unknown[] }).accountActions), ["/settings/integrations", "/settings/iorbit", "permission:camera"]);
  assert.equal(await page.getByRole("button", { name: "サーバー", exact: true }).count(), 0);
});

test("R18a suggestions select individual fields, dismiss and filter present sources", { timeout: 15000 }, async t => {
  const page = await openScenario(browser, script, { scenario: "suggestions" }); t.after(() => page.close());
  page.setDefaultTimeout(3000);
  const apply = page.getByRole("button", { name: "✓ した項目を反映", exact: true });
  assert.equal(await apply.isDisabled(), true);
  await page.getByRole("button", { name: "役職を採用", exact: true }).click();
  await apply.click();
  assert.deepEqual(await page.evaluate(() => (window as unknown as { accountActions: unknown[] }).accountActions), [["one:role"]]);
  await page.getByRole("button", { name: "自己紹介を見送る", exact: true }).click();
  assert.equal(await page.getByText("製造業の導入支援", { exact: true }).count(), 0);
  await page.getByRole("button", { name: /アクティビティ.*1/ }).click();
  assert.equal(await page.getByTestId("account-suggestion-card").count(), 1);
  assert.equal(await page.getByRole("button", { name: /新しい名刺/ }).count(), 0);
});

test("R18a my-page card share opens only invite, not the surrounding editor", { timeout: 15000 }, async t => {
  const page = await openScenario(browser, script, { scenario: "profile" }); t.after(() => page.close());
  page.setDefaultTimeout(3000);
  await page.getByRole("button", { name: "名刺を共有", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as unknown as { accountActions: unknown[] }).accountActions), ["/contacts/new/invite"]);
});
