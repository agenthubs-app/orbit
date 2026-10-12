#!/usr/bin/env node
/**
 * 像素门禁用：给本机测试账号 qa@orbit.test 补 2 条 iOrbit 会话（标题照 b12 goalRail「最近の会話」的示例），
 * 让目標入力右栏的两行有数据。只写本机库：先核对 .env.local 的 ORBIT_EVENT_DATABASE_URL 主机是 localhost，
 * 且 dev 服务器 origin 也是 localhost，否则退出。走不调 AI 的保存接口 POST /api/ai/conversations/sessions（upsert，
 * 会话 id 固定，可重复执行）。
 *
 *   node features/plans/v2/design-fixtures/seed-local-chats.mjs --origin http://localhost:3202 --storage <qa-storage.json>
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
const origin = args.origin ?? "http://localhost:3000";
const storagePath = args.storage;

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function fail(message) {
  console.error(`seed-local-chats: ${message}`);
  process.exit(1);
}

// 1. The database the dev server uses must be local (the last ORBIT_EVENT_DATABASE_URL line wins, as dotenv reads it).
const env = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const urls = [...env.matchAll(/^\s*ORBIT_EVENT_DATABASE_URL\s*=\s*['"]?([^'"\n]+)['"]?\s*$/gmu)].map((match) => match[1]);
if (!urls.length) fail("ORBIT_EVENT_DATABASE_URL is not set in .env.local");
const dbHost = new URL(urls[urls.length - 1]).hostname;
if (!LOCAL.has(dbHost)) fail(`the database host is ${dbHost}, not localhost — refusing to write`);
// 2. The server we post to must be this machine.
if (!LOCAL.has(new URL(origin).hostname)) fail(`origin ${origin} is not localhost`);
if (!storagePath) fail("--storage <playwright storage state of qa@orbit.test> is required");

const storage = JSON.parse(readFileSync(storagePath, "utf8"));
const cookie = (storage.cookies ?? []).map((item) => `${item.name}=${item.value}`).join("; ");

// The account must be the test account.
const me = await fetch(`${origin}/api/auth/session`, { headers: { cookie } }).then((response) => response.json()).catch(() => null);
const email = me?.user?.email ?? null;
if (email !== "qa@orbit.test") fail(`signed-in account is ${email ?? "unknown"}, not qa@orbit.test`);

const CHATS = [
  { id: "design-fixture-chat-plan-flow", title: "プランを作る · Orbit を落地して黒字化したい", user: "Orbit を落地して黒字化したい", assistant: "背景を下書きしました。上から順に、違うところだけ直してください。", at: "2026-10-12T00:02:00.000Z" },
  { id: "design-fixture-chat-payer", title: "前提の「払い手」について", user: "前提の「払い手」について相談したい", assistant: "最初に払うのはイベント主催者、参加者は無料、という前提で進めています。", at: "2026-10-12T00:01:00.000Z" },
];

for (const chat of CHATS) {
  const session = {
    createdAt: chat.at, id: chat.id, messageRevision: 2, title: chat.title, updatedAt: chat.at,
    messages: [
      { createdAt: chat.at, id: `${chat.id}-m1`, role: "user", text: chat.user },
      { createdAt: chat.at, id: `${chat.id}-m2`, role: "assistant", text: chat.assistant },
    ],
  };
  const response = await fetch(`${origin}/api/ai/conversations/sessions`, { body: JSON.stringify({ session }), headers: { "content-type": "application/json", cookie }, method: "POST" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) fail(`saving ${chat.id} failed: ${response.status} ${JSON.stringify(body?.error ?? body).slice(0, 200)}`);
  console.log(`seed-local-chats: saved ${chat.id}`);
}
