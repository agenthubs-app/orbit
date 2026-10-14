// R26 真实验证前的预检（不调 AI）：用同一个 SSRF 安全抓取器找 connpass / Peatix / 主办方官网的公开活动页。
import { fetchEventPage } from "../../features/events/assessment/url-fetch";
import { extractEventPage } from "../../features/events/assessment/page-extract";

async function main() {
const targets = process.argv.slice(2);
for (const url of targets) {
  const page = await fetchEventPage(url);
  if (!page.ok) { console.log(url, "->", page.reason, page.status ?? ""); continue; }
  const extract = extractEventPage(page.html, page.finalUrl);
  const links = [...new Set([...page.html.matchAll(/href="(https:\/\/[^"]*?(?:connpass\.com\/event\/\d+|peatix\.com\/event\/\d+)[^"]*)"/g)].map((m) => m[1]))].slice(0, 5);
  console.log(url, "->", page.finalUrl, "events:", extract.eventCount, "login:", extract.loginRequired, "title:", (extract.facts.title ?? extract.title ?? "").slice(0, 60), "text:", extract.text.length, "links:", links.join(" "));
}
}
void main();
