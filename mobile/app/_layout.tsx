import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api, getRefreshToken, loadApiBaseOverride, setAccessToken } from '@/api/client';
import { registerForPush, usePushDeepLinks } from '@/api/push';
import { useSession, type SessionRole, type SessionUser } from '@/store/session.store';
import { useNumerals } from '@/theme/fonts';
import { useTheme } from '@/theme/tokens';
import '@/theme/global.css';

/**
 * The client app's root.
 *
 * TWO THINGS HAPPEN HERE AND NOTHING ELSE:
 *
 *  1. The DATA FACE is loaded before anything paints. Every numeral in the
 *     product is set in Newsreader, so a late swap would reflow every reading on
 *     the screen — the demo preloads it for the same reason.
 *  2. The session is RECOVERED from the keychain. The access token is memory
 *     only; what survives an app restart is the refresh token in secure storage,
 *     and the first call is what turns it back into a session.
 */
export default function RootLayout() {
  /* three static cuts, not the variable file — React Native cannot vary an axis,
     so 500 and 600 have to arrive as their own families. See theme/fonts.ts. */
  const fontsLoaded = useNumerals();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
          mutations: { retry: false },
        },
      }),
  );

  const setSession = useSession((s) => s.setSession);
  const setReady = useSession((s) => s.setReady);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      /* a dev backend-URL override, if one was set, before the first request */
      await loadApiBaseOverride();
      const stored = await getRefreshToken();
      if (!stored) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        /* no access token in memory yet, so this 401s and the client's own
           refresh turns the stored token into a live session */
        const me = await api.get<{ user: SessionUser; role: SessionRole }>('/me');
        if (!cancelled) {
          setSession(me.user, me.role);
          /* a signed-in device registers for push; a courtesy, never awaited */
          void registerForPush();
        }
      } catch {
        setAccessToken(null);
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setSession, setReady]);

  /* route a tapped notification to the screen it names */
  usePushDeepLinks();

  /* A hard ceiling on the blank first frame. `fontsLoaded` already resolves on a
     font ERROR (see useNumerals), but if the load neither resolves nor errors —
     a wedged native font module on a release build — this stops the app hanging
     on white forever and lets it paint in the fallback face. */
  const [bootTimedOut, setBootTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBootTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, []);

  if (!fontsLoaded && !bootTimedOut) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <Chrome />
        {/* `(auth)` is a group with ONE route in it, so expo-router registers it as
            `(auth)/login` and a Stack.Screen named `(auth)` matches nothing — it
            warned on every boot. Naming the route that actually exists is the fix;
            the group still keeps login out of the tab bar. */}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)/login" />
          <Stack.Screen name="(tabs)" />
          {/* Onboarding is standalone — no shell, no tab bar (the demo's
              `standalone: true`). A top-level route, not inside (tabs). */}
          <Stack.Screen name="onboard" />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/**
 * The status bar belongs to the screen it frames.
 *
 * ALWAYS LIGHT CONTENT, because the ground is always dark: the client shell never
 * consults the system scheme (app.css:639), so reading `useColorScheme()` here
 * only produced dark glyphs on a dark photograph whenever the phone was set to
 * light. The demo paints its browser chrome `#0D1211` for the same reason.
 */
function Chrome() {
  const c = useTheme();
  return <StatusBar style="light" backgroundColor={c.bg} />;
}

/**
 * A crash during a route's render lands here instead of a silent white screen.
 * expo-router mounts this around the app's routes, so an error that would
 * otherwise leave a blank frame shows its message — readable and copyable — with
 * a retry. Deliberately dependency-free (inline colours, no fonts or theme hook)
 * so it paints even when the shell itself is what failed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const err = error as (Error & { stack?: string }) | undefined;
  return (
    <View style={{ flex: 1, backgroundColor: '#0D1211', paddingHorizontal: 24, justifyContent: 'center' }}>
      <Text style={{ color: '#F4F1EA', fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
        The app hit an error on startup
      </Text>
      <ScrollView style={{ maxHeight: 280, marginBottom: 20 }}>
        <Text selectable style={{ color: '#F2C879', fontSize: 13, lineHeight: 20 }}>
          {err?.message ?? String(error)}
          {err?.stack ? `\n\n${err.stack}` : ''}
        </Text>
      </ScrollView>
      <Text onPress={retry} style={{ color: '#7FC8B8', fontSize: 16, fontWeight: '600' }}>
        Tap to retry
      </Text>
    </View>
  );
}
