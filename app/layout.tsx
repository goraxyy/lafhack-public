import type { Metadata } from 'next';
import { Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { AuthProvider } from '@/lib/auth-context';

/**
 * The display face.
 *
 * Lafayette sets its headlines in a high-contrast serif, and that -- not the
 * maroon -- is what makes the college's pages read as a college's. Source
 * Serif 4 is the closest open equivalent to the Scotch romans in that family:
 * academic without being antique, and it holds up at 14px as well as at 48px.
 *
 * Self-hosted by next/font at build time, so there is no request to a font CDN
 * and no flash of a fallback face.
 */
const displaySerif = Source_Serif_4({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '600'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: {
    default: 'LafHack — projects made at Lafayette College',
    template: '%s · LafHack',
  },
  description:
    'Projects made at Lafayette College, playable in the browser. Put your own work in front of people, or just play what everybody else has made.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={displaySerif.variable}>
      <body className="flex min-h-screen flex-col font-sans text-ink antialiased">
        {/*
          The maroon rule across the top of every page. Nearly every Lafayette
          page carries one, and it does more to place the site than any amount
          of maroon further down.
        */}
        <div className="h-1 w-full bg-accent" aria-hidden="true" />
        <AuthProvider>
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
