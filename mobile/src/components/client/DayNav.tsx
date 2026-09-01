import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * THE DAY STEPPER — `.daynav` (app.css:1594), built at client-today.js:742.
 *
 * It stands where a section title would, because it does that job: it names the
 * day the drawers below belong to.
 *
 * AN ARROW AT THE EDGE STAYS IN PLACE, greyed. The demo's own note says why, and
 * it is the kind of thing only a thumb notices: a control that comes and goes
 * makes the row jump under the finger reaching for it.
 */

export function DayNav({
  day,
  date,
  tag,
  tagTone = 'neutral',
  onPrev,
  onNext,
}: {
  day: number;
  /** the calendar date beside the day number, when there is one */
  date?: string;
  /** Today / Level review / Progress meeting / Active rest / Already done / Planned */
  tag: string;
  tagTone?: 'ok' | 'warn' | 'info' | 'neutral';
  /** undefined parks the arrow greyed rather than removing it */
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const c = useTheme();

  const step = (dir: 'chevL' | 'chevR', onPress: (() => void) | undefined, label: string) => {
    const off = !onPress;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: off }}
        disabled={off}
        onPress={onPress}
        style={[
          styles.step,
          off
            ? { backgroundColor: 'transparent', opacity: 0.35 }
            : {
                backgroundColor: c.surface,
                shadowColor: '#141A17',
                shadowOpacity: 0.4,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 1 },
                elevation: 1,
              },
        ]}
      >
        <Icon name={dir} size={20} color={off ? c.ink3 : c.ink2} />
      </Pressable>
    );
  };

  return (
    <View style={styles.nav}>
      {step('chevL', onPrev, 'Previous day')}
      <View style={styles.mid}>
        <Text style={[styles.day, { color: c.ink }]}>
          <Text style={{ fontFamily: numFamily(600) }}>Day {day}</Text>
          {date ? ` · ${date}` : ''}
        </Text>
        <Pill tone={tagTone}>{tag}</Pill>
      </View>
      {step('chevR', onNext, 'Next day')}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginTop: spacing.s2,
    marginBottom: spacing.s3,
  },
  mid: { flex: 1, minWidth: 0, alignItems: 'center', gap: spacing.s1 },
  day: { fontSize: t.h3, fontWeight: '600' },
  step: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
