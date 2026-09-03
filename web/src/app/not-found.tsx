import Link from 'next/link';

/**
 * The console's 404.
 *
 * Its existence is also load-bearing for the production build: without an
 * explicit `not-found`, Next synthesises a default error page and pre-renders it
 * through `react-dom/server`, which crashes the static export on this
 * Next 15 / React 19 pairing (`useContext` on a null dispatcher). Owning the
 * page keeps the export on our own, hook-free markup.
 */
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        padding: '4rem 1.5rem',
      }}
    >
      <div>
        <p style={{ letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.6 }}>
          HAALVING · Console
        </p>
        <h1 style={{ fontSize: '2.5rem', margin: '0.5rem 0' }}>Page not found</h1>
        <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>
          The screen you were looking for isn’t here.
        </p>
        <Link href="/" style={{ color: '#0B5350', fontWeight: 600 }}>
          Back to Home
        </Link>
      </div>
    </main>
  );
}
