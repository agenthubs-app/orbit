/**
 * understand (main model): the first layer (设计稿附录 C). One call; if the output does not pass the
 * checks, one repair call that is told what was wrong (§3.3). Each call first checks the round's
 * budget (models/main.ts). Still invalid after the repair: nothing is made up, deliver says so.
 */
import { capabilityKind } from "../../route/capabilities";
import { formatWhen } from "../../answer/materials";
import { callMainModel, type MainModelResult } from "../../models/main";
import { emitTrace } from "../../observability/trace";
import { hypothesisOf, negationIn, negationOf } from "../../route/decide";
import { replyLanguageOf } from "../../route/handoff-copy";
import { repairUserText, understandSystemPrompt, understandUserText, UNDERSTAND_PROMPT_VERSION } from "../../understand/prompt";
import { coverEverySentence } from "../../understand/cover";
import { describedObjectSpan, subjectInsideRecord, timeWordClue } from "../../understand/described-clue";
import type { UnderstandOutput } from "../../understand/schema";
import { parseModelJson, validateUnderstandOutput, type UnderstandValidationInput } from "../../understand/validate";
import type { GraphNode, NodeScope } from "../deps";
import type { AgentGraphState, GraphPart } from "../state";

function graphPartsOf(output: UnderstandOutput, scope: NodeScope): GraphPart[] {
  const context = scope.run.context!;
  const message = scope.input.message;
  // AG13 opening 3 (AE-RD-003): parts whose only contact clue is a word of time ("当时说了什么？"); they take the object of the
  // part before them in the same message.
  const timeClued = new Set<string>();
  const parts = output.parts.map((part) => {
    const start = message.indexOf(part.sourceQuote);
    const continued = part.continues ? context.openItemHandles.get(part.continues.ref) ?? null : null;
    // AG13 (AE-SCL-025): a part that only reads and names a schedule item reads schedule items too
    // ("明天这场周会关联了哪些人" tagged event.read only).
    const readsOnly = part.requiredCapabilities.length > 0 && part.requiredCapabilities.every((capability) => capabilityKind(capability) !== "write");
    // A meeting the user calls an event ("明天这场周会" tagged event) is one of their own schedule items too.
    const MEETING = /(周会|例会|会议|开会|定例|打ち合わせ|ミーティング|\bmeeting\b|\bstand-?up\b)/iu;
    const implied = readsOnly ? part.objectClues.flatMap((clue) => ((clue.entity === "schedule" || (clue.entity === "event" && MEETING.test(clue.text))) && !part.requiredCapabilities.includes("schedule.read" as never) ? ["schedule.read"] : [])) : [];
    if (implied.length) emitTrace({ added: [...new Set(implied)], partId: part.localId, type: "understand.read_implied_by_clue" });
    return {
      asked: 0,
      capabilities: [...new Set([...part.requiredCapabilities, ...implied])] as typeof part.requiredCapabilities,
      continues: part.continues && continued ? { kind: part.continues.kind, ref: continued.ref } : null,
      dependsOn: [...part.dependsOn],
      localId: part.localId,
      origin: null,
      plan: {
        clarity: part.clarity,
        dataOwner: part.dataOwner,
        dataSources: [...part.dataSources],
        deliverable: part.deliverable,
        hypothesis: hypothesisOf(part),
        intentBasis: part.intentBasis,
        // AG09 run-04 repair 2 (AE-JDG-007): a negation counts only when the user's own message carries one; a note the model
        // wrote around the user's words ("（假设，先不要真的改）") does not make one.
        negation: negationOf(part) && negationIn(message),
        persistence: part.persistence,
        readings: (part.readings ?? []).map((reading) => ({ capabilities: [...reading.capabilities], deliverable: reading.deliverable })),
        // The checkpoint keeps the words as offsets into this turn's message, never the words.
        ...(part.readFilter ? { readFilter: { ...part.readFilter, text: part.readFilter.text && message.includes(part.readFilter.text) ? [message.indexOf(part.readFilter.text), message.indexOf(part.readFilter.text) + part.readFilter.text.length] as [number, number] : undefined } } : {}),
        // AG08: the rank words as offsets too.
        ...(part.rank ? { rank: { ...part.rank, basis: spanOf(message, part.rank.basis), within: spanOf(message, part.rank.within) } } : {}),
        // AG09: what a web.search part looks up, the words as offsets too.
        ...(part.webTarget ? { webTarget: { qualifiers: [...part.webTarget.qualifiers], quote: spanOf(message, part.webTarget.quote) } } : {}),
      },
      quote: [start, start + part.sourceQuote.length],
      reading: null,
      reason: null,
      // AG12 run-03 (AE-WEB-004): an unnamed "那家公司" beside a clue naming a record is the subject inside that record.
      refs: part.objectClues.filter((clue) => {
        if (!clue.referenceId && timeWordClue(clue)) {
          timeClued.add(part.localId);
          emitTrace({ clue: clue.text, entity: clue.entity, partId: part.localId, type: "understand.time_word_clue" });
          return false;
        }
        // AG13 (AE-EVT-010): "老周" inside 「联系老周聊独立出版」这条待办 is words of the to-do's title, not a person to look up.
        const writes = part.requiredCapabilities.some((capability) => capabilityKind(capability) === "write");
        // Only a title the user quoted counts ("「联系老周聊独立出版」这条待办"); "上次和小林聊了什么" names 小林 the person.
        const quotedTitles = (text: string) => [...text.matchAll(/[「『"“]([^」』"”]+)[」』"”]/gu)].map((match) => match[1]);
        if (!clue.referenceId && !writes && clue.entity === "contact" && part.objectClues.some((other) => other !== clue && other.entity !== "contact" && quotedTitles(other.text).some((title) => title.includes(clue.text) && title !== clue.text))) {
          emitTrace({ clue: clue.text, entity: clue.entity, partId: part.localId, type: "understand.name_inside_title" });
          return false;
        }
        if (clue.referenceId || !subjectInsideRecord(clue, part.objectClues, writes)) return true;
        emitTrace({ clue: clue.text, entity: clue.entity, partId: part.localId, type: "understand.subject_in_record" });
        return false;
      }).map((clue) => {
        const at = message.indexOf(clue.text);
        const own: [number, number] | null = at >= 0 ? [at, at + clue.text.length] : null;
        // AG09 run-03 (AE-BND-006): a demonstrative the user described just before ("约山本吃饭这条待办") is looked up by
        // those words; the clue then names the record and is not a missing object.
        const described = clue.referenceId ? null : describedObjectSpan(message, own, [start, start + part.sourceQuote.length], clue.text);
        if (described) emitTrace({ clue: clue.text, described: message.slice(described[0], described[1]), entity: clue.entity, partId: part.localId, type: "understand.described_clue" });
        return { entity: clue.entity, quote: described ?? own, recordId: clue.referenceId ? context.handles.get(clue.referenceId)?.id ?? null : null };
      }),
      route: null,
      status: "unfinished",
      step: null,
      verdict: null,
      waitReason: null,
    } satisfies GraphPart;
  });
  for (const part of parts) {
    if (!timeClued.has(part.localId) || part.refs.some((ref) => ref.entity === "contact")) continue;
    const earlier = parts.filter((other) => other !== part && other.quote[0] >= 0 && other.quote[0] < part.quote[0] && other.refs.some((ref) => ref.entity === "contact"));
    const before = earlier.find((other) => part.dependsOn.includes(other.localId)) ?? earlier.sort((left, right) => right.quote[0] - left.quote[0])[0];
    if (!before) continue;
    part.refs = [...part.refs, ...before.refs.filter((ref) => ref.entity === "contact").map((ref) => ({ ...ref }))];
    emitTrace({ from: before.localId, partId: part.localId, type: "understand.time_word_clue_attached" });
  }
  return parts;
}

/** Words of this turn's message as [start, end), or undefined when they are not in it. */
function spanOf(message: string, words: string | undefined): [number, number] | undefined {
  if (!words) return undefined;
  const at = message.indexOf(words);
  return at >= 0 ? [at, at + words.length] : undefined;
}

type Checked = { ok: true; output: UnderstandOutput; dropped: string[] } | { ok: false; errors: string[] };

function check(text: string, input: UnderstandValidationInput): Checked {
  const parsed = parseModelJson(text);
  if (parsed.ok === false) return { errors: [parsed.error], ok: false };
  return validateUnderstandOutput(parsed.value, input);
}

const failedUnderstanding = (result: Extract<MainModelResult, { ok: false }>) => (result.reason === "budget" ? "budget" as const : "model_error" as const);

/** Family names (zh, ja) and name prefixes: a bare word that starts so, or ends with an honorific, reads as a person. */
const ZH_SURNAME = "王李张刘陈杨黄赵吴周徐孙马朱胡郭何林罗郑梁谢宋唐许韩冯邓曹彭曾肖董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范廖贾夏韦邹孟熊秦邱尹薛闫段雷侯史陶黎贺顾毛郝龚邵钱严覃戴莫孔汤";
const JA_SURNAME = /^(佐藤|鈴木|高橋|田中|伊藤|渡辺|渡边|山本|中村|小林|加藤|吉田|山田|佐々木|山口|松本|井上|木村|斎藤|清水|山崎|池田|橋本|阿部|石川|山下|中島|石井|小川|前田|岡田|長谷川|藤田|後藤|近藤|村上|遠藤|青木|坂本|福田|太田|西村|藤井|岡本|藤原|中野|三浦|原田|中川|松田|竹内|小野|田村|中山|和田|石田|森田|上田|柴田|酒井|工藤|横山|宮崎|宮本|内田|高木|安藤|島田|谷口|大野|高田|丸山|今井|河野|藤本|村田|武田|上野|杉山|増田|小山|大塚|平野|是枝)/u;
const HONORIFIC_END = /(さん|さま|様|くん|君|ちゃん|先生|氏|老师|女士|总监|经理|总)$/u;
const NOT_A_NAME = /^(今天|明天|昨天|后天|前天|今日|明日|昨日|早上|晚上|上午|下午|中午|周末|你好|您好|谢谢|好的|收到|嗯嗯|哈哈|在吗|帮忙|帮我|这个|那个|什么|为什么|怎么|是的|不是|没有|可以|不行|行吗|对的|继续|取消|算了|随便|好吧)$/u;
const EN_NOT_A_NAME = /^(hi|hello|hey|thanks|thank you|yes|no|ok|okay|sure|help|today|tomorrow|yesterday|please|continue|cancel|never mind|what|why|how|good|great|fine)$/iu;

/** True when a word on its own reads as a person's name (code's rule: no record is looked up). */
export function bareNameOf(words: string): string | null {
  const said = words.replace(/[\s。．.!！?？、，,…~～]+$/u, "").replace(/^[\s@]+/u, "").trim();
  if (!said) return null;
  if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]{2,8}$/u.test(said)) {
    const core = said.replace(HONORIFIC_END, "");
    if (NOT_A_NAME.test(said) || NOT_A_NAME.test(core) || core.length < 1) return null;
    if (HONORIFIC_END.test(said) && core.length >= 1) return said;
    if (/^[\p{Script=Han}]{2,4}$/u.test(core) && (/^[小老阿]/u.test(core) || ZH_SURNAME.includes(core[0]) || JA_SURNAME.test(core))) return said;
    return null;
  }
  if (/^[A-Z][a-z'-]+(?: [A-Z][a-z'-]+){0,2}$/u.test(said) && !EN_NOT_A_NAME.test(said)) return said;
  return null;
}

