// R37b: the v3 plan home, after plan-draft-v5-proposal.html v16「手机」·「计划主页 · 执行」(body.m, 390 wide; source
// `renderHome(g)`), the App side of R37a's Web PlanHomeV3. Sections in the design's order: .top (crumb + ✦ AI 調整) →
// .hh（目标 / 结论 | 阶段 N / 总数 · 阶段名 · 进度条 · 人数 / 分数）→ .route → 先做的事（.todo checklist; a row opens
// its .prep card）→ 要认识的人（.seats: legend / progress / .sr rows that open .ex / the event row）→ 为什么这么排
// (.evlink, opens the draft's evidence card). Numbers are the design's `.m` CSS values; colours are tokens. Rules
// (header numbers, line order, marks, merges) live in `plan-home-v3-model`; the field table's 「缺了不显示」 rows are
// simply not drawn. The R24 entry rows (goal switcher, 見直し, 手動編集, 達成…) stay below this page (PlanOverview).
import * as Clipboard from "expo-clipboard";
import { useIsFocused, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput, View, type StyleProp, type TextLayoutLine, type TextStyle } from "react-native";

import type { PlanHomeAction, PlanHomeView, PlanPrepCardView, PlanV2Detail, PlanV2PersonType } from "../../api/contract/plan-v2";
import { designFont } from "../../api/design/tokens";
import { BottomSheet, Button, UiPressable, UiText, useToast } from "../../components/ui";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { kitText } from "./plan-kit";
import { useV3KitStyles, V3_INLINE, V3Evidence, V3Route, v3Num, v3Shadow } from "./plan-draft-v3-kit";
import {
  draftPieces,
  eventsDoneOf,
  factTextOk,
  homeHeader,
  isEventAction,
  markedPieces,
  mergeHome,
  monthDay,
  PLAN_HOME_FACT_MAX,
  PLAN_HOME_POLL_MAX,
  PLAN_HOME_POLL_MS,
  prepLines,
  seatOf,
  typeStepNumber,
  typeToneOf,
  withDone,
  type MarkedPiece,
  type PlanTypeTone,
} from "./plan-home-v3-model";
import { PLAN_EVENT_EMOJI, newIdempotencyKey } from "./plan-model";
import { usePlanApi } from "./plan-api";

// New in R37a (both ends): the checklist title size and the 「なぜこう切り出すか」 leading.
const designTaskTitle = designFont.size.taskTitle;
const designRelaxed = designFont.lineHeight.relaxed;

const ROW_KEYS = {
  about: "plan.home.rowAbout",
  common: "plan.home.rowCommon",
  last_contact: "plan.home.rowLast",
  met: "plan.home.rowMet",
  plan_fit: "plan.home.rowFit",
  when_where: "plan.home.rowWhen",
  who: "plan.home.rowWho",
} as const;

