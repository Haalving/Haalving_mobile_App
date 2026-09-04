import { Redirect, Tabs } from 'expo-router';

import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/store/session.store';
import { TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * The client shell's tab bar — ported from `CLIENT_TABS` (core.js:1690).
 *
 * FIVE SEATS, one time horizon each, in the demo's own order:
 *
 *   Plan       the whole 14-day cycle
 *   Today      do now
 *   My Circle  talk — the most-used door, and the CENTRE seat
 *   Trackers   log and sync
 *   Community  the community space
 *
 * Journey lost its seat on 9 Aug 2026 and lives inside Trackers; Profile lives
 * on the top-right avatar because it is not a daily destination. Neither is
 * re-added here.
 *
 * `core: true` marks My Circle. It reads half a step brighter at rest — fuller
 * ink and a larger glyph, nothing more. A filled brand disc was tried in the
 * demo and pulled; the quiet version is the one.
 */
const TABS = [
  { name: 'plan', label: 'Plan', icon: 'cal' },
  { name: 'today', label: 'Today', icon: 'sun' },
  { name: 'coach', label: 'My Circle', icon: 'circle', core: true },
  { name: 'trackers', label: 'Trackers', icon: 'pulse' },
  { name: 'community', label: 'Community', icon: 'tribe' },
] as const;

export default function TabsLayout() {
  const c = useTheme();
  const ready = useSession((s) => s.ready);
  const user = useSession((s) => s.user);

  if (!ready) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        /* the centre seat reads at ink-2 at rest; the others at ink-3. The
           per-tab colour below is what carries that half step. */
        tabBarInactiveTintColor: c.ink3,
        tabBarStyle: {
          height: TABBAR_HEIGHT,
          backgroundColor: c.surface,
          borderTopWidth: 0,
          /* the demo's active marker is a hairline above the tab, not a filled
             blob — a top shadow line stands in for `box-shadow: 0 -1px 0` */
          shadowColor: c.lineSoft,
          shadowOffset: { width: 0, height: -1 },
          shadowOpacity: 1,
          shadowRadius: 0,
          elevation: 8,
        },
        tabBarLabelStyle: { fontSize: t.micro, letterSpacing: 0.1 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarIcon: ({ color, focused }) => (
              <Icon
                name={tab.icon}
                /* the centre seat is a larger glyph, at rest and focused */
                size={'core' in tab && tab.core ? 26 : 23}
                color={!focused && 'core' in tab && tab.core ? c.ink2 : color}
              />
            ),
            tabBarLabelStyle: {
              fontSize: t.micro,
              fontWeight: 'core' in tab && tab.core ? '600' : '400',
            },
          }}
        />
      ))}

      {/* Profile lives on the avatar, not the tab bar — it is not a daily
          destination. Registered so the route exists and stays reachable. */}
      <Tabs.Screen name="profile" options={{ href: null }} />

      {/* Pushed client screens — reached from within the shell, never a tab of
          their own, so each is registered href:null (the tab bar still shows,
          matching the demo which renders them inside the client shell). Added as
          each route file lands. */}
      <Tabs.Screen name="meal" options={{ href: null }} />
      <Tabs.Screen name="meal-detail/[id]" options={{ href: null }} />
      <Tabs.Screen name="coaches/[pillar]" options={{ href: null }} />
      <Tabs.Screen name="plan-full/[pillar]" options={{ href: null }} />
      <Tabs.Screen name="journey" options={{ href: null }} />
    </Tabs>
  );
}
