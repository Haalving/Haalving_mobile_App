import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCircle, useMarkCircleRead, useMe, useSendCircle, type CircleMessage } from '@/api/client-app';
import { useCircleLive } from '@/api/realtime';
import { ClientHeader } from '@/components/client/ClientHeader';
import { QuickAddSheet } from '@/components/client/QuickAddSheet';
import { SceneBand } from '@/components/client/SceneBand';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { ClientGround } from '@/theme/ClientGround';
import { radius, spacing, TABBAR_HEIGHT, type as t, useTheme } from '@/theme/tokens';

/**
 * My Circle — the care-circle thread (`client-coach.js`, the centre tab #/coach).
 *
 * The day-session thread with the pinned card at the top, message bubbles (the
 * client's own on the right, the team's on the left with a who-line), and the
 * composer fixed above the tab bar. The thread is `GET /client/circle`, live over
 * Socket.IO (useCircleLive) with a polling fallback, and opening it marks the
 * thread read. The composer takes no free text — a client speaks to the room
 * through meal capture and arrival, not typed lines — but the CAMERA is live: it
 * opens the Log-a-meal wizard, and a logged plate posts its own card into the
 * thread and onto the team's Meals queue to be rated.
 */
export default function CoachScreen() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useMe();
  const circle = useCircle();
  /* live updates while this screen is open; the query polls as a fallback */
  useCircleLive();

  /* opening the thread marks it caught up — clears the unread dot on /client/me.
     Once per mount: a re-mark on every re-render would be a POST storm. */
  const markRead = useMarkCircleRead();
  const send = useSendCircle();
  const [draft, setDraft] = useState('');
  const [quickAdd, setQuickAdd] = useState(false);

  /* the server decides where the line lands; the field only has to be emptied
     once it has been accepted, so a failed send keeps what was typed */
  const submit = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(text, { onSuccess: () => setDraft('') });
  };
  const marked = useRef(false);
  useEffect(() => {
    if (!marked.current) {
      marked.current = true;
      markRead.mutate();
    }
  }, [markRead]);
  const scroller = useRef<ScrollView>(null);

  const composerH = 56;
  const composerBottom = TABBAR_HEIGHT + insets.bottom;

  return (
    <ClientGround>
      {me.data ? <ClientHeader name={me.data.name} plan={me.data.plan} /> : null}

      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: composerBottom + composerH + spacing.s5 },
        ]}
      >
        <SceneBand kicker="THE ROOM" title="My Circle" sub={circle.data?.sub} />

        <View style={styles.tools}>
          <Text style={[styles.sessNow, { color: c.ink3 }]}>Session · Today</Text>
          {circle.data?.hasHistory ? (
            <View style={[styles.chip, { backgroundColor: c.surface, borderColor: c.line }]}>
              <Icon name="clock" size={12} color={c.ink2} />
              <Text style={{ fontSize: t.xs, color: c.ink2 }}>See chat history</Text>
            </View>
          ) : null}
        </View>

        <View style={{ gap: spacing.s2 }}>
          {(circle.data?.messages ?? []).map((m) => (
            <Msg key={m.id} m={m} />
          ))}
        </View>
      </ScrollView>

      {/* the composer — fixed above the tab bar (.shell-client .composer) */}
      <View style={[styles.composer, { bottom: composerBottom, paddingBottom: spacing.s3 }]}>
        <View style={[styles.field, { backgroundColor: c.surface }]}>
          <View style={styles.ic}>
            <Icon name="smile" size={20} color={c.ink3} />
          </View>
          {/*
            THE FIELD TAKES WORDS NOW.
            It was deliberately read-only, on the demo's reading that a client
            speaks to the room through a plate and a mood rather than typed lines.
            That holds for somebody with a plan; it is exactly wrong for somebody
            still on the onboarding rail, for whom asking the team is the only
            thing they can do. One field, both states — the server routes the line
            to the care circle or to the arrival thread.
          */}
          <TextInput
            style={[styles.inp, { color: c.ink }]}
            placeholder="Message"
            placeholderTextColor={c.ink3}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            returnKeyType="send"
            multiline
          />
          {/* QUICK ADD, from the room the client is already standing in.
              A tracker entry belongs here as much as on the Trackers tab: this is
              where somebody is when they remember they drank a glass of water, and
              sending them two tabs away to say so is how a log goes unlogged. The
              SAME sheet as Trackers, not a copy — one place decides what can be
              logged and how it is written. */}
          <Pressable
            style={styles.ic}
            onPress={() => setQuickAdd(true)}
            accessibilityRole="button"
            accessibilityLabel="Quick add"
            hitSlop={6}
          >
            <Icon name="plusbox" size={20} color={c.brand} />
          </Pressable>
          {/* the one live control — log a meal, the way a plate reaches the room */}
          <Pressable
            style={styles.ic}
            onPress={() => router.push('/(tabs)/meal')}
            accessibilityRole="button"
            accessibilityLabel="Log a meal"
            hitSlop={6}
          >
            <Icon name="camera" size={20} color={c.brand} />
          </Pressable>
        </View>
        <Pressable
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel={draft.trim() ? 'Send' : 'Hold to speak'}
          style={[styles.primary, { backgroundColor: c.brandFill, opacity: send.isPending ? 0.6 : 1 }]}
        >
          {/* the mark changes with the field: a microphone over an empty box, an
              arrow the moment there are words to send */}
          <Icon name={draft.trim() ? 'send' : 'mic'} size={21} color="#fff" strokeWidth={1.7} />
        </Pressable>
      </View>

      <QuickAddSheet open={quickAdd} onClose={() => setQuickAdd(false)} />
    </ClientGround>
  );
}

