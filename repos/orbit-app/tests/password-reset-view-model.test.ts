import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const source = new URL("../src/view-models/password-reset.ts", import.meta.url);
const token = "a".repeat(43);
const require = createRequire(import.meta.url);
async function helpers() {
  assert.ok(existsSync(source), "reset helpers exist");
  return import("../src/view-models/password-reset");
}

test("fragment parsing rejects missing, duplicate and malformed bearer values", async () => {
  const { passwordResetTokenFromFragment: parse } = await helpers();
  for (const value of [undefined, "", "token=", "token=short", `token=${token}&token=${token}`, `token=${"a".repeat(44)}`, `token=${"+".repeat(43)}`, `token=${token}%00`]) {
    assert.ok(parse(value) === null, "invalid fragment rejected");
  }
  assert.ok(parse(`token=${token}`) === token);
  assert.ok(parse(`#token=${token}`) === token);
});

test("installed Expo Router stores the actual hash under # for the native reset parser", async () => {
  const { parseQueryParams } = require("expo-router/build/fork/getStateFromPath-forks");
  const { passwordResetTokenFromFragment: parse } = await helpers();
  const params = parseQueryParams("/account/reset-password", { name: "account/reset-password" }, undefined, `#token=${token}`);
  assert.ok(parse(params["#"]) === token);
  const queryOnly = parseQueryParams(`/account/reset-password?token=${token}`, { name: "account/reset-password" }, undefined, "");
  assert.equal(parse(queryOnly["#"]), null);
});

test("pasted links require exact server origin and path without query or credentials", async () => {
  const { passwordResetTokenFromLink: parse } = await helpers();
  const base = "https://orbit.example";
  const path = `/app/account/reset-password#token=${token}`;
  assert.ok(parse(base + path, base) === token);
  for (const link of ["https://other.example" + path, "http://orbit.example" + path, "https://user@orbit.example" + path,
    base + "/account/reset-password#token=" + token, base + "/app/account/reset-password/?x=1#token=" + token,
    base + "/app/account/reset-password?token=" + token, base + "/app/account/reset-password?x=1#token=" + token,
    base + "/app/account/reset-password?#token=" + token, "not a url"]) {
    assert.ok(parse(link, base) === null, "unsafe link rejected");
  }
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) assert.ok(parse(origin + path, origin) === token);
  assert.ok(parse("http://lan.example" + path, "http://lan.example") === null);
  assert.ok(parse("http://127.0.0.1:3001" + path, "http://127.0.0.1:3000") === null);
});

test("password validation respects eight characters, 72 UTF-8 bytes and confirmation", async () => {
  const { passwordResetValidation: validate } = await helpers();
  for (const value of ["a".repeat(7), "a".repeat(73), "界".repeat(25), "😀".repeat(19)]) assert.ok(typeof validate(value, value) === "string");
  for (const value of ["a".repeat(8), "a".repeat(72), "界".repeat(24), "😀".repeat(18)]) assert.equal(validate(value, value), null);
  assert.ok(typeof validate("a".repeat(8), "b".repeat(8)) === "string");
});
