import type { Metadata, Viewport } from 'next';

import { Providers } from '@/components/shell/Providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'HAALVING · Console',
  description: 'HAALVING Team Console — a Blue Zones way-of-living platform.',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  /* the console's own brand teal. The demo repaints this per screen because its
     first screen is a film; the console has one register, so one value. */
  themeColor: '#0B5350',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* the data face is on the critical path: every numeral in the app is
            set in it, so a late swap reflows every reading on the page */}
        <link
          rel="preload"
          href="/fonts/newsreader-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
