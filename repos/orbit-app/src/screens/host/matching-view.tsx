// R17 イベント運営 · マッチング（App；b13 HM-M1–M10，同 Web HostMatchingPhone）：
// 未生成 = 准备检查 + 条件卡 + 底部「マッチングを生成」；生成中 = 引导卡 + 占位；结果 = 状态卡（ラウンド・下書き / 公開済み・条件 chip・
// 条件 / 再生成・横排桌号跳转）→ 未配置卡在最上 → 桌卡默认收成一行，点开看成员；换桌 = 成员行「移動」→ 底部抽屉选目标桌或「未配置へ」。
// 公開確認（HM-M8）= 底部抽屉，写明「公開後はテーブルを変更できません」。公开后只读。
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";

import type { HostMatchingConditions, HostMatchingMember, HostMatchingMove, HostMatchingResponse, HostMatchingTable } from "../../api/contract/host-console";
import { BottomSheet, Checkbox, Icon, IconButton, Segmented, Toggle, UiPressable, UiText } from "../../components/ui";
import { avatarTone } from "../../components/ui/Avatar";
import Svg, { Defs, Rect, Stop } from "../../components/ui/svg";
import { LinearGradient } from "../plan/plan-svg";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { addDesignMock } from "../add/add-design-mock";
import { Avatar, Chip, type Tone } from "../events/v2/venue-ui";
import { hostTime, type HostT } from "./host-model";
import { Btn, BtnSm, Emo, numFont, useHostStyles } from "./host-ui";

// 立場 chip 的颜色按本页首次出现的顺序取（同 Web：事業会社 teal / 投資家 lav / CFO blue / 士業 pink / 経営者 apricot / 其余无色）。
const STANDING_TONES: readonly (Tone | null)[] = ["teal", "lav", "blue", "pink", "apricot", null];
export function standingToneMap(tables: readonly HostMatchingTable[]): Map<string, Tone | null> {
  const map = new Map<string, Tone | null>();
  for (const table of tables) for (const member of table.members) {
    if (member.standing && !map.has(member.standing)) map.set(member.standing, STANDING_TONES[map.size % STANDING_TONES.length]!);
  }
  return map;
}

/** 「1卓 5名」/「1卓 4〜5名」。 */
export function tableSizeText(min: number, max: number): string {
  return min === max ? String(max) : `${min}〜${max}`;
}

/** 「空き席に入れる」：未配置的人按顺序放进人数最少、且没满 tableSize 的桌（同 Web fillSeatsMoves）。 */
export function fillSeatsMoves(data: HostMatchingResponse): HostMatchingMove[] {
  const capacity = Math.max(data.conditions.tableSize, data.tableSizeMax);
  const sizes = data.tables.filter((table) => table.round === data.round).map((table) => ({ size: table.members.length, table: table.table }));
  const moves: HostMatchingMove[] = [];
  for (const person of data.unplaced) {
    const open = sizes.filter((item) => item.size < capacity).sort((a, b) => a.size - b.size)[0];
    if (!open) break;
    open.size += 1;
    moves.push({ participantId: person.participantId, round: data.round, toTable: open.table });
  }
  return moves;
}

/** 当前轮的桌（没有这一轮的数据时显示全部，同 Web）。 */
export function roundTables(data: HostMatchingResponse): HostMatchingTable[] {
  return data.tables.filter((table) => table.round === data.round || data.tables.every((item) => item.round !== data.round));
}

export type Moving = { member: HostMatchingMember; from: string | null };

function StandingChip({ standing, tones }: { standing: string | null; tones: Map<string, Tone | null> }) {
  if (!standing) return null;
  const tone = tones.get(standing);
  return <Chip label={standing} {...(tone ? { tone } : {})} />;
}

function TableNo({ label, small = false, warn = false, light = false }: { label: string; small?: boolean; warn?: boolean; /** 灰底行里（移動先）用白底。 */ light?: boolean }) {
  const { styles } = useMatchStyles();
  return <View style={[styles.tno, small ? styles.tnoSm : null, warn ? styles.tnoWarn : null, light ? styles.tnoLight : null]}><UiText style={[styles.tnoText, small ? styles.tnoTextSm : null]}>{label}</UiText></View>;
}

