"use client";

import Link from 'next/link';
import { Logo } from '@/components/logo';
import { NavMobileMenu } from '@/components/nav-mobile-menu';
import { useAuth } from '@/lib/auth-context';

const NAV_LINKS = [
  { href: '/gallery', label: 'Gallery' },
  { href: '/play', label: 'Play' },
  { href: '/upload', label: 'Upload' },
];

export function Nav() {
  const { user, role, loading } = useAuth();
  const isAdmin = role === 'admin';

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="LafHack home">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              // Uppercase with open tracking: Lafayette sets its own navigation in
              // small caps, and this is the closest read without licensing Whitney.
              className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500 transition-colors hover:text-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {loading ? (
            <span className="text-sm text-ink-300">Loading...</span>
          ) : user ? (
            <>
              {isAdmin && (
                <Link href="/admin" className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500 transition-colors hover:text-accent">Admin</Link>
              )}
              <Link href="/profile" className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500 transition-colors hover:text-accent">Profile</Link>
            </>
          ) : (
            <>
              <Link href="/login" className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500 transition-colors hover:text-accent">Log in</Link>
              <Link href="/signup" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700">Sign up</Link>
            </>
          )}
        </div>

        <NavMobileMenu links={NAV_LINKS} showProfile={!!user} showAdmin={isAdmin} />
      </div>
    </header>
  );
}
