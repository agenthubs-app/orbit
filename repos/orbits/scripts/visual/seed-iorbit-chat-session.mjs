// $WEB/scripts/visual/seed-iorbit-chat-session.mjs
// iOrbit 像素比对（chat 视图）的会话种子：用真实写接口 POST 一条确定性会话，
// 让 `/app/agent?session=<id>` 走真实恢复路径，截图字节稳定（不依赖任何 LLM 应答）。
//
// 用法：
//   node scripts/visual/seed-iorbit-chat-session.mjs
//   node scripts/visual/seed-iorbit-chat-session.mjs --origin http://localhost:3100 --id iorbit-visual-chat-0918
//   # 当前验证库 orbit_newui_events_20260922 里没有 qa@orbit.test，QA 参与者是 participant.a：
//   node scripts/visual/seed-iorbit-chat-session.mjs \
//     --email participant.a@orbit.example.test --password-env ORBIT_DEMO_ORGANIZER_PASSWORD
//
// 账号：默认 qa@orbit.test，密码只从 `.env.local`（或同名环境变量）读，默认键
// ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD，可用 --password-env 换键；脚本永不打印密码，
// 也不接受命令行传入明文密码。
//
// 输出：最后一行是 `session=<id>`，前一行是可直接喂给 compare-0918.mjs 的 --app URL。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"]);
    return acc;
  }, []),
);

const origin = (args.origin ?? "http://localhost:3100").replace(/\/+$/, "");
const email = args.email ?? "qa@orbit.test";
const sessionId = args.id ?? "iorbit-visual-chat-0918";
const envFile = resolve(process.cwd(), args["env-file"] ?? ".env.local");
const passwordEnvKey = args["password-env"] ?? "ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD";

// `.env.local` 的极简解析：只取 KEY=VALUE，忽略注释与空行，去掉成对引号。
function readEnvFile(path) {
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const password =
  process.env[passwordEnvKey] || readEnvFile(envFile)[passwordEnvKey] || "";
if (!password) {
  console.error(
    `usage error: ${passwordEnvKey} not found (env or ${envFile}); never pass the password on the command line.`,
  );
  process.exit(2);
}

// 确定性内容：逐字取设计 iOrbit.dc.html 的 chat 屏（272–303 行）。
// 这是**像素比对专用的会话快照**，只写入 Orbit Agent 会话存储，不往活动/联系人库里造任何数据。
const createdAt = "2026-09-18T01:24:00.000Z";
const updatedAt = "2026-09-18T01:24:30.000Z";
const eventItems = [
  {
    event: {
      code: "IORBIT-VISUAL-0918",
      g: "linear-gradient(135deg,#DDDEFA,#ECEEFB)",
      id: "iorbit-visual-fixture-event-1",
      name: "东京 AI 创业者交流会",
      place: "东京国际论坛",
      startsAt: "2026-09-18T09:30:00.000Z",
    },
    howto: "聚焦 AI 应用与出海机会，适合希望拓展日本市场的人士。",
    reason: "与你的兴趣方向和过往报名记录一致。",
    score: 92,
  },
  {
    event: {
      code: "IORBIT-VISUAL-0920",
      g: "linear-gradient(135deg,#ECEEFB,#F1F1FA)",
      id: "iorbit-visual-fixture-event-2",
      name: "日本 · 亚洲创业峰会",
      place: "虎之门之丘 · 东京",
      startsAt: "2026-09-20T01:00:00.000Z",
    },
    howto: "汇聚中日创业者、投资人与大企业代表，探讨合作与融资机会。",
    reason: "覆盖你关注的中日合作与融资话题。",
    score: 88,
  },
  {
    event: {
      code: "IORBIT-VISUAL-0925",
      g: "linear-gradient(135deg,#F1F1FA,#FFFFFF)",
      id: "iorbit-visual-fixture-event-3",
      name: "产品经理 Meetup（东京）",
      place: "WeWork 东京",
      startsAt: "2026-09-25T10:00:00.000Z",
    },
    howto: "专为产品经理打造的线下交流活动，分享产品增长与本地化经验。",
    reason: "与你的岗位与目标人脉重合度高。",
    score: 81,
  },
];
const assistantText = [
  "根据你的兴趣方向、过往报名记录以及目标人脉，我为你筛选了以下适合的活动：",
  "",
  "如果你有更具体的时间、城市或主题偏好，我可以进一步为你筛选更合适的活动。",
].join("\n");

// 形状由 `orbit-real-agent.tsx` 的 parseStoredAgentMessage(:570) / isStoredAgentMessage(:514) 校验：
// assistant 行必须同时带 items（数组）、kind（people|events|todos）、panelTitle（字符串）。
const session = {
  createdAt,
  id: sessionId,
  messageRevision: 2,
  messages: [
    { id: `${sessionId}-m1`, role: "user", text: "最近有什么适合我的活动？" },
    {
      id: `${sessionId}-m2`,
      items: eventItems,
      kind: "events",
      panelTitle: "为你筛选的活动",
      role: "assistant",
      text: assistantText,
    },
  ],
  panel: { items: eventItems, kind: "events", panelTitle: "为你筛选的活动" },
  pinned: false,
  title: "最近有什么适合我的活动？",
  updatedAt,
};

function cookieHeaderFrom(response) {
  const raw =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  return raw
    .filter(Boolean)
    .map((entry) => entry.split(";")[0])
    .join("; ");
}

const loginResponse = await fetch(`${origin}/api/auth/mobile/credentials`, {
  body: JSON.stringify({ email, password }),
  headers: { "content-type": "application/json" },
  method: "POST",
});
if (!loginResponse.ok) {
  console.error(`login failed: HTTP ${loginResponse.status} for ${email}`);
  process.exit(2);
}
const cookie = cookieHeaderFrom(loginResponse);
if (!cookie) {
  console.error("login failed: no session cookie returned");
  process.exit(2);
}

const seedResponse = await fetch(`${origin}/api/ai/conversations/sessions`, {
  body: JSON.stringify({ session }),
  headers: { "content-type": "application/json", cookie },
  method: "POST",
});
const payload = await seedResponse.json().catch(() => null);
const persisted =
  seedResponse.ok &&
  payload?.success === true &&
  payload?.data?.storage?.persisted === true;
if (!persisted) {
  console.error(
    `seed failed: HTTP ${seedResponse.status} ${JSON.stringify(payload?.error ?? payload ?? null)}`,
  );
  process.exit(2);
}

console.log(`app=${origin}/app/agent?session=${encodeURIComponent(sessionId)}`);
console.log(`session=${sessionId}`);