/** 条件的四行开关（HM-M2 / M5）。 */
function ConditionToggles({ conditions, t, onChange }: { conditions: HostMatchingConditions; t: HostT; onChange: (next: HostMatchingConditions) => void }) {
  const { styles } = useMatchStyles();
  const items = [["separateCompanies", t("cSeparate")], ["avoidPreviousTablemates", t("cAvoid")], ["investorPerTable", t("cInvestor")]] as const;
  return (
    <>
      {items.map(([key, label]) => (
        <View key={key} style={styles.crow}>
          <UiText style={styles.crowText}>{label}</UiText>
          <Toggle value={conditions[key]} accessibilityLabel={label} onValueChange={() => onChange({ ...conditions, [key]: !conditions[key] })} />
        </View>
      ))}
    </>
  );
}

function Check({ ok, title, sub, action, first = false }: { ok: boolean; title: string; sub: string; action?: React.ReactNode; first?: boolean }) {
  const { styles, colors } = useMatchStyles();
  const { styles: h } = useHostStyles();
  return (
    <View style={[styles.chk, first ? null : styles.chkLine]}>
      <View style={[styles.box, ok ? styles.boxOk : styles.boxNo]}>{ok ? <Icon name="check" size={13} strokeWidth={2.4} color={colors.surface} /> : null}</View>
      <View style={h.grow}><UiText style={h.b13}>{title}</UiText><UiText style={h.lbl}>{sub}</UiText></View>
      {action}
    </View>
  );
}

/** HM-M1 未生成：准备检查 + 条件卡（人数・ラウンド 点开抽屉；三个开关直接改）。 */
export function MatchingNone({ data, conditions, t, onConditions, onOpenConditions, onRemind }: { data: HostMatchingResponse; conditions: HostMatchingConditions; t: HostT; onConditions: (next: HostMatchingConditions) => void; onOpenConditions: () => void; onRemind: () => void }) {
  const { styles: h } = useHostStyles();
  const { styles } = useMatchStyles();
  const enough = data.applied >= data.minimumApplied;
  const missing = Math.max(0, data.applied - data.profileComplete);
  return (
    <View style={styles.col} testID="host-matching-none">
      <View style={[h.card, styles.guide]}>
        <View style={[h.row, { alignItems: "flex-start", gap: 12 }]}>
          <Emo emoji="🪑" tone="lav" />
          <View style={h.grow}><UiText style={styles.gT}>{t("mEmptyTitle")}</UiText><UiText style={[h.sub, { marginTop: 4 }]}>{t("mEmptySub")}</UiText></View>
        </View>
        <View style={{ marginTop: 12 }}>
          <Check first ok={enough} title={t("mApplied", { n: data.applied })} sub={enough ? t("mAppliedOk", { m: data.minimumApplied }) : t("mAppliedShort", { k: data.minimumApplied - data.applied, m: data.minimumApplied })} />
          <Check ok={missing === 0} title={t("mProfile", { a: data.profileComplete, n: data.applied })} sub={missing ? t("mProfileSub", { k: missing }) : t("mProfileAll")}
            action={missing ? <BtnSm label={t("mRemind")} onPress={onRemind} testID="host-matching-remind" /> : undefined} />
          <Check ok title={t("mCondCheck")} sub={t("mCondCheckSub")} />
        </View>
      </View>
      <View style={h.card} testID="host-matching-conditions">
        <UiText style={[h.h3, { marginBottom: 6 }]}>{t("mCondTitle")}</UiText>
        <UiPressable accessibilityRole="button" accessibilityLabel={`${t("cTableSize")} ${t("nPeople", { n: conditions.tableSize })}`} onPress={onOpenConditions} style={styles.crow}>
          <UiText style={styles.crowText}>{t("cTableSize")}</UiText><Chip label={t("nPeople", { n: conditions.tableSize })} />
        </UiPressable>
        <UiPressable accessibilityRole="button" accessibilityLabel={`${t("cRounds")} ${conditions.roundCount}`} onPress={onOpenConditions} style={styles.crow}>
          <UiText style={styles.crowText}>{t("cRounds")}</UiText><Chip label={String(conditions.roundCount)} />
        </UiPressable>
        <ConditionToggles conditions={conditions} t={t} onChange={onConditions} />
      </View>
    </View>
  );
}

/** HM-M3b 生成中：引导卡 + 三条占位（每 4 秒重读由外层做）。 */
export function MatchingGenerating({ t }: { t: HostT }) {
  const { styles: h } = useHostStyles();
  const { styles } = useMatchStyles();
  return (
    <View style={styles.col} testID="host-matching-generating" accessibilityLiveRegion="polite">
      <View style={[h.card, styles.guide]}>
        <View style={[h.row, { alignItems: "flex-start", gap: 12 }]}>
          <Emo emoji="🪑" tone="lav" />
          <View style={h.grow}><UiText style={styles.gT}>{t("mGenerating")}</UiText><UiText style={[h.sub, { marginTop: 4 }]}>{t("mGeneratingSub")}</UiText></View>
        </View>
      </View>
      {[0, 1, 2].map((key) => <View key={key} style={styles.shim} />)}
    </View>
  );
}

