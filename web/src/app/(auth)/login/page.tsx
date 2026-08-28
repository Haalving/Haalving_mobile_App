'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { homePath, schemas } from '@haalving/shared';
import type { z } from 'zod';

import { Icon } from '@/components/icons/Icon';
import { api, ApiError, setAccessToken } from '@/lib/api';
import { useSession, type SessionRole, type SessionUser } from '@/store/session.store';

/**
 * The arrival, ported from `renderLogin` (core.js:1488).
 *
 * The demo's login is a full-bleed Kerala morning — a film where it can play,
 * its own first frame where it cannot — with the wordmark and the actions
 * resting on a deeper scrim below. That layout is kept exactly: `.login-hero`,
 * `.lh-media`, `.lh-scrim`, `.lh-top`, `.lh-bottom`, `.lh-head`, `.lh-eyebrow`,
 * `.lh-word`, `.lh-tag`, `.btn.lh-begin`, `.lh-note` all come straight from
 * app.css.
 *
 * TWO THINGS CHANGE, and only these two:
 *
 *  1. The persona picker is gone. It was a demo affordance, not the product —
 *     eleven people you could become with one tap. In its place is the form the
 *     console actually needs.
 *  2. The film is not shipped. `media/welcome.mp4` is 2.6MB and belongs with the
 *     client app; the console opens on the still, which is the demo's own
 *     reduced-motion path and therefore already a designed state rather than a
 *     downgrade.
 */

const LOGIN_CUES = [
  'Haalving Yoga',
  'Haalving Nutrition',
  'Haalving Fitness',
  'Haalving Mind Wellness',
];

type LoginForm = z.infer<typeof schemas.staffLoginSchema>;

function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useSession((s) => s.setSession);

  /* the demo swaps the headline word on each cut of the film. With the still
     there is no film to follow, so the words rotate on their own clock — the
     lockup is the same and the page is not static. */
  const [cue, setCue] = useState(0);
  const wordRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setCue((c) => (c + 1) % LOGIN_CUES.length), 4200);
    return () => clearInterval(t);
  }, []);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(schemas.staffLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = useMutation({
    mutationFn: (values: LoginForm) =>
      api.post<{ accessToken: string; user: SessionUser }>('/auth/staff/login', values),
    onSuccess: async (data) => {
      setAccessToken(data.accessToken);
      /* read the role back from the server rather than assuming it from the
         login response — the Role table is what the sidebar is built from, and
         Configuration may have edited it since the code matrix was written */
      const me = await api.get<{ user: SessionUser; role: SessionRole }>('/me');
      setSession(me.user, me.role);
      try {
        document.cookie = `hv_nav=${encodeURIComponent(
          JSON.stringify({ role: me.role.key, nav: me.role.nav }),
        )}; Path=/; SameSite=Lax`;
      } catch {
        /* the in-shell gate still decides */
      }
      const from = params.get('from');
      router.replace(from && from.startsWith('/') ? from : homePath(me.role.key));
    },
    onError: (err) => {
      if (err instanceof ApiError && err.isValidation && err.details) {
        for (const [field, message] of Object.entries(err.details)) {
          setError(field as keyof LoginForm, { message });
        }
        return;
      }
      setError('root', {
        message:
          err instanceof ApiError ? err.message : 'We could not reach the server. Try again.',
      });
    },
  });

  return (
    <div className="login-hero">
      <div className="lh-media" aria-hidden="true">
        {/* the still IS the arrival here — see the note above */}
        <img src="/media/welcome.jpg" alt="" />
      </div>
      <div className="lh-scrim" aria-hidden="true" />

      <div className="lh-top">
        <h1 className="lh-head">
          <span className="lh-eyebrow">Welcome to HAALVING CULTURE: Rooted in Balance</span>
          <b key={cue} ref={wordRef} className="lh-word in">
            {LOGIN_CUES[cue]}
          </b>
        </h1>
      </div>

      <div className="lh-bottom">
        <div className="wordmark">HAALVING</div>
        <p className="lh-tag">Habits of Healthy living.</p>

        <form
          onSubmit={handleSubmit((v) => login.mutate(v))}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}
        >
          <div>
            <label className="lh-label" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              placeholder="you@haalving.dev"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email ? <p className="lh-err">{errors.email.message}</p> : null}
          </div>

          <div>
            <label className="lh-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            {errors.password ? <p className="lh-err">{errors.password.message}</p> : null}
          </div>

          {errors.root ? (
            <p className="lh-err" role="alert">
              {errors.root.message}
            </p>
          ) : null}

          <button className="btn block lh-begin" type="submit" disabled={isSubmitting || login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="lh-note">
          <Icon name="lock" style={{ width: 12, height: 12, verticalAlign: '-1px' }} /> Each role sees
          only what its access allows
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
