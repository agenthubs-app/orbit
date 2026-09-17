import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrbitReferenceStyles } from "../../app/(app)/app/orbit-reference-styles";

test("actual Web 7a formal typography and footer stay usable in a long 390px page and a reduced visual viewport", async () => {
  const bundle = await build({
    stdin: { contents: `import React from "react"; import {createRoot} from "react-dom/client"; import {RegistrationPortraitWorkspace} from "./app/(app)/app/events/[id]/register/registration-portrait-workspace";
      window.calls=[]; window.fetch=async(path,init)=>{window.calls.push({path,method:init.method});return Response.json({success:true,data:String(path).endsWith("/portrait")?{portrait:null}:{registration:null,questionSet:{questions:["positioning","industry","targetAttendees","valueOffered","desiredOutcome","energyStyle","experienceHighlight","followUpPreference"].map((field,index)=>({id:field,participantProfileField:field,prompt:"真实正式题测试 "+(index+1)+"：请描述参与目标和希望认识的人。".repeat(3),options:["Builders","Other"],required:true,portraitQuestionToken:"synthetic-formal:"+field}))}}});};
      createRoot(document.getElementById("root")).render(<div data-orbit-real-page="registration"><RegistrationPortraitWorkspace actorId="synthetic-actor" event={{id:"synthetic-event",title:"Robotics evening",venue:"Tokyo"}} language="zh" enrollment={{stage:"interview",status:"unregistered",canSubmit:true,pending:false,error:null,onSubmit:async()=>{}}}><p>Legacy controls</p></RegistrationPortraitWorkspace></div>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
  });
  const appRequire = createRequire(`${process.cwd()}/../orbit-app/package.json`);
  const installedChromium = appRequire("playwright").chromium.executablePath();
  const browser = await chromium.launch({ headless: true, executablePath: installedChromium });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => route.abort());
    await page.setContent(renderToStaticMarkup(React.createElement(OrbitReferenceStyles)) + '<style>html,body{margin:0;font-family:Arial}</style><div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const submit = page.getByRole("button", { name: "确认报名", exact: true });
    await submit.waitFor(); await page.getByRole("button", { name: "其他", exact: true }).first().waitFor();
    const title = page.locator("main section h2").first();
    assert.deepEqual(await title.evaluate(node => { const css = getComputedStyle(node); return [css.fontSize, css.fontWeight, css.lineHeight]; }), ["15px", "700", "22px"]);
    const checkFooter = async (height: number) => {
      const box = await submit.boundingBox(); assert.ok(box && box.y >= 0 && box.y + box.height <= height && box.height >= 44);
      assert.ok(await page.locator(".registration-portrait-7a>article").evaluate(node => node.scrollHeight > node.clientHeight));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
    };
    await checkFooter(844);
    const entry = page.getByRole("button", { name: /补充画像/ });
    assert.ok(await entry.evaluate(node => node.scrollHeight <= node.clientHeight + 1), "The actual button foundation must not clip the two-line portrait entry.");
    await page.getByRole("button", { name: "其他", exact: true }).last().click();
    // The production input uses a localized accessible name; this fixture is not a permission/proof test.
    const input = page.getByRole("textbox", { name: "自行补充回答" });
    await input.fill("保留真实草稿");
    await page.setViewportSize({ width: 390, height: 450 });
    await page.waitForFunction(() => document.querySelector(".registration-portrait-7a")?.getBoundingClientRect().height === 450);
    await checkFooter(450);
    assert.equal(await input.inputValue(), "保留真实草稿");
    assert.equal(await page.evaluate(() => (window as any).calls.filter((call: any) => call.method === "POST").length), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
