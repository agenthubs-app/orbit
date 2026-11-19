/**
 * probe (code; one main-model call to choose search results): the web step of a request (设计稿 §3.4, §3.9 `probe`;
 * agent-design AG09). It runs for parts that need the public web, after their record reads (so the outbound rules know
 * what private text was read this turn) and before the answer.
 *
 * Per part, in the order the user said them:
 * 1. Both switches (the deployment's ORBIT_AGENT_WEB, the user's own) — off: not one request; code says so.
 * 2. A URL the user gave in this part's words: fetched directly (rule 5), no search first.
 * 3. Otherwise a query built by code (web/query.ts) from the first layer's webTarget, through the first gate (the seven
 *    rules, web/outbound-gate.ts) and the second (`outbound.extra`, web/second-gate.ts). Blocked: not sent, not rewritten,
 *    only the rule numbers kept. A name from a contact record: the full query is shown and sent only after a click.
 * 4. The results: one call picks the page to open, or says they point at different objects of the same name — then the
 *    user chooses (options in search order) and the page is opened after the click, without searching again.
 * Every call is reserved first in the request's web record (2 searches, 2 fetches per request, shared by all parts, a
 * resume and a re-run node). Fetched pages become materials (handles w1, w2 …) the answer step cites; a snippet never does.
 * Web text is never written to the checkpoint: the part keeps call keys and indexes only.
 */
import type { Material } from "../../answer/schema";
import { callMainModel } from "../../models/main";
import { emitTrace } from "../../observability/trace";
import { capabilityKind } from "../../route/capabilities";
import { splitSentences } from "../../text/sentences";
import { parseModelJson } from "../../understand/validate";
import { WEB_WORDS, type BlockKind } from "../../web/copy";
import type { SearchResultItem } from "../../web/deepseek-tools";
import type { WebCall } from "../../web/evidence";
import { fetchGate, outboundGate, urlsIn, type GateContext } from "../../web/outbound-gate";
import { buildQuery, type QueryCandidate, type WebTarget } from "../../web/query";
import { secondGateMany } from "../../web/second-gate";
import { openRequestWeb, type RequestWeb } from "../../web/service";
import { parseSelectPicks, webSelectSystemPrompt, webSelectUserText, WEB_SELECT_PROMPT_VERSION, type SelectItem } from "../../web/select";
import type { QualifierCode, WebLanguage } from "../../web/vocabulary";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart, OptionSetState } from "../state";
import { setIdOf } from "./clarify";

/** A part that needs the public web: a web capability, or the first layer said the data is on the public web. */
export function needsWeb(part: GraphPart): boolean {
  return part.capabilities.some((capability) => capabilityKind(capability) === "web") || part.plan.dataSources.includes("public_web");
}

/** A web part that also reads the user's records (it goes through resolve first). */
export function webPartReads(part: GraphPart): boolean {
  // AG10 run-02 (AE-WEB-007): a function on a page alone ("what does this review say": web.fetch + fn.summarize, data from
  // the public web only) works over the page; it reads the user's records only when the part says it uses them.
  return part.route === "web_lookup" && part.capabilities.some((capability) => capabilityKind(capability) === "read" || (capabilityKind(capability) === "function" && part.plan.dataSources.includes("orbit_records")));
}

const touchedBy = (state: AgentGraphState, part: GraphPart) => state.touched === null || state.touched.includes(part.localId);

export function webDue(scope: NodeScope, state: AgentGraphState): boolean {
  return state.parts.some((part) => needsWeb(part) && touchedBy(state, part) && !scope.run.webDone.has(part.localId) && (part.route === "web_lookup" || part.route === "read") && (part.status === "answered" || part.status === "unfinished"));
}

const quoteOf = (message: string, part: GraphPart) => message.slice(part.quote[0], part.quote[1]);