/**
 * AG10 run-03 (AE-AMB-001): a part that is only a name ("小林") and got no object clue from the first layer names a person,
 * as the first layer gives it (a contact clue, no record bound). Code decides from the words alone — nothing is looked up,
 * so the question that follows still reads none of the user's records.
 */
function nameBareContacts(output: UnderstandOutput): void {
  if (output.plainChat) return;
  for (const part of output.parts) {
    if (part.objectClues.length || part.clarity !== "none" || part.requiredCapabilities.length) continue;
    const name = bareNameOf(part.sourceQuote);
    if (!name) continue;
    part.objectClues = [{ entity: "contact", text: name }];
    emitTrace({ type: "understand.bare_name_contact", words: name.length });
  }
}

export function understandNode(scope: NodeScope): GraphNode {
  const { deps, input, run } = scope;
  return async (state: AgentGraphState) => {
    const context = run.context!;
    const budget = { ...state.budget };
    const validation: UnderstandValidationInput = { handles: new Set(context.handles.keys()), message: input.message, openItemRefs: new Set(context.openItemHandles.keys()) };
    const system = understandSystemPrompt();
    // AG05: today (with its weekday, in the user's time zone) lets the first layer give a date range.
    const zone = state.timeZone || "Asia/Tokyo";
    const today = `${formatWhen(state.asOf || deps.now(), zone, false)}, ${zone}`;
    const user = understandUserText({ contextText: context.promptText, message: input.message, today });
    emitTrace({ contextMessages: context.messages.length, promptVersion: UNDERSTAND_PROMPT_VERSION, type: "understand.prompt" });
    let repairs = state.repairs;
    let first = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "understand", purpose: "first", requestId: input.requestId, system, user });
    if (first.ok === false && first.reason === "model_error" && first.retryable && repairs < 1) {
      // A failed call (timeout, 429, 5xx) gets the round's one second chance, inside the same budget.
      repairs += 1;
      first = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "understand", purpose: "retry", requestId: input.requestId, system, user });
    }
    if (first.ok === false) return { budget, repairs, understanding: failedUnderstanding(first) };
    let checked = check(first.text, validation);
    if (checked.ok === false) {
      emitTrace({ errors: checked.errors, purpose: "first", type: "understand.invalid" });
      if (repairs >= 1) return { budget, repairs, understanding: "invalid" };
      repairs += 1;
      const repair = await callMainModel({ budget, fetchImplementation: deps.fetchImplementation, node: "understand", purpose: "repair", requestId: input.requestId, system, user: repairUserText({ contextText: context.promptText, errors: checked.errors, message: input.message, previousOutput: first.text, today }) });
      if (repair.ok === false) return { budget, repairs, understanding: failedUnderstanding(repair) };
      checked = check(repair.text, validation);
      if (checked.ok === false) {
        emitTrace({ errors: checked.errors, purpose: "repair", type: "understand.invalid" });
        return { budget, repairs, understanding: "invalid" };
      }
    }
    if (checked.dropped.length) emitTrace({ dropped: checked.dropped, note: "verdict, route and waitReason are decided by code; the model's values are dropped", type: "understand.fields_dropped" });
    // run-03: a sentence of the message no part holds becomes a statement part (code's, not the model's).
    const covered = coverEverySentence(checked.output, input.message);
    if (covered.added.length) emitTrace({ quotes: covered.added.map((words) => [input.message.indexOf(words), input.message.indexOf(words) + words.length]), type: "understand.sentence_covered" });
    nameBareContacts(covered.output);
    run.understood = covered.output;
    run.plainReply = covered.output.plainChat ? covered.output.reply ?? null : null;
    // AG06: the reply language — the first layer's report, checked against the text (intake's rule is the fallback).
    // AG06 repair 1: a Han-only message is decided by the user's earlier messages of this session, else the locale.
    const earlier = (run.context?.messages ?? []).filter((item) => item.role === "user").map((item) => item.text);
    const chosen = replyLanguageOf(input.message, covered.output.language, input.locale, earlier);
    emitTrace({ language: chosen.language, reported: covered.output.language ?? null, decidedBy: chosen.source, ...(chosen.rejected ? { rejected: chosen.rejected } : {}), type: "understand.language" });
    return { budget, language: chosen.language, parts: graphPartsOf(covered.output, scope), plainChat: covered.output.plainChat, repairs, understanding: "understood" };
  };
}
