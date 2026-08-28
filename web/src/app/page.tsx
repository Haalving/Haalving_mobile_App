import { redirect } from 'next/navigation';

/**
 * The front door. Middleware already redirects `/` based on whether a session
 * cookie exists; this is the fallback for the case where it did not run.
 */
export default function RootPage() {
  redirect('/home');
}
