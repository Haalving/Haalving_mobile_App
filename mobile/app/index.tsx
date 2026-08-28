import { Redirect } from 'expo-router';

import { useSession } from '@/store/session.store';

/**
 * The front door. While the session is still being recovered from the keychain
 * this renders NOTHING rather than a login screen — flashing "sign in" at
 * someone who is already signed in reads as the app having logged them out.
 */
export default function Index() {
  const ready = useSession((s) => s.ready);
  const user = useSession((s) => s.user);

  if (!ready) return null;
  return <Redirect href={user ? '/(tabs)/today' : '/(auth)/login'} />;
}
