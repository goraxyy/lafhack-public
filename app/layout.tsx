import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';
import { AuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: 'LafHack',
  description: 'Upload, browse, and run Processing sketches in the browser.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col font-sans text-ink antialiased">
        <AuthProvider>
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
