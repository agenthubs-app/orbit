import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { agentRecordHref, memorySettingsHref } from "../../../api/agent-v1-client";
import { answerRecordKey, answerTileOf, recordsShown, type AnswerBlock, type AnswerRecordsBlock, type AnswerTileTone } from "../../../api/compute/agent-answer-blocks";
import { referenceKindLabel } from "../../../api/compute/agent-references";
import type { AgentAnswerRecordContract, AgentAnswerRecordKind } from "../../../api/contract/agent-v1";
import { createThemedStyles } from "../../../design/theme";
import type { OrbitColors } from "../../../design/tokens";
import { standardCopy } from "../../../i18n/standard-copy";

/**
 * agent-design AG19 (approved visual draft 2026-11-19, D1–D6; App column of board 6): the answer rendered from its blocks.
 * Conclusion 18 bold / 28, body 17 / 27, card title 17 bold, small text 13, the note 15 / 23; paragraphs 10 apart, cards
 * 8, text ↔ cards and answer ↔ note 18. Every word and the order are the result document's (the server wrote them); this
 * only lays them out: five cards first and "还有 N 条" unfolding in place (no request), a record that is gone as a dashed
 * card that cannot be pressed, the whole card opening that record's page.
 */
type Language = "zh" | "ja" | "en";

const toneOf = (c: OrbitColors, tone: AnswerTileTone) => ({
  apricot: { bg: c.macApricot, ink: c.macApricotText },
  blue: { bg: c.macBlue, ink: c.macBlueText },
  lav: { bg: c.macLav, ink: c.macLavText },
  pink: { bg: c.macPink, ink: c.macPinkText },
  plum: { bg: c.plum100, ink: c.plum900 },
  teal: { bg: c.macTeal, ink: c.macTealText },
})[tone];

/** The kind badge: the same six colours as the @ picker (AG11), at the draft's size for a card (12 / 16). */
const kindToneOf = (c: OrbitColors, kind: AgentAnswerRecordKind) => ({
  attendance: { bg: c.plum100, ink: c.plum900 },
  contact: { bg: c.macLav, ink: c.macLavText },
  event: { bg: c.macPink, ink: c.macPinkText },
  memo: { bg: c.macApricot, ink: c.macApricotText },
  schedule: { bg: c.macTeal, ink: c.macTealText },
  todo: { bg: c.macBlue, ink: c.macBlueText },
})[kind];

function KindBadge({ kind, language }: { kind: AgentAnswerRecordKind; language: Language }) {
  const { colors, styles } = useStyles();
  const tone = kindToneOf(colors, kind);
  return <Text style={[styles.badge, { backgroundColor: tone.bg, color: tone.ink }]}>{referenceKindLabel(kind, language)}</Text>;
}

