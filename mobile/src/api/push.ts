import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from '@/api/client';

/**
 * CLIENT PUSH, the device half of the push.service loop.
 *
 * `registerForPush` asks for permission, mints this device's Expo push token and
 * hands it to `POST /client/push-token`; the server then delivers Notice traffic to
 * it (meal rated, a coach's reply, a session soon). `usePushDeepLinks` routes a
 * TAP on one of those to the screen it names via the `data.link` bag the server
 * sets — a tap lands on the meal, the circle, or today, not the home tab.
 *
 * PUSH IS A COURTESY, NEVER A GATE. Every path here is guarded and swallows its
 * own errors: no permission, no device (web/simulator), a network blip — none of
 * it may keep the app from running, because the data is always refetchable without
 * a single notification.
 */

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

/** Ask, mint, and register this device's token. Safe to call more than once. */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    /* set here, not at module load: a delivered notification shows even
       foregrounded. Kept off the import path so a build without the native module
       linked cannot crash the app before it paints. */
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const pid = projectId();
    const token = (await Notifications.getExpoPushTokenAsync(pid ? { projectId: pid } : undefined)).data;
    await api.post('/client/push-token', { token, platform: Platform.OS });
  } catch {
    /* a courtesy, never a gate */
  }
}

/** Route a tapped notification to the screen its `data.link` names. */
export function usePushDeepLinks(): void {
  const router = useRouter();
  useEffect(() => {
    /* same guard as registration above: expo-notifications has no web module,
       and `getLastNotificationResponseAsync` throws ERR_UNAVAILABLE there — an
       unhandled rejection that LogBox paints over the login screen on the web
       (pixel-harness) target. There are no push taps to route on the web. */
    if (Platform.OS === 'web') return;

    const go = (data: Record<string, unknown> | undefined) => {
      const link = typeof data?.link === 'string' ? data.link : null;
      if (link === 'circle') router.push('/(tabs)/coach');
      else if (link === 'today') router.push('/(tabs)/today');
      else if (link === 'meal') {
        const id = typeof data?.id === 'string' ? data.id : null;
        router.push(id ? `/(tabs)/meal-detail/${id}` : '/(tabs)/today');
      }
    };

    /* a tap while the app is running */
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      go(resp.notification.request.content.data as Record<string, unknown> | undefined);
    });

    /* a tap that COLD-STARTED the app: the response is waiting, not emitted */
    void Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (resp) go(resp.notification.request.content.data as Record<string, unknown> | undefined);
    });

    return () => sub.remove();
  }, [router]);
}
