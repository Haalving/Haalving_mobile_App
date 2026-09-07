import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/Icon';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * A COMMUNITY ROOM, opened over the comb.
 *
 * THE HIVE IS ONE SECTION, not five. Every room here — the games book, the events
 * deck, the partners list — is a sheet over the hub rather than a screen of its
 * own, because a screen of its own is a route, and a route under `(tabs)/` becomes
 * a TAB. That is exactly what went wrong the first time: two extra tabs appeared
 * in the bar for rooms that belong inside Community.
 *
 * The header is the demo's: a back chevron on the left, the room's name, and a
 * close on the right. Both exits are offered because they mean different things —
 * back is "I am done with this room", close is "I am done with the hive".
 */
export function CommunitySheet({
  open,
  title,
  sub,
  footnote,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  /** The line under the title — what this room is for, in the demo's words. */
  sub?: string;
  /** The quiet line at the bottom, after the content. */
  footnote?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
        <View style={[styles.sheet, { backgroundColor: c.bg, paddingTop: insets.top + spacing.s3 }]}>
          <View style={styles.head}>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={[styles.round, { backgroundColor: c.surface2 }]}
            >
              <Icon name="chevL" size={20} color={c.ink} />
            </Pressable>

            <Text style={[styles.title, { color: c.ink }]} numberOfLines={1}>
              {title}
            </Text>

            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.x}
            >
              <Icon name="x" size={20} color={c.ink2} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: spacing.s5,
              paddingBottom: insets.bottom + spacing.s8,
              gap: spacing.s3,
            }}
            showsVerticalScrollIndicator={false}
          >
            {sub ? <Text style={[styles.sub, { color: c.ink2 }]}>{sub}</Text> : null}
            {children}
            {footnote ? <Text style={[styles.foot, { color: c.ink3 }]}>{footnote}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { height: '94%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s5,
    paddingBottom: spacing.s4,
  },
  round: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: t.h2, fontWeight: '700' },
  x: { padding: 4 },
  sub: { fontSize: t.sm, lineHeight: t.sm * 1.55, marginBottom: spacing.s2 },
  foot: { fontSize: t.micro, fontStyle: 'italic', marginTop: spacing.s5 },
});
