'use client';

/**
 * The last-resort boundary: an error thrown in the root layout itself lands
 * here, so it must render its own <html>/<body>. Kept deliberately minimal and
 * self-contained — no providers, no design-system imports — because the tree it
 * would normally rely on is the very thing that failed.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          padding: '4rem 1.5rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', margin: '0 0 0.5rem' }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>
            An unexpected error interrupted the console.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '0.6rem 1.4rem',
              borderRadius: 999,
              border: 'none',
              background: '#0B5350',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