function Msg({ m }: { m: CircleMessage }) {
  const c = useTheme();
  const router = useRouter();

  if (m.kind === 'card') {
    return (
      <Card style={{ padding: spacing.s4 }}>
        <Text style={[styles.k, { color: c.ink3 }]}>PINNED</Text>
        <Text style={{ color: c.ink, fontSize: t.sm, marginTop: 3 }}>{m.text}</Text>
        <Text style={[styles.when, { color: c.ink3 }]}>{m.ago}</Text>
      </Card>
    );
  }

  const mine = m.mine;
  const bubbleStyle = [
    styles.msg,
    mine
      ? { backgroundColor: c.brandFill, alignSelf: 'flex-end' as const, borderBottomRightRadius: spacing.s1 }
      : { backgroundColor: c.surface, alignSelf: 'flex-start' as const, borderBottomLeftRadius: spacing.s1 },
  ];
  const ink = mine ? '#fff' : c.ink;
  const sub = mine ? 'rgba(255,255,255,0.78)' : c.ink2;
  const whenC = mine ? 'rgba(255,255,255,0.62)' : c.ink3;

  return (
    <View style={bubbleStyle}>
      {m.who ? <Text style={[styles.who, { color: c.brand }]}>{m.who}</Text> : null}

      {m.kind === 'doc' ? (
        /*
         * THE ARTEFACT A CHAIN PUBLISHED — a diet plan, a chart, a calendar.
         * It used to fall through to a plain sentence, which is exactly wrong:
         * a published plan is the single most consequential thing that lands in
         * this room, and it read as chat. It is an attachment, so it is drawn as
         * one, and it says where the thing now lives.
         */
        <Pressable
          onPress={() => router.push('/(tabs)/plan')}
          style={[styles.attach, { backgroundColor: 'rgba(0,0,0,0.10)' }]}
        >
          <View style={[styles.attachBowl, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
            <Icon name="doc" size={22} color={mine ? '#fff' : c.brand} strokeWidth={1.5} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: ink, fontWeight: '600', fontSize: t.sm }}>{m.text}</Text>
            <Text style={{ color: sub, fontSize: t.xs }}>Published to your Plan · tap to open</Text>
          </View>
        </Pressable>
      ) : m.kind === 'meal' ? (
        <View style={[styles.attach, { backgroundColor: 'rgba(0,0,0,0.14)' }]}>
          <View style={[styles.attachBowl, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
            <Icon name="bowl" size={22} color="#fff" strokeWidth={1.5} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: ink, fontWeight: '600', fontSize: t.sm }}>{m.text}</Text>
            <Text style={{ color: sub, fontSize: t.xs }}>
              {m.slot} · {(m.dishes ?? []).join(', ')}
            </Text>
          </View>
        </View>
      ) : m.kind === 'rating' ? (
        <>
          <Stars n={m.stars ?? 0} />
          <Text style={{ color: ink, fontSize: t.sm, marginTop: 3 }}>{m.text}</Text>
          {m.voiceSec ? <Voice sec={m.voiceSec} /> : null}
          {/* the rating is ABOUT a plate, so the link opens that plate — it was
              inert text, which is a promise a screen should not make twice */}
          {m.mealId ? (
            <Pressable onPress={() => router.push(`/(tabs)/meal-detail/${m.mealId}`)}>
              <Text style={[styles.link, { color: mine ? '#fff' : c.brand }]}>See why →</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <Text style={{ color: ink, fontSize: t.sm, lineHeight: t.sm * 1.5 }}>{m.text}</Text>
      )}

      {m.kind === 'meal' && m.mealId ? (
        /* the meal-detail screen existed and nothing in the app reached it */
        <Pressable onPress={() => router.push(`/(tabs)/meal-detail/${m.mealId}`)}>
          <Text style={[styles.link, { color: mine ? '#fff' : c.brand }]}>View meal</Text>
        </Pressable>
      ) : null}

      <Text style={[styles.when, { color: whenC }]}>{m.ago}</Text>
    </View>
  );
}

function Stars({ n }: { n: number }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={16} color={i <= n ? c.culture : c.lineStrong} filled={i <= n} />
      ))}
    </View>
  );
}