/** "@小林" in the message for a contact reference named 小林健: the words and the record's name. */
function mentionsOf(message: string, references: readonly { name?: string; type: string; accessible?: boolean }[]): { quote: string; name: string }[] {
  const out: { quote: string; name: string }[] = [];
  for (const match of message.matchAll(/@([^\s@，。、,.!?！？]+)/gu)) {
    const said = match[1];
    const named = references.filter((reference) => reference.type === "contact" && reference.name && reference.accessible !== false);
    const found = named.find((reference) => reference.name!.startsWith(said) || said.startsWith(reference.name!)) ?? (named.length === 1 ? named[0] : undefined);
    if (found?.name) out.push({ name: found.name, quote: `@${said.startsWith(found.name) ? found.name : said}` });
  }
  return out;
}

function blockKindOf(why: readonly string[]): BlockKind {
  return why.some((code) => ["phone", "email", "name_with_contact_details"].includes(code)) ? "contact" : "private";
}

interface PageSource {
  partId: string;
  call: WebCall;
}

export function probeNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const parts: GraphPart[] = state.parts.map((part) => ({ ...part, ...(part.web ? { web: { ...part.web } } : {}) }));
    const due = parts.filter((part) => needsWeb(part) && touchedBy(state, part) && !run.webDone.has(part.localId) && (part.route === "web_lookup" || part.route === "read") && (part.status === "answered" || part.status === "unfinished")).sort((left, right) => left.quote[0] - right.quote[0]);
    if (!due.length) return {};
    for (const part of due) run.webDone.add(part.localId);
    // The one model call of this node (choosing results) counts in the round.s budget.
    const budget = { ...state.budget };
    const language = state.language as WebLanguage;
    const message = input.message;
    const now = () => deps.now();
    const access = deps.web;
    const userOn = access?.enabled ? await access.settings.userWebOn(input.actorId).catch(() => false) : false;
    const switches = { global: Boolean(access?.enabled && access.apiKey), user: userOn };
    const web: RequestWeb | null = access && switches.global && switches.user ? await openRequestWeb(access, input.actorId, input.requestId, now) : null;
    const messageUrls = urlsIn(message);
    const privateTexts = [...run.materials.values()].flat().map((material) => material.sentences.map((sentence) => sentence.text).join(" "));
    const blockedParts = new Set((web?.ledger().blocked ?? []).map((item) => item.partId));
    const lines = (part: GraphPart, line: string) => run.gapLines.set(part.localId, [...(run.gapLines.get(part.localId) ?? []), line]);
    const sentQueries = new Map<string, string[]>();
    const opened: PageSource[] = [];
    const sets: OptionSetState[] = [...state.optionSets];
    const webOnly = (part: GraphPart) => part.route === "web_lookup";
    const settle = (part: GraphPart, reason: string, gap?: "budget" | "service_error" | "unreadable") => {
      if (gap) part.gaps = [...new Set([...(part.gaps ?? []), gap])];
      if (webOnly(part) && !(run.materials.get(part.localId)?.length)) {
        part.status = "unfinished";
        part.reason = reason;
      }
    };
    const searchUrls = () => (web?.ledger().calls ?? []).flatMap((call) => (call.kind === "search" ? (call.results ?? []).map((result) => result.url) : []));
    const context = (part: GraphPart, extra: Partial<GateContext> = {}): GateContext => ({ blockedParts, budget: web?.left() ?? { fetch: 0, search: 0 }, message, partQuote: quoteOf(message, part), privateTexts, switches, ...extra });

    const openPage = async (part: GraphPart, url: string): Promise<"ok" | "stop"> => {
      const gate = fetchGate(url, { ...context(part), messageUrls, searchUrls: searchUrls() });
      emitTrace({ gate: 1, kind: "fetch", partId: part.localId, rules: gate.rules, type: "web.gate", url, verdict: gate.verdict, why: gate.why });
      if (gate.verdict === "budget") {
        const found = searchResultFor(url);
        lines(part, WEB_WORDS.budget(language, quoteOf(message, part), found ? { title: found.title, url: found.url } : { title: "", url }));
        settle(part, "web_budget", "budget");
        return "stop";
      }
      if (gate.verdict === "block") {
        lines(part, WEB_WORDS.noUrl(language, quoteOf(message, part)));
        settle(part, "web_url_refused");
        return "stop";
      }
      const outcome = await web!.fetch(part.localId, url);
      if (!outcome) {
        lines(part, WEB_WORDS.budget(language, quoteOf(message, part), null));
        settle(part, "web_budget", "budget");
        return "stop";
      }
      run.webUrls.add(url);
      const { call } = outcome;
      opened.push({ call, partId: part.localId });
      if (call.status === "ok" && call.page) {
        const material = pageMaterial(part.localId, call, searchResultFor(url)?.date ?? null);
        run.materials.set(part.localId, [...(run.materials.get(part.localId) ?? []), material]);
        // A page to answer from: a part whose records gave nothing is still answered from the page.
        if (part.status === "unfinished") {
          part.status = "answered";
          part.reason = null;
        }
        return "ok";
      }
      lines(part, WEB_WORDS.readFailed(language, url, call.status === "timeout"));
      settle(part, call.status === "timeout" ? "web_timeout" : "web_provider_error", call.status === "timeout" ? "unreadable" : "service_error");
      return "ok";
    };
    const searchResultFor = (url: string): SearchResultItem | null => {
      for (const call of web?.ledger().calls ?? []) for (const result of call.results ?? []) if (result.url === url) return result;
      return null;
    };
    let pageIndex = [...run.materials.values()].flat().filter((material) => material.handle.startsWith("w")).length;
    const pageMaterial = (partId: string, call: WebCall, searchDate: string | null): Material => {
      pageIndex += 1;
      const page = call.page!;
      const date = page.sourceDate ?? searchDate;
      const sentences = splitSentences(page.excerpt).slice(0, 60);
      return { at: date, handle: `w${pageIndex}`, header: `public web page "${page.title || call.url}" at ${call.url}${date ? `, page date ${date}` : ", no page date given"}, read ${call.finishedAt ?? call.reservedAt}`, kind: "web", partId, ref: `web:${call.key}`, sentences, version: call.key };
    };

    // Searches waiting for a choice of result.
    const toPick: { part: GraphPart; call: WebCall; name: string; follows?: GraphPart }[] = [];
    // AG09 dev run 2 (AE-WEB-008): parts of one request that look up the same name share one search — one query with all
    // their qualifiers, one choice of result, one question — instead of a search and a question each.
    const targetOf = (part: GraphPart) => (part.plan.webTarget?.quote ? message.slice(part.plan.webTarget.quote[0], part.plan.webTarget.quote[1]).replace(/^@/u, "").replace(/(さん|様|さま|氏|先生|老师)$/u, "").trim() : "");
    const leaders = new Map<string, GraphPart>();
    const qualifiersOf = new Map<string, string[]>();
    for (const part of due) {
      const key = targetOf(part);
      if (!key || part.web?.searchKey || urlsIn(quoteOf(message, part)).length) continue;
      if (!leaders.has(key)) leaders.set(key, part);
      qualifiersOf.set(key, [...new Set([...(qualifiersOf.get(key) ?? []), ...(part.plan.webTarget?.qualifiers ?? [])])]);
    }
    const followers: { part: GraphPart; leader: GraphPart }[] = [];
    const samePage: { part: GraphPart; holder: GraphPart }[] = [];
    // Queries that passed gate 1, waiting for gate 2.
    const cleared: { part: GraphPart; candidate: QueryCandidate; quote: string }[] = [];
    for (const part of due) {
      const quote = quoteOf(message, part);
      if (!switches.global || !switches.user) {
        // Mixed parts (records and web) say it too: the web half was asked for.
        lines(part, WEB_WORDS.off(language, quote));
        emitTrace({ partId: part.localId, reason: switches.global ? "user switch off" : "deployment switch off (or no key)", type: "web.off" });
        settle(part, "web_off");
        continue;
      }
      // Resumed: the search this part made before the pause, and the result the user picked.
      if (part.web?.searchKey) {
        const call = web!.ledger().calls.find((item) => item.key === part.web!.searchKey);
        if (call?.query) sentQueries.set(part.localId, [call.query]);
        const pick = part.web.pick;
        const result = call?.results && pick !== undefined ? call.results[pick] : undefined;
        if (result) await openPage(part, result.url);
        continue;
      }
      // A URL the user gave in this part's words (or the message's, when no other part holds it): read it, no search.
      // AG09 stability run (AE-WEB-001): a URL in a part that does not look up the web itself ("这是…的官方简介： <url> ，") is
      // this part's to read; that other part is only its context and is not answered on its own.
      // AG13 repair round 8 (AE-SCL-016 run-08, AE-WEB-009 run-06): only a part that is itself read by this probe holds its
      // URL; one routed elsewhere ("Here is their pricing page: <url>." answered as a statement) leaves the URL to this part.
      const heldByWeb = (url: string) => due.some((other) => other !== part && quoteOf(message, other).includes(url));
      const urls = urlsIn(quote).length ? urlsIn(quote) : webOnly(part) ? messageUrls.filter((url) => !heldByWeb(url)) : [];
      if (urls.length && !urlsIn(quote).length) {
        for (const other of parts) {
          if (other === part || other.route !== "answer" || needsWeb(other) || !urls.some((url) => quoteOf(message, other).includes(url))) continue;
          other.reason = "web_context";
          emitTrace({ partId: other.localId, reason: `its web address is read by ${part.localId}`, type: "web.context_part" });
        }
      }
      if (urls.length) {
        for (const url of urls) if ((await openPage(part, url)) === "stop") break;
        continue;
      }
      const target = part.plan.webTarget;
      // AG09 stability run (AE-WEB-006): a web.search part whose words point at a person only with an @ reference ("上网查查
      // @小林 …") looks up that person when the first layer gave no usable quote; the name comes from the record, so the
      // query is shown before it is sent (rule 4).
      const ownMention = mentionsOf(message, run.references).find((mention) => quote.includes(mention.quote));
      const targetQuote = target?.quote ? message.slice(target.quote[0], target.quote[1]) : part.capabilities.includes("web.search") && ownMention ? ownMention.quote : "";
      // Resumed after send_query / skip_query: the query shown is in the request's web record (the @ names are not re-read).
      const answeredShown = (part.web?.confirmed || part.web?.skipped) && web!.ledger().pending.some((item) => item.partId === part.localId);
      if (!targetQuote && !answeredShown) {
        // A part that builds on another part of this request that looks up the web (a comparison with the page the user gave)
        // has nothing of its own to look up: it is answered from that part's page, with no line of its own.
        const fromDependency = part.dependsOn.some((id) => { const other = parts.find((item) => item.localId === id); return Boolean(other && needsWeb(other)); });
        // AG11 run-02 (AE-WEB-001): 「…<url> ，这位导演的代表作和现任职务是什么？」 split into two parts: the second asks about the
        // same page the first reads (the message's URL is held by it) — it is answered from that page, not "no public name".
        const holder = !fromDependency && part.capabilities.includes("web.fetch") && !part.capabilities.includes("web.search")
          ? due.find((other) => other !== part && messageUrls.some((url) => quoteOf(message, other).includes(url))) : undefined;
        if (holder) {
          samePage.push({ holder, part });
          emitTrace({ holder: holder.localId, partId: part.localId, type: "web.same_page" });
          continue;
        }
        if (webOnly(part) && !fromDependency) {
          lines(part, WEB_WORDS.noPublicName(language, quote));
          emitTrace({ partId: part.localId, reason: "no public name in the user's words to look up", type: "web.no_target" });
          settle(part, "web_no_public_name");
        }
        continue;
      }
      const leader = leaders.get(targetOf(part));
      if (leader && leader !== part) {
        followers.push({ leader, part });
        continue;
      }
      const mentions = mentionsOf(message, run.references);
      // "小林" said as "@小林": the mention is what the target stands for.
      const atMention = mentions.find((mention) => mention.quote === `@${targetQuote}` || mention.quote === targetQuote);
      const pending = web!.ledger().pending.find((item) => item.partId === part.localId);
      if (part.web?.skipped) {
        lines(part, WEB_WORDS.skipped(language, quote));
        settle(part, "web_skipped");
        continue;
      }
      let candidate: QueryCandidate | null = null;
      if (part.web?.confirmed && pending) candidate = { builtBy: "code", needsConfirmation: true, partId: part.localId, text: pending.text, tokens: pending.tokens };
      else {
        const built = buildQuery({ language, message, partId: part.localId, references: mentions, target: { qualifiers: (qualifiersOf.get(targetOf(part)) ?? target?.qualifiers ?? []) as QualifierCode[], quote: atMention ? atMention.quote : targetQuote } satisfies WebTarget });
        if (built.ok === false) {
          // The object is named only through the user's records: nothing is built from them (rule 2).
          const rules = built.reason === "private_pointer" || built.reason === "not_in_message" ? [2] : [];
          if (rules.length) {
            await web!.block(part.localId, rules, now());
            blockedParts.add(part.localId);
            emitTrace({ partId: part.localId, reason: built.reason, rules, type: "web.outbound_blocked" });
          }
          if (webOnly(part)) {
            lines(part, WEB_WORDS.noPublicName(language, quote));
            settle(part, "web_no_public_name");
          }
          continue;
        }
        candidate = built.candidate;
      }
      const gate = outboundGate(candidate, context(part, { confirmedText: part.web?.confirmed ? pending?.text ?? null : null }));
      emitTrace({ gate: 1, kind: "search", partId: part.localId, rules: gate.rules, tokens: candidate.tokens.map((token) => ({ origin: token.origin, text: token.text })), type: "web.gate", verdict: gate.verdict, why: gate.why });
      if (gate.verdict === "budget") {
        lines(part, WEB_WORDS.budget(language, quote, null));
        settle(part, "web_budget", "budget");
        continue;
      }
      if (gate.verdict === "block") {
        await web!.block(part.localId, gate.rules, now());
        blockedParts.add(part.localId);
        emitTrace({ partId: part.localId, rules: gate.rules, type: "web.outbound_blocked", why: gate.why });
        lines(part, WEB_WORDS.blocked(language, quote, blockKindOf(gate.why)));
        settle(part, "web_blocked");
        continue;
      }
      if (gate.verdict === "confirm") {
        await web!.pend(part.localId, { at: now(), partId: part.localId, text: candidate.text, tokens: candidate.tokens });
        const clarificationId = setIdOf(input.requestId, part.localId, "q");
        if (!sets.some((set) => set.clarificationId === clarificationId)) {
          sets.push({ clarificationId, kind: "question", options: [{ capabilities: ["web.search"], capability: "web.search", optionId: "send_query" }, { capabilities: ["web.search"], capability: "web.search", optionId: "skip_query" }], partId: part.localId, purpose: "web_send", state: "open", subgoal: `clarification:${input.requestId}:${part.localId}` });
          run.optionLabels.set(clarificationId, new Map([["send_query", { label: WEB_WORDS.sendLabel(language) }], ["skip_query", { label: WEB_WORDS.skipLabel(language) }]]));
          emitTrace({ clarificationId, kind: "question", options: 2, partId: part.localId, purpose: "web_send", query: candidate.text, subgoal: `clarification:${input.requestId}:${part.localId}`, type: "clarify.asked" });
        }
        run.webQuestions.set(part.localId, WEB_WORDS.confirm(language, quote, candidate.text));
        part.status = "awaiting_clarification";
        part.reason = null;
        part.waitReason = "object_ambiguous";
        continue;
      }
      // Gate 2 comes after every part's gate 1: one judgment request for all the queries of this pass.
      cleared.push({ candidate, part, quote });
    }
    const verdicts = await secondGateMany(deps.judgment, run.judgment, { language, message, queries: cleared.map((item, index) => ({ key: `q${index + 1}`, query: item.candidate.text })), requestId: input.requestId });
    for (const [index, { candidate, part, quote }] of cleared.entries()) {
      // Gate 2: only a sure "no" from outbound.extra sends it.
      const second = verdicts.get(`q${index + 1}`) ?? { reason: "missing", send: false, verdict: null };
      emitTrace({ confidence: second.verdict?.confidence ?? null, gate: 2, kind: "search", partId: part.localId, reason: second.reason, threshold: second.verdict?.threshold ?? null, type: "web.gate", verdict: second.send ? "send" : "block" });
      if (!second.send) {
        await web!.block(part.localId, ["judgment"], now());
        blockedParts.add(part.localId);
        emitTrace({ gate: 2, partId: part.localId, reason: second.reason, rules: ["judgment"], type: "web.outbound_blocked" });
        lines(part, WEB_WORDS.blocked(language, quote, "judgment"));
        settle(part, "web_blocked");
        continue;
      }
      const outcome = await web!.search(part.localId, candidate.text);
      if (!outcome) {
        lines(part, WEB_WORDS.budget(language, quote, null));
        settle(part, "web_budget", "budget");
        continue;
      }
      const { call } = outcome;
      sentQueries.set(part.localId, [candidate.text]);
      part.web = { ...(part.web ?? {}), searchKey: call.key };
      if (call.status === "timeout" || call.status === "provider_error") {
        lines(part, WEB_WORDS.searchFailed(language, candidate.text, call.status === "timeout"));
        settle(part, "web_search_failed", "service_error");
        continue;
      }
      if (!call.results?.length) {
        lines(part, WEB_WORDS.noResult(language, candidate.text));
        settle(part, "web_no_result");
        continue;
      }
      for (const result of call.results) run.webUrls.add(result.url);
      toPick.push({ call, name: candidate.tokens.filter((token) => token.origin !== "vocabulary").map((token) => token.text).join(" "), part });
    }

    // A part that looks up the same name as an earlier one goes with that part's search: its result, or what stopped it.
    for (const { leader, part } of followers) {
      const led = toPick.find((item) => item.part === leader);
      if (led) {
        part.web = { ...(part.web ?? {}), searchKey: led.call.key };
        toPick.push({ call: led.call, follows: leader, name: led.name, part });
        continue;
      }
      for (const line of run.gapLines.get(leader.localId) ?? []) lines(part, line);
      if (webOnly(part) && !(run.materials.get(part.localId)?.length)) {
        part.status = leader.status === "awaiting_clarification" ? "waiting_dependency" : "unfinished";
        part.reason = leader.status === "awaiting_clarification" ? "web_shares_question" : leader.reason;
      }
    }
    // Which result to open: one result is opened as it is; several, one model call for all parts at once.
    if (toPick.length) {
      const several = toPick.filter((item) => !item.follows && (item.call.results?.length ?? 0) > 1);
      const items: SelectItem[] = several.map((item) => ({ goal: run.understood?.parts.find((source) => source.localId === item.part.localId)?.goal ?? quoteOf(message, item.part), name: item.name, partId: item.part.localId, results: item.call.results ?? [] }));
      let picks: ReturnType<typeof parseSelectPicks> = new Map();
      if (items.length) {
        emitTrace({ items: items.map((item) => ({ partId: item.partId, results: item.results.length })), promptVersion: WEB_SELECT_PROMPT_VERSION, type: "web.select_prompt" });
        const result = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "probe", purpose: "first", requestId: input.requestId, system: webSelectSystemPrompt(), user: webSelectUserText(items) });
        const parsed = result.ok === true ? parseModelJson(result.text) : null;
        picks = parsed && parsed.ok === true ? parseSelectPicks(parsed.value, items, 1) : null;
        if (!picks) emitTrace({ reason: result.ok === true ? "unusable output" : result.reason, type: "web.select_failed" });
      }
      for (const item of toPick) {
        const results = item.call.results ?? [];
        const pick = results.length === 1 ? { open: [0], sameName: [] } : picks?.get((item.follows ?? item.part).localId);
        if (!pick) {
          // No usable choice: nothing is opened; the snippets are not taken as an answer.
          lines(item.part, WEB_WORDS.noRelevant(language, item.call.query ?? ""));
          settle(item.part, "web_not_opened");
          continue;
        }
        if (pick.sameName.length >= 2) {
          if (item.follows) {
            // The question is asked once, under the part it follows; the click answers both.
            item.part.status = "waiting_dependency";
            item.part.reason = "web_shares_question";
            item.part.waitReason = "dependency_pending";
            continue;
          }
          const clarificationId = setIdOf(input.requestId, item.part.localId, "q");
          const order = pick.sameName.slice(0, 3);
          sets.push({ clarificationId, kind: "question", options: order.map((index) => ({ capabilities: ["web.fetch"], capability: "web.fetch", optionId: String(index + 1) })), partId: item.part.localId, purpose: "web_pick", state: "open", subgoal: `clarification:${input.requestId}:${item.part.localId}` });
          run.optionLabels.set(clarificationId, new Map(order.map((index) => [String(index + 1), { label: `${results[index].title}${results[index].snippet ? `（${results[index].snippet}）` : ""}` }])));
          emitTrace({ clarificationId, kind: "question", options: order.length, partId: item.part.localId, purpose: "web_pick", subgoal: `clarification:${input.requestId}:${item.part.localId}`, type: "clarify.asked" });
          run.webQuestions.set(item.part.localId, [WEB_WORDS.sameName(language, quoteOf(message, item.part), item.name), ...order.map((index, at) => `${at + 1}. ${results[index].title}${results[index].snippet ? `（${results[index].snippet}）` : ""}`)].join("\n"));
          item.part.status = "awaiting_clarification";
          item.part.reason = null;
          item.part.waitReason = "object_ambiguous";
          continue;
        }
        if (!pick.open.length) {
          lines(item.part, WEB_WORDS.noRelevant(language, item.call.query ?? ""));
          settle(item.part, "web_not_opened");
          continue;
        }
        for (const index of pick.open) if ((await openPage(item.part, results[index].url)) === "stop") break;
      }
    }

    // AG11 run-02 (AE-WEB-001): a part about the page another part opened is answered from that page (no second fetch);
    // when that page could not be read, it says what the holder says.
    for (const { holder, part } of samePage) {
      const pages = (run.materials.get(holder.localId) ?? []).filter((material) => material.kind === "web");
      if (pages.length) {
        run.materials.set(part.localId, [...(run.materials.get(part.localId) ?? []), ...pages]);
        if (part.status === "unfinished") {
          part.status = "answered";
          part.reason = null;
        }
        continue;
      }
      for (const line of run.gapLines.get(holder.localId) ?? []) lines(part, line);
      if (webOnly(part)) {
        part.status = holder.status === "awaiting_clarification" ? "waiting_dependency" : "unfinished";
        part.reason = holder.reason;
      }
    }

    // AG09 (PLANNER 排除范围; AE-UND-010): saving what a web page says as a record is not in this version — a change that
    // needs a web part's result makes no card; code says so (a later sprint adds the save card with its own check).
    for (const part of due) {
      // One part that both reads the page and asks to save from it (route.ts made it a web part): the save is not offered.
      if (part.capabilities.some((capability) => capabilityKind(capability) === "write")) lines(part, WEB_WORDS.saveNotYet(language, quoteOf(message, part)));
    }
    for (const part of parts) {
      if (part.route !== "propose_write" || part.reason !== "proposing") continue;
      // Only when the web part read something: a web part that could not look anything up leaves the change waiting for it.
      if (!part.dependsOn.some((id) => { const other = parts.find((item) => item.localId === id); return Boolean(other && needsWeb(other) && run.materials.get(other.localId)?.some((material) => material.kind === "web")); })) continue;
      part.status = "unfinished";
      part.reason = "web_save_not_in_this_version";
      run.writeLines.set(part.localId, WEB_WORDS.saveNotYet(language, quoteOf(message, part)));
      emitTrace({ partId: part.localId, reason: "a change built on a web result: not offered yet", type: "web.save_not_offered" });
    }

    // AG09 stability run (AE-WEB-012): a web part that could not look anything up (switched off, blocked, nothing
    // found …) says so itself; a part that leans on it goes on with what the user's records give and does not wait.
    for (const part of due) {
      if (part.status !== "unfinished" || !part.reason?.startsWith("web_")) continue;
      for (const other of parts) {
        // A change that needs what the page says still waits for it (no card from a page that was not read).
        if (!other.dependsOn.includes(part.localId) || other.capabilities.some((capability) => capabilityKind(capability) === "write")) continue;
        other.dependsOn = other.dependsOn.filter((id) => id !== part.localId);
        emitTrace({ dependency: part.localId, partId: other.localId, reason: part.reason, type: "web.dependency_released" });
      }
    }

    // What was sent and opened, said next to the answer and kept in the result document.
    for (const part of due) {
      const queries = sentQueries.get(part.localId) ?? [];
      const pages = opened.filter((item) => item.partId === part.localId).map((item) => ({ date: item.call.page?.sourceDate ?? searchResultFor(item.call.url ?? "")?.date ?? null, title: item.call.page?.title ?? "", url: item.call.url ?? "" }));
      const line = WEB_WORDS.sources(language, queries, pages);
      if (line && (queries.length || pages.length)) lines(part, line);
    }
    for (const [partId, queries] of sentQueries) {
      const call = web?.ledger().calls.find((item) => item.kind === "search" && item.partId === partId && queries.includes(item.query ?? ""));
      for (const text of queries) if (!run.web.queries.some((query) => query.text === text)) run.web = { ...run.web, queries: [...run.web.queries, { provider: "deepseek", sentAt: call?.reservedAt ?? now(), text }] };
    }
    for (const item of opened) {
      const page = item.call.page;
      const date = page?.sourceDate ?? searchResultFor(item.call.url ?? "")?.date ?? undefined;
      run.web = { ...run.web, pages: [...run.web.pages.filter((existing) => existing.sourceRef !== `web:${item.call.key}`), { excerpt: (page?.excerpt ?? "").slice(0, 300), fetchedAt: item.call.finishedAt ?? item.call.reservedAt, readStatus: item.call.status === "reserved" ? "provider_error" : item.call.status, sourceRef: `web:${item.call.key}`, title: page?.title ?? "", url: item.call.url ?? "", ...(date ? { sourceDate: date } : {}) }] };
    }
    for (const url of messageUrls) run.webUrls.add(url);
    emitTrace({ budget: web?.left() ?? null, opened: opened.map((item) => item.call.key), parts: due.map((part) => ({ partId: part.localId, reason: part.reason, status: part.status })), queries: [...sentQueries.values()].flat().length, type: "web.done" });
    return { budget, optionSets: sets, parts };
  };
}
