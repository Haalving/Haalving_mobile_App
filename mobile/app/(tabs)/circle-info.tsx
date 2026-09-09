import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCircleInfo, useMe, type CircleMember } from '@/api/client-app';
import { Avatar } from '@/components/client/ClientHeader';
import { Icon } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/primitives';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * THE ROOM'S INFO SHEET — tap "My Circle" and this opens, the way a group's
 * name opens its info in WhatsApp: who is in it, what has been shared in it.
 *
 * MEMBERS ARE THE SEATS. A circle is the client's pod — one person per seat
 * (Nutrition, Fitness, Yoga, Mind Wellness, Doctor, Haalving Coach, Operations)
 * — plus the client. Nothing here is editable by the client: the seats are
 * set on the console, and the sheet says so at the foot rather than offering
 * an "Add member" that would have to be refused.
 *
 * MEDIA is the plates photographed into the room, LINKS are the URLs anybody
 * pasted, DOCS are the artifacts a chain published. All three are read off the
 * same messages the thread shows, so nothing appears here that is not in the
 * room.
 */
export default function CircleInfoScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useMe();
  const info = useCircleInfo();
  const d = info.data;
  const members: CircleMember[] = d?.members ?? [];
  const team = members.filter((m) => !m.you);

  return (
    <ClientGround>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.s3, paddingBottom: insets.bottom + spacing.s9 }]}>
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: c.surface }]} accessibilityRole="button" accessibilityLabel="Back to the room">
            <Icon name="chevL" size={17} color={c.ink2} strokeWidth={1.8} />
          </Pressable>
          <Text style={[styles.topTitle, { color: c.ink2 }]}>Circle info</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* ------------------------------------------------ the group */}
        <View style={styles.hero}>
          <View style={styles.cluster}>
            {team.slice(0, 3).map((m, i) => (
              <View key={m.id} style={[styles.clusterItem, { marginLeft: i ? -18 : 0, borderColor: c.bg }]}>
                <Avatar name={m.name} size={64} />
              </View>
            ))}
            {!team.length ? <Avatar name={me.data?.name ?? '?'} size={64} /> : null}
          </View>
          <Text style={[styles.h1, { color: c.ink }]}>My Circle</Text>
          <Text style={[styles.sub, { color: c.ink2 }]}>
            {d ? `${members.length} members · ${d.plan === 'svayam' ? 'Svayam' : 'Poorna'} care team` : 'Loading…'}
          </Text>
        </View>

        {/* ------------------------------------------------ media */}
        <Section title={`Media${d?.media.length ? ` · ${d.media.length}` : ''}`}>
          {d && d.media.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.s2 }}>
              {d.media.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => router.push({ pathname: '/(tabs)/meal-detail/[id]', params: { id: m.mealId } })}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`${m.slot}, ${m.ago}`}
                  style={[styles.thumb, { backgroundColor: c.surface2 }]}
                >
                  <Image source={{ uri: m.photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} cachePolicy="memory-disk" />
                  <Text style={styles.thumbSlot} numberOfLines={1}>{m.slot}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Empty>No photos yet — the plates you log land here.</Empty>
          )}
        </Section>

        {/* ------------------------------------------------ links */}
        <Section title={`Links${d?.links.length ? ` · ${d.links.length}` : ''}`}>
          {d && d.links.length ? (
            d.links.map((l, i) => (
              <Pressable key={`${l.url}-${i}`} onPress={() => void Linking.openURL(l.url)} style={[styles.row, { backgroundColor: c.surface }]} accessibilityRole="link">
                <View style={[styles.rowIcon, { backgroundColor: c.brandWash }]}>
                  <Icon name="clip" size={16} color={c.brand} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowTitle, { color: c.brand2 }]} numberOfLines={1}>{l.url.replace(/^https?:\/\//, '')}</Text>
                  <Text style={[styles.rowSub, { color: c.ink3 }]} numberOfLines={1}>{l.who ?? 'You'} · {l.ago}</Text>
                </View>
              </Pressable>
            ))
          ) : (
            <Empty>No links shared in the room yet.</Empty>
          )}
        </Section>

        {/* ------------------------------------------------ docs */}
        <Section title={`Docs${d?.docs.length ? ` · ${d.docs.length}` : ''}`}>
          {d && d.docs.length ? (
            d.docs.map((x) => (
              <View key={x.id} style={[styles.row, { backgroundColor: c.surface }]}>
                <View style={[styles.rowIcon, { backgroundColor: c.okWash }]}>
                  <Icon name="doc" size={16} color={c.ok} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowTitle, { color: c.ink }]} numberOfLines={2}>{x.text}</Text>
                  <Text style={[styles.rowSub, { color: c.ink3 }]} numberOfLines={1}>{x.who ?? 'Your team'} · {x.ago}</Text>
                </View>
              </View>
            ))
          ) : (
            <Empty>Nothing published to you yet — a signed diet plan or chart lands here.</Empty>
          )}
        </Section>

        {/* ------------------------------------------------ members */}
        <Section title={`${members.length || ''} members`.trim()}>
          {members.map((m) => (
            <View key={`${m.seat}:${m.id}`} style={[styles.row, { backgroundColor: c.surface }]}>
              <Avatar name={m.name} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.rowTitle, { color: c.ink }]} numberOfLines={1}>
                  {m.name}
                  {m.you ? <Text style={{ color: c.ink3, fontWeight: '400' }}> (you)</Text> : null}
                </Text>
                <Text style={[styles.rowSub, { color: c.ink2 }]} numberOfLines={1}>
                  {m.you ? 'Client' : `${m.seatLabel} · ${m.roleTitle}`}
                </Text>
              </View>
              {m.covering ? <Pill tone="warn">Covering today</Pill> : null}
              {m.seat === 'admin' || m.seat === 'onboarding' ? <Pill tone="info">Admin</Pill> : null}
            </View>
          ))}
          {info.isLoading && !members.length ? <Empty>Loading the room…</Empty> : null}
        </Section>

        <Text style={[styles.audit, { color: c.ink3 }]}>
          Your circle is set by your HAALVING Coach — one person per seat. To change who is here, ask in the room.
        </Text>
      </ScrollView>
    </ClientGround>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ gap: spacing.s2 }}>
      <Text style={[styles.secTitle, { color: c.ink3 }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return <Text style={[styles.empty, { color: c.ink3 }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.s5, gap: spacing.s5 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.15 },
  hero: { alignItems: 'center', gap: spacing.s2, paddingVertical: spacing.s2 },
  cluster: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.s1 },
  clusterItem: { borderRadius: 40, borderWidth: 3 },
  h1: { fontSize: t.h1, fontWeight: '600', letterSpacing: -0.5 },
  sub: { fontSize: t.sm },
  secTitle: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.15 },
  thumb: { width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden', justifyContent: 'flex-end' },
  thumbSlot: { color: '#fff', fontSize: t.micro, fontWeight: '600', padding: spacing.s1, paddingHorizontal: spacing.s2, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, borderRadius: radius.md, paddingVertical: spacing.s3, paddingHorizontal: spacing.s4 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: t.sm, fontWeight: '600' },
  rowSub: { fontSize: t.micro, marginTop: 2 },
  empty: { fontSize: t.xs, fontStyle: 'italic', lineHeight: t.xs * 1.5 },
  audit: { fontSize: t.micro, fontStyle: 'italic', lineHeight: t.micro * 1.55, textAlign: 'center' },
});
