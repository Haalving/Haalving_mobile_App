import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { ImageBackground, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { schemas } from '@haalving/shared';

import { api, ApiError, setAccessToken, setRefreshToken } from '@/api/client';
import { Button } from '@/components/ui/primitives';
import { useSession, type SessionRole, type SessionUser } from '@/store/session.store';
import { radius, spacing, type as t } from '@/theme/tokens';

/**
 * The arrival — the demo's login, on a phone.
 *
 * The layout is the demo's `.login-hero`: a full-bleed Kerala morning, the
 * promise breathing at the top, the actions resting on a deeper ground below,
 * and the photograph keeping its middle third. Ink here is FIXED WHITE rather
 * than a theme token, exactly as app.css has it — this is a photographic ground
 * and it is the same in both themes, so theme tokens would be the wrong
 * instrument.
 *
 * A client signs in with the phone in their hand and a one-time code. There is
 * no password door for a client at all — the API refuses one.
 */
export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setSession = useSession((s) => s.setSession);

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: (value: string) => {
      const parsed = schemas.otpRequestSchema.safeParse({ phone: value });
      if (!parsed.success) {
        throw new ApiError(400, 'bad_request', 'That does not look like a mobile number.');
      }
      return api.post('/auth/client/otp/request', parsed.data);
    },
    onSuccess: () => {
      setError(null);
      setStep('code');
    },
    onError: (err: Error) => setError(err.message),
  });

  const verify = useMutation({
    mutationFn: () =>
      api.post<{ accessToken: string; refreshToken: string; user: SessionUser }>(
        '/auth/client/otp/verify',
        schemas.otpVerifySchema.parse({ phone, code }),
      ),
    onSuccess: async (data) => {
      setAccessToken(data.accessToken);
      await setRefreshToken(data.refreshToken);
      const me = await api.get<{ user: SessionUser; role: SessionRole }>('/me');
      setSession(me.user, me.role);
      router.replace('/(tabs)/today');
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <ImageBackground
      source={require('../../assets/welcome.jpg')}
      style={{ flex: 1, backgroundColor: '#0E1512' }}
      imageStyle={{ resizeMode: 'cover' }}
    >
      {/* the scrim: the promise breathes at the top, the actions rest on a
          deeper ground below, and the photograph keeps its middle third */}
      <View
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,14,12,0.45)' }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'space-between' }}
      >
        <View style={{ paddingTop: insets.top + spacing.s8, paddingHorizontal: spacing.s6 }}>
          <Text
            style={{
              fontSize: t.micro,
              fontWeight: '600',
              letterSpacing: 1.9,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            Welcome to HAALVING Culture: Rooted in Balance
          </Text>
          <Text
            style={{
              fontSize: t.h1,
              lineHeight: 33,
              fontWeight: '600',
              letterSpacing: -0.5,
              color: '#fff',
              marginTop: spacing.s1,
            }}
          >
            Haalving Yoga
          </Text>
        </View>

        <View
          style={{
            paddingBottom: insets.bottom + spacing.s7,
            paddingHorizontal: spacing.s6,
            gap: spacing.s3,
          }}
        >
          <Text style={{ fontSize: t.h2, fontWeight: '600', letterSpacing: 6, color: '#fff' }}>HAALVING</Text>
          <Text
            style={{
              fontSize: t.sm,
              lineHeight: 21,
              color: 'rgba(255,255,255,0.85)',
              marginBottom: spacing.s3,
            }}
          >
            Habits of Healthy living.
          </Text>

          {step === 'phone' ? (
            <>
              <FieldLabel>Your mobile number</FieldLabel>
              <GlassInput
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 98470 22110"
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <Button
                label="Send me a code"
                onPress={() => request.mutate(phone)}
                loading={request.isPending}
                disabled={phone.trim().length < 10}
              />
            </>
          ) : (
            <>
              <FieldLabel>The six digits we just sent</FieldLabel>
              <GlassInput
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="sms-otp"
              />
              <Button
                label="Sign in"
                onPress={() => verify.mutate()}
                loading={verify.isPending}
                disabled={code.length !== 6}
              />
              <Button
                label="Use a different number"
                variant="glass"
                onPress={() => {
                  setStep('phone');
                  setCode('');
                  setError(null);
                }}
              />
            </>
          )}

          {error ? (
            <Text style={{ fontSize: t.xs, color: '#FFC9BE', textAlign: 'center' }}>{error}</Text>
          ) : null}

          <Text
            style={{
              fontSize: t.micro,
              color: 'rgba(255,255,255,0.62)',
              textAlign: 'center',
              marginTop: spacing.s1,
            }}
          >
            Your plan, your team, your day.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontSize: t.micro,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.72)',
      }}
    >
      {children}
    </Text>
  );
}

/** Frosted over a photograph — never over a flat card, per the demo's rule. */
function GlassInput(props: ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      placeholderTextColor="rgba(255,255,255,0.45)"
      style={{
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.28)',
        borderRadius: radius.md,
        paddingHorizontal: spacing.s4,
        paddingVertical: spacing.s3,
        fontSize: t.body,
        color: '#fff',
      }}
    />
  );
}