export function PlanHomeV3({ plan, onReload, onAiAdjust, now = new Date() }: {
  plan: PlanV2Detail;
  /** Reads the overview again (bypassing the page copy): the 準備中 poll and after a saved fact. */
  onReload: () => Promise<void>;
  /** 「✦ AI に調整してもらう」 = the 見直し entry. */
  onAiAdjust: () => void;
  now?: Date;
}) {
  const { styles, colors } = useStyles();
  const kit = useV3KitStyles().styles;
  const { t } = useOrbitLocale();
  const api = usePlanApi();
  const toast = useToast();
  const router = useRouter();
  const focused = useIsFocused();
  const [home, setHome] = useState<PlanHomeView | null>(plan.home ?? null);
  const [openAction, setOpenAction] = useState<string | null>(null);
  const [openSeat, setOpenSeat] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [limited, setLimited] = useState<ReadonlySet<string>>(new Set());
  const [factFor, setFactFor] = useState<string | null>(null);
  const [factText, setFactText] = useState("");
  const content = plan.content;

  useEffect(() => { setHome((previous) => (plan.home ? mergeHome(previous, plan.home) : null)); }, [plan.home]);

  // 準備中: read the overview every 3 s, at most 10 times, only while this page is in view (the server fills it in on read).
  const pending = home?.state === "pending";
  const reload = useRef(onReload);
  reload.current = onReload;
  const polls = useRef(0);
  useEffect(() => {
    if (!pending || !focused) return;
    const timer = setInterval(() => {
      if (polls.current >= PLAN_HOME_POLL_MAX) { clearInterval(timer); return; }
      polls.current += 1;
      void reload.current();
    }, PLAN_HOME_POLL_MS);
    return () => clearInterval(timer);
  }, [pending, focused]);

  const header = homeHeader({ ...plan, home });
  const stage = content.steps[header.stepIndex];
  const actions = home?.actions ?? [];
  const sources = content.sources ?? [];
  const maxPoints = Math.max(0, ...content.personTypes.map((type) => type.allocation));
  const eventsDone = eventsDoneOf(plan);
  const toneColor = (tone: PlanTypeTone) => ({ apricot: colors.macApricot, blue: colors.macBlue, lav: colors.macLav, pink: colors.macPink, teal: colors.macTeal })[tone];
  const openContact = (contactId: string) => router.push(`/contacts/${encodeURIComponent(contactId)}` as Href);

  const toggleDone = async (action: PlanHomeAction) => {
    if (!home) return;
    const next = !action.done;
    setHome(withDone(home, action.actionKey, next));
    const result = await api.homeDone(plan.planId, action.actionKey, next, newIdempotencyKey("home-done"));
    if (result.ok) setHome((previous) => mergeHome(previous, result.data));
    else setHome((previous) => (previous ? withDone(previous, action.actionKey, action.done) : previous));
  };

  const regenerate = async (action: PlanHomeAction) => {
    setBusy(`regen:${action.actionKey}`);
    const result = await api.homeRegenerate(plan.planId, action.actionKey, newIdempotencyKey("home-regenerate"));
    setBusy(null);
    if (result.ok) { setHome((previous) => mergeHome(previous, result.data)); return; }
    // 409 LIMIT: today's plan-flow uses are gone — the card stays as it is and says so instead of offering the button.
    if (result.failure.kind === "other" && result.failure.reason === "LIMIT") {
      setLimited((previous) => new Set(previous).add(action.actionKey));
      toast.error(t("plan.home.regenerateLimit"));
      return;
    }
    toast.error(t("plan.home.regenerateFailed"));
  };

  const copyDraft = (text: string) => void Clipboard.setStringAsync(text).then(() => toast.success(t("plan.home.copied")), () => undefined);

  const saveFact = async () => {
    const contactId = factFor;
    if (!contactId || !factTextOk(factText)) return;
    setBusy("fact");
    const result = await api.addContactFact(contactId, factText.trim(), newIdempotencyKey("contact-fact"));
    setBusy(null);
    if (!result.ok) { toast.error(t("plan.home.factFailed")); return; }
    setFactFor(null);
    setFactText("");
    toast.success(t("plan.home.factSaved"));
    await onReload();
  };

  return (
    <View style={styles.page} testID="plan-home-v3">
      <View style={kit.top}>
        <UiText style={kit.crumb}>{t("plan.home.crumb")}</UiText>
        <UiPressable accessibilityRole="button" hitSlop={6} onPress={onAiAdjust} style={kit.ai} testID="plan-home-ai">
          <UiText style={kit.aiText}>{t("plan.home.aiAdjust")}</UiText>
        </UiPressable>
      </View>

      {/* .hh（手机：上下排）：目标 · 结论 | 阶段 N / 总数 · 阶段名 · 进度条 · 人数 / 分数 */}
      <View style={styles.hh} testID="plan-home-head">
        <View>
          {content.outcome ? <UiText style={styles.goal}>{t("plan.v3.goal", { outcome: content.outcome })}</UiText> : null}
          <UiText accessibilityRole="header" style={styles.h1}>{content.conclusion ?? plan.goal}</UiText>
        </View>
        <View>
          <View style={styles.pgB}>
            <UiText style={styles.pgBText}>{t("plan.home.stageNow", { n: header.stepIndex + 1 })}</UiText>
            <UiText style={styles.pgBSmall}>{t("plan.home.stageOf", { total: header.stepCount })}</UiText>
          </View>
          {header.stepTitle ? <UiText style={styles.dn}>{header.stepTitle}</UiText> : null}
          <View style={[styles.prog, styles.pgProg]}><View style={[styles.progFill, { width: `${header.barPercent}%` }]} /></View>
          <UiText style={styles.pgLine} testID="plan-home-progress">{t("plan.home.progressLine", { found: header.found, need: header.need, score: header.score, total: header.total })}</UiText>
        </View>
      </View>

      <V3Route steps={content.steps} current={header.stepIndex} testID="plan-home-route" />

      {/* 先做的事 */}
      <View style={kit.section} testID={`plan-home-todo-${home?.state ?? "none"}`}>
        <View style={kit.sh}>
          <UiText accessibilityRole="header" style={kit.h2}>{t("plan.home.todoTitle", { n: actions.length })}</UiText>
          {stage ? <UiText style={kit.shSpan}>{t("plan.home.stageLine", { n: header.stepIndex + 1, title: stage.title })}</UiText> : null}
        </View>
        {home?.lead ? <UiText style={kit.guide}>{home.lead}</UiText> : null}
        <View style={styles.todo}>
          {pending ? <UiText accessibilityLiveRegion="polite" style={styles.hint} testID="plan-home-preparing">{t("plan.home.preparing")}</UiText> : null}
          {!pending && actions.length === 0 ? <UiText style={styles.hint} testID="plan-home-go-meet">{t("plan.home.goMeet")}</UiText> : null}
          {actions.map((action, index) => {
            const open = openAction === action.actionKey;
            const event = isEventAction(action);
            const tone = event ? "pink" : typeToneOf(plan, action.typeKey);
            return (
              <View key={action.actionKey} style={[styles.td, index > 0 && styles.tdLine]} testID={`plan-home-action-${action.actionKey}`}>
                <UiPressable accessibilityRole="checkbox" accessibilityLabel={action.title} accessibilityState={{ checked: action.done }} hitSlop={10} onPress={() => void toggleDone(action)} style={[styles.box, action.done && styles.boxOn]} testID={`plan-home-done-${action.actionKey}`}>
                  {action.done ? <View style={styles.tick} testID={`plan-home-tick-${action.actionKey}`} /> : null}
                </UiPressable>
                <View style={styles.tdBody}>
                  <View style={styles.tx}>
                    <UiText style={[styles.tt, action.done && styles.ttDone]}>
                      {action.title}
                      {action.stepNumber > 1 ? <UiText>{" "}<View style={styles.stt}><UiText style={styles.sttText}>{t("plan.home.early", { n: action.stepNumber })}</UiText></View></UiText> : null}
                    </UiText>
                    <MarkedLines text={action.reason.text} marks={action.reason.marks} style={styles.why} markStyle={styles.whyMark} mark={{ color: colors.macApricot, kind: "highlight" }} testID={`plan-home-why-${action.actionKey}`} />
                    {action.prep ? (
                      <View style={styles.acts}>
                        <UiPressable accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6} onPress={() => setOpenAction(open ? null : action.actionKey)} style={[styles.opb, open && styles.opbOn]} testID={`plan-home-prep-toggle-${action.actionKey}`}>
                          <UiText style={styles.opbText}>{t(event ? "plan.home.prepEvent" : "plan.home.prepContact")} {open ? "▴" : "▾"}</UiText>
                        </UiPressable>
                        <View style={styles.hk}>
                          <UiText style={styles.hkText}>{t("plan.home.hookLabel")}</UiText>
                          <UiText style={styles.hkB}>{action.prep.hook.label}</UiText>
                        </View>
                      </View>
                    ) : null}
                    {open && action.prep ? (
                      <PrepCard
                        action={action}
                        prep={action.prep}
                        event={event}
                        busy={busy}
                        limited={limited.has(action.actionKey)}
                        onCopy={copyDraft}
                        onRegenerate={() => void regenerate(action)}
                        onOpenContact={openContact}
                        onAddFact={(contactId) => { setFactFor(contactId); setFactText(""); }}
                      />
                    ) : null}
                  </View>
                  <View style={styles.meta}>
                    <View style={[styles.mk, { backgroundColor: toneColor(tone) }]}><UiText style={styles.mkText}>{action.avatar}</UiText></View>
                    <UiText numberOfLines={1} style={styles.metaText}>{action.meta}</UiText>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* 要认识的人 */}
      <View style={kit.section} testID="plan-home-seats">
        <View style={kit.sh}>
          <UiText accessibilityRole="header" style={kit.h2}>{t("plan.home.seatsTitle")}</UiText>
          <UiText style={kit.shSpan}>{t("plan.home.seatsSub", { found: header.found, need: header.need })}</UiText>
        </View>
        <View style={styles.seats}>
          <View style={styles.legend}>
            <View style={styles.legendItem}><View style={styles.lf}><View style={styles.lfRing} /></View><UiText style={styles.legendText}>{t("plan.home.legendFilled")}</UiText></View>
            <View style={styles.legendItem}><View style={styles.le}><UiText style={styles.leText}>+</UiText></View><UiText style={styles.legendText}>{t("plan.home.legendEmpty")}</UiText></View>
            <View style={styles.legendItem}><UiText style={styles.lp}>{String(maxPoints)}</UiText><UiText style={styles.legendText}>{t("plan.home.legendPoints", { total: header.total })}</UiText></View>
          </View>
          <View style={styles.prog}><View style={[styles.progFill, { width: `${header.need > 0 ? Math.round((header.found / header.need) * 100) : 0}%` }]} /></View>
          {content.personTypes.map((type) => (
            <SeatRow
              key={type.key}
              type={type}
              tone={toneColor(typeToneOf(plan, type.key))}
              stepNumber={typeStepNumber(content, type.key)}
              seat={seatOf(home, type.key)}
              open={openSeat === type.key}
              onToggle={() => setOpenSeat(openSeat === type.key ? null : type.key)}
            />
          ))}
          <View style={[styles.sr, styles.ev]} testID="plan-home-seat-event">
            <View style={styles.srTop}>
              <View style={[styles.em, { backgroundColor: colors.macPink }]}><UiText style={styles.emText}>{PLAN_EVENT_EMOJI}</UiText></View>
              <View style={styles.srNm}>
                <UiText style={styles.srNmText}>{t("plan.v3.eventRow")}</UiText>
                <UiText style={styles.srNmSmall}>{t("plan.home.eventRole")}</UiText>
              </View>
              <Points value={content.event.allocation} />
            </View>
            <View style={styles.slots}>
              {Array.from({ length: content.event.targetCount }, (_, slot) => <Slot key={slot} filled={slot < eventsDone} square label={slot < eventsDone ? "✓" : "+"} />)}
            </View>
          </View>
        </View>
      </View>

      {/* 为什么这么排：收起 = .evlink；展开 = 初稿页的依据区 */}
      {sources.length || content.orderReasons?.length || content.comparison ? (
        full ? (
          <V3Evidence content={content} citations={[]} now={now} testID="plan-home-evidence" onClose={() => setFull(false)} />
        ) : (
          <View style={kit.section}>
            <UiPressable accessibilityRole="button" accessibilityState={{ expanded: false }} onPress={() => setFull(true)} style={styles.evlink} testID="plan-home-evlink">
              <UiText style={styles.evlinkText}><UiText style={styles.evlinkB}>{t("plan.v3.whyTitle")}</UiText>{t("plan.home.evlinkRest", { n: sources.length })}</UiText>
            </UiPressable>
          </View>
        )
      ) : null}
      <View style={styles.bottom} />

      <BottomSheet visible={factFor !== null} onClose={() => setFactFor(null)} accessibilityLabel={t("plan.home.factTitle")}>
        <View style={styles.factSheet} testID="plan-home-fact-sheet">
          <UiText accessibilityRole="header" style={styles.factTitle}>{t("plan.home.factTitle")}</UiText>
          <TextInput
            accessibilityLabel={t("plan.home.factTitle")}
            multiline
            value={factText}
            onChangeText={setFactText}
            placeholder={t("plan.home.factPlaceholder")}
            placeholderTextColor={colors.ink3Text}
            maxLength={PLAN_HOME_FACT_MAX * 2}
            style={styles.factInput}
            testID="plan-home-fact-input"
          />
          <UiText style={styles.factCount}>{`${Array.from(factText.trim()).length} / ${PLAN_HOME_FACT_MAX}`}</UiText>
          <View style={styles.factActions}>
            <Button label={t("plan.home.factCancel")} onPress={() => setFactFor(null)} variant="ghost" />
            <Button label={t("plan.home.factSave")} onPress={() => void saveFact()} variant="primary" disabled={!factTextOk(factText) || busy === "fact"} loading={busy === "fact"} />
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

/** .prep：行表（no record → no row）→ なぜこう切り出すか → 書き出し（下線 + コピー）→ 情報が更新 · 作り直す → 補足できること. */
function PrepCard({ action, prep, event, busy, limited, onCopy, onRegenerate, onOpenContact, onAddFact }: {
  action: PlanHomeAction; prep: PlanPrepCardView; event: boolean; busy: string | null; limited: boolean;
  onCopy: (text: string) => void; onRegenerate: () => void; onOpenContact: (contactId: string) => void; onAddFact: (contactId: string) => void;
}) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const contactId = action.contactId;
  return (
    <View style={styles.prep} testID={`plan-home-prep-${action.actionKey}`}>
      {prepLines(prep).map((line) => line.kind === "fact" ? (
        <View key={`f${line.fact.id}`} style={styles.pr} testID={`plan-home-fact-${line.fact.id}`}>
          <UiText style={styles.prK}>{t("plan.home.rowMemo")}</UiText>
          <View style={styles.prV}>
            <UiText style={styles.prText}>{line.fact.text}</UiText>
            <UiPressable accessibilityRole={contactId ? "link" : undefined} disabled={!contactId} hitSlop={6} onPress={() => contactId && onOpenContact(contactId)} style={styles.sg}>
              <UiText style={styles.sgText}>{t("plan.home.memoChip", { date: monthDay(line.fact.date) })}</UiText>
            </UiPressable>
          </View>
        </View>
      ) : (
        <View key={`r${line.row.key}`} style={styles.pr} testID={`plan-home-row-${line.row.key}`}>
          <UiText style={styles.prK}>{t(ROW_KEYS[line.row.key])}</UiText>
          <View style={styles.prV}>
            <UiText style={styles.prText}>{line.row.value}</UiText>
            {line.row.source !== "—" ? <View style={styles.sg}><UiText style={styles.sgText}>{line.row.source}</UiText></View> : null}
          </View>
        </View>
      ))}
      <UiText style={styles.hook}><UiText style={styles.hookB}>{t("plan.home.hookWhy")}{"\n"}</UiText>{prep.hook.reason}</UiText>
      <View style={styles.op}>
        <View style={styles.opH}>
          <UiText style={styles.opHText}>{t(event ? "plan.home.draftHeadEvent" : "plan.home.draftHead")}</UiText>
          <UiPressable accessibilityRole="button" hitSlop={6} onPress={() => onCopy(prep.draft.text)} style={styles.copy} testID={`plan-home-copy-${action.actionKey}`}>
            <UiText style={styles.copyText}>{t("plan.home.copy")}</UiText>
          </UiPressable>
        </View>
        <MarkedLines text={prep.draft.text} marks={prep.draft.refs} style={styles.opText} mark={{ color: colors.plum300, kind: "underline" }} pieces={draftPieces(prep)} testID={`plan-home-draft-${action.actionKey}`} />
      </View>
      {prep.staleSince ? (
        <View style={styles.stale} testID={`plan-home-stale-${action.actionKey}`}>
          <UiText style={styles.staleText}>{t(limited ? "plan.home.regenerateLimit" : "plan.home.stale")}</UiText>
          {!limited ? (
            <UiPressable accessibilityRole="button" accessibilityState={{ busy: busy === `regen:${action.actionKey}`, disabled: busy !== null }} disabled={busy !== null} hitSlop={6} onPress={onRegenerate} style={styles.regen} testID={`plan-home-regenerate-${action.actionKey}`}>
              <UiText style={styles.regenText}>{t("plan.home.regenerate")}</UiText>
            </UiPressable>
          ) : null}
        </View>
      ) : null}
      {prep.gaps.length && contactId ? (
        <View style={styles.gaps} testID={`plan-home-gaps-${prep.gaps.join(",")}`}>
          <UiText style={styles.gapsText}>{t("plan.home.gapsLead")}</UiText>
          {prep.gaps.includes("memo") ? <UiPressable accessibilityRole="button" hitSlop={4} onPress={() => onAddFact(contactId)} style={styles.gap} testID="plan-home-gap-memo"><UiText style={styles.gapText}>{t("plan.home.gapMemo")}</UiText></UiPressable> : null}
          {prep.gaps.includes("interaction") ? <UiPressable accessibilityRole="link" hitSlop={4} onPress={() => onOpenContact(contactId)} style={styles.gap} testID="plan-home-gap-interaction"><UiText style={styles.gapText}>{t("plan.home.gapInteraction")}</UiText></UiPressable> : null}
        </View>
      ) : null}
    </View>
  );
}

/** .sr（手机：32 | 1fr | 44，两行）：emoji · 名 + 阶段 · 分量；第二行空位。展开 .ex：是什么样的人 / 已在人脉里或去哪里认识 / 见面聊什么. */
function SeatRow({ type, tone, stepNumber, seat, open, onToggle }: { type: PlanV2PersonType; tone: string; stepNumber: number; seat: ReturnType<typeof seatOf>; open: boolean; onToggle: () => void }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const people = seat?.people ?? [];
  return (
    <View>
      <UiPressable accessibilityRole="button" accessibilityLabel={type.shortLabel} accessibilityState={{ expanded: open }} onPress={onToggle} style={[styles.sr, open && styles.srOpen]} testID={`plan-home-seat-${type.key}`}>
        <View style={styles.srTop}>
          <View style={[styles.em, { backgroundColor: tone }]}><UiText style={styles.emText}>{type.emoji}</UiText></View>
          <View style={styles.srNm}>
            <UiText style={styles.srNmText}>{type.shortLabel}</UiText>
            <UiText style={styles.srNmSmall}>{t("plan.home.typeStage", { n: stepNumber })}</UiText>
          </View>
          <Points value={type.allocation} />
        </View>
        <View style={styles.slots}>
          {Array.from({ length: type.targetCount }, (_, slot) => {
            const person = people[slot];
            return <Slot key={slot} filled={Boolean(person)} label={person ? Array.from(person.name)[0] ?? "✓" : "+"} />;
          })}
        </View>
      </UiPressable>
      {open ? (
        <View style={styles.ex} testID={`plan-home-seat-detail-${type.key}`}>
          <View>
            <UiText style={styles.h4}>{t("plan.home.exWhat")}</UiText>
            <UiText style={styles.exP}>{type.roleSituation}</UiText>
            {people.length ? (
              <>
                <UiText style={[styles.h4, styles.gap12]}>{t("plan.home.legendFilled")}</UiText>
                {people.map((person, index) => (
                  <View key={person.contactId ?? `anon${index}`} style={styles.cd}>
                    <View style={styles.av}><UiText style={styles.avText}>{Array.from(person.name)[0] ?? "?"}</UiText></View>
                    <UiText style={styles.cdText}>{person.name || "—"}{person.note ? <UiText style={styles.cdSmall}>{" "}{person.note}</UiText> : null}</UiText>
                  </View>
                ))}
              </>
            ) : (
              <>
                <UiText style={[styles.h4, styles.gap12]}>{t("plan.home.exWhere")}</UiText>
                <View style={styles.miss}><UiText style={styles.missText}>{seat?.meetAt ? t("plan.home.exMissAt", { event: seat.meetAt }) : t("plan.home.exMissNone")}</UiText></View>
              </>
            )}
          </View>
          <View>
            <UiText style={styles.h4}>{t("plan.home.exAsk")}</UiText>
            {type.questions.map((question, index) => (
              <View key={index} style={styles.li}>
                <UiText style={styles.liNum}>{`${index + 1}.`}</UiText>
                <UiText style={styles.liText}>{question}</UiText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Points({ value }: { value: number }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  return (
    <View style={styles.pts}>
      <UiText style={styles.ptsB}>{String(value)}</UiText>
      <UiText style={styles.ptsSmall}>{t("plan.v3.unitPoints")}</UiText>
    </View>
  );
}

/** .slots i：filled = 淡紫底 + 2px 白缝 + 1.5px ok 色环；empty = 虚线圈 +；square = 活动行的方块。 */
function Slot({ filled, label, square = false }: { filled: boolean; label: string; square?: boolean }) {
  const { styles } = useStyles();
  return (
    <View style={[styles.slot, square && styles.slotSq, filled ? styles.slotFill : styles.slotEmpty]}>
      {filled ? <View pointerEvents="none" style={[styles.slotRing, square && styles.slotRingSq]} /> : null}
      <UiText style={filled ? styles.slotFillText : styles.slotEmptyText}>{label}</UiText>
    </View>
  );
}

/**
 * Text with marked ranges drawn the way the design's CSS does on an inline box: `highlight` = the reason's bold part on a
 * marker stripe (`linear-gradient(transparent 62%, apricot 62%)` over the glyph box), `underline` = the opener's 1.5px
 * border under the glyph box. RN cannot paint those on a nested Text, so after layout each covered line's prefix is
 * measured (hidden one-line copies with the same pieces) and the stripes are laid behind the text.
 */
function MarkedLines({ text, marks, style, markStyle, mark, pieces, testID }: {
  text: string;
  marks: readonly { start: number; end: number }[];
  style: StyleProp<TextStyle>;
  markStyle?: StyleProp<TextStyle>;
  mark: { color: string; kind: "highlight" | "underline" };
  pieces?: MarkedPiece[];
  testID?: string;
}) {
  const [lines, setLines] = useState<readonly TextLayoutLine[] | null>(null);
  const [widths, setWidths] = useState<Readonly<Record<string, number>>>({});
  const all = pieces ?? markedPieces(text, marks);
  const spans = lines ? lineSpans(lines, marks) : [];
  const piecesOf = (from: number, to: number) => markedPieces(text.slice(from, to), marks.map((entry) => ({ end: entry.end - from, start: entry.start - from })));
  const render = (list: MarkedPiece[]) => list.map((piece, index) => <UiText key={index} style={piece.marked ? markStyle : undefined}>{piece.text}</UiText>);
  return (
    <View testID={testID}>
      {spans.map((span) => {
        const line = lines![span.line]!;
        const left = span.from === span.lineStart ? 0 : widths[`${span.lineStart}:${span.from}`];
        const right = widths[`${span.lineStart}:${span.to}`];
        if (left === undefined || right === undefined || right <= left) return null;
        const glyph = line.ascender + line.descender;
        const top = line.y + (line.height - glyph) / 2;
        const box = mark.kind === "highlight" ? { height: glyph * 0.38, top: top + glyph * 0.62 } : { height: 1.5, top: top + glyph };
        return <View key={`${span.line}:${span.from}`} pointerEvents="none" style={{ backgroundColor: mark.color, left: line.x + left, position: "absolute", width: right - left, ...box }} />;
      })}
      <UiText style={style} onTextLayout={(event) => setLines(event.nativeEvent.lines)}>{render(all)}</UiText>
      {spans.length ? (
        <View pointerEvents="none" style={hidden.box} aria-hidden>
          {spans.flatMap((span) => [span.from, span.to].filter((end) => end > span.lineStart).map((end) => (
            <UiText key={`${span.lineStart}:${end}`} numberOfLines={1} style={style} onTextLayout={(event) => { const width = event.nativeEvent.lines[0]?.width ?? 0; setWidths((previous) => (previous[`${span.lineStart}:${end}`] === width ? previous : { ...previous, [`${span.lineStart}:${end}`]: width })); }}>
              {render(piecesOf(span.lineStart, end))}
            </UiText>
          )))}
        </View>
      ) : null}
    </View>
  );
}

/** The parts of each laid-out line a mark covers (string offsets; lines in order cover the text). */
function lineSpans(lines: readonly TextLayoutLine[], marks: readonly { start: number; end: number }[]) {
  const spans: { line: number; lineStart: number; from: number; to: number }[] = [];
  let offset = 0;
  lines.forEach((line, index) => {
    const end = offset + line.text.length;
    for (const entry of marks) {
      const from = Math.max(entry.start, offset);
      const to = Math.min(entry.end, end);
      if (from < to) spans.push({ from, line: index, lineStart: offset, to });
    }
    offset = end;
  });
  return spans;
}

const hidden = StyleSheet.create({ box: { left: 0, opacity: 0, position: "absolute", top: 0, width: 4000 } });

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { paddingTop: 18 },

  // CSS collapses .hh's margins (4 / 22) into .top's 26 below and .route's 30 above, so none are left here.
  hh: { gap: 12 },
  goal: { color: colors.plum700, ...kitText(12.5, "500", 1.6), marginBottom: 8 },
  h1: { color: colors.ink, ...kitText(22, "600", 1.35) },
  // .pg's inline lines sit on the parent's 14px / 1.6 strut: the 26px b line box ends ~1.7pt lower, the 12px last line is 22.4 tall.
  pgB: { flexDirection: "row", alignItems: "baseline", paddingBottom: 1.7 },
  pgBText: { color: colors.ink, ...v3Num(26, "600", 1) },
  pgBSmall: { color: colors.ink3Text, marginLeft: 3, ...kitText(11.5, "500", 1.2) },
  dn: { color: colors.ink2, marginTop: 4, ...kitText(12, "400", 1.5) },
  pgProg: { marginTop: 8, marginHorizontal: 0, marginBottom: 0 },
  pgLine: { color: colors.ink3Text, ...kitText(12, "400", 22.4 / 12) },
  prog: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, marginHorizontal: 20, marginBottom: 8, overflow: "hidden" },
  progFill: { height: 6, borderRadius: 3, backgroundColor: colors.ok },

  todo: { backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 4, ...v3Shadow(colors.ink, 0.04) },
  hint: { paddingVertical: 15, paddingHorizontal: 20, color: colors.ink2, ...kitText(13, "400", 1.6) },
  td: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 12, paddingHorizontal: 16 },
  tdLine: { borderTopWidth: 1, borderTopColor: colors.line },
  box: { width: 20, height: 20, marginTop: 1, marginRight: 2, borderRadius: 7, borderWidth: 1.6, borderColor: colors.plum300, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tick: { width: 9, height: 5, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: colors.surface, transform: [{ rotate: "-45deg" }, { translateX: 1 }, { translateY: -1 }] },
  tdBody: { flex: 1, minWidth: 0, gap: 10 },
  tx: { gap: 5, minWidth: 0 },
  tt: { color: colors.ink, ...kitText(designTaskTitle, "600", 1.6) },
  ttDone: { color: colors.ink4, textDecorationLine: "line-through" },
  stt: { ...V3_INLINE, backgroundColor: colors.macLav, borderRadius: 999, paddingVertical: 1, paddingHorizontal: 8, marginLeft: 8, transform: [{ translateY: -2 }] },
  sttText: { color: colors.macLavText, ...kitText(11, "500", 1.6) },
  why: { color: colors.ink2, ...kitText(13, "400", 1.6) },
  whyMark: { color: colors.ink, fontWeight: "600" },
  acts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 3 },
  opb: { alignSelf: "flex-start", marginTop: 3, borderWidth: 1, borderColor: colors.plum100, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 11 },
  opbOn: { backgroundColor: colors.plum100 },
  opbText: { color: colors.plum700, ...kitText(12.5, "400", 1.6) },
  hk: { flexDirection: "row", alignItems: "center", gap: 6 },
  hkText: { color: colors.ink3Text, ...kitText(12, "400", 1.6) },
  hkB: { color: colors.plum700, ...kitText(12, "500", 1.6) },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  mk: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  mkText: { color: colors.ink2, ...kitText(11, "600", 1.6) },
  metaText: { flexShrink: 1, color: colors.ink3Text, ...kitText(12.5, "400", 1.6) },

  prep: { marginTop: 6, marginLeft: -36, backgroundColor: colors.surface2, borderRadius: 16, paddingTop: 4, paddingHorizontal: 12, paddingBottom: 12 },
  pr: { flexDirection: "row", alignItems: "baseline", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  prK: { width: 64, color: colors.ink3Text, ...kitText(12, "400", 1.6) },
  prV: { flex: 1, minWidth: 0, gap: 10 },
  prText: { color: colors.ink, ...kitText(13, "400", 1.6) },
  sg: { alignSelf: "flex-start", backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 1, paddingHorizontal: 8 },
  sgText: { color: colors.ink3Text, ...kitText(11, "400", 1.6) },
  hook: { marginTop: 12, marginBottom: 10, color: colors.ink2, ...kitText(13, "400", designRelaxed) },
  hookB: { color: colors.plum900, ...kitText(12.5, "700", 1.6) },
  op: { backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  opH: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  opHText: { flex: 1, minWidth: 0, color: colors.ink3Text, ...kitText(11.5, "400", 1.6) },
  copy: { backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10 },
  copyText: { color: colors.ink2, ...kitText(12, "400", 1.6) },
  opText: { color: colors.ink, ...kitText(13.5, "400", 1.75) },
  stale: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.macLav },
  staleText: { flexShrink: 1, color: colors.macLavText, ...kitText(12, "400", 1.6) },
  regen: { marginLeft: "auto", backgroundColor: colors.surface, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10 },
  regenText: { color: colors.plum700, ...kitText(12, "400", 1.6) },
  gaps: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 6, columnGap: 8, marginTop: 10 },
  gapsText: { color: colors.macApricotText, ...kitText(12, "400", 1.6) },
  gap: { backgroundColor: colors.macApricot, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10 },
  gapText: { color: colors.macApricotText, ...kitText(12, "400", 1.6) },

  seats: { backgroundColor: colors.surface, borderRadius: 20, paddingTop: 16, paddingBottom: 6, ...v3Shadow(colors.ink, 0.04) },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 6, columnGap: 16, paddingHorizontal: 20, paddingBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { color: colors.ink3Text, ...kitText(12, "400", 1.6) },
  lf: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.plum100 },
  lfRing: { position: "absolute", left: -1.5, top: -1.5, width: 19, height: 19, borderRadius: 9.5, borderWidth: 1.5, borderColor: colors.ok },
  le: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.2, borderStyle: "dashed", borderColor: colors.ink4, alignItems: "center", justifyContent: "center" },
  leText: { color: colors.ink4, ...kitText(10, "400", 1.2) },
  lp: { color: colors.ink, ...v3Num(12, "600", 1.6) },
  sr: { paddingVertical: 10, paddingHorizontal: 14, gap: 6 },
  srOpen: { backgroundColor: colors.surface2 },
  srTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  em: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  emText: { fontSize: 17, lineHeight: 27 },
  srNm: { flex: 1, minWidth: 0 },
  srNmText: { color: colors.ink, ...kitText(14.5, "600", 1.3) },
  srNmSmall: { color: colors.ink3Text, ...kitText(11.5, "400", 1.3) },
  pts: { width: 44, flexDirection: "row", alignItems: "baseline", justifyContent: "flex-end" },
  ptsB: { color: colors.ink, ...v3Num(20, "600", 1) },
  ptsSmall: { color: colors.ink3Text, marginLeft: 2, ...kitText(11, "500", 1.2) },
  slots: { flexDirection: "row", gap: 6, marginLeft: 46 },
  slot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  slotSq: { borderRadius: 9 },
  slotFill: { backgroundColor: colors.plum100 },
  slotEmpty: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.ink4 },
  slotRing: { position: "absolute", left: -3.5, top: -3.5, width: 33, height: 33, borderRadius: 16.5, borderWidth: 1.5, borderColor: colors.ok },
  slotRingSq: { borderRadius: 12.5 },
  slotFillText: { color: colors.macLavText, ...kitText(12, "600", 1.6) },
  slotEmptyText: { color: colors.ink4, ...kitText(15, "400", 1.6) },
  ev: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 4 },
  ex: { gap: 18, paddingTop: 6, paddingHorizontal: 14, paddingBottom: 14, backgroundColor: colors.surface2 },
  h4: { color: colors.ink3Text, marginBottom: 6, ...kitText(12, "500", 1.6) },
  gap12: { marginTop: 12 },
  exP: { color: colors.ink2, marginBottom: 4, ...kitText(13.5, "400", 1.6) },
  cd: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  av: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.plum100, alignItems: "center", justifyContent: "center" },
  avText: { color: colors.macLavText, ...kitText(12, "600", 1.6) },
  cdText: { flex: 1, minWidth: 0, color: colors.ink, ...kitText(13.5, "400", 1.6) },
  cdSmall: { color: colors.ink3Text, ...kitText(12, "400", 1.6) },
  miss: { backgroundColor: colors.macApricot, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 },
  missText: { color: colors.macApricotText, ...kitText(13, "400", 1.6) },
  li: { flexDirection: "row", marginVertical: 2 },
  liNum: { width: 18, color: colors.ink, ...kitText(13.5, "400", 1.6) },
  liText: { flex: 1, minWidth: 0, color: colors.ink, ...kitText(13.5, "400", 1.6) },

  evlink: { backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, ...v3Shadow(colors.ink, 0.04) },
  evlinkText: { color: colors.ink2, ...kitText(13.5, "400", 1.6) },
  evlinkB: { color: colors.ink, fontWeight: "700" },
  bottom: { height: 110 },

  factSheet: { gap: 10, paddingBottom: 8 },
  factTitle: { color: colors.ink, ...kitText(17, "700", 1.5) },
  factInput: { minHeight: 72, borderWidth: 1, borderColor: colors.plum100, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, color: colors.ink, backgroundColor: colors.surface, textAlignVertical: "top", ...kitText(15, "400", 1.5) },
  factCount: { alignSelf: "flex-end", color: colors.ink3Text, ...kitText(12, "400", 1.6) },
  factActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
}));
