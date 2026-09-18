import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useOrbitTheme } from '../../design/theme';
import { useOrbitLocale } from '../../i18n/OrbitLocaleContext';
import type { RelationshipConversationView } from '../../view-models/relationship-inbox';

export function MessageInboxList({ conversations, onOpen }: {
  conversations: readonly RelationshipConversationView[];
  onOpen: (id: string) => void;
}) {
  const { colors } = useOrbitTheme();
  const { t } = useOrbitLocale();
  if (!conversations.length) return <View style={styles.empty}>
    <Text style={{ color: colors.text }}>{t('inbox.noMessages')}</Text>
    <Text style={{ color: colors.text3 }}>{t('inbox.messagesHint')}</Text>
  </View>;
  return <View>{conversations.map(conversation => <Pressable key={conversation.id}
    accessibilityRole="button"
    accessibilityLabel={`${conversation.name}, ${conversation.preview}${conversation.unreadCount ? `, ${t('inboxVm.newMessages', { count: conversation.unreadCount })}` : ''}`}
    onPress={() => onOpen(conversation.id)}
    style={[styles.row, { borderBottomColor: colors.border }]}>
    <View accessibilityElementsHidden style={[styles.avatar, { backgroundColor: colors.surface2 }]}>
      <Text style={{ color: colors.text }}>{Array.from(conversation.name)[0] || '?'}</Text>
    </View>
    <View style={styles.copy}>
      <Text style={[styles.name, { color: colors.text }]}>{conversation.name}</Text>
      <Text numberOfLines={2} style={{ color: colors.text3 }}>{conversation.preview}</Text>
      <Text style={[styles.time, { color: colors.text3 }]}>{conversation.lastAt}</Text>
    </View>
    {conversation.unreadCount > 0 ? <Text style={[styles.count, { color: colors.onAccent, backgroundColor: colors.accent }]}>{conversation.unreadCount}</Text> : null}
  </Pressable>)}</View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 5 }, name: { fontSize: 16, fontWeight: '600' },
  time: { fontSize: 12 }, count: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 12, textAlign: 'center' },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
});