function Voice({ sec }: { sec: number }) {
  const c = useTheme();
  return (
    <View style={[styles.voice, { backgroundColor: c.surface2, marginTop: 7 }]}>
      <View style={[styles.voicePlay, { backgroundColor: c.brandFill }]}>
        <Icon name="play" size={11} color="#fff" filled strokeWidth={2} />
      </View>
      <View style={[styles.voiceWave, { backgroundColor: c.ink3 }]} />
      <Text style={{ fontFamily: numFamily(400), color: c.ink2, fontSize: t.xs }}>
        0:{String(sec).padStart(2, '0')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: spacing.s2, paddingHorizontal: spacing.s5 },
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    marginTop: spacing.s2,
    marginBottom: spacing.s3,
  },
  sessNow: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.13, textTransform: 'uppercase' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1.5,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
  },
  k: { fontSize: t.micro, fontWeight: '600', letterSpacing: t.micro * 0.14 },
  msg: { maxWidth: '84%', borderRadius: radius.lg, padding: spacing.s3, paddingHorizontal: spacing.s4 },
  who: { fontSize: t.micro, fontWeight: '600', marginBottom: 2, letterSpacing: 0.2 },
  when: { fontSize: t.micro, marginTop: spacing.s1 },
  link: { fontSize: t.xs, fontWeight: '600', marginTop: spacing.s2 },
  attach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    borderRadius: radius.md,
    padding: spacing.s2,
    paddingHorizontal: spacing.s3,
    marginBottom: spacing.s2,
  },
  attachBowl: {
    width: 56,
    height: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderRadius: radius.full,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
  },
  voicePlay: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  voiceWave: { flex: 1, height: 16, borderRadius: 2, opacity: 0.42 },

  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
  field: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: radius.full,
    paddingVertical: spacing.s1,
    paddingLeft: spacing.s2,
    paddingRight: spacing.s1,
  },
  inp: { flex: 1, minWidth: 0, fontSize: t.body, paddingVertical: spacing.s2, paddingHorizontal: spacing.s1 },
  ic: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  primary: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
