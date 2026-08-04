import { chromium } from "playwright";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Use real signed-in session cookies from two seeded test users.`);
  return value;
}

async function main() {
  const baseUrl = process.env.ORBIT_SMOKE_BASE_URL?.trim() || "http://localhost:3000";
  const eventId = required("ORBIT_SMOKE_EVENT_ID");
  const participantA = required("ORBIT_SMOKE_PARTICIPANT_A");
  const participantB = required("ORBIT_SMOKE_PARTICIPANT_B");
  const nameA = required("ORBIT_SMOKE_NAME_A");
  const browser = await chromium.launch({ headless: true });
  const contextA = await browser.newContext({ extraHTTPHeaders: { cookie: required("ORBIT_SMOKE_COOKIE_A") }, viewport: { width: 1440, height: 1000 } });
  const contextB = await browser.newContext({ extraHTTPHeaders: { cookie: required("ORBIT_SMOKE_COOKIE_B") }, viewport: { width: 390, height: 844 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const errors: string[] = [];
  for (const page of [pageA, pageB]) page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await pageA.goto(`${baseUrl}/app/events/${encodeURIComponent(eventId)}`);
    await pageA.locator(`[data-matchmaking-candidate="${participantB}"]`).getByRole("button", { name: /申请交换名片|Request business card/ }).click();
    await pageB.goto(`${baseUrl}/app/events/${encodeURIComponent(eventId)}`);
    await pageB.getByRole("button", { name: /全部参会者|All participants/ }).click();
    await pageB.locator("[data-event-participant-directory]").getByRole("button", { name: new RegExp(nameA) }).click().catch(async () => {
      await pageB.locator(`[data-matchmaking-candidate="${participantA}"]`).getByRole("button").first().click();
    });
    await pageB.getByRole("button", { name: /同意交换|Accept/ }).click();
    await pageA.reload();
    await pageA.locator(`[data-matchmaking-candidate="${participantB}"]`).getByRole("button").first().click();
    await pageA.locator("[data-appointment-negotiation]").getByRole("button", { name: /开始约时间|Start scheduling/ }).click();
    const tomorrow = new Date(Date.now() + 48 * 60 * 60_000);
    for (let index = 0; index < 3; index += 1) {
      const value = new Date(tomorrow.getTime() + index * 24 * 60 * 60_000).toISOString().slice(0, 16);
      await pageA.getByLabel(new RegExp(`候选时间 ${index + 1}|Candidate ${index + 1}`)).fill(value);
    }
    await pageA.getByRole("button", { name: /发送提议|Send proposal/ }).click();
    await pageB.reload();
    await pageB.getByRole("button", { name: /全部参会者|All participants/ }).click();
    await pageB.locator(`[data-matchmaking-candidate="${participantA}"]`).getByRole("button").first().click().catch(async () => {
      await pageB.locator("[data-event-participant-directory]").getByRole("button", { name: new RegExp(nameA) }).click();
    });
    await pageB.locator("[data-appointment-negotiation]").getByRole("button").filter({ hasText: /2026|2027/ }).first().click();
    if (errors.length) throw new Error(`Browser console errors: ${errors.join(" | ")}`);
    console.log(JSON.stringify({ desktop: "passed", mobile: "passed", eventId }));
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
