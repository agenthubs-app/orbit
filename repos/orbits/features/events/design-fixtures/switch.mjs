#!/usr/bin/env node
/**
 * 切换 mock 服务器上的活动设计稿示例 fixture（R26）（像素门禁用，见同目录 README）。
 * 用门禁已保存的 Playwright 登录态（storageState JSON）带 cookie 调开发接口；不读密码、不打印 cookie。
 *
 *   node features/events/design-fixtures/switch.mjs --origin http://localhost:3026 --storage <qa-storage.json> --name <fixture 名|null|list>
 *   R27：--journey '{"discover":"few","venue":"before_check_in"}'（或 --journey null）切换参加者整条路的示例变体。
 */
import { readFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
const origin = args.origin ?? "http://localhost:3026";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
  console.error("local origins only");
  process.exit(2);
}
if (!args.storage) {
  console.error("--storage <storageState.json> is required (log in once with the gate)");
  process.exit(2);
}
const host = new URL(origin).hostname;
const state = JSON.parse(readFileSync(args.storage, "utf8"));
const cookie = (state.cookies ?? []).filter((item) => item.domain.replace(/^\./, "") === host).map((item) => `${item.name}=${item.value}`).join("; ");
const url = `${origin}/api/dev/event-design-fixture`;
const response = args.journey !== undefined
  ? await fetch(url, { body: JSON.stringify({ journey: args.journey === "null" ? null : JSON.parse(args.journey) }), headers: { "content-type": "application/json", cookie }, method: "POST" })
  : args.name === "list" || args.name === undefined
  ? await fetch(url, { headers: { cookie } })
  : await fetch(url, { body: JSON.stringify({ name: args.name === "null" ? null : args.name }), headers: { "content-type": "application/json", cookie }, method: "POST" });
console.log(response.status, await response.text());
process.exit(response.ok ? 0 : 1);
