import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/primitives';
import { radius, spacing, type as t, useTheme } from '@/theme/tokens';

/**
 * "CORRECT THE DISHES" — the demo's sheet (client-meal.js openCorrect), one
 * field and two buttons: type what is really on the plate, add it, and the
 * chip appears selected on the confirm step. Enter adds too. An empty box is
 * refused with the demo's own words rather than adding a blank chip.
 */
export function CorrectDishSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (dish: string) => void;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setHint(null);
    }
  }, [open]);

  const add = () => {
    const v = name.trim();
    if (!v) {
      setHint('Type a dish name first');
      return;
    }
    onAdd(v);
    onClose();
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { backgroundColor: c.surface2, paddingBottom: insets.bottom + spacing.s5 }]}>
          <Text style={[styles.h1, { color: c.ink }]}>Correct the dishes</Text>
          <Text style={[styles.sub, { color: c.ink2 }]}>
            Tell us what’s really on the plate — corrections help us learn your kitchen.
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.surface3, color: c.ink, borderColor: c.brand }]}
            placeholder="e.g. Phulka, Curd rice…"
            placeholderTextColor={c.ink3}
            value={name}
            onChangeText={(v) => {
              setName(v);
              if (hint) setHint(null);
            }}
            onSubmitEditing={add}
            returnKeyType="done"
            autoFocus
            autoCapitalize="sentences"
            autoCorrect={false}
            maxLength={80}
            accessibilityLabel="Dish name"
          />
          {hint ? <Text style={[styles.hint, { color: c.amber }]}>{hint}</Text> : null}
          <Button label="Add dish" onPress={add} />
          <Button label="Cancel" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s5,
    gap: spacing.s3,
  },
  h1: { fontSize: t.h2, fontWeight: '600' },
  sub: { fontSize: t.sm, lineHeight: t.sm * 1.5 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.s4, paddingVertical: spacing.s3, fontSize: t.body },
  hint: { fontSize: t.xs },
});
