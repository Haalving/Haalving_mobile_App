import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { askForCamera, openCameraSettings, useCameraAccess } from '@/api/permissions';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * THE REMINDER THAT CAMERA ACCESS IS OFF — on Today, until it is on.
 *
 * It offers the one act that helps: the system dialog while the OS still
 * shows one, the phone's Settings once it does not. "Not now" hides it for
 * this run of the app; it is back on the next start, because a plate logged
 * without a photo is a plate the dietitian cannot read.
 */
export function CameraReminder() {
  const c = useTheme();
  const access = useCameraAccess();
  const [hidden, setHidden] = useState(false);

  if (hidden || access === 'unknown' || access === 'granted') return null;
  const blocked = access === 'blocked';

  return (
    <View style={[styles.box, { backgroundColor: c.amberWash, borderColor: 'rgba(217,164,74,0.30)' }]}>
      <Text style={{ color: c.ink, fontSize: t.xs, lineHeight: t.xs * 1.55 }}>
        Camera access is off, so your plates go up without a photo.
        {blocked ? ' Turn it on in your phone’s Settings.' : ' Allow it and the meal log opens the camera.'}
      </Text>
      <View style={styles.acts}>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => (blocked ? openCameraSettings() : void askForCamera())}
        >
          <Text style={[styles.act, { color: c.brand }]}>{blocked ? 'Open Settings' : 'Allow camera'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setHidden(true)}>
          <Text style={[styles.act, { color: c.ink3 }]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    gap: spacing.s2,
    marginBottom: spacing.s3,
  },
  acts: { flexDirection: 'row', gap: spacing.s5 },
  act: { fontSize: t.sm, fontWeight: '600' },
});