function TileIcon({ icon, color, size }: { icon: "todo" | "memo" | "schedule" | "attendance"; color: string; size: number }) {
  const stroke = { fill: "none", stroke: color, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (icon === "todo") return <Svg width={size} height={size} viewBox="0 0 24 24"><Rect x={4} y={4} width={16} height={16} rx={5} {...stroke} strokeWidth={1.8} /><Path d="m8.5 12.2 2.4 2.4 4.6-5" {...stroke} strokeWidth={1.8} /></Svg>;
  if (icon === "memo") return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M6.5 4h8.2L18 7.3V20H6.5z" {...stroke} strokeWidth={1.8} /><Path d="M9.5 11h5.5M9.5 15h5.5" {...stroke} strokeWidth={1.8} /></Svg>;
  if (icon === "schedule") return <Svg width={size} height={size} viewBox="0 0 24 24"><Rect x={4} y={5.5} width={16} height={14.5} rx={3.5} {...stroke} strokeWidth={1.8} /><Path d="M8 3.5v4M16 3.5v4M4 10.5h16" {...stroke} strokeWidth={1.8} /></Svg>;
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="m5.5 12.5 4.2 4.2 8.8-9.4" {...stroke} strokeWidth={2} /></Svg>;
}

function Tile({ record, index, mini, gone }: { record: AgentAnswerRecordContract; index: number; mini: boolean; gone: boolean }) {
  const { colors, styles } = useStyles();
  const tile = answerTileOf(record, index);
  const tone = gone ? { bg: colors.surface2, ink: colors.ink3Text } : toneOf(colors, tile.tone);
  const box = [styles.tile, mini && styles.tileMini, tile.shape === "avatar" && styles.tileRound, { backgroundColor: tone.bg }];
  if (tile.shape === "emoji") return <View style={box}><Text style={mini ? styles.emojiMini : styles.emoji}>{tile.emoji}</Text></View>;
  if (tile.shape === "avatar") return <View style={box}><Text style={[mini ? styles.letterMini : styles.letter, { color: tone.ink }]}>{tile.letter}</Text></View>;
  return <View style={box}><TileIcon icon={tile.icon} color={tone.ink} size={mini ? 16 : 20} /></View>;
}

function Chevron() {
  const { colors } = useStyles();
  return <Svg width={12} height={12} viewBox="0 0 12 12"><Path d="M4 1.5 8.5 6 4 10.5" fill="none" stroke={colors.ink4} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

function RecordCard({ record, index, mini, gone, language, onOpenHref }: { record: AgentAnswerRecordContract; index: number; mini: boolean; gone: boolean; language: Language; onOpenHref(href: string): void }) {
  const { styles } = useStyles();
  const ui = standardCopy[language].aiCard;
  const href = gone ? null : agentRecordHref(record);
  const lower = mini ? record.top ?? record.sub : record.sub;
  const body: ReactNode = (
    <>
      <Tile record={record} index={index} mini={mini} gone={gone} />
      <View style={styles.meta}>
        {mini ? null : (
          <View style={styles.top}>
            <KindBadge kind={record.kind} language={language} />
            {gone ? <Text style={styles.goneWord}>{ui.recordGone}</Text> : record.top ? <Text numberOfLines={1} style={styles.topText}>{record.top}</Text> : null}
          </View>
        )}
        {/* D6: the full card never cuts a name or a place: a long one folds to a second line. */}
        <Text numberOfLines={mini ? 1 : 2} style={[mini ? styles.titleMini : styles.title, gone && styles.titleGone]}>{record.title}</Text>
        {gone ? (mini ? <Text style={[styles.sub, styles.goneWord]}>{ui.recordGone}</Text> : null) : lower ? <Text numberOfLines={mini ? 1 : 2} style={[styles.sub, !mini && record.subTone === "late" && styles.late]}>{lower}</Text> : null}
        {!mini && !gone && record.why ? <Text style={styles.why}>{record.why}</Text> : null}
      </View>
      {href ? <Chevron /> : null}
    </>
  );
  const key = answerRecordKey(record);
  if (!href) return <View accessibilityLabel={`${record.title}${gone ? ` ${ui.recordGone}` : ""}`} style={[styles.card, mini && styles.cardMini, styles.cardGone]} testID={`answer-card-${key}`}>{body}</View>;
  return <Pressable accessibilityRole="link" accessibilityLabel={record.title} onPress={() => onOpenHref(href)} style={({ pressed }) => [styles.card, mini && styles.cardMini, pressed && styles.pressed]} testID={`answer-card-${key}`}>{body}</Pressable>;
}

function Records({ block, gone, language, onOpenHref }: { block: AnswerRecordsBlock; gone: ReadonlySet<string>; language: Language; onOpenHref(href: string): void }) {
  const { colors, styles } = useStyles();
  // D2: the rest unfolds in place; nothing is requested again.
  const [expanded, setExpanded] = useState(false);
  const mini = block.size === "mini";
  const view = recordsShown(block, expanded);
  return (
    <View style={styles.cards} testID={mini ? "answer-records-mini" : "answer-records"}>
      {block.caption ? <Text style={styles.caption}>{block.caption}</Text> : null}
      {view.items.map((record, index) => <RecordCard key={answerRecordKey(record)} record={record} index={index} mini={mini} gone={Boolean(record.gone) || gone.has(answerRecordKey(record))} language={language} onOpenHref={onOpenHref} />)}
      {view.foldable ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={({ pressed }) => [styles.more, pressed && styles.pressed]} testID="answer-more">
          <Text style={styles.moreText}>{expanded ? block.lessLabel ?? "" : block.moreLabel}</Text>
          <Svg width={10} height={10} viewBox="0 0 10 10"><Path d={expanded ? "M1.5 6.5 5 3l3.5 3.5" : "M1.5 3.5 5 7l3.5-3.5"} fill="none" stroke={colors.ink3} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </Pressable>
      ) : null}
    </View>
  );
}

function Note({ block, onOpenHref }: { block: Extract<AnswerBlock, { type: "note" }>; onOpenHref(href: string): void }) {
  const { colors, styles } = useStyles();
  // AG14 (board 4, D3): a memory note ends in 「去设置 ›」 to the memory part of the iOrbit settings.
  const go = block.go ? memorySettingsHref(block.go.memoryId) : null;
  return (
    <View style={styles.note} testID={block.go ? "answer-note-memory" : "answer-note"}>
      <View style={styles.noteHead}>
        <Svg width={14} height={14} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={9} fill="none" stroke={colors.ink3Text} strokeWidth={2} /><Path d="M12 11v5M12 7.6v.2" fill="none" stroke={colors.ink3Text} strokeWidth={2} strokeLinecap="round" /></Svg>
        <Text style={styles.noteTitle}>{block.title}</Text>
      </View>
      {block.items.map((item, index) => (
        <View key={index} style={index > 0 ? styles.noteNext : null}>
          {item.quote ? <Text style={styles.noteQuote}>「{item.quote}」</Text> : null}
          <Text selectable style={styles.noteText}>{item.text}{item.action ? <Text style={styles.noteDo}>{item.action}</Text> : null}</Text>
        </View>
      ))}
      {go && block.go ? <Pressable accessibilityRole="link" onPress={() => onOpenHref(go)} style={styles.noteGo} testID="answer-note-go"><Text style={styles.noteGoText}>{block.go.label} ›</Text></Pressable> : null}
    </View>
  );
}

/** The answer's blocks. Text blocks that follow each other are one group (10 apart); cards and the note stand 18 away. */
export function AgentAnswerBlocks({ blocks, gone, language, onOpenHref }: { blocks: readonly AnswerBlock[]; gone: ReadonlySet<string>; language: Language; onOpenHref(href: string): void }) {
  const { styles } = useStyles();
  const groups: ({ kind: "text"; blocks: AnswerBlock[] } | { kind: "other"; block: AnswerBlock })[] = [];
  for (const block of blocks) {
    if (block.type === "conclusion" || block.type === "paragraph" || block.type === "points") {
      const last = groups[groups.length - 1];
      if (last?.kind === "text") last.blocks.push(block);
      else groups.push({ blocks: [block], kind: "text" });
    } else groups.push({ block, kind: "other" });
  }
  return (
    <View style={styles.answer} testID="answer-blocks">
      {groups.map((group, at) => {
        if (group.kind === "text") {
          return (
            <View key={at} style={styles.text}>
              {group.blocks.map((block, index) => {
                if (block.type === "conclusion") return <Text key={index} selectable style={styles.conclusion} testID="answer-conclusion">{block.text}</Text>;
                if (block.type === "paragraph") return <Text key={index} selectable style={styles.paragraph}>{block.text}</Text>;
                if (block.type === "points") {
                  return (
                    <View key={index} style={styles.points} testID="answer-points">
                      {block.items.map((item, n) => (
                        <View key={n} style={styles.point}>
                          <View style={styles.dot} />
                          <Text selectable style={styles.pointText}>{item.head ? <Text style={styles.pointHead}>{item.head}　</Text> : null}{item.text}</Text>
                        </View>
                      ))}
                    </View>
                  );
                }
                return null;
              })}
            </View>
          );
        }
        if (group.block.type === "records") return <Records key={at} block={group.block} gone={gone} language={language} onOpenHref={onOpenHref} />;
        if (group.block.type === "note") return <Note key={at} block={group.block} onOpenHref={onOpenHref} />;
        return null;
      })}
    </View>
  );
}

/** An answer with no blocks (an older conversation) is still its text, in the new size (board 6: body 17 / 27). */
export function AgentAnswerText({ text }: { text: string }) {
  const { styles } = useStyles();
  return <Text selectable style={styles.paragraph} testID="answer-text">{text}</Text>;
}

const useStyles = createThemedStyles((c) => StyleSheet.create({
  answer: { gap: 18, minWidth: 0 },
  badge: { borderRadius: 6, fontSize: 12, fontWeight: "700", lineHeight: 16, overflow: "hidden", paddingHorizontal: 6, paddingVertical: 1 },
  caption: { color: c.ink3Text, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  card: { alignItems: "center", backgroundColor: c.surface, borderColor: c.line, borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 10, minWidth: 0, paddingBottom: 12, paddingLeft: 14, paddingRight: 12, paddingTop: 12 },
  cardGone: { backgroundColor: "transparent", borderColor: c.ink3, borderStyle: "dashed" },
  cardMini: { borderRadius: 14, paddingBottom: 9, paddingLeft: 12, paddingRight: 12, paddingTop: 9 },
  cards: { gap: 8, minWidth: 0 },
  conclusion: { color: c.ink, fontSize: 18, fontWeight: "700", lineHeight: 28 },
  dot: { backgroundColor: c.ink3, borderRadius: 2.5, height: 5, marginTop: 11, width: 5 },
  emoji: { fontSize: 21, lineHeight: 26 },
  emojiMini: { fontSize: 17, lineHeight: 22 },
  goneWord: { color: c.coralText, fontSize: 13, fontWeight: "700", lineHeight: 19 },
  late: { color: c.coralText, fontWeight: "600" },
  letter: { fontSize: 16, fontWeight: "800" },
  letterMini: { fontSize: 13, fontWeight: "800" },
  meta: { flex: 1, gap: 1, minWidth: 0 },
  more: { alignItems: "center", backgroundColor: c.surface2, borderRadius: 14, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 44 },
  moreText: { color: c.ink2, fontSize: 15, fontWeight: "700" },
  note: { backgroundColor: c.surface2, borderRadius: 14, gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  noteDo: { color: c.ink },
  noteGo: { alignSelf: "flex-start", minHeight: 30, justifyContent: "center" },
  noteGoText: { color: c.plum900, fontSize: 15, fontWeight: "700" },
  noteHead: { alignItems: "center", flexDirection: "row", gap: 6 },
  noteNext: { borderTopColor: c.line, borderTopWidth: 1, paddingTop: 10 },
  noteQuote: { color: c.ink, fontSize: 15, fontWeight: "600", lineHeight: 23 },
  noteText: { color: c.ink2, fontSize: 15, lineHeight: 23 },
  noteTitle: { color: c.ink3Text, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  paragraph: { color: c.ink, fontSize: 17, lineHeight: 27 },
  point: { flexDirection: "row", gap: 10 },
  pointHead: { fontWeight: "700" },
  pointText: { color: c.ink, flex: 1, fontSize: 17, lineHeight: 27 },
  points: { gap: 6 },
  pressed: { opacity: 0.7 },
  sub: { color: c.ink3Text, fontSize: 13, lineHeight: 19 },
  text: { gap: 10 },
  tile: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  tileMini: { borderRadius: 10, height: 32, width: 32 },
  tileRound: { borderRadius: 999 },
  title: { color: c.ink, fontSize: 17, fontWeight: "700", lineHeight: 24 },
  titleGone: { color: c.ink2 },
  titleMini: { color: c.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  top: { alignItems: "center", flexDirection: "row", gap: 6, minWidth: 0 },
  topText: { color: c.ink3Text, flexShrink: 1, fontSize: 13, fontWeight: "500", lineHeight: 19 },
  why: { color: c.ink2, fontSize: 13, lineHeight: 19, marginTop: 3 },
}));
