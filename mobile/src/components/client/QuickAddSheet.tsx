import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  MOODS,
  useLogTrackers,
  useSetArrival,
  useTrackers,
  type Mood,
} from '@/api/client-app';
import * as DocumentPicker from 'expo-document-picker';

import { useAddDocument } from '@/api/client-app';
import { uploadFile } from '@/api/uploads';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/primitives';
import { numFamily } from '@/theme/fonts';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * QUICK-ADD — the tracker hub's + sheet.
 *
 * The demo's manual-entry pop: a glass of water, last night's sleep, today's
 * steps, a weigh-in, or how you are arriving. Each writes to the SAME blob the
 * six signals read (`POST /client/trackers`) or the morning arrival
 * (`POST /client/arrival`), so what you log here shows on the hub at once — and
 * on the team's console Trackers tab, which reads the identical row.
 *
 * TWO STEPS on purpose: a grid of what you can log, then the one you picked. A
 * single sheet with four keyboards fighting for the bottom of the screen is the
 * thing this shape avoids.
 */

type Mode = null | 'water' | 'sleep' | 'steps' | 'weight' | 'mood' | 'doc';

const CHOICES: { mode: Exclude<Mode, null>; icon: string; label: string; series: string }[] = [
  { mode: 'water', icon: 'drop', label: 'Water', series: 'tkWater' },
  { mode: 'sleep', icon: 'moon', label: 'Sleep', series: 'tkRest' },
  { mode: 'steps', icon: 'walk', label: 'Steps', series: 'tkMove' },
  { mode: 'weight', icon: 'scale', label: 'Weight', series: 'brand' },
  { mode: 'mood', icon: 'smile', label: 'Mood', series: 'brand' },
  /* the only one that is not a number: a lab, an InBody sheet or a scan, which
     goes to object storage and lands in the doctor's queue */
  { mode: 'doc', icon: 'clip', label: 'Document', series: 'brand' },
];

const MOOD_LABEL: Record<Mood, string> = {
  happy: 'Happy',
  sad: 'Low',
  angry: 'Frustrated',
  drained: 'Drained',
};

