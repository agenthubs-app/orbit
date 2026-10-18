import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { EmptyState, ListRow, SearchField, UiText } from '../../components/ui';
import { useOrbitTheme } from '../../design/theme';
import { useOrbitLocale } from '../../i18n/OrbitLocaleContext';
import type { RelationshipConversationView } from '../../view-models/relationship-inbox';
import { filterMessageConversations } from '../../view-models/message-search';

export function MessageInboxList({ conversations, onOpen }: {
  conversations: readonly RelationshipConversationView[];
  onOpen: (id: string) => void;
}) {
  const { colors } = useOrbitTheme();
  const { t } = useOrbitLocale();
  const [query, setQuery] = useState('');
  const visible = filterMessageConversations(conversations, query);
  return <View style={styles.root}>
    <SearchField value={query} onChangeText={setQuery} placeholder={t('inbox.searchCompact')} />
    {!visible.length ? <EmptyState title={t(query.trim() ? 'inbox.noSearchResults' : 'inbox.noMessages')}
      message={t(query.trim() ? 'inbox.searchHint' : 'inbox.messagesHint')} /> : null}
    {visible.map(conversation => <ListRow key={conversation.id} title={conversation.name}
      subtitle={[conversation.subject, conversation.preview].filter(Boolean).join(' · ')}
      accessibilityLabel={`${conversation.name}, ${conversation.preview}`}
      onPress={() => onOpen(conversation.id)}
      leading={<View accessibilityElementsHidden style={[styles.avatar, { backgroundColor: colors.surface2 }]}><UiText>{Array.from(conversation.name)[0] || '?'}</UiText></View>}
      trailing={<View style={styles.trailing}><UiText style={{ color: colors.ink3Text, fontSize: 11 }}>{conversation.lastAt}</UiText>
        {conversation.unreadCount > 0 ? <UiText style={[styles.count, { color: colors.onAccent, backgroundColor: colors.accentText }]}>{conversation.unreadCount}</UiText> : null}</View>} />)}
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  trailing: { alignItems: 'flex-end', gap: 5 },
  count: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 12, textAlign: 'center' },
});
