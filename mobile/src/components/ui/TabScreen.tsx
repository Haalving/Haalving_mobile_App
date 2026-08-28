import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { Empty, H1, Kicker, Sub } from '@/components/ui/primitives';
import { spacing, TABBAR_HEIGHT, useTheme } from '@/theme/tokens';
import type { IconName } from '@/components/ui/Icon';

/**
 * A tab whose board has not been built yet.
 *
 * It renders the demo's OWN empty state — a sentence a human would say, never
 * just an icon — because a blank screen and a broken screen look identical to
 * whoever is holding the phone.
 *
 * The header is real: the tab's name, its route and its place in the bar are
 * decided, and only the board inside it is outstanding.
 */
export function TabScreen({
  kicker,
  title,
  sub,
  icon,
  sentence,
  detail,
  children,
}: {
  kicker: string;
  title: string;
  sub?: string;
  icon?: IconName | string;
  sentence?: string;
  detail?: string;
  children?: ReactNode;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.s4,
        paddingHorizontal: spacing.s5,
        /* clears the tab bar AND the home indicator, the way the demo's
           .c-body bottom padding clears the bar and the resting FAB */
        paddingBottom: TABBAR_HEIGHT + insets.bottom + spacing.s8,
        gap: spacing.s5,
      }}
    >
      <View style={{ gap: spacing.s1 }}>
        <Kicker>{kicker}</Kicker>
        <H1>{title}</H1>
        {sub ? <Sub>{sub}</Sub> : null}
      </View>

      {children}

      {sentence ? <Empty icon={icon} sentence={sentence} sub={detail} /> : null}
    </ScrollView>
  );
}