export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState('');
  const [busy2, setBusy2] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* the filename, kept just long enough to confirm it went — the grid behind
     cannot show a document the way it shows a number */
  const [sent, setSent] = useState<string | null>(null);

  const log = useLogTrackers();
  const arrival = useSetArrival();
  const addDoc = useAddDocument();
  const tr = useTrackers();

  const busy = log.isPending || arrival.isPending || busy2 || addDoc.isPending;

  const reset = () => {
    setMode(null);
    setText('');
    setErr(null);
    setSent(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  /* one write, then home to the grid (or out) — the sheet confirms by the number
     on the hub changing behind it, not by a banner that has to be dismissed too */
  const done = () => {
    setText('');
    setMode(null);
  };

  const logWater = () => log.mutate({ waterAdd: 1 }, { onSuccess: done });

  const logSleep = () => {
    const hours = Number(text.replace(',', '.'));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return;
    log.mutate({ sleepMins: Math.round(hours * 60) }, { onSuccess: done });
  };

  const logSteps = () => {
    const n = Number(text.replace(/[^\d]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return;
    log.mutate({ steps: Math.round(n) }, { onSuccess: done });
  };

  const logWeight = () => {
    const kg = Number(text.replace(',', '.'));
    if (!Number.isFinite(kg) || kg < 20 || kg > 400) return;
    log.mutate({ weightKg: kg }, { onSuccess: done });
  };

  const logMood = (m: Mood) => arrival.mutate({ mood: m }, { onSuccess: done });

  /**
   * A REPORT FROM THE PHONE INTO THE RECORDS VAULT.
   *
   * Pick, upload to R2, then record it — in that order, so a row is never written
   * for a file that did not land. It arrives as a PENDING summary in the same
   * table the console's Medical board reads, which is the whole point: a lab a
   * client sends here appears in the doctor's queue rather than in a private
   * corner of the app nobody is watching.
   */
  const attachDoc = async () => {
    setErr(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return;

    const a = picked.assets[0];
    if (!a) return;

    setBusy2(true);
    try {
      const key = await uploadFile('documents', {
        uri: a.uri,
        name: a.name,
        mime: a.mimeType ?? 'application/pdf',
        bytes: a.size ?? 0,
      });
      await addDoc.mutateAsync({
        /* the filename is the title until somebody renames it — better than
           asking a person to type one while they are already mid-task */
        title: a.name.replace(/\.[^.]+$/, ''),
        kind: 'Lab',
        key,
        fileName: a.name,
        mime: a.mimeType ?? 'application/pdf',
        bytes: a.size ?? 0,
      });
      setSent(a.name);
      done();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy2(false);
    }
  };

  const waterSig = tr.data?.signals.find((s) => s.key === 'water');

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.dock}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.surface, paddingBottom: insets.bottom + spacing.s5 },
          ]}
        >
          <View style={styles.grabber}>
            <View style={[styles.grab, { backgroundColor: c.surface3 }]} />
          </View>

          <View style={styles.head}>
            <Text style={[styles.title, { color: c.ink }]}>
              {mode ? CHOICES.find((x) => x.mode === mode)?.label : 'Quick add'}
            </Text>
            <Pressable onPress={mode ? reset : close} hitSlop={12} accessibilityLabel="Back">
              <Icon name={mode ? 'chevL' : 'x'} size={22} color={c.ink3} />
            </Pressable>
          </View>

          {/* step 1 — the grid of what you can log */}
          {!mode ? (
            <View style={styles.grid}>
              {CHOICES.map((ch) => {
                const tint = (c as unknown as Record<string, string>)[ch.series] ?? c.brand;
                return (
                  <Pressable
                    key={ch.mode}
                    style={[styles.tile, { backgroundColor: c.surface2 }]}
                    onPress={() => (ch.mode === 'water' ? logWater() : setMode(ch.mode))}
                  >
                    <Icon name={ch.icon} size={24} color={tint} strokeWidth={1.5} />
                    <Text style={[styles.tileLabel, { color: c.ink2 }]}>{ch.label}</Text>
                    {ch.mode === 'water' && waterSig ? (
                      <Text style={[styles.tileHint, { color: c.ink3 }]}>
                        {waterSig.value} {waterSig.sub}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* step 2 — the picked entry's own control */}
          {mode === 'sleep' ? (
            <Entry
              hint="How many hours did you sleep last night?"
              suffix="hours"
              value={text}
              onChange={setText}
              onSave={logSleep}
              busy={busy}
              placeholder="7.5"
            />
          ) : null}

          {mode === 'steps' ? (
            <Entry
              hint="Your step count so far today."
              suffix="steps"
              value={text}
              onChange={setText}
              onSave={logSteps}
              busy={busy}
              placeholder="8000"
            />
          ) : null}

          {mode === 'weight' ? (
            <Entry
              hint="Today's weigh-in — your team sees the latest on your record."
              suffix="kg"
              value={text}
              onChange={setText}
              onSave={logWeight}
              busy={busy}
              placeholder="72.5"
            />
          ) : null}

          {mode === 'mood' ? (
            <View style={{ gap: spacing.s4, paddingTop: spacing.s2 }}>
              <Text style={[styles.entryHint, { color: c.ink2 }]}>How are you arriving today?</Text>
              <View style={styles.moods}>
                {MOODS.map((m) => (
                  <Pressable
                    key={m}
                    disabled={busy}
                    style={[styles.mood, { borderColor: c.brand }]}
                    onPress={() => logMood(m)}
                  >
                    <Icon name="smile" size={22} color={c.brand} />
                    <Text style={[styles.moodLabel, { color: c.ink2 }]}>{MOOD_LABEL[m]}</Text>
                  </Pressable>
                ))}
              </View>
              {busy ? <ActivityIndicator color={c.brand} /> : null}
            </View>
          ) : null}

          {mode === 'doc' ? (
            <View style={{ gap: spacing.s4, paddingTop: spacing.s2 }}>
              <Text style={[styles.entryHint, { color: c.ink2 }]}>
                A lab, an InBody sheet or a scan. It goes straight to your care team — your
                doctor sees it in their queue.
              </Text>
              {sent ? (
                <Text style={[styles.entryHint, { color: c.brand }]}>
                  {sent} is with your team.
                </Text>
              ) : null}
              {err ? <Text style={[styles.entryHint, { color: c.amber }]}>{err}</Text> : null}
              <Button
                label={busy ? 'Sending…' : 'Choose a file'}
                onPress={() => void attachDoc()}
                disabled={busy}
              />
              {busy ? <ActivityIndicator color={c.brand} /> : null}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Entry({
  hint,
  suffix,
  value,
  onChange,
  onSave,
  busy,
  placeholder,
}: {
  hint: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  busy: boolean;
  placeholder: string;
}) {
  const c = useTheme();
  return (
    <View style={{ gap: spacing.s4, paddingTop: spacing.s2 }}>
      <Text style={[styles.entryHint, { color: c.ink2 }]}>{hint}</Text>
      <View style={[styles.inputRow, { borderColor: c.line, backgroundColor: c.surface2 }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={c.ink3}
          autoFocus
          style={[styles.input, { color: c.ink, fontFamily: numFamily(500) }]}
        />
        <Text style={[styles.suffix, { color: c.ink3 }]}>{suffix}</Text>
      </View>
      <Button label={busy ? 'Saving…' : 'Save'} onPress={onSave} loading={busy} disabled={!value.trim()} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  dock: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s2,
    gap: spacing.s4,
  },
  grabber: { alignItems: 'center', paddingVertical: spacing.s1 },
  grab: { width: 40, height: 4, borderRadius: radius.full },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: t.h3, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, paddingBottom: spacing.s2 },
  tile: {
    width: '31.5%',
    borderRadius: radius.md,
    paddingVertical: spacing.s4,
    alignItems: 'center',
    gap: spacing.s2,
  },
  tileLabel: { fontSize: t.sm, fontWeight: '600' },
  tileHint: { fontSize: t.micro },

  entryHint: { fontSize: t.sm, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s4,
  },
  input: { flex: 1, fontSize: 28, paddingVertical: spacing.s3 },
  suffix: { fontSize: t.sm, fontWeight: '600' },

  moods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  mood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
  moodLabel: { fontSize: t.sm, fontWeight: '600' },
});
