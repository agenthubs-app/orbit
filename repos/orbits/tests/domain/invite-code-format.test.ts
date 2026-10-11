import assert from "node:assert/strict";
import test from "node:test";

import {
  formatInviteCode, formatInviteCodeInput, INVITE_CODE_ALPHABET, INVITE_DEFAULT_SHARED_KEYS, INVITE_SHARED_FIELD_KEYS, inviteCodeInputHint, isInviteCodePath,
  normalizeInviteCode,
} from "../../shared/compute/invite-code-format";

// R15（DESIGN §2.4、§2.5 第 2 / 7 条、§3.2、§9 #15）：码的字母表、规范化、显示格式、手输提示与回跳白名单。

test("the alphabet has 30 characters and leaves out 0 O 1 I L U", () => {
  assert.equal(INVITE_CODE_ALPHABET, "23456789ABCDEFGHJKMNPQRSTVWXYZ");
  assert.equal(new Set(INVITE_CODE_ALPHABET).size, INVITE_CODE_ALPHABET.length);
  for (const char of "0O1ILU") assert.equal(INVITE_CODE_ALPHABET.includes(char), false, char);
});

const normalizeCases: readonly [string, string | null][] = [
  ["K7QX-2M9P", "K7QX2M9P"],
  ["k7qx-2m9p", "K7QX2M9P"],
  ["K7QX2M9P", "K7QX2M9P"],
  [" K7QX 2M9P ", "K7QX2M9P"],
  ["K7QX－2M9P", "K7QX2M9P"], // 全角连字符
  ["K7QXー2M9P", "K7QX2M9P"], // 日文输入法的长音符
  ["Ｋ７ＱＸ２Ｍ９Ｐ", "K7QX2M9P"], // 全角英数
  ["K7QX-2M9", null], // 7 位
  ["K7QX-2M9PA", null], // 9 位
  ["K7QX-2M0P", null], // 0 不在字母表里
  ["K7QX-2MOP", null], // O
  ["K7QX-2M1P", null], // 1
  ["K7QX-2MIP", null], // I
  ["K7QX-2MLP", null], // L
  ["K7QX-2MUP", null], // U
  ["K7QX_2M9P", null], // 下划线不是分隔符
  ["", null],
  ["SATO-7Q2K", null], // 设计稿旧例（含 O）
];
for (const [input, expected] of normalizeCases) {
  test(`normalizeInviteCode(${JSON.stringify(input)}) = ${JSON.stringify(expected)}`, () => {
    assert.equal(normalizeInviteCode(input), expected);
  });
}

const formatCases: readonly [string, string | null][] = [
  ["K7QX2M9P", "K7QX-2M9P"],
  ["K7QX-2M9P", "K7QX-2M9P"],
  ["k7qx2m9p", "K7QX-2M9P"],
  ["K7QX2M9", null],
  ["K7QX2M0P", null],
];
for (const [input, expected] of formatCases) {
  test(`formatInviteCode(${JSON.stringify(input)}) = ${JSON.stringify(expected)}`, () => {
    assert.equal(formatInviteCode(input), expected);
  });
}

const typingCases: readonly [string, string][] = [
  ["", ""],
  ["k", "K"],
  ["k7qx", "K7QX"],
  ["k7qx2", "K7QX-2"],
  ["K7QX-2M9P", "K7QX-2M9P"],
  ["k7qx 2m9p", "K7QX-2M9P"],
  ["K7QX-2M9PXYZ", "K7QX-2M9P"], // 粘贴多余部分截掉
  ["K7Q0", "K7Q0"], // 字母表外的字符原样留着，交给 inviteCodeInputHint 提示
];
for (const [input, expected] of typingCases) {
  test(`formatInviteCodeInput(${JSON.stringify(input)}) = ${JSON.stringify(expected)}`, () => {
    assert.equal(formatInviteCodeInput(input), expected);
  });
}

const hintCases: readonly [string, ReturnType<typeof inviteCodeInputHint>][] = [
  ["K7QX-2M9P", "ok"],
  ["k7qx2m9p", "ok"],
  [" K7QX 2M9P", "ok"],
  ["", "too_short"],
  ["K7QX-2M", "too_short"],
  ["K7QX-2M0", "invalid_char"], // 字母表外的字符优先提示
  ["K7QX-2MOP", "invalid_char"],
  ["K7QX@2M9P", "invalid_char"],
  ["K7QX-2M9PA", "too_long"],
];
for (const [input, expected] of hintCases) {
  test(`inviteCodeInputHint(${JSON.stringify(input)}) = ${expected}`, () => {
    assert.equal(inviteCodeInputHint(input), expected);
  });
}

const pathCases: readonly [string, boolean][] = [
  ["/i", true],
  ["/i/K7QX-2M9P", true],
  ["/i/K7QX2M9P", true],
  ["/i/", false],
  ["/i/k7qx-2m9p", false], // 小写不放行（白名单只认规范形式）
  ["/i/K7QX-2M0P", false],
  ["/i/K7QX-2M9P/", false],
  ["/i/K7QX-2M9P?x=//evil", false],
  ["/i/K7QX-2M9P#x", false],
  ["/i/../app/admin", false],
  ["/i/%2F%2Fevil.example", false],
  ["//evil.example", false],
  ["/i/K7QX--2M9P", false],
  ["/i/K7QX-2M9P-AAAA", false],
  ["/ii/K7QX-2M9P", false],
  ["https://evil.example/i/K7QX-2M9P", false],
  ["/app/home", false],
  [`/i/${"A".repeat(4096)}`, false],
];
for (const [input, expected] of pathCases) {
  test(`isInviteCodePath(${JSON.stringify(input.slice(0, 40))}) = ${expected}`, () => {
    assert.equal(isInviteCodePath(input), expected);
  });
}

test("shared-field keys: five keys; email and phone are off by default", () => {
  assert.deepEqual([...INVITE_SHARED_FIELD_KEYS], ["organization", "offering", "seeking", "email", "phone"]);
  assert.deepEqual([...INVITE_DEFAULT_SHARED_KEYS], ["organization", "offering", "seeking"]);
});
