import assert from "node:assert/strict";
import test from "node:test";

import { allowContactMethodsFrom, CONTACT_METHOD_PLACEHOLDER, contactMethodsIn, scrubModelInput, withoutContactMethods } from "../../features/agent-v1/domains/contact/field-grants";
import { callMainModel } from "../../features/agent-v1/models/main";
import { CONTACT_DOMAIN } from "../../features/agent-v1/domains/contact/read";

/**
 * agent-design AG12-5: contact methods (e-mail, phone, WeChat, address) have no grant in the first version, so they go
 * into no model input. Records lose the fields before code hands them on; every request to the main model and the
 * judgment model passes one exit that withholds any e-mail or phone the user did not type in this request.
 */

test("a contact read says which methods are on file (names only, never values), so an answer never says there are none", () => {
  const fields = CONTACT_DOMAIN.fieldsOf({ id: "contact:c17", payload: { displayName: "小林健", organization: "北辰软件", primaryEmail: "kobayashi@hokushin.example.test", primaryPhone: "+81-90-0000-0017", role: "销售总监" }, updatedAt: "x" } as never)!;
  assert.deepEqual(fields.contactMethods, ["email", "phone"]);
  assert.ok(!JSON.stringify(fields).includes("kobayashi@") && !JSON.stringify(fields).includes("0000-0017"));
  assert.equal(CONTACT_DOMAIN.fieldsOf({ id: "contact:c31", payload: { displayName: "李薇" }, updatedAt: "x" } as never)!.contactMethods, undefined);
});

test("records: the contact-method fields are dropped at any depth; other fields stay", () => {
  const out = withoutContactMethods({ candidates: [{ address: "东京都", contactId: "c1", displayName: "王强", email: "wang@yuanfan.example.test", organization: "远帆物流", phone: "+81-90-0000-0001" }], primaryEmail: "x@y.example.test", primaryPhone: "090-1111-2222", role: "运营经理" });
  assert.deepEqual(out, { candidates: [{ contactId: "c1", displayName: "王强", organization: "远帆物流" }], role: "运营经理" });
});

test("the exit: e-mails and phone numbers are withheld; dates, times, amounts and ids are not touched", () => {
  const text = "小林健 kobayashi@hokushin.example.test，电话 +81-90-0000-0017 或 90-0000-0017，手机 13812345678；11月15日（2026-11-15）10:00，报价 1200000 円，记录 contact:c17，task:t42。";
  const { text: out, withheld } = scrubModelInput(text, "req-none");
  assert.equal(withheld, 4);
  for (const value of ["kobayashi@hokushin.example.test", "+81-90-0000-0017", "90-0000-0017", "13812345678"]) assert.ok(!out.includes(value), value);
  for (const kept of ["2026-11-15", "10:00", "1200000", "contact:c17", "task:t42", "11月15日"]) assert.ok(out.includes(kept), kept);
  assert.ok(out.includes(CONTACT_METHOD_PLACEHOLDER));
  assert.deepEqual(contactMethodsIn("call 03-1234-5678 or (03) 1234-5678"), ["03-1234-5678", "(03) 1234-5678"]);
});

test("the user's own words are not limited: what they typed in this request goes through; the same method from a record in another request does not", () => {
  allowContactMethodsFrom("req-own", "把王强的邮箱改成 wq@new.example.test");
  const prompt = "CURRENT message: 把王强的邮箱改成 wq@new.example.test\nrecord: wang@yuanfan.example.test";
  const own = scrubModelInput(prompt, "req-own");
  assert.ok(own.text.includes("wq@new.example.test"));
  assert.ok(!own.text.includes("wang@yuanfan.example.test"));
  assert.ok(!scrubModelInput(prompt, "req-other").text.includes("wq@new.example.test"));
});

test("callMainModel sends the scrubbed text: the model request never holds a method the user did not type", async () => {
  const sent: string[] = [];
  const fetchImplementation = (async (_url: unknown, init?: { body?: unknown }) => {
    sent.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { completion_tokens: 1, prompt_tokens: 1 } }), { headers: { "content-type": "application/json" }, status: 200 });
  }) as typeof fetch;
  const previous = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-key";
  try {
    await callMainModel({ budget: { limit: 4, used: 0 }, fetchImplementation, node: "answer", purpose: "first", requestId: "req-call", system: "You answer.", user: "小林健的邮箱 kobayashi@hokushin.example.test，电话 +81-90-0000-0017" });
  } finally {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous;
  }
  assert.equal(sent.length, 1);
  assert.ok(!sent[0].includes("kobayashi@hokushin.example.test"));
  assert.ok(!sent[0].includes("0000-0017"));
});