function TableRow({ table, t, tones, open, why, canMove, onToggle, onWhy, onMove, onLayoutY }: { table: HostMatchingTable; t: HostT; tones: Map<string, Tone | null>; open: boolean; why: boolean; canMove: boolean; onToggle: () => void; onWhy: () => void; onMove: (member: HostMatchingMember) => void; onLayoutY: (y: number) => void }) {
  const { styles: h, colors } = useHostStyles();
  const { styles } = useMatchStyles();
  const n = table.members.length;
  const hostPlaced = table.members.filter((member) => member.placedByHost);
  return (
    <View style={[h.card, styles.tc, open ? null : styles.one]} onLayout={(event) => onLayoutY(event.nativeEvent.layout.y)} testID={`host-table-${table.table}`}>
      <UiPressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${table.theme ?? t("mTableN", { n, t: table.table })} ${t("nPeople", { n })}`} onPress={onToggle} style={[h.row, styles.tcH]} pressedScale={1}>
        <TableNo label={table.table} small={!open} />
        <View style={h.grow}>
          <UiText style={open ? styles.metaB : styles.metaBOne} numberOfLines={1}>{table.theme ?? t("mTableN", { n, t: table.table })}</UiText>
          {open ? <UiText style={h.lbl} numberOfLines={1}>{t("mTableN", { n, t: table.table })}</UiText> : null}
        </View>
        {table.absent > 0 ? <Chip label={t("mAbsent", { n: table.absent })} coral /> : null}
        {open ? null : <UiText style={h.lbl}>{t("nPeople", { n })}</UiText>}
        <Icon name={open ? "down" : "right"} size={16} color={colors.ink3} />
      </UiPressable>
      {open ? (
        <>
          {table.members.map((member, index) => (
            <View key={member.participantId} style={[styles.mr, index === 0 ? { marginTop: 8 } : null]} testID={`host-member-${member.participantId}`}>
              <Avatar initial={member.initial} tone={avatarTone(member.name)} size="sm" />
              <View style={h.grow}>
                <UiText style={styles.mrName} numberOfLines={1}>{member.name}</UiText>
                {member.org || member.role ? <UiText style={styles.mrSub} numberOfLines={1}>{[member.org, member.role].filter(Boolean).join(" · ")}</UiText> : null}
              </View>
              <StandingChip standing={member.standing} tones={tones} />
              {canMove ? (
                <UiPressable accessibilityRole="button" accessibilityLabel={`${member.name} ${t("mMove")}`} onPress={() => onMove(member)} style={styles.mvBtn} testID={`host-move-${member.participantId}`}>
                  <UiText style={styles.mvText}>{t("mMove")}</UiText>
                </UiPressable>
              ) : null}
            </View>
          ))}
          <View style={[h.row, styles.whyRow]}>
            <UiText style={h.lbl}>{t("mWhy")}</UiText>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("mWhy")} accessibilityState={{ expanded: why }} onPress={onWhy} style={styles.why} testID={`host-why-${table.table}`}>
              <UiText style={styles.whyQ}>?</UiText>
            </UiPressable>
          </View>
          {why ? (
            <View style={styles.whyBody}>
              {table.why ? <UiText style={h.sub}>{table.why}</UiText> : null}
              {hostPlaced.map((member) => <UiText key={member.participantId} style={h.lbl}><UiText style={[h.lbl, { color: colors.ink, fontWeight: "700" }]}>{member.name}</UiText> · {t("mWhyHost")}</UiText>)}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** HM-M3–M7 结果：状态卡 → 未配置卡 → 桌卡。 */
export function MatchingResult({ data, t, busy, onRound, onConditions, onRegenerate, onFillSeats, onMove, onJump }: {
  data: HostMatchingResponse; t: HostT; busy: boolean;
  onRound: (round: number) => void; onConditions: () => void; onRegenerate: () => void; onFillSeats: () => void;
  onMove: (moving: Moving) => void;
  /** 跳到某桌：外层把页面滚到这个 y（相对本组件顶）。 */
  onJump: (y: number) => void;
}) {
  const { styles: h, colors } = useHostStyles();
  const { styles } = useMatchStyles();
  const tables = useMemo(() => roundTables(data), [data]);
  const tones = useMemo(() => standingToneMap(tables), [tables]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(tables[0] ? [tables[0].table] : []));
  const [why, setWhy] = useState<ReadonlySet<string>>(new Set());
  const [ys] = useState(() => new Map<string, number>());
  const published = data.state === "published";
  const canMove = !published && Boolean(data.generationId) && !busy;
  const remaining = Math.max(0, data.generationsLimit - data.generationsUsed);
  const rounds = data.rounds.length ? data.rounds : [{ endsAt: "", index: 1, startsAt: "" }];
  const toggle = (set: ReadonlySet<string>, key: string) => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; };
  const jump = (table: string) => {
    setOpen((prev) => new Set([...prev, table]));
    const y = ys.get(table);
    if (y !== undefined) onJump(y);
  };
  return (
    <View style={styles.col} testID={`host-matching-${data.state}`}>
      <View style={[h.card, styles.mstat]} testID="host-matching-status">
        {rounds.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hscroll} contentContainerStyle={styles.hscrollIn}>
            <Segmented inline segments={rounds.map((round) => ({ key: String(round.index), label: round.startsAt ? t("mRound", { from: hostTime(round.startsAt), n: round.index, to: hostTime(round.endsAt) }) : t("mRoundShort", { n: round.index }) }))}
              value={String(data.round)} onChange={(key) => onRound(Number(key))} accessibilityLabel={t("mRoundsLabel")} />
          </ScrollView>
        ) : null}
        <View style={[h.row, styles.statRow, rounds.length > 1 ? null : { marginTop: 0 }]}>
          <Chip label={published ? t("mPublishedChip") : t("mDraftChip")} tone={published ? "teal" : "apricot"} />
          <UiText style={[h.lbl, h.grow]}>{t("mStats", { p: data.participantCount, size: tableSizeText(data.tableSizeMin, data.tableSizeMax), t: data.tableCount })}</UiText>
        </View>
        <View style={styles.chips}>
          {data.conditions.separateCompanies ? <Chip label={t("cSeparate")} /> : null}
          {data.conditions.avoidPreviousTablemates ? <Chip label={t("chipAvoid")} /> : null}
          {data.conditions.investorPerTable ? <Chip label={t("chipInvestor")} /> : null}
          {data.unsatisfiedTables > 0 ? <Chip label={t("chipUnsatisfied", { n: data.unsatisfiedTables })} coral /> : null}
          {data.unplaced.length > 0 && !published ? <Chip label={t("chipUnplaced", { n: data.unplaced.length })} coral /> : null}
        </View>
        {published ? null : (
          <View style={[h.row, styles.acts]}>
            <BtnSm label={t("mCond")} icon="sliders" onPress={onConditions} testID="host-matching-cond" />
            <UiPressable accessibilityRole="button" accessibilityLabel={`${t("mRegen")} ${t("mRemaining", { n: remaining })}`} accessibilityState={{ disabled: busy || remaining <= 0 }} disabled={busy || remaining <= 0}
              onPress={onRegenerate} style={[h.btnSm, busy || remaining <= 0 ? styles.off : null]} testID="host-matching-regen">
              <Icon name="refresh" size={16} color={colors.ink} />
              <UiText style={h.btnSmText}>{t("mRegen")}</UiText>
              <UiText style={h.lbl}>{t("mRemaining", { n: remaining })}</UiText>
            </UiPressable>
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.hscroll, styles.tjump]} contentContainerStyle={[styles.hscrollIn, { gap: 6 }]} testID="host-table-jump">
          {tables.map((table) => (
            <UiPressable key={table.table} accessibilityRole="button" accessibilityLabel={t("mJump", { t: table.table })} onPress={() => jump(table.table)} style={[styles.tjBtn, table.absent ? styles.tnoWarn : null]}>
              <UiText style={styles.tjText}>{table.table}</UiText>
            </UiPressable>
          ))}
        </ScrollView>
      </View>
      {data.unplaced.length && !published ? (
        <View style={[h.card, h.flat, styles.unpl]} testID="host-matching-unplaced">
          <View style={[h.row, { alignItems: "flex-start", gap: 12 }]}>
            <Emo emoji="🧩" tone="apricot" />
            <View style={h.grow}><UiText style={h.b13}>{t("mUnplacedTitle", { n: data.unplaced.length })}</UiText><UiText style={[h.lbl, { marginTop: 2 }]}>{t("mUnplacedSub")}</UiText></View>
          </View>
          <View style={[h.row, { gap: 6, marginTop: 10 }]}>
            <View style={styles.avs}>
              {data.unplaced.slice(0, 4).map((member, index) => (
                <UiPressable key={member.participantId} accessibilityRole="button" accessibilityLabel={t("mMoveTitle", { name: member.name })} disabled={!canMove}
                  onPress={() => onMove({ from: null, member })} style={[styles.avBtn, index ? { marginLeft: -8 } : null]} testID={`host-unplaced-${member.participantId}`}>
                  <Avatar initial={member.initial} tone={avatarTone(member.name)} size="sm" />
                </UiPressable>
              ))}
            </View>
            <UiText style={[h.lbl, h.grow]} numberOfLines={1}>{data.unplaced.map((member) => member.name.split(/\s+/u)[0]).join(t("listSep"))}</UiText>
            <BtnSm label={t("mFillSeats")} primary onPress={() => { if (canMove) onFillSeats(); }} testID="host-matching-fill" />
          </View>
        </View>
      ) : null}
      {tables.map((table) => (
        <TableRow key={`${table.round}-${table.table}`} table={table} t={t} tones={tones} open={open.has(table.table)} why={why.has(table.table)} canMove={canMove}
          onToggle={() => setOpen((prev) => toggle(prev, table.table))} onWhy={() => setWhy((prev) => toggle(prev, table.table))}
          onMove={(member) => onMove({ from: table.table, member })} onLayoutY={(y) => ys.set(table.table, y)} />
      ))}
    </View>
  );
}

/** HM-M6 移動先：目标桌列表（可搜索）+「未配置へ」。 */
export function MoveSheet({ moving, tables, round, t, onPick, onClose }: { moving: Moving | null; tables: readonly HostMatchingTable[]; round: number; t: HostT; onPick: (to: string | null) => void; onClose: () => void }) {
  const { styles: h, colors } = useHostStyles();
  const { styles } = useMatchStyles();
  const noKeyboard = addDesignMock("no-keyboard");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = tables.filter((table) => !needle || table.table.toLowerCase() === needle || (table.theme ?? "").toLowerCase().includes(needle) || table.members.some((member) => member.name.toLowerCase().includes(needle)));
  const title = moving ? t("mMoveTitle", { name: moving.member.name }) : "";
  return (
    <BottomSheet visible={Boolean(moving)} onClose={() => { setQ(""); onClose(); }} accessibilityLabel={title}>
      {moving ? (
        <View style={{ paddingBottom: 12 }} testID="host-move-sheet">
          <View style={[h.row, { marginBottom: 12 }]}>
            <Avatar initial={moving.member.initial} tone={avatarTone(moving.member.name)} />
            <View style={h.grow}><UiText style={styles.shT} numberOfLines={1}>{title}</UiText><UiText style={h.lbl}>{moving.from ? t("mMoveFrom", { n: round, t: moving.from }) : t("mMoveFromNone", { n: round })}</UiText></View>
            <IconButton icon="x" accessibilityLabel={t("close")} onPress={() => { setQ(""); onClose(); }} />
          </View>
          <View style={styles.search}>
            <Icon name="search" size={16} color={colors.ink3} />
            <TextInput value={q} onChangeText={setQ} placeholder={t("mSearchTable")} placeholderTextColor={colors.ink3} accessibilityLabel={t("mSearchTable")} showSoftInputOnFocus={!noKeyboard} autoCorrect={false} style={styles.searchInput} />
          </View>
          <View style={{ gap: 8 }}>
            {list.map((table) => {
              const current = table.table === moving.from;
              const n = table.members.length;
              const standings = [...new Set(table.members.map((member) => member.standing).filter(Boolean))].slice(0, 3).join(t("listSep"));
              return (
                <UiPressable key={table.table} accessibilityRole="button" accessibilityState={{ disabled: current }} disabled={current} accessibilityLabel={`${table.theme ?? t("mTableN", { n, t: table.table })} ${current ? t("mCurTable") : t("mCountTo", { a: n, b: n + 1 })}`}
                  onPress={() => { setQ(""); onPick(table.table); }} style={[h.row, styles.tpick, current ? styles.cur : null]} testID={`host-move-to-${table.table}`}>
                  <TableNo label={table.table} small light />
                  <View style={h.grow}>
                    <UiText style={styles.metaBOne} numberOfLines={1}>{table.theme ?? t("mTableN", { n, t: table.table })}</UiText>
                    <UiText style={h.lbl} numberOfLines={1}>{current ? t("mCurTable") : table.absent ? t("mAbsent", { n: table.absent }) : standings}</UiText>
                  </View>
                  <UiText style={styles.tcnt}>{current ? t("nPeople", { n }) : t("mCountTo", { a: n, b: n + 1 })}</UiText>
                </UiPressable>
              );
            })}
          </View>
          {moving.from ? (
            <View style={styles.sf}><Btn label={t("mToUnplaced")} icon="layers" height={46} onPress={() => { setQ(""); onPick(null); }} style={h.grow} testID="host-move-to-unplaced" /></View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

/** HM-M5 条件：人数 3–8・ラウンド 1–3・三个开关；已生成时 = 按新条件再生成（会先确认）。 */
export function ConditionsSheet({ visible, initial, t, remaining, regenerate, busy, onClose, onApply }: { visible: boolean; initial: HostMatchingConditions; t: HostT; remaining: number; regenerate: boolean; busy: boolean; onClose: () => void; onApply: (next: HostMatchingConditions) => void }) {
  const { styles: h } = useHostStyles();
  const { styles } = useMatchStyles();
  const [draft, setDraft] = useState(initial);
  const [shown, setShown] = useState(false);
  // 每次打开都从当前条件开始。
  if (visible !== shown) { setShown(visible); if (visible) setDraft(initial); }
  const off = busy || (regenerate && remaining <= 0);
  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel={t("mCondTitle")}>
      <View style={{ paddingBottom: 12 }} testID="host-conditions-sheet">
        <UiText style={styles.shT}>{t("mCondTitle")}</UiText>
        <View style={[styles.crow, styles.crowCol]}>
          <UiText style={styles.crowText}>{t("cTableSize")}</UiText>
          <Segmented inline segments={[3, 4, 5, 6, 7, 8].map((n) => ({ key: String(n), label: t("nPeople", { n }) }))} value={String(draft.tableSize)} onChange={(key) => setDraft({ ...draft, tableSize: Number(key) })} accessibilityLabel={t("cTableSize")} />
        </View>
        <View style={[styles.crow, styles.crowCol]}>
          <UiText style={styles.crowText}>{t("cRounds")}</UiText>
          <Segmented inline segments={[1, 2, 3].map((n) => ({ key: String(n), label: String(n) }))} value={String(draft.roundCount)} onChange={(key) => setDraft({ ...draft, roundCount: Number(key) })} accessibilityLabel={t("cRounds")} />
        </View>
        <ConditionToggles conditions={draft} t={t} onChange={setDraft} />
        {regenerate ? <UiText style={[h.lbl, { marginTop: 6 }]}>{t("mRulesNote", { n: remaining })}</UiText> : null}
        <View style={[h.row, { gap: 8, marginTop: 14 }]}>
          <Btn label={t("cancel")} onPress={onClose} height={48} style={h.grow} />
          <Btn label={regenerate ? t("mApply") : t("mSaveRules")} variant="primary" height={48} onPress={() => { if (!off) onApply(draft); }} style={[h.grow, off ? styles.off : null]} testID="host-conditions-apply" />
        </View>
      </View>
    </BottomSheet>
  );
}

/** HM-M8 公開確認（底部抽屉）：各ラウンド的桌数・人数、未配置、「公開後はテーブルを変更できません」、共同運営者にも知らせる。 */
export function MatchPublishSheet({ data, visible, t, busy, onCancel, onPublish }: { data: HostMatchingResponse; visible: boolean; t: HostT; busy: boolean; onCancel: () => void; onPublish: (notifyCohosts: boolean) => void }) {
  const { styles: h, colors } = useHostStyles();
  const { styles } = useMatchStyles();
  const [notifyCohosts, setNotifyCohosts] = useState(true);
  const placed = Math.max(0, data.participantCount - data.unplaced.length);
  const rounds = data.rounds.length ? data.rounds.map((round) => round.index) : [1];
  return (
    <BottomSheet visible={visible} onClose={onCancel} accessibilityLabel={t("pubTitle")}>
      <View style={styles.sheet} testID="host-match-publish-sheet">
        <Emo emoji="📣" tone="lav" />
        <UiText style={styles.pubT}>{t("pubTitle")}</UiText>
        <UiText style={h.sub}>{t("pubSub", { n: data.participantCount })}</UiText>
        <View style={styles.pubList}>
          {rounds.map((index, i) => (
            <View key={index} style={[h.row, styles.pubRow, i ? styles.pubLine : null]}>
              <View style={[styles.pubMark, { backgroundColor: colors.macTeal }]}><Icon name="check" size={13} strokeWidth={2.4} color={colors.macTealInk} /></View>
              <UiText style={h.b13}>{t("mRoundShort", { n: index })}</UiText>
              <UiText style={[h.lbl, h.grow, { textAlign: "right" }]}>{t("pubRoundStat", { p: placed, t: data.tableCount })}</UiText>
            </View>
          ))}
          {data.unplaced.length ? (
            <View style={[h.row, styles.pubRow, styles.pubLine]}>
              <View style={[styles.pubMark, { backgroundColor: colors.coralSoft }]}><UiText style={[styles.bang, { color: colors.coral }]}>!</UiText></View>
              <UiText style={h.b13}>{t("pubUnplaced")}</UiText>
              <UiText style={[h.lbl, h.grow, { textAlign: "right" }]}>{t("pubUnplacedStat", { n: data.unplaced.length })}</UiText>
            </View>
          ) : null}
        </View>
        <View style={styles.note} testID="host-match-publish-note"><UiText style={h.sub}>{t("pubNote")}</UiText></View>
        {data.event.cohostCount > 0 ? (
          <View style={[h.row, { gap: 10 }]}>
            <Checkbox checked={notifyCohosts} onChange={setNotifyCohosts} accessibilityLabel={t("pubCohosts", { n: data.event.cohostCount })} />
            <UiText style={[h.sub, h.grow]} accessibilityElementsHidden importantForAccessibility="no">{t("pubCohosts", { n: data.event.cohostCount })}</UiText>
          </View>
        ) : null}
        <View style={[h.row, { gap: 8 }]}>
          <Btn label={t("cancel")} onPress={onCancel} height={44} style={h.grow} />
          <Btn label={t("aPublish")} variant="primary" height={44} onPress={() => { if (!busy) onPublish(data.event.cohostCount > 0 && notifyCohosts); }} style={[h.grow, busy ? styles.off : null]} testID="host-match-publish-confirm" />
        </View>
      </View>
    </BottomSheet>
  );
}

/** 底部唯一主按钮（HM-M1 / M3）：未生成 = 说明一句 + 「マッチングを生成」；下書き = 「公開する」。画板是裸按钮（不放玻璃条），浮在页面最下方。 */
export function MatchingFoot({ note, label, icon, disabled, onPress, testID }: { note?: string; label: string; icon: "sparkle" | "share"; disabled: boolean; onPress: () => void; testID: string }) {
  const { styles: h, colors } = useHostStyles();
  const { styles } = useMatchStyles();
  const [size, setSize] = useState({ h: 0, w: 0 });
  return (
    <View style={styles.foot} pointerEvents="box-none" onLayout={(event) => setSize({ h: event.nativeEvent.layout.height, w: event.nativeEvent.layout.width })}>
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs><LinearGradient id="hostMatchFoot" x1={0} y1={0} x2={0} y2={size.h} gradientUnits="userSpaceOnUse"><Stop offset={0} stopColor={colors.bg} stopOpacity={0} /><Stop offset={0.28} stopColor={colors.bg} stopOpacity={1} /></LinearGradient></Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#hostMatchFoot)" />
        </Svg>
      ) : null}
      {note ? <UiText style={[h.lbl, { textAlign: "center" }]}>{note}</UiText> : null}
      <UiPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[h.btn, h.primary, styles.xl, disabled ? styles.off : null]} testID={testID}>
        <Icon name={icon} size={16} color={colors.bg} />
        <UiText style={[styles.xlText, { color: colors.bg }]}>{label}</UiText>
      </UiPressable>
    </View>
  );
}

// 数值照 Web matching-phone.module.css（画板 .mstat / .tno / .tc / .mr / .tjump / .tpick / .crow）；字号按 UX-1 的 App 档。
const useMatchStyles = createThemedStyles((colors) => StyleSheet.create({
  col: { gap: 12 },
  guide: { padding: 20 },
  gT: { color: colors.ink, fontSize: 18, fontWeight: "800", lineHeight: 26 },
  // kit .chk：gap 10、10 0、上下分隔线；.box 22 圆、1.8 边；满足 = ok 色实心白勾，未满足 = 珊瑚色圈。
  chk: { alignItems: "flex-start", flexDirection: "row", gap: 10, paddingVertical: 10 },
  chkLine: { borderTopColor: colors.line, borderTopWidth: 1 },
  box: { alignItems: "center", borderRadius: 11, borderWidth: 1.8, height: 22, justifyContent: "center", marginTop: 1, width: 22 },
  boxOk: { backgroundColor: colors.ok, borderColor: colors.ok },
  boxNo: { borderColor: colors.coral },
  crow: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 10, justifyContent: "space-between", paddingVertical: 12 },
  crowCol: { alignItems: "stretch", flexDirection: "column", gap: 8 },
  crowText: { color: colors.ink, flexShrink: 1, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  shim: { backgroundColor: colors.surface, borderRadius: radius.xl, height: 64, opacity: 0.6 },
  mstat: { paddingHorizontal: 16, paddingVertical: 14 },
  hscroll: { flexGrow: 0, marginHorizontal: -16 },
  hscrollIn: { paddingHorizontal: 16 },
  statRow: { flexWrap: "wrap", gap: 8, marginTop: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10 },
  acts: { flexWrap: "wrap", gap: 8, marginTop: 12 },
  tjump: { marginTop: 10 },
  tno: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 12, height: 34, justifyContent: "center", width: 34 },
  tnoSm: { borderRadius: 9, height: 28, width: 28 },
  tnoText: { color: colors.ink, fontFamily: numFont, fontSize: 18, fontWeight: "900", lineHeight: 22 },
  tnoTextSm: { fontSize: 15, lineHeight: 20 },
  tnoLight: { backgroundColor: colors.surface },
  tnoWarn: { borderColor: colors.coral, borderWidth: 2 },
  tjBtn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 9, height: 32, justifyContent: "center", width: 32 },
  tjText: { color: colors.ink, fontFamily: numFont, fontSize: 15, fontWeight: "900", lineHeight: 20 },
  unpl: { paddingHorizontal: 16, paddingVertical: 14 },
  avs: { flexDirection: "row" },
  avBtn: { borderColor: colors.surface2, borderRadius: 999, borderWidth: 2 },
  tc: { paddingHorizontal: 16, paddingVertical: 14 },
  one: { paddingHorizontal: 14, paddingVertical: 10 },
  tcH: { gap: 10 },
  metaB: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 24 },
  metaBOne: { color: colors.ink, fontSize: 16, fontWeight: "800", lineHeight: 23 },
  mr: { alignItems: "center", borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 10, paddingVertical: 9 },
  mrName: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 23 },
  mrSub: { color: colors.ink3, fontSize: 13, lineHeight: 19 },
  mvBtn: { alignItems: "center", borderRadius: 999, height: 30, justifyContent: "center", paddingHorizontal: 10 },
  mvText: { color: colors.ink2, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  whyRow: { gap: 6, marginTop: 8 },
  why: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 11, height: 22, justifyContent: "center", width: 22 },
  whyQ: { color: colors.ink2, fontSize: 13, fontWeight: "800", lineHeight: 18 },
  whyBody: { backgroundColor: colors.surface2, borderRadius: radius.tile, gap: 4, marginTop: 8, padding: 12 },
  shT: { color: colors.ink, fontSize: 20, fontWeight: "800", lineHeight: 28 },
  search: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 12, flexDirection: "row", gap: 8, height: 40, marginBottom: 10, paddingHorizontal: 14 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 15, height: "100%", padding: 0 },
  tpick: { backgroundColor: colors.surface2, borderRadius: radius.tile, gap: 12, paddingHorizontal: 12, paddingVertical: 11 },
  cur: { opacity: 0.55 },
  tcnt: { color: colors.ink, fontFamily: numFont, fontSize: 15, fontWeight: "800", lineHeight: 21 },
  sf: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 8, marginTop: 12, paddingTop: 12 },
  sheet: { gap: 12, paddingBottom: 12 },
  pubT: { color: colors.ink, fontSize: 20, fontWeight: "800", lineHeight: 28 },
  pubList: {},
  pubRow: { gap: 10, minHeight: 44 },
  pubLine: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  pubMark: { alignItems: "center", borderRadius: 12, height: 24, justifyContent: "center", width: 24 },
  bang: { fontSize: 14, fontWeight: "900", lineHeight: 18 },
  note: { backgroundColor: colors.macApricot, borderRadius: radius.tile, padding: 12 },
  // kit .foot：padding 22 18 14、gap 8、底色从透明渐变到 bg（28%）；.btn.xl 高 50。
  foot: { bottom: 0, gap: 8, left: 0, paddingBottom: 30, paddingHorizontal: 18, paddingTop: 22, position: "absolute", right: 0 },
  xl: { height: 50, width: "100%" },
  xlText: { fontSize: 17, fontWeight: "800", lineHeight: 24 },
  off: { opacity: 0.45 },
}));
